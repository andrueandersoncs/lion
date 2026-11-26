/**
 * First-class Model Context Protocol (MCP) JSON-RPC 2.0 server for Lion.
 *
 * Exposes a sandboxed, journaled Lion logic database to AI agents over stdio
 * (`lion mcp`) or HTTP (`POST /v1/mcp` in `lion serve`) with tools for:
 * - `lion_check`: static analysis, Lion lints, and RFC 6902 auto-fix patches
 * - `lion_eval`: read-only expression, query, `find`, `why`, `proof/*`, and `assuming`
 * - `lion_commit`: atomic WAL-backed mutation with optional `expectedRevision` OCC
 * - `lion_inspect`: ontology, counts, revision, and Draft 2020-12 JSON Schemas
 * - `lion_branch`: persistent copy-on-write branching (`fork`, `eval`, `commit`, `merge`)
 */
import { createInterface } from "node:readline";
import { analyze, flattenAnalysis } from "@lionlang/core/analysis/analyze";
import {
  applyJsonPatches,
  suggestFixes,
} from "@lionlang/core/analysis/autofix";
import { lint } from "@lionlang/core/analysis/lint";
import { runWithMetrics } from "@lionlang/core/evaluation/evaluate";
import type {
  DatabasePermissions,
  ExecutionLimits,
} from "@lionlang/core/evaluation/sandbox";
import { countBaseFacts } from "@lionlang/core/evaluation/sandbox";
import { decodeWire, encodeWire } from "@lionlang/core/evaluation/wire";
import {
  type Branch,
  type JournaledDatabase,
  type JournalStore,
  MemoryJournalStore,
  openJournal,
} from "@lionlang/core/logic/journal";
import { databaseToJsonSchema } from "@lionlang/core/logic/json-schema";
import { safeStdlib } from "@lionlang/core/modules";
import type { LionExpressionType } from "@lionlang/core/schemas/lion-expression";
import { Cause, Effect, Exit } from "effect";

export interface JsonRpcRequest {
  readonly id?: number | string | null;
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

export interface JsonRpcResponse {
  readonly error?: {
    readonly code: number;
    readonly data?: unknown;
    readonly message: string;
  };
  readonly id: number | string | null;
  readonly jsonrpc: "2.0";
  readonly result?: unknown;
}

export interface LionMcpOptions {
  readonly environment?: Record<string, unknown>;
  readonly limits?: ExecutionLimits;
  readonly permissions?: DatabasePermissions;
  readonly store?: JournalStore;
}

const PROTOCOL_VERSION = "2024-11-05";

const TOOL_DEFINITIONS = [
  {
    description:
      "Statically check and lint a Lion JSON program without running it; returns diagnostics and RFC 6902 auto-fix patches.",
    inputSchema: {
      properties: {
        applyFixes: {
          description: "If true, also returns the patched program.",
          type: "boolean",
        },
        program: { description: "Lion JSON expression to validate." },
      },
      required: ["program"],
      type: "object",
    },
    name: "lion_check",
  },
  {
    description:
      "Evaluate a read-only Lion expression (query, find, why, proof/*, or assuming counterfactual) against the database or a named branch.",
    inputSchema: {
      properties: {
        branch: {
          description: "Optional branch name created with lion_branch.",
          type: "string",
        },
        program: { description: "Lion JSON expression to evaluate read-only." },
      },
      required: ["program"],
      type: "object",
    },
    name: "lion_eval",
  },
  {
    description:
      "Atomically commit a Lion program (relation, schema, rule, fact, retract, invariant) to the journaled database with optional optimistic concurrency.",
    inputSchema: {
      properties: {
        branch: {
          description: "Optional branch name to commit to instead of main.",
          type: "string",
        },
        expectedRevision: {
          description:
            "Optional revision check; fails with ConflictError if stale.",
          type: "integer",
        },
        meta: {
          description: "Optional metadata attached to the journal entry.",
          type: "object",
        },
        program: { description: "Lion JSON program to commit." },
      },
      required: ["program"],
      type: "object",
    },
    name: "lion_commit",
  },
  {
    description:
      "Inspect the current database revision, relations, schemas, counts, active branches, and Draft 2020-12 JSON Schemas for constrained decoding.",
    inputSchema: {
      properties: {
        branch: { type: "string" },
      },
      type: "object",
    },
    name: "lion_inspect",
  },
  {
    description:
      "Manage persistent copy-on-write branches: fork a branch from main, list branches, merge a branch into main, or delete a branch.",
    inputSchema: {
      properties: {
        action: { enum: ["fork", "list", "merge", "delete"], type: "string" },
        name: { type: "string" },
        requireBaseRevision: {
          description:
            "For merge: fail if main advanced since fork (default true).",
          type: "boolean",
        },
      },
      required: ["action"],
      type: "object",
    },
    name: "lion_branch",
  },
] as const;

export const extractErrorInfo = (
  cause: Cause.Cause<unknown>
): { readonly message: string; readonly tag: string } => {
  const err = Cause.squash(cause);
  if (err instanceof Error) {
    const tag = (err as { readonly _tag?: string })._tag ?? err.name;
    return { message: err.message, tag };
  }
  return { message: String(err), tag: "Error" };
};

/** Stateful sandboxed Lion session shared by both MCP and HTTP servers. */
export class LionRuntimeSession {
  readonly branches = new Map<string, Branch>();
  readonly environment: Record<string, unknown>;
  readonly journal: JournaledDatabase;
  readonly limits: ExecutionLimits | undefined;
  readonly permissions: DatabasePermissions | undefined;

