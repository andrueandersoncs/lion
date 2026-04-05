import { Array as Arr, Effect, Record, Ref } from "effect";
import { ArgumentMismatchError } from "@/errors/evaluation";
import {
  getGlobalEnvironment,
  makeEnvironment,
  replaceGlobalEnvironment,
} from "@/evaluation/environment";
import { evaluate } from "@/evaluation/evaluate";
import type { LambdaFormSchema } from "@/schemas/evaluation";
import {
  getService,
  LionEnvironmentService,
  makeEnvironmentRef,
} from "@/services/evaluation";

export const evaluateLambda = ([
  _,
  parameters,
  bodyExpression,
]: typeof LambdaFormSchema.Type) =>
  Effect.gen(function* () {
    const enclosedEnvironmentRef = yield* getService(LionEnvironmentService);
    const lambda = Effect.fn(function* (...args: unknown[]) {
      if (args.length < parameters.length) {
        return yield* new ArgumentMismatchError();
      }
      const paramsEnvironment = Record.fromEntries(Arr.zip(parameters, args));
      const enclosedEnvironment = yield* Ref.get(enclosedEnvironmentRef);
      const environmentRef = yield* makeEnvironmentRef(
        makeEnvironment(paramsEnvironment, enclosedEnvironment)
      );

      const syncGlobalEnvironment = Ref.get(environmentRef).pipe(
        Effect.flatMap((environment) =>
          Ref.update(enclosedEnvironmentRef, (enclosedEnvironment) =>
            replaceGlobalEnvironment(
              enclosedEnvironment,
              getGlobalEnvironment(environment)
            )
          )
        )
      );

      return yield* evaluate(bodyExpression).pipe(
        Effect.provideService(LionEnvironmentService, environmentRef),
        Effect.ensuring(syncGlobalEnvironment)
      );
    });
    return lambda;
  });
