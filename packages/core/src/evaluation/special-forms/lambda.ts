import { Array as Arr, Effect, Record, Ref } from "effect";
import { ArgumentMismatchError } from "@/errors/evaluation";
import { evaluate } from "@/evaluation/evaluate";
import type { LambdaFormSchema } from "@/schemas/evaluation";
import {
  getService,
  LionEnvironmentService,
  makeEnvironmentRef,
} from "@/services/evaluation";

// TODO: FIXME: lambda breaks global environment (code inside lambda does not have access to global environment)
export const evaluateLambda = ([
  _,
  parameters,
  bodyExpression,
]: typeof LambdaFormSchema.Type) =>
  Effect.gen(function* () {
    const environmentRef = yield* getService(LionEnvironmentService);
    const environment = yield* Ref.get(environmentRef);
    const lambda = Effect.fn(function* (...args: unknown[]) {
      if (parameters.length !== args.length) {
        return yield* new ArgumentMismatchError();
      }
      const params = Record.fromEntries(Arr.zip(parameters, args));
      const newEnvironment = yield* makeEnvironmentRef({
        ...environment,
        ...params,
      });
      return yield* evaluate(bodyExpression).pipe(
        Effect.provideService(LionEnvironmentService, newEnvironment)
      );
    });
    return lambda;
  });
