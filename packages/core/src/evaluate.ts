import { Context, Effect, Match, Ref, Schema, Array, Option, pipe, Record, String, Data } from "effect";
import {
  LionArrayExpressionSchema,
  LionExpressionSchema,
  LionRecordExpressionSchema,
  type LionArrayExpressionType,
  type LionExpressionType,
  type LionRecordExpressionType,
} from "./schemas/lion-expression.ts";
import { LionFunctionValueSchema, type LionValueType } from "./schemas/lion-value.ts";
import { JsonPrimitiveSchema, type JsonPrimitiveType } from "./schemas/json-primitive.ts";

// IDEA:
// walk creates a stream of expressions to evaluate
// evaluate creates a stream of evaluated values

export class LionEnvironment extends Context.Tag("LionEnvironment")<
  LionEnvironment,
  Ref.Ref<Record<string, LionValueType>>
>() {}

export class TooFewArgumentsGivenError extends Data.TaggedError("TooFewArgumentsGivenError")<{
  functionName: string;
  passedArgs: any[];
  expectedArgs: string[];
}> {}

export class InvalidArgumentTypeError extends Data.TaggedError("InvalidArgumentTypeError")<{
  functionName: string;
  passedArgs: any[];
  expectedArgs: string[];
}> {}

const evaluateArray = (expression: LionArrayExpressionType): Effect.Effect<unknown, Error, LionEnvironment> =>
  pipe(
    Match.value(expression),
    // empty array expression: default return empty array
    Match.when(
      (expression) => Array.isEmptyReadonlyArray(expression),
      (emptyArray) => Effect.succeed(emptyArray)
    ),
    // nonempty array expression: evaluate
    Match.when(
      (expression) => Array.isNonEmptyReadonlyArray(expression),
      (nonEmptyArray) =>
        pipe(
          Array.unprepend(nonEmptyArray),
          Match.value,
          // function call form: match on correct evaluation order
          Match.when([Match.string, Match.any], ([name, args]) =>
            pipe(
              Match.value(name),
              // quote special form
              Match.when("quote", () =>
                pipe(
                  Array.head(args),
                  Option.match({
                    onSome: (quotedValue) => Effect.succeed(quotedValue),
                    onNone: () =>
                      Effect.fail(
                        new TooFewArgumentsGivenError({
                          functionName: "quote",
                          passedArgs: args,
                          expectedArgs: ["quotedValue"],
                        })
                      ),
                  })
                )
              ),
              // eval special form
              Match.when("eval", () =>
                pipe(
                  Array.head(args),
                  Option.match({
                    onSome: (firstArg) =>
                      pipe(
                        evaluate(firstArg),
                        Effect.flatMap((value) =>
                          pipe(
                            Match.value(value),
                            Match.when(Schema.is(LionFunctionValueSchema), (_) =>
                              Effect.fail(
                                new InvalidArgumentTypeError({
                                  functionName: "eval",
                                  passedArgs: args,
                                  expectedArgs: ["expression"],
                                })
                              )
                            ),
                            Match.when(Schema.is(LionExpressionSchema), (_) => evaluate(_)),
                            Match.orElseAbsurd
                          )
                        )
                      ),
                    onNone: () =>
                      Effect.fail(
                        new TooFewArgumentsGivenError({
                          functionName: "eval",
                          passedArgs: args,
                          expectedArgs: ["expression"],
                        })
                      ),
                  })
                )
              ),
              // function application form
              Match.when(Match.string, () =>
                pipe(
                  nonEmptyArray,
                  Array.map(evaluate),
                  Effect.all,
                  Effect.map(Array.unprepend),
                  Effect.flatMap(([head, tail]) =>
                    pipe(
                      Match.value(head),
                      Match.when(Schema.is(LionFunctionValueSchema), (fn) => fn(...tail)),
                      Match.orElse(() => Effect.succeed([head, ...tail]))
                    )
                  )
                )
              ),
              Match.exhaustive
            )
          ),
          // basically a "cons" expression: just evaluate and return the list
          Match.orElse(() => pipe(nonEmptyArray, Array.map(evaluate), Effect.all))
        )
    ),
    Match.orElseAbsurd
  );

const evaluatePrimitive = (expression: JsonPrimitiveType): Effect.Effect<LionValueType, Error, LionEnvironment> =>
  pipe(
    Match.value(expression),
    Match.when(String.isString, (name) =>
      Effect.gen(function* () {
        const envService = yield* LionEnvironment;
        const environment = yield* envService.get;
        return pipe(
          Record.get(environment, name),
          Option.match({
            onSome: (referencedValue) => referencedValue,
            onNone: () => expression,
          })
        );
      })
    ),
    Match.orElse((_) => Effect.succeed(_))
  );

export const evaluate = (expression: LionExpressionType): Effect.Effect<unknown, Error, LionEnvironment> =>
  pipe(
    Match.value(expression),
    Match.when(Schema.is(LionArrayExpressionSchema), (_) => evaluateArray(_)),
    Match.when(Schema.is(LionRecordExpressionSchema), (_) => evaluateRecord(_)),
    Match.when(Schema.is(JsonPrimitiveSchema), (_) => evaluatePrimitive(_)),
    Match.exhaustive
  );

const evaluateRecord = (expression: LionRecordExpressionType): Effect.Effect<unknown, Error, LionEnvironment> =>
  pipe(expression, Record.map(evaluate), Effect.all);
