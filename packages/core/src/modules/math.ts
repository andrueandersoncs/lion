import { Effect, pipe, Array, Match, Schema, flow } from "effect";

const add = (a: number, b: number) => Effect.succeed(a + b);
const subtract = (a: number, b: number) => Effect.succeed(a - b);
const multiply = (a: number, b: number) => Effect.succeed(a * b);
const divide = (a: number, b: number) => (b === 0 ? Effect.fail(new Error("Division by zero")) : Effect.succeed(a / b));

const equals = (a: number, b: number) => Effect.succeed(a === b);
const lessThan = (a: number, b: number) => Effect.succeed(a < b);
const greaterThan = (a: number, b: number) => Effect.succeed(a > b);
const lessThanOrEqualTo = (a: number, b: number) => Effect.succeed(a <= b);
const greaterThanOrEqualTo = (a: number, b: number) => Effect.succeed(a >= b);

export const math = {
  "+": (...args: unknown[]) =>
    pipe(
      args,
      Match.value,
      Match.when(Schema.is(Schema.Array(Schema.Number)), Effect.reduce(0, add)),
      Match.orElseAbsurd
    ),
  "-": (...args: unknown[]) =>
    pipe(
      args,
      Match.value,
      Match.when(Schema.is(Schema.Array(Schema.Number)), Effect.reduce(0, subtract)),
      Match.orElseAbsurd
    ),
  "*": (...args: unknown[]) =>
    pipe(
      args,
      Match.value,
      Match.when(Schema.is(Schema.Array(Schema.Number)), Effect.reduce(0, multiply)),
      Match.orElseAbsurd
    ),
  "/": (...args: unknown[]) =>
    pipe(
      args,
      Match.value,
      Match.when(Schema.is(Schema.Array(Schema.Number)), Effect.reduce(0, divide)),
      Match.orElseAbsurd
    ),
  "=": (...args: unknown[]) =>
    pipe(
      args,
      Match.value,
      Match.when(Schema.is(Schema.Array(Schema.Number).pipe(Schema.minItems(2))), (a) => {
        if (Array.isNonEmptyReadonlyArray(a)) {
          const [b, rest] = Array.unprepend(a);
          return pipe(rest, Effect.every(equals.bind(undefined, b)));
        }
        return Effect.fail(new Error("Equality comparison requires at least two arguments"));
      }),
      Match.orElseAbsurd
    ),
  "<": (a: unknown, b: unknown) =>
    Effect.gen(function* () {
      const aNumber = yield* Schema.decodeUnknown(Schema.Number)(a);
      const bNumber = yield* Schema.decodeUnknown(Schema.Number)(b);
      return yield* lessThan(aNumber, bNumber);
    }),
  ">": (a: unknown, b: unknown) =>
    Effect.gen(function* () {
      const aNumber = yield* Schema.decodeUnknown(Schema.Number)(a);
      const bNumber = yield* Schema.decodeUnknown(Schema.Number)(b);
      return yield* greaterThan(aNumber, bNumber);
    }),
  "<=": (a: unknown, b: unknown) =>
    Effect.gen(function* () {
      const aNumber = yield* Schema.decodeUnknown(Schema.Number)(a);
      const bNumber = yield* Schema.decodeUnknown(Schema.Number)(b);
      return yield* lessThanOrEqualTo(aNumber, bNumber);
    }),
  ">=": (a: unknown, b: unknown) =>
    Effect.gen(function* () {
      const aNumber = yield* Schema.decodeUnknown(Schema.Number)(a);
      const bNumber = yield* Schema.decodeUnknown(Schema.Number)(b);
      return yield* greaterThanOrEqualTo(aNumber, bNumber);
    }),
};
