import { Effect, pipe } from "effect";
import { compileArray } from "@/evaluation/base-forms/array";
import { compilePrimitive } from "@/evaluation/base-forms/primitive";
import { compileRecord } from "@/evaluation/base-forms/record";
import { type Compiled, toEffect } from "@/evaluation/compiled";
import {
  asWritten,
  makeEnvironment,
  predeclare,
  type Scope,
} from "@/evaluation/environment";
import { declaredIn, definedIn } from "@/evaluation/hoisting";
import { compileBegin, isBegin } from "@/evaluation/special-forms/begin.ts";
import {
  LogicDatabase,
  relationBindings,
  schemaBindings,
} from "@/logic/database";
import { nameFunctions } from "@/logic/terms";
import { type Watched, watchQuery } from "@/logic/watch";
import { Exact } from "@/numbers/exact";
import type { JsonPrimitiveType } from "@/schemas/json-primitive";
import {
  decodeExpression,
  type LionExpressionType,
  type LionRecordExpressionType,
} from "@/schemas/lion-expression";
import { LionDatabaseService } from "@/services/database";
import { LionEnvironmentService } from "@/services/evaluation";
import type { EvaluateResult } from "@/types/evaluation";

/**
 * Compiles an expression: JSON that `run` or `eval` has checked, written in
 * `scope`. The scope settles what each string means: a name it declares, or
 * data. What it compiles to holds its parts compiled, so a lambda's body is
 * compiled once and runs compiled every time the lambda is called. Nothing
 * else keeps it: once the code that holds it is gone, so is the compiled
 * code.
 */
export const compile = (
  expression: LionExpressionType,
  scope: Scope | undefined
): Compiled => {
  if (Array.isArray(expression)) {
    return compileArray(expression, scope);
  }
  // A number no JavaScript number writes, as the reader gives 1/3 or
  // 2^53 + 1, is itself, as every number is.
  return typeof expression === "object" &&
    expression !== null &&
    !(expression instanceof Exact)
    ? compileRecord(expression as LionRecordExpressionType, scope)
    : compilePrimitive(expression as JsonPrimitiveType, scope);
};

/** Compiles each expression in the same scope. */
export const compileAll = (
  expressions: readonly LionExpressionType[],
  scope: Scope | undefined
): Compiled[] => expressions.map((expression) => compile(expression, scope));

/** Evaluates an expression in the scope of the evaluation. */
export const evaluate = (expression: LionExpressionType): EvaluateResult =>
  Effect.flatMap(Effect.service(LionEnvironmentService), (environment) =>
    toEffect(compile(expression, asWritten(environment))(environment, 0))
  );

/**
 * Compiles a program. A `begin` there is the program's own: it runs its
 * forms one at a time, and never waits as a whole.
 */
const compileProgram = (
  program: LionExpressionType,
  scope: Scope | undefined
) =>
  isBegin(program, scope)
    ? compileBegin(program, scope, true)
    : compile(program, scope);

/**
 * The top scope of a run: the environment's bindings, the database's
 * relations and schemas, and every name the program defines or declares,
 * from the start.
 */
const topScope = (
  program: LionExpressionType,
  bindings: Record<string, unknown>
) => {
  const top = makeEnvironment(bindings, undefined, true);
  predeclare(top.bindings, [
    ...definedIn(program, top),
    ...declaredIn(program, top),
  ]);
  return top;
};

export interface RunOptions {
  /**
   * Relations, schemas, facts, and rules to start from. Defaults to an empty
   * database. The database's relations and schemas are bound by name, unless
   * the environment binds the same name.
   */
  readonly database?: LogicDatabase;
}

export const run = (
  expression: unknown,
  environment: Record<string, unknown>,
  options: RunOptions = {}
) =>
  Effect.suspend(() => {
    const database = options.database ?? new LogicDatabase();
    nameFunctions(environment);
    return pipe(
      decodeExpression(expression),
      Effect.flatMap((program) => {
        const top = topScope(program, {
          ...relationBindings(database),
          ...schemaBindings(database),
          ...environment,
        });
        return Effect.suspend(() =>
          toEffect(compileProgram(program, asWritten(top))(top, 0))
        ).pipe(Effect.provideService(LionEnvironmentService, top));
      }),
      Effect.provideService(LionDatabaseService, database)
    );
  });

/**
 * Watches a query of a database from host code: `query` is Lion code, such
 * as a `find`, run as `run` runs it against the database. Gives the answers
 * now and a function that stops the watching; `onChange` is called after
 * each change a `fact`, `retract`, `rule`, or `invariant` form makes that
 * adds or takes away an answer, with the answers that came and went.
 */
export const watch = (
  query: unknown,
  environment: Record<string, unknown>,
  database: LogicDatabase,
  onChange: (watched: Watched) => void
) =>
  watchQuery(database, () => run(query, environment, { database }), onChange);
