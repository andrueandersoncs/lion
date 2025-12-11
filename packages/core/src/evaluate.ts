import { Context, Effect, Match, Ref, Schema, Array, Option, pipe, flow, Predicate, Record } from "effect";
import {
  LionArraySchema,
  LionExpressionSchema,
  LionRecordSchema,
  type LionArrayType,
  type LionExpressionType,
  type LionRecordType,
} from "./schemas/lion-expression";
import { LionValueSchema, type LionValueType } from "./schemas/lion-value";
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

const expressionTypeMatch = Match.type<LionExpressionType>();

/*
Option.map((name) =>
  Match.value(name).pipe(
    Match.when("quote", () => {}),
    Match.when("eval", () => {}),
    Match.orElse(() => {})
  )
),
Option.orElseSome(() => [])
,*/

/*
Match.when(Schema.is(LionArraySchema), (expression) =>
    pipe(
      Match.value(expression),
      Match.when(Array.isEmptyReadonlyArray, () => []),
      Match.when(Array.isNonEmptyReadonlyArray, Array.unprepend)
    )
  ),
*/

const evaluateArray = Match.type<LionArrayType>().pipe(
  Match.when(Array.isEmptyReadonlyArray, () => []),
  Match.when(
    Array.isNonEmptyReadonlyArray,
    flow(
      Array.unprepend,
      Match.value,
      Match.when(["quote", () => true], () => true),
      Match.when(["eval", () => true], () => true),
      Match.when([Match.string, () => true], () => true)
    )
  ),
  Match.orElseAbsurd
);

const evaluateRecord = Match.type<LionRecordType>().pipe(Match.orElseAbsurd);

const evaluatePrimitive = Match.type<JsonPrimitiveType>().pipe(Match.orElseAbsurd);

export const evaluate = expressionTypeMatch.pipe(
  Match.when(Schema.is(LionArraySchema), (expression) => evaluateArray(expression)),
  Match.when(Schema.is(LionRecordSchema), (expression) => evaluateRecord(expression)),
  Match.when(Schema.is(JsonPrimitiveSchema), (expression) => evaluatePrimitive(expression)),
  Match.exhaustive
);
