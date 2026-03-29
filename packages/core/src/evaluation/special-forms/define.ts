import { Effect, pipe, Record, Ref } from "effect";
import type { DefineFormSchema } from "@/schemas/evaluation";
import { getService, LionEnvironmentService } from "@/services/evaluation";
import { evaluate } from "../evaluate";

export const evaluateDefine = ([_, id, expr]: typeof DefineFormSchema.Type) =>
  pipe(
    Effect.Do,
    Effect.bind("environment", () => getService(LionEnvironmentService)),
    Effect.bind("value", () => evaluate(expr)),
    Effect.flatMap(({ environment, value }) =>
      pipe(
        Ref.update(environment, Record.set(id, value)),
        Effect.map(() => value)
      )
    )
  );

// Effect.gen(function* () {
//   const environment = yield* getService(LionEnvironmentService);
//   const value = yield* evaluate(expr);
//   yield* Ref.update(environment, Record.set(id, value));
//   return value;
// });