  private constructor(
    journal: JournaledDatabase,
    environment: Record<string, unknown>,
    limits: ExecutionLimits | undefined,
    permissions: DatabasePermissions | undefined
  ) {
    this.journal = journal;
    this.environment = environment;
    this.limits = limits;
    this.permissions = permissions;
  }

  static create(
    options: LionMcpOptions = {}
  ): Effect.Effect<LionRuntimeSession, unknown> {
    const environment = options.environment ?? { ...safeStdlib };
    const store = options.store ?? new MemoryJournalStore();
    return Effect.map(
      openJournal(store, environment),
      (journal) =>
        new LionRuntimeSession(
          journal,
          environment,
          options.limits,
          options.permissions
        )
    );
  }

  resolveJournal(branchName?: string): JournaledDatabase | undefined {
    if (branchName === undefined) {
      return this.journal;
    }
    return this.branches.get(branchName)?.journal;
  }

  check(
    program: unknown,
    applyFixes = false
  ): Effect.Effect<Record<string, unknown>, unknown> {
    const self = this;
    return Effect.gen(function* () {
      const decoded = yield* decodeWire(program);
      const env: Record<string, unknown> = {
        ...self.environment,
        ...Object.fromEntries(
          [...self.journal.database.relations.keys()].map((k) => [k, null])
        ),
        ...Object.fromEntries(
          [...self.journal.database.schemas.keys()].map((k) => [k, null])
        ),
      };
      const tree = analyze(decoded as LionExpressionType, env);
      const diagnostics = flattenAnalysis(tree)
        .filter((n) => n.diagnostic !== undefined || n.warning !== undefined)
        .map((n) => ({
          at: n.pointer,
          ...(n.diagnostic === undefined ? {} : { error: n.diagnostic }),
          ...(n.warning === undefined ? {} : { warning: n.warning }),
        }));
      const declared = [...self.journal.database.relations.keys()];
      const lints = yield* lint(decoded, declared);
      const fixes = yield* suggestFixes(decoded, {
        declared,
        environment: env,
      });
      const ok = diagnostics.every((d) => d.error === undefined);
      const patched = applyFixes
        ? applyJsonPatches(
            decoded,
            fixes.flatMap((f) => f.patch)
          )
        : undefined;
      return {
        diagnostics,
        fixes,
        lints,
        ok,
        ...(patched === undefined ? {} : { patched }),
      };
    });
  }

  evalReadOnly(
    program: unknown,
    branchName?: string
  ): Effect.Effect<Record<string, unknown>, unknown> {
    const self = this;
    return Effect.gen(function* () {
      const target = self.resolveJournal(branchName);
      if (target === undefined) {
        return yield* Effect.fail(new Error(`Unknown branch "${branchName}".`));
      }
      const decoded = yield* decodeWire(program);
      const { metrics, value } = yield* runWithMetrics(
        decoded,
        self.environment,
        {
          database: target.database,
          ...(self.limits === undefined ? {} : { limits: self.limits }),
          permissions: { readOnly: true },
        }
      );
      return {
        metrics,
        revision: target.revision,
        value,
      };
    });
  }

