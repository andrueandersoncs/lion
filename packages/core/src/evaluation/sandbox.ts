/**
 * Execution sandboxing, cooperative resource metering, and database write
 * permissions for running untrusted or multi-tenant Lion programs.
 *
 * When neither `limits`, `permissions`, nor `onMetrics` is provided to `run`,
 * no meter is created and compiled evaluation runs at full speed with a single
 * undefined check. Limit and permission errors are marked uncatchable so
 * untrusted Lion code cannot swallow them with `func/catch`.
 */
import { Effect } from "effect";
import {
  PermissionError,
  ResourceLimitError,
  steers,
} from "@/errors/evaluation";
import type { LogicDatabase } from "@/logic/database";

/** Cooperative resource bounds for one `run` call. */
export interface ExecutionLimits {
  /** Maximum wall-clock duration in milliseconds, checked cooperatively. */
  readonly maxDurationMs?: number;
  /** Maximum total base facts allowed in the database after a mutation. */
  readonly maxFacts?: number;
  /** Maximum evaluation steps (calls and logic forms). */
  readonly maxSteps?: number;
}

/** Fine-grained write capabilities for persistent database mutations. */
export interface DatabasePermissions {
  /** Allow `relation` declarations (defaults to `!readOnly`). */
  readonly declareRelations?: boolean;
  /** Allow `schema` declarations (defaults to `!readOnly`). */
  readonly declareSchemas?: boolean;
  /** Allow adding or retracting `invariant` forms (defaults to `!readOnly`). */
  readonly mutateInvariants?: boolean;
  /** Allow adding or retracting `rule` forms (defaults to `!readOnly`). */
  readonly mutateRules?: boolean;
  /** Allow persisted `define` forms (defaults to `!readOnly`). */
  readonly persistDefinitions?: boolean;
  /**
   * Disallow all persistent mutations. Queries, `find`, `why`, `proof/*`,
   * `snapshot`, and ephemeral `assuming` counterfactuals remain allowed.
   */
  readonly readOnly?: boolean;
  /**
   * Relations that `fact` and `retract` may modify. When omitted, all
   * relations are writable unless `readOnly` is true.
   */
  readonly writableRelations?: ReadonlySet<string> | readonly string[];
}

/** Resource usage recorded for one `run` call. */
export interface ExecutionMetrics {
  readonly durationMs: number;
  readonly steps: number;
  readonly totalFacts: number;
}

export type PermissionAction =
  | "declare-relation"
  | "declare-schema"
  | "persist-define"
  | "mutate-rule"
  | "mutate-invariant"
  | "write-fact";

/** How often `tick` checks wall-clock duration to keep overhead minimal. */
const DURATION_CHECK_STRIDE = 64;

/** Counts all base facts currently stored in `database`. */
export const countBaseFacts = (database: LogicDatabase): number => {
  let total = 0;
  for (const tuples of database.facts.values()) {
    total += tuples.size;
  }
  return total;
};

const toRelationSet = (
  relations: ReadonlySet<string> | readonly string[] | undefined
): ReadonlySet<string> | undefined => {
  if (relations === undefined) {
    return undefined;
  }
  return relations instanceof Set ? relations : new Set(relations);
};

/** Mutable per-run resource meter and permission guard, attached to `Environment`. */
export class ExecutionMeter {
  readonly limits: ExecutionLimits | undefined;
  readonly permissions: DatabasePermissions | undefined;
  private readonly startedAt: number;
  private readonly writable: ReadonlySet<string> | undefined;
  private steps = 0;

  constructor(limits?: ExecutionLimits, permissions?: DatabasePermissions) {
    this.limits = limits;
    this.permissions = permissions;
    this.writable = toRelationSet(permissions?.writableRelations);
    this.startedAt = performance.now();
  }

  /**
   * Advances the step counter and checks `maxSteps` and (periodically)
   * `maxDurationMs`. Returns an uncatchable `ResourceLimitError` on breach.
   */
  tick(count = 1, checkClock = false): ResourceLimitError | undefined {
    this.steps += count;
    const maxSteps = this.limits?.maxSteps;
    if (maxSteps !== undefined && this.steps > maxSteps) {
      return steers(
        new ResourceLimitError({
          actual: this.steps,
          limit: "steps",
          limitValue: maxSteps,
          message: `Execution exceeded the limit of ${maxSteps} steps.`,
        })
      );
    }
    const maxDurationMs = this.limits?.maxDurationMs;
    if (
      maxDurationMs !== undefined &&
      (checkClock || this.steps % DURATION_CHECK_STRIDE === 0)
    ) {
      const elapsed = performance.now() - this.startedAt;
      if (elapsed > maxDurationMs) {
        return steers(
          new ResourceLimitError({
            actual: Math.ceil(elapsed),
            limit: "duration",
            limitValue: maxDurationMs,
            message: `Execution exceeded the limit of ${maxDurationMs} ms.`,
          })
        );
      }
    }
    return undefined;
  }

  /** Checks whether `database` is within `limits.maxFacts`. */
  checkFactLimit(database: LogicDatabase): ResourceLimitError | undefined {
    const maxFacts = this.limits?.maxFacts;
    if (maxFacts === undefined) {
      return undefined;
    }
    const total = countBaseFacts(database);
    if (total > maxFacts) {
      return steers(
        new ResourceLimitError({
          actual: total,
          limit: "facts",
          limitValue: maxFacts,
          message: `Database exceeded the limit of ${maxFacts} facts (has ${total}).`,
        })
      );
    }
    return undefined;
  }

  /** Checks whether `action` (on `target`, if applicable) is permitted. */
  checkPermission(
    action: PermissionAction,
    target?: string
  ): PermissionError | undefined {
    const permissions = this.permissions;
    if (permissions === undefined) {
      return undefined;
    }
    const defaultAllowed = permissions.readOnly !== true;
    const allowed = this.isAllowed(action, permissions, defaultAllowed, target);
    if (allowed) {
      return undefined;
    }
    const detail = target === undefined ? action : `${action} on "${target}"`;
    return steers(
      new PermissionError({
        action,
        message: `Permission denied for ${detail}.`,
        ...(target === undefined ? {} : { target }),
      })
    );
  }

  private isAllowed(
    action: PermissionAction,
    permissions: DatabasePermissions,
    defaultAllowed: boolean,
    target?: string
  ): boolean {
    switch (action) {
      case "declare-relation":
        return permissions.declareRelations ?? defaultAllowed;
      case "declare-schema":
        return permissions.declareSchemas ?? defaultAllowed;
      case "persist-define":
        return permissions.persistDefinitions ?? defaultAllowed;
      case "mutate-rule":
        return permissions.mutateRules ?? defaultAllowed;
      case "mutate-invariant":
        return permissions.mutateInvariants ?? defaultAllowed;
      case "write-fact":
        if (this.writable !== undefined) {
          return target !== undefined && this.writable.has(target);
        }
        return defaultAllowed;
      default:
        return false;
    }
  }

  /** Effect helper that fails with an uncatchable `PermissionError` if denied. */
  requirePermission(
    action: PermissionAction,
    target?: string
  ): Effect.Effect<void, PermissionError> {
    const error = this.checkPermission(action, target);
    return error === undefined ? Effect.void : Effect.fail(error);
  }

  /** Snapshot of the metrics collected so far. */
  snapshot(database: LogicDatabase): ExecutionMetrics {
    return {
      durationMs: Math.max(0, performance.now() - this.startedAt),
      steps: this.steps,
      totalFacts: countBaseFacts(database),
    };
  }
}
