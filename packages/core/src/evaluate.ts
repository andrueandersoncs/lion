import { Context, Effect, Match, Ref, Schema, Array, Option, pipe, Record, String } from "effect";
import {
  LionArrayExpressionSchema,
  LionExpressionSchema,
  LionRecordExpressionSchema,
  type LionArrayExpressionType,
  type LionExpressionType,
  type LionRecordExpressionType,
} from "./schemas/lion-expression";
import { LionFunctionValueSchema, type LionRecordValueType, type LionValueType } from "./schemas/lion-value";
import { JsonPrimitiveSchema, type JsonPrimitiveType } from "./schemas/json-primitive";

// walk creates a stream of expressions to evaluate
// evaluate creates a stream of evaluated values

export class LionEnvironment extends Context.Tag("LionEnvironment")<
  LionEnvironment,
  Ref.Ref<Record<string, LionValueType>>
>() {}

const evaluateArray = (expression: LionArrayExpressionType): Effect.Effect<LionValueType, Error, LionEnvironment> =>
  pipe(
    Match.value(expression),
    Match.when(
      (expression) => Array.isEmptyReadonlyArray(expression),
      (emptyArray) => Effect.succeed(emptyArray)
    ),
    Match.when(
      (expression) => Array.isNonEmptyReadonlyArray(expression),
      (nonEmptyArray) =>
        pipe(
          Array.unprepend(nonEmptyArray),
          Match.value,
          Match.when([Match.string, Match.any], ([name, args]) =>
            pipe(
              Match.value(name),
              Match.when("quote", () =>
                pipe(
                  Array.head(args),
                  Option.match({
                    onSome: (quotedValue) => Effect.succeed(quotedValue),
                    onNone: () =>
                      Effect.fail(new Error("Invalid quote expression: quote requires exactly one argument")),
                  })
                )
              ),
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
                              Effect.fail(new Error("Invalid eval expression: given argument must be an expression"))
                            ),
                            Match.when(Schema.is(LionExpressionSchema), (_) => evaluate(_)),
                            Match.orElseAbsurd
                          )
                        )
                      ),
                    onNone: () => Effect.fail(new Error("Invalid eval expression: eval requires exactly one argument")),
                  })
                )
              ),
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
                      Match.orElse((_) => Effect.succeed(_))
                    )
                  )
                )
              ),
              Match.orElse((_) => Effect.succeed(_))
            )
          ),
          Match.orElse((_) => Effect.succeed(_))
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

export const evaluate = (expression: LionExpressionType): Effect.Effect<LionValueType, Error, LionEnvironment> =>
  pipe(
    Match.value(expression),
    Match.when(Schema.is(LionArrayExpressionSchema), (_) => evaluateArray(_)),
    Match.when(Schema.is(LionRecordExpressionSchema), (_) => evaluateRecord(_)),
    Match.when(Schema.is(JsonPrimitiveSchema), (_) => evaluatePrimitive(_)),
    Match.exhaustive
  );

const evaluateRecord = (
  expression: LionRecordExpressionType
): Effect.Effect<LionRecordValueType, Error, LionEnvironment> => Effect.all(Record.map(evaluate)(expression));