  commit(
    program: unknown,
    options: {
      readonly branch?: string;
      readonly expectedRevision?: number;
      readonly meta?: Readonly<Record<string, unknown>>;
    } = {}
  ): Effect.Effect<Record<string, unknown>, unknown> {
    const self = this;
    return Effect.gen(function* () {
      const target = self.resolveJournal(options.branch);
      if (target === undefined) {
        return yield* Effect.fail(
          new Error(`Unknown branch "${options.branch}".`)
        );
      }
      const decoded = yield* decodeWire(program);
      const result = yield* target.commit(decoded, {
        ...(options.expectedRevision === undefined
          ? {}
          : { expectedRevision: options.expectedRevision }),
        ...(self.limits === undefined ? {} : { limits: self.limits }),
        ...(options.meta === undefined ? {} : { meta: options.meta }),
        ...(self.permissions === undefined
          ? {}
          : { permissions: self.permissions }),
      });
      return {
        changed: result.changed,
        metrics: result.metrics,
        revision: result.revision,
        value: result.value,
      };
    });
  }

  inspect(branchName?: string) {
    const target = this.resolveJournal(branchName);
    if (target === undefined) {
      return Effect.fail(new Error(`Unknown branch "${branchName}".`));
    }
    const db = target.database;
    return Effect.succeed({
      branches: [...this.branches.keys()].sort(),
      invariants: db.invariants.length,
      jsonSchemas: databaseToJsonSchema(db),
      relations: [...db.relations.values()].map((r) => ({
        columns: r.columns,
        facts: db.facts.get(r.name)?.size ?? 0,
        name: r.name,
      })),
      revision: target.revision,
      rules: db.rules.length,
      schemas: [...db.schemas.keys()].sort(),
      totalFacts: countBaseFacts(db),
    });
  }

  private forkBranch(
    name?: string
  ): Effect.Effect<Record<string, unknown>, unknown> {
    const self = this;
    return Effect.gen(function* () {
      const branchName = name ?? `branch-${self.branches.size + 1}`;
      if (self.branches.has(branchName)) {
        return yield* Effect.fail(
          new Error(`Branch "${branchName}" already exists.`)
        );
      }
      const branch = yield* self.journal.fork(branchName);
      self.branches.set(branchName, branch);
      return {
        baseRevision: branch.baseRevision,
        name: branch.name,
        revision: branch.journal.revision,
      };
    });
  }

  private mergeBranch(
    name: string | undefined,
    requireBaseRevision?: boolean
  ): Effect.Effect<Record<string, unknown>, unknown> {
    const self = this;
    return Effect.gen(function* () {
      if (name === undefined) {
        return yield* Effect.fail(
          new Error("Branch name is required for merge.")
        );
      }
      const branch = self.branches.get(name);
      if (branch === undefined) {
        return yield* Effect.fail(new Error(`Unknown branch "${name}".`));
      }
      const merged = yield* self.journal.merge(branch, {
        ...(self.limits === undefined ? {} : { limits: self.limits }),
        ...(self.permissions === undefined
          ? {}
          : { permissions: self.permissions }),
        ...(requireBaseRevision === undefined ? {} : { requireBaseRevision }),
      });
      self.branches.delete(name);
      return {
        changed: merged.changed,
        merged: name,
        revision: merged.revision,
      };
    });
  }

