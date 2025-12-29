import { Effect, pipe, Record } from "effect";
import { type LionRecordExpressionType } from "../../schemas/lion-expression.ts";
import { evaluate } from "../evaluate.ts";

export const evaluateRecord = (expression: LionRecordExpressionType) =>
  pipe(expression, Record.map(evaluate), Effect.all);
