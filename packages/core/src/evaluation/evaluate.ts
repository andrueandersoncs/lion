import { Effect, pipe, Schema } from "effect";
import { evaluateArray } from "@/evaluation/base-forms/array";
import { evaluatePrimitive } from "@/evaluation/base-forms/primitive";
import { evaluateRecord } from "@/evaluation/base-forms/record";
import { makeEnvironment } from "@/evaluation/environment";
import { LogicDatabase, relationBindings } from "@/logic/database";
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

/** Evaluates an expression: JSON that `run` or `eval` has checked. */
export const evaluate = (expression: LionExpressionType): EvaluateResult => {
  if (Array.isArray(expression)) {
    return evaluateArray(expression);
  }
  return typeof expression === "object" && expression !== null
    ? evaluateRecord(expression as LionRecordExpressionType)
    : evaluatePrimitive(expression as JsonPrimitiveType);
};

export interface RunOptions {
  /**
   * Relations, facts, and rules to start from. Defaults to an empty database.
   * The database's relations are bound by name, unless the environment
   * binds the same name.
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
      Effect.provideServiceEffect(
        LionEnvironmentService,
        makeEnvironment({ ...relationBindings(database), ...environment })
      ),
      Effect.provideService(LionDatabaseService, database)
    );
  });
