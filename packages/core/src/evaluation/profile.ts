/**
 * Query/database execution profiling and dependency plan inspection for Lion.
 *
 * Gives platform operators and agent developers visibility into step counts,
 * wall-clock time, base vs. derived row counts per relation, and recursive
 * Datalog strata—with zero overhead on normal `run()` calls.
 */
import { Effect } from "effect";
import { type RunOptions, runWithMetrics } from "@/evaluation/evaluate";
import { countBaseFacts, type ExecutionMetrics } from "@/evaluation/sandbox";
import { LogicDatabase, mergeOption } from "@/logic/database";
import { keyColumns } from "@/logic/model";
import { dependencyEdges, stronglyConnected } from "@/logic/strata";
import type { EvaluationError } from "@/types/evaluation";

export interface RelationPlanInfo {
  readonly baseFacts: number;
  readonly columns: readonly string[];
  readonly derivedRows: number;
  readonly key: readonly string[] | undefined;
  readonly merge: Readonly<Record<string, string>> | undefined;
  readonly name: string;
}

export interface StratumPlanInfo {
  readonly recursive: boolean;
  readonly relations: readonly string[];
}

export interface DatabasePlan {
  readonly invariants: number;
  readonly relations: readonly RelationPlanInfo[];
  readonly revision: number;
  readonly rules: number;
  readonly schemas: readonly string[];
  readonly strata: readonly StratumPlanInfo[];
  readonly totalBaseFacts: number;
  readonly totalDerivedRows: number;
}

export interface RunProfile {
  readonly metrics: ExecutionMetrics;
  readonly plan: DatabasePlan;
  readonly value: unknown;
}

/**
 * Inspects `database` and returns a structured execution plan summary:
 * base facts vs. derived rows per relation, key/merge definitions, and
 * strongly connected Datalog strata (flagging recursive cycles).
 */
export const explainPlan = (database: LogicDatabase): DatabasePlan => {
  const relations: RelationPlanInfo[] = [];
  let totalDerivedRows = 0;

  for (const info of database.relations.values()) {
    const baseFacts = database.facts.get(info.name)?.size ?? 0;
    const derivedSet = database.model?.relations.get(info.name);
    const derivedRows = derivedSet === undefined ? 0 : derivedSet.size;
    totalDerivedRows += derivedRows;
    const key =
      info.key === undefined
        ? undefined
        : keyColumns(info).filter((col): col is string => col !== undefined);
    const merge = mergeOption(info);
    relations.push({
      baseFacts,
      columns: info.columns,
      derivedRows,
      key,
      merge,
      name: info.name,
    });
  }
  relations.sort((a, b) => a.name.localeCompare(b.name));

  const edges = dependencyEdges(database.rules);
  const sccs = stronglyConnected([...database.relations.keys()], (name) => [
    ...(edges.get(name) ?? []),
  ]);
  const strata: StratumPlanInfo[] = sccs.map((group) => {
    const names = [...group].sort();
    const recursive =
      names.length > 1 ||
      names.some((name) => edges.get(name)?.has(name) === true);
    return { recursive, relations: names };
  });

  return {
    invariants: database.invariants.length,
    relations,
    revision: database.revision,
    rules: database.rules.length,
    schemas: [...database.schemas.keys()].sort(),
    strata,
    totalBaseFacts: countBaseFacts(database),
    totalDerivedRows,
  };
};

/**
 * Evaluates `expression` with metering enabled and returns the result,
 * `ExecutionMetrics`, and post-run `DatabasePlan`.
 */
export const profileRun = (
  expression: unknown,
  environment: Record<string, unknown>,
  options: Omit<RunOptions, "onMetrics"> = {}
): Effect.Effect<RunProfile, EvaluationError> =>
  Effect.suspend(() => {
    const database = options.database ?? new LogicDatabase();
    return Effect.map(
      runWithMetrics(expression, environment, { ...options, database }),
      ({ metrics, value }) => ({
        metrics,
        plan: explainPlan(database),
        value,
      })
    );
  });
