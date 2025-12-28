import { Effect, pipe, Record } from "effect";
import type { LionRecordExpressionType } from "../../schemas/lion-expression.ts";
import { evaluate, type EvaluateResult } from "../evaluate.ts";

export const evaluateRecord = (expression: LionRecordExpressionType): EvaluateResult =>
  pipe(expression, Record.map(evaluate), Effect.all);
