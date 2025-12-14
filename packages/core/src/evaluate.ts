import {
  Context,
  Effect,
  Match,
  Ref,
  Schema,
  Array,
  Option,
  pipe,
  flow,
  Predicate,
  Record,
  Function,
  String,
} from "effect";
import {
  LionArrayExpressionSchema,
  LionExpressionSchema,
  LionRecordExpressionSchema,
  type LionArrayExpressionType,
  type LionExpressionType,
  type LionRecordExpressionType,
} from "./schemas/lion-expression";
import { LionValueSchema, type LionRecordValueType, type LionValueType } from "./schemas/lion-value";
import { JsonPrimitiveSchema, type JsonPrimitiveType } from "./schemas/json-primitive";
import type { NonEmptyReadonlyArray } from "effect/Array";

// export const evaluate = (environment: Record<string, LionValueType>, expression: LionExpressionType): LionValueType => {
//   if (Array.isArray(expression)) {
//     if (expression.length === 0) {
//       return [];
//     }

//     const [name, ...args] = expression;

//     switch (name) {
//       case "quote": {
//         const [arg] = args;

//         if (arg === undefined) {
//           return (...args: unknown[]) => args[0];
//         }

//         return arg;
//       }
//       case "eval": {
//         const [arg] = args;

//         // Automatic currying
//         if (arg === undefined) {
//           return (...args: unknown[]) => {
//             const arg = args[0];
//             if (!isLionExpression(arg)) throw new Error("Invalid expression");
//             const value = evaluate(environment, arg);
//             if (!isLionExpression(value)) throw new Error("Invalid expression");
//             return evaluate(environment, value);
//           };
//         }

//         if (!isLionExpression(arg)) throw new Error("Invalid expression");
//         const value = evaluate(environment, arg);
//         if (!isLionExpression(value)) throw new Error("Invalid expression");
//         return evaluate(environment, value);
//       }
//       default: {
//         // The default is applicative-order evaluation: evaluate all arguments first before calling the function
//         const values = expression.map(evaluate.bind(undefined, environment));
//         const [fn, ...args] = values;

//         if (typeof fn === "function") {
//           const result = fn(...args);
//           if (!isLionValue(result)) throw new Error("Invalid value");
//           return result;
//         }

//         // If execution reaches this point, the expression is just a regular list of values
//         return values;
//       }
//     }
//   }

//   if (typeof expression === "object" && expression !== null) {
//     return Object.fromEntries(Object.entries(expression).map(([key, value]) => [key, evaluate(environment, value)]));
//   }

//   if (typeof expression === "string") {
//     const value = environment[expression];
//     if (value !== undefined) {
//       return value;
//     }
//   }

//   return expression;
// };

// walk creates a stream of expressions to evaluate
// evaluate creates a stream of evaluated values

class LionEnvironment extends Context.Tag("LionEnvironment")<
  LionEnvironment,
  Ref.Ref<Record<string, LionValueType>>
>() {}

const evaluateArray = (array: LionArrayExpressionType): Effect.Effect<LionValueType, Error> =>
  Effect.gen(function* () {
    return yield* pipe(
      array,
      Match.value,
      Match.when(
        (a) => Array.isEmptyReadonlyArray(a),
        (emptyArray) => Effect.succeed(emptyArray)
      ),
      Match.when(
        (a) => Array.isNonEmptyReadonlyArray(a),
        (nonEmptyArray) =>
          pipe(
            nonEmptyArray,
            Array.headNonEmpty,
            Match.value,
            Match.when(Match.string, (procedureName) =>
              pipe(
                procedureName,
                Match.value,
                Match.when("quote", () =>
                  pipe(
                    nonEmptyArray,
                    Match.value,
                    Match.when(Array.isNonEmptyReadonlyArray, (a) => Effect.succeed(Array.tailNonEmpty(a))),
                    Match.when(Array.isEmptyReadonlyArray, () =>
                      Effect.fail(new Error("Invalid quote expression: quote requires exactly one argument"))
                    ),
                    Match.orElseAbsurd
                  )
                ),
                Match.when("eval", () =>
                  pipe(
                    nonEmptyArray,
                    Match.value,
                    Match.when(Array.isNonEmptyReadonlyArray, (c) => evaluate(Array.tailNonEmpty(c))),
                    Match.when(Array.isEmptyReadonlyArray, () =>
                      Effect.fail(new Error("Invalid eval expression: eval requires exactly one argument"))
                    ),
                    Match.orElseAbsurd
                  )
                ),
                Match.orElseAbsurd
              )
            ),
            Match.orElse((regularList) => Effect.succeed(regularList))
          )
      ),
      Match.orElseAbsurd
    );
  });

const evaluatePrimitive = (a: JsonPrimitiveType): Effect.Effect<LionValueType> =>
  Effect.gen(function* () {
    return yield* pipe(
      a,
      Match.value,
      Match.when(String.isString, (a) => Effect.succeed(a)),
      Match.orElse((_) => Effect.succeed(a))
    );
  });

export const evaluate = (a: LionExpressionType): Effect.Effect<LionValueType, Error> =>
  Effect.gen(function* () {
    return yield* pipe(
      a,
      Match.value,
      Match.when(Schema.is(LionArrayExpressionSchema), (a) => evaluateArray(a)),
      Match.when(Schema.is(LionRecordExpressionSchema), (a) => evaluateRecord(a)),
      Match.when(Schema.is(JsonPrimitiveSchema), (a) => evaluatePrimitive(a)),
      Match.exhaustive
    );
  });

const evaluateRecord = (a: LionRecordExpressionType): Effect.Effect<LionRecordValueType, Error> =>
  Effect.all(Record.map(evaluate)(a));
