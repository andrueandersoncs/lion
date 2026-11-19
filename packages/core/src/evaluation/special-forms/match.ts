import { Effect, Schema } from "effect";
import { answer, isWriting } from "@/evaluation/asking";
import {
  andThen,
  type Compiled,
  Pending,
  toEffect,
} from "@/evaluation/compiled";
import type { Environment, Scope } from "@/evaluation/environment";
import { compile } from "@/evaluation/evaluate";
import { applyIn } from "@/evaluation/special-forms/function";
import { suspend } from "@/evaluation/special-forms/lambda";
import { fits } from "@/logic/fit";
import { isWaiting, LogicValue } from "@/logic/terms";
import {
  LionFunctionValueSchema,
  type MatchFormSchema,
} from "@/schemas/evaluation";
import type { LionExpressionType } from "@/schemas/lion-expression";
import { LionEnvironmentService } from "@/services/evaluation";
import type { EvaluateResult } from "@/types/evaluation";

/*
["match", <value>, [<schema>, <fn>], ..., <fallback-fn>]
*/

const functionOf = Schema.decodeUnknownEffect(LionFunctionValueSchema);

/**
 * Applies the function of the first pattern whose schema the value fits, or
 * the fallback. Anything is a schema: a predicate, a relation, a record or
 * list of schemas, or a plain value. A value that is a question is asked.
 * When the value, or what a schema says about it, is not known yet, the
 * form waits.
 */
export const compileMatch = (
  expression: typeof MatchFormSchema.Type,
  scope: Scope | undefined
): Compiled => {
  const [_, subject, ...rest] = expression;
  const value = compile(subject, scope);
  const patterns = (
    rest.slice(0, -1) as (readonly [LionExpressionType, LionExpressionType])[]
  ).map(
    ([schema, fn]) => [compile(schema, scope), compile(fn, scope)] as const
  );
  const fallback = compile(rest.at(-1) as LionExpressionType, scope);
  const applied = (fn: Compiled, made: unknown, environment: Environment) =>
    Effect.gen(function* () {
      const decoded = yield* functionOf(yield* toEffect(fn(environment, 0)));
      return yield* toEffect(
        applyIn(decoded, [made], undefined, environment, 0)
      );
    });
  const against = (made: unknown, environment: Environment): EvaluateResult =>
    Effect.gen(function* () {
      for (const [schema, fn] of patterns) {
        const shape = yield* toEffect(schema(environment, 0));
        const decoded = yield* functionOf(yield* toEffect(fn(environment, 0)));
        const fit = yield* fits(shape, made).pipe(
          Effect.provideService(LionEnvironmentService, environment)
        );
        if (fit) {
          return yield* toEffect(
            applyIn(decoded, [made], undefined, environment, 0)
          );
        }
      }
      return yield* applied(fallback, made, environment);
    });
  const matched = (made: unknown, environment: Environment): unknown => {
    if (!(made instanceof LogicValue)) {
      return new Pending(against(made, environment));
    }
    if (isWaiting(made)) {
      return new Pending(suspend(expression, environment, self, scope));
    }
    return new Pending(
      Effect.flatMap(isWriting, (writing) =>
        writing
          ? suspend(expression, environment, self, scope)
          : Effect.flatMap(answer(made), (answered) =>
              against(answered, environment)
            )
      )
    );
  };
  const self: Compiled = (environment, depth) => {
    const result = andThen(value(environment, depth), depth, (made) =>
      matched(made, environment)
    );
    return result instanceof Pending
      ? new Pending(
          Effect.catchTag(result.effect, "WaitingError", () =>
            suspend(expression, environment, self, scope)
          )
        )
      : result;
  };
  return self;
};
