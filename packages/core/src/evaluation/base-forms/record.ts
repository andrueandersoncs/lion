import { Effect, pipe, Record } from "effect";
import { answer, isWriting } from "@/evaluation/asking";
import { evaluate } from "@/evaluation/evaluate.ts";
import { suspendArguments } from "@/evaluation/special-forms/lambda";
import {
  DeferredCall,
  isWaiting,
  LogicValue,
  recordMaker,
} from "@/logic/terms";
import type { LionRecordExpressionType } from "@/schemas/lion-expression";
import type { EvaluateResult } from "@/types/evaluation";

const isLogic = (value: unknown) => value instanceof LogicValue;

/**
 * Evaluates every value of a record. A record holds values, so a question
 * among them is asked, and a record with a value that is not known yet
 * waits: it is a term, made of the terms its values are, and becomes the
 * record once the variables it mentions are bound. A rule or query holds
 * every record with a logic value in it that way.
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
      return Effect.flatMap(
        isWriting,
        (writing): EvaluateResult =>
          writing || values.some(isWaiting)
            ? Effect.map(
                suspendArguments(values),
                (parts) =>
                  new DeferredCall(
                    recordMaker(Object.keys(record)),
                    undefined,
                    parts
                  )
              )
            : Effect.all(Record.map(record, answer))
      );
    })
  );
