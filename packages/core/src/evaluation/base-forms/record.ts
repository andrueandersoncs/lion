import { Effect, Record } from "effect";
import { answer, isWriting } from "@/evaluation/asking";
import { andThen, type Compiled, Pending, runAll } from "@/evaluation/compiled";
import { compile } from "@/evaluation/evaluate.ts";
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
 * A record holds values, so a question among them is asked, and a record
 * with a value that is not known yet waits: it is a term, made of the terms
 * its values are, and becomes the record once the variables it mentions are
 * bound. A rule or query holds every record with a logic value in it that
 * way.
 */
const holding = (
  keys: readonly string[],
  values: readonly unknown[]
): unknown => {
  const record: Record<string, unknown> = {};
  for (const [at, key] of keys.entries()) {
    record[key] = values[at];
  }
  if (!values.some(isLogic)) {
    return record;
  }
  return new Pending(
    Effect.flatMap(
      isWriting,
      (writing): EvaluateResult =>
        writing || values.some(isWaiting)
          ? Effect.map(
              suspendArguments(values),
              (parts) => new DeferredCall(recordMaker(keys), undefined, parts)
            )
          : Effect.all(Record.map(record, answer))
    )
  );
};

/** Evaluates every value of a record, in the order of its keys. */
export const compileRecord = (
  expression: LionRecordExpressionType
): Compiled => {
  const keys = Object.keys(expression);
  const values = keys.map((key) => compile(expression[key] as never));
  const hold = (made: unknown) => holding(keys, made as readonly unknown[]);
  return (environment, depth) =>
    andThen(runAll(values, environment, depth), depth, hold);
};
