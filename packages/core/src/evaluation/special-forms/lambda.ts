import { Array as Arr, Effect, Record, Ref } from "effect";
import { ArgumentMismatchError } from "@/errors/evaluation";
import { makeEnvironment } from "@/evaluation/environment";
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
    const enclosedEnvironment = yield* Ref.get(enclosedEnvironmentRef);
    const lambda = Effect.fn(function* (...args: unknown[]) {
      if (args.length < parameters.length) {
        return yield* new ArgumentMismatchError();
      }
      const paramsEnvironment = Record.fromEntries(Arr.zip(parameters, args));
      const environmentRef = yield* makeEnvironmentRef(
        makeEnvironment(paramsEnvironment, enclosedEnvironment)
      );
      return yield* evaluate(bodyExpression).pipe(
        Effect.provideService(LionEnvironmentService, environmentRef)
      );
    });
    return lambda;
  });
