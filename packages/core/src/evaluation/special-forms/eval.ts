import { Effect, Schema } from "effect";
import { evaluate } from "@/evaluation/evaluate.ts";
import { DeferredCall, isWaiting, nameFunctions } from "@/logic/terms";
import type { EvalFormSchema } from "@/schemas/evaluation";
import { LionExpressionSchema } from "@/schemas/lion-expression";
import { LionEnvironmentService } from "@/services/evaluation";

/**
 * Evaluates its argument, then evaluates the result as code, in the scope
 * the form was written in. Code that is not known yet waits for its logic
 * variables.
 */
export const evaluateEval = ([_, expression]: typeof EvalFormSchema.Type) =>
  Effect.gen(function* () {
    const environment = yield* LionEnvironmentService;
    const run = (code: unknown) =>
      Schema.decodeUnknownEffect(LionExpressionSchema)(code).pipe(
        Effect.flatMap(evaluate),
        Effect.provideService(LionEnvironmentService, environment)
      );
    const code = yield* evaluate(expression);
    if (!isWaiting(code)) {
      return yield* run(code);
    }
    nameFunctions({ eval: run });
    return new DeferredCall(run, "eval", [code]);
  });
