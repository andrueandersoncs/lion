import { Effect, pipe, Schema } from "effect";
import { compileArray } from "@/evaluation/base-forms/array";
import { compilePrimitive } from "@/evaluation/base-forms/primitive";
import { compileRecord } from "@/evaluation/base-forms/record";
import { type Compiled, toEffect } from "@/evaluation/compiled";
import { makeEnvironment } from "@/evaluation/environment";
import {
  LogicDatabase,
  relationBindings,
  schemaBindings,
} from "@/logic/database";
import { nameFunctions } from "@/logic/terms";
import type { JsonPrimitiveType } from "@/schemas/json-primitive";
import {
  LionExpressionSchema,
  type LionExpressionType,
  type LionRecordExpressionType,
} from "@/schemas/lion-expression";
import { LionDatabaseService } from "@/services/database";
import { LionEnvironmentService } from "@/services/evaluation";
import type { EvaluateResult } from "@/types/evaluation";

/**
 * Compiles an expression: JSON that `run` or `eval` has checked. What it
 * compiles to holds its parts compiled, so a lambda's body is compiled once
 * and runs compiled every time the lambda is called. Nothing else keeps it:
 * once the code that holds it is gone, so is the compiled code.
 */
export const compile = (expression: LionExpressionType): Compiled => {
  if (Array.isArray(expression)) {
    return compileArray(expression);
  }
  return typeof expression === "object" && expression !== null
    ? compileRecord(expression as LionRecordExpressionType)
    : compilePrimitive(expression as JsonPrimitiveType);
};

/** Evaluates an expression in the scope of the evaluation. */
export const evaluate = (expression: LionExpressionType): EvaluateResult =>
  Effect.flatMap(Effect.service(LionEnvironmentService), (environment) =>
    toEffect(compile(expression)(environment, 0))
  );

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
      Schema.decodeUnknownEffect(LionExpressionSchema)(expression),
      Effect.flatMap(evaluate),
      Effect.provideService(
        LionEnvironmentService,
        makeEnvironment({
          ...relationBindings(database),
          ...schemaBindings(database),
          ...environment,
        })
      ),
      Effect.provideService(LionDatabaseService, database)
    );
  });
