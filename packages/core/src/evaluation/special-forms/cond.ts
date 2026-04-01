import { Array as Arr, Effect, Match, pipe, Schema } from "effect";
import { evaluate } from "@/evaluation/evaluate";
import {
  type CondFormSchema,
  CondFormWithElseSchema,
  CondFormWithoutElseSchema,
} from "@/schemas/evaluation";

export const evaluateCond = (expression: typeof CondFormSchema.Type) =>
  pipe(
    Match.value(expression),
    Match.when(Schema.is(CondFormWithoutElseSchema), (exprWithoutElse) =>
      Effect.gen(function* () {
        const [_, ...cases] = exprWithoutElse;
        for (const [condition, result] of cases) {
          const conditionResult = yield* evaluate(condition);
          if (conditionResult) {
            return yield* evaluate(result);
          }
        }
        return null;
      })
    ),
    Match.when(Schema.is(CondFormWithElseSchema), (expression) =>
      Effect.gen(function* () {
        const [_, ...cases] = expression;
        for (const [condition, result] of Arr.initNonEmpty(cases)) {
          const conditionResult = yield* evaluate(condition);
          if (conditionResult) {
            return yield* evaluate(result);
          }
        }
        const elseCase = Arr.lastNonEmpty(cases);
        return yield* evaluate(elseCase);
      })
    ),
    Match.exhaustive
  );
