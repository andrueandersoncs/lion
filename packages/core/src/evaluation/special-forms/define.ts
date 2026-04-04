import { Effect, pipe, Ref } from "effect";
import { setGlobalBinding } from "@/evaluation/environment";
import { evaluate } from "@/evaluation/evaluate";
import type { DefineFormSchema } from "@/schemas/evaluation";
import { getService, LionEnvironmentService } from "@/services/evaluation";

export const evaluateDefine = ([_, id, expr]: typeof DefineFormSchema.Type) =>
  pipe(
    Effect.Do,
    Effect.bind("environment", () => getService(LionEnvironmentService)),
    Effect.bind("value", () => evaluate(expr)),
    Effect.flatMap(({ environment, value }) =>
      pipe(
        Ref.update(environment, (environment) =>
          setGlobalBinding(environment, id, value)
        ),
        Effect.map(() => value)
      )
    )
  );
