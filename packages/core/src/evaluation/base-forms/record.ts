import { Effect, pipe, Record } from "effect";
import { evaluate } from "@/evaluation/evaluate.ts";
import { suspend } from "@/evaluation/special-forms/lambda";
import { isWaiting } from "@/logic/terms";
import type { LionRecordExpressionType } from "@/schemas/lion-expression";
import type { EvaluateResult } from "@/types/evaluation";

/**
 * Evaluates every value of a record. A record that holds a logic term waits:
 * it is built once the variables it mentions are bound.
 */
export const evaluateRecord = (expression: LionRecordExpressionType) =>
  pipe(
    expression,
    Record.map(evaluate),
    Effect.all,
    Effect.flatMap(
      (record): EvaluateResult =>
        Object.values(record).some(isWaiting)
          ? suspend(expression)
          : Effect.succeed(record)
    )
  );
