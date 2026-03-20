import { Effect, pipe, Record } from "effect";
import { evaluate } from "@/evaluation/evaluate.ts";
import type { LionRecordExpressionType } from "@/schemas/lion-expression";

export const evaluateRecord = (expression: LionRecordExpressionType) =>
  pipe(expression, Record.map(evaluate), Effect.all);