  manageBranch(args: {
    readonly action: "fork" | "list" | "merge" | "delete";
    readonly name?: string;
    readonly requireBaseRevision?: boolean;
  }): Effect.Effect<Record<string, unknown>, unknown> {
    switch (args.action) {
      case "list":
        return Effect.succeed({
          branches: [...this.branches.values()].map((b) => ({
            baseRevision: b.baseRevision,
            name: b.name,
            revision: b.journal.revision,
          })),
        });
      case "fork":
        return this.forkBranch(args.name);
      case "delete":
        if (args.name === undefined || !this.branches.has(args.name)) {
          return Effect.fail(new Error(`Unknown branch "${args.name ?? ""}".`));
        }
        this.branches.delete(args.name);
        return Effect.succeed({ deleted: args.name });
      case "merge":
        return this.mergeBranch(args.name, args.requireBaseRevision);
      default:
        return Effect.fail(
          new Error(`Unknown branch action "${String(args.action)}".`)
        );
    }
  }
}

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const dispatchTool = (
  session: LionRuntimeSession,
  name: unknown,
  args: Record<string, unknown>
): Effect.Effect<unknown, unknown> | undefined => {
  switch (name) {
    case "lion_check":
      return session.check(args.program, args.applyFixes === true);
    case "lion_eval":
      return session.evalReadOnly(args.program, optionalString(args.branch));
    case "lion_commit": {
      const branch = optionalString(args.branch);
      const expectedRevision =
        typeof args.expectedRevision === "number"
          ? args.expectedRevision
          : undefined;
      const meta =
        typeof args.meta === "object" && args.meta !== null
          ? (args.meta as Record<string, unknown>)
          : undefined;
      return session.commit(args.program, {
        ...(branch === undefined ? {} : { branch }),
        ...(expectedRevision === undefined ? {} : { expectedRevision }),
        ...(meta === undefined ? {} : { meta }),
      });
    }
    case "lion_inspect":
      return session.inspect(optionalString(args.branch));
    case "lion_branch": {
      const branchName = optionalString(args.name);
      const reqBase =
        typeof args.requireBaseRevision === "boolean"
          ? args.requireBaseRevision
          : undefined;
      return session.manageBranch({
        action: args.action as "fork" | "list" | "merge" | "delete",
        ...(branchName === undefined ? {} : { name: branchName }),
        ...(reqBase === undefined ? {} : { requireBaseRevision: reqBase }),
      });
    }
    default:
      return undefined;
  }
};

const handleToolCall = (
  session: LionRuntimeSession,
  id: number | string | null,
  params: Readonly<Record<string, unknown>>
): Effect.Effect<JsonRpcResponse> =>
  Effect.gen(function* () {
    const effect = dispatchTool(
      session,
      params.name,
      (params.arguments ?? {}) as Record<string, unknown>
    );
    if (effect === undefined) {
      return {
        error: {
          code: -32_601,
          message: `Unknown tool "${String(params.name)}".`,
        },
        id,
        jsonrpc: "2.0" as const,
      };
    }
    const exit = yield* Effect.exit(effect);
    if (Exit.isSuccess(exit)) {
      const encoded = encodeWire(exit.value);
      return {
        id,
        jsonrpc: "2.0" as const,
        result: {
          content: [{ text: JSON.stringify(encoded, null, 2), type: "text" }],
          isError: false,
          structuredContent: encoded,
        },
      };
    }
    const { message, tag } = extractErrorInfo(exit.cause);
    return {
      id,
      jsonrpc: "2.0" as const,
      result: {
        content: [{ text: `${tag}: ${message}`, type: "text" }],
        isError: true,
      },
    };
  });

/** Handles one MCP JSON-RPC 2.0 request against `session`. */
export const handleMcpRequest = (
  session: LionRuntimeSession,
  request: JsonRpcRequest
): Effect.Effect<JsonRpcResponse | undefined> => {
  const id = request.id ?? null;
  switch (request.method) {
    case "notifications/initialized":
      return Effect.succeed(undefined);
    case "initialize":
      return Effect.succeed({
        id,
        jsonrpc: "2.0",
        result: {
          capabilities: { tools: {} },
          protocolVersion: PROTOCOL_VERSION,
          serverInfo: { name: "lion-mcp", version: "0.18.0" },
        },
      });
    case "ping":
      return Effect.succeed({ id, jsonrpc: "2.0", result: {} });
    case "tools/list":
      return Effect.succeed({
        id,
        jsonrpc: "2.0",
        result: { tools: TOOL_DEFINITIONS },
      });
    case "tools/call":
      return handleToolCall(session, id, request.params ?? {});
    default:
      return Effect.succeed({
        error: {
          code: -32_601,
          message: `Method not found: ${request.method}`,
        },
        id,
        jsonrpc: "2.0",
      });
  }
};

/** Runs the Lion MCP server over stdin/stdout newline-delimited JSON-RPC. */
export const serveMcpStdio = (
  options: LionMcpOptions = {}
): Effect.Effect<void, unknown> =>
  Effect.gen(function* () {
    const session = yield* LionRuntimeSession.create(options);
    yield* Effect.promise(
      () =>
        new Promise<void>((resolve) => {
          const rl = createInterface({
            input: process.stdin,
            terminal: false,
          });
          rl.on("line", (line) => {
            const trimmed = line.trim();
            if (trimmed.length === 0) {
              return;
            }
            let parsed: JsonRpcRequest;
            try {
              parsed = JSON.parse(trimmed) as JsonRpcRequest;
            } catch (error) {
              const errResp: JsonRpcResponse = {
                error: {
                  code: -32_700,
                  message: `Parse error: ${error instanceof Error ? error.message : String(error)}`,
                },
                id: null,
                jsonrpc: "2.0",
              };
              process.stdout.write(`${JSON.stringify(errResp)}\n`);
              return;
            }
            Effect.runPromise(handleMcpRequest(session, parsed)).then(
              (response) => {
                if (response !== undefined) {
                  process.stdout.write(`${JSON.stringify(response)}\n`);
                }
              },
              () => undefined
            );
          });
          rl.on("close", () => resolve());
        })
    );
  });
