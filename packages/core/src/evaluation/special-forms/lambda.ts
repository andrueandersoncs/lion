import { Array as Arr, Effect, Record } from "effect";
import { ArgumentMismatchError } from "@/errors/evaluation";
import { makeEnvironment } from "@/evaluation/environment";
import { evaluate } from "@/evaluation/evaluate";
import type { LambdaFormSchema } from "@/schemas/evaluation";
import { getService, LionEnvironmentService } from "@/services/evaluation";

export const evaluateLambda = ([
  _,
  parameters,
  bodyExpression,
]: typeof LambdaFormSchema.Type) =>
  Effect.gen(function* () {
    const enclosedEnvironment = yield* getService(LionEnvironmentService);
    const lambda = Effect.fn(function* (...args: unknown[]) {
      if (args.length < parameters.length) {
        return yield* new ArgumentMismatchError();
      }
      const paramsEnvironment = Record.fromEntries(Arr.zip(parameters, args));
      const environment = yield* makeEnvironment(
        paramsEnvironment,
        enclosedEnvironment
      );
      return yield* evaluate(bodyExpression).pipe(
        Effect.provideService(LionEnvironmentService, environment)
      );
    });
    return lambda;
  });
