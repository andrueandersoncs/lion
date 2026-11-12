import { Effect, pipe, Record } from "effect";
import { answer, isWriting } from "@/evaluation/asking";
import { evaluate } from "@/evaluation/evaluate.ts";
import { suspend } from "@/evaluation/special-forms/lambda";
import { isWaiting, LogicValue } from "@/logic/terms";
import type { LionRecordExpressionType } from "@/schemas/lion-expression";
import type { EvaluateResult } from "@/types/evaluation";

const isLogic = (value: unknown) => value instanceof LogicValue;

/**
 * Evaluates every value of a record. A record holds values, so a question
 * among them is asked, and a record with a value that is not known yet
 * waits: it is built once the variables it mentions are bound.
 */
export const evaluateRecord = (expression: LionRecordExpressionType) =>
  pipe(
    expression,
    Record.map(evaluate),
    Effect.all,
    Effect.flatMap((record): EvaluateResult => {
      const values = Object.values(record);
      if (!values.some(isLogic)) {
        return Effect.succeed(record);
      }
      if (values.some(isWaiting)) {
        return suspend(expression);
      }
      return Effect.flatMap(
        isWriting,
        (writing): EvaluateResult =>
          writing ? suspend(expression) : Effect.all(Record.map(record, answer))
      );
    })
  );
