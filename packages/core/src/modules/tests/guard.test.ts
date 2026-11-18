/**
 * A library function checks its arguments with a guard compiled from each
 * parameter schema's AST, and runs the schema's decoder only when the guard
 * says no, or the schema has no guard. The model is the decoder alone: on
 * every schema and every value, checking with the guard gives what decoding
 * gives, the same value or the same error, and so do the library functions
 * built on it.
 *
 * Schemas are generated as descriptions. Each is written out as an Effect
 * Schema, and a plain model says whether it should have a guard: a schema
 * of strings, numbers, booleans, anything, and lists of those, with any
 * checks, and nothing that transforms or that the decoder rebuilds.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Cause, Effect, Exit, Schema } from "effect";
import { guardOf } from "@/modules/lib/guard";
import { combining, decode, over, slicing } from "@/modules/lib/shared";
import { RecordKeySchema } from "@/schemas/lion-expression";

const OPTIONS = { arbitrary: { runs: 500 } };

/** A number the throwing check throws on. */
const UNLUCKY = 7;

/** Schemas whose decoder gives back the value it was given. */
const LEAVES = {
  any: Schema.Any,
  unknown: Schema.Unknown,
  string: Schema.String,
  number: Schema.Number,
  boolean: Schema.Boolean,
  int: Schema.Int,
  key: RecordKeySchema,
  short: Schema.String.check(Schema.isMaxLength(3)),
  int32: Schema.Number.check(Schema.isInt32()),
  positive: Schema.Int.check(Schema.isGreaterThan(0)),
  throwing: Schema.Number.check(
    Schema.makeFilter((n: number) => {
      if (n === UNLUCKY) {
        throw new Error("unlucky");
      }
      return true;
    })
  ),
} as const;

/** Schemas the decoder transforms or rebuilds, so they have no guard. */
const OTHERS = {
  record: Schema.Record(Schema.String, Schema.Unknown),
  struct: Schema.Struct({ a: Schema.Number }),
  union: Schema.Union([Schema.Number, Schema.String]),
  transform: Schema.NumberFromString,
  optional: Schema.Tuple([Schema.Number, Schema.optionalKey(Schema.String)]),
  literal: Schema.Literals(["a", 1]),
  null: Schema.Null,
} as const;

type Leaf = keyof typeof LEAVES;
type Other = keyof typeof OTHERS;

type Shape =
  | { readonly kind: "leaf"; readonly name: Leaf }
  | { readonly kind: "other"; readonly name: Other }
  | { readonly kind: "list"; readonly item: Shape; readonly some: boolean }
  | {
      readonly kind: "tuple";
      readonly items: readonly Shape[];
      readonly rest: Shape | undefined;
    };

const schemaOf = (shape: Shape): Schema.Top => {
  switch (shape.kind) {
    case "leaf":
      return LEAVES[shape.name];
    case "other":
      return OTHERS[shape.name];
    case "list": {
      const list = Schema.Array(schemaOf(shape.item));
      return shape.some ? list.check(Schema.isMinLength(1)) : list;
    }
    default: {
      const items = shape.items.map(schemaOf);
      return shape.rest === undefined
        ? Schema.Tuple(items)
        : Schema.TupleWithRest(Schema.Tuple(items), [schemaOf(shape.rest)]);
    }
  }
};

/** Whether the shape's schema should have a guard. */
const guarded = (shape: Shape): boolean => {
  switch (shape.kind) {
    case "leaf":
      return true;
    case "other":
      return false;
    case "list":
      return guarded(shape.item);
    default:
      return (
        shape.items.every(guarded) &&
        (shape.rest === undefined || guarded(shape.rest))
      );
  }
};

/** One of the generators, chosen at random. */
const oneOf = <A>(choices: readonly Arbitrary.Arbitrary<A>[]) =>
  Arbitrary.flatMap(
    Arbitrary.schema(
      Schema.Int.check(
        Schema.isBetween({ minimum: 0, maximum: choices.length - 1 })
      )
    ),
    (at) => choices[at] as Arbitrary.Arbitrary<A>
  );

const pick = <const A extends readonly unknown[]>(values: A) =>
  oneOf(values.map((value) => Arbitrary.Constant(value as A[number])));

const small = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -3, maximum: 9 }))
);

/** Scalars, with the strings and numbers the checks above tell apart. */
const scalar: Arbitrary.Arbitrary<unknown> = oneOf<unknown>([
  pick([null, undefined, true, false, 0, -0, 1.5, Number.NaN] as const),
  small,
  Arbitrary.schema(Schema.Number),
  Arbitrary.schema(Schema.String),
  pick(["", "a", "abcd", "__proto__", "constructor", "1"] as const),
]);

/** Any value Lion could pass, nested a little. */
const anything = (depth: number): Arbitrary.Arbitrary<unknown> =>
  depth === 0
    ? scalar
    : oneOf<unknown>([
        scalar,
        scalar,
        Arbitrary.array(anything(depth - 1), { maxLength: 3 }),
        Arbitrary.map(
          Arbitrary.array(
            Arbitrary.all([pick(["a", "b", "__proto__"] as const), scalar]),
            { maxLength: 3 }
          ),
          (entries): unknown => Object.fromEntries(entries)
        ),
      ]);

/** A list of values for the items in order, one fewer or one more at times. */
const near = (items: readonly Arbitrary.Arbitrary<unknown>[]) =>
  Arbitrary.flatMap(pick([-1, 0, 0, 0, 1] as const), (change) => {
    const kept = change < 0 ? items.slice(0, -1) : items;
    return Arbitrary.all(change > 0 ? [...kept, anything(1)] : kept);
  });

/** For each leaf, values of its kind, which fit it or nearly do. */
const OF_KIND: Record<Leaf, Arbitrary.Arbitrary<unknown>> = {
  any: anything(1),
  unknown: anything(1),
  string: Arbitrary.schema(Schema.String),
  number: Arbitrary.schema(Schema.Number),
  boolean: pick([true, false] as const),
  int: oneOf<unknown>([small, pick([1.5, -0] as const)]),
  key: pick(["a", "", "__proto__", "constructor"] as const),
  short: pick(["", "ab", "abc", "abcd"] as const),
  int32: oneOf<unknown>([small, pick([2 ** 31, 0.5] as const)]),
  positive: small,
  throwing: pick([UNLUCKY - 1, UNLUCKY, UNLUCKY + 1] as const),
};

/** A value for the shape: often one that fits, often one that nearly does. */
const valueFor = (shape: Shape): Arbitrary.Arbitrary<unknown> => {
  switch (shape.kind) {
    case "leaf":
      return oneOf([OF_KIND[shape.name], OF_KIND[shape.name], scalar]);
    case "other":
      return oneOf<unknown>([
        anything(1),
        pick([[1], [1, "a"], [1, 2], { a: 1, b: 2 }, "2", "a"] as const),
      ]);
    case "list":
      return oneOf<unknown>([
        anything(1),
        Arbitrary.array(valueFor(shape.item), { maxLength: 4 }),
      ]);
    default: {
      const rest =
        shape.rest === undefined
          ? []
          : [valueFor(shape.rest), valueFor(shape.rest)];
      return oneOf<unknown>([
        anything(1),
        near([...shape.items.map(valueFor), ...rest]),
      ]);
    }
  }
};

const leaf = Arbitrary.map(
  pick(Object.keys(LEAVES) as Leaf[]),
  (name): Shape => ({ kind: "leaf", name })
);

const other = Arbitrary.map(
  pick(Object.keys(OTHERS) as Other[]),
  (name): Shape => ({ kind: "other", name })
);

const shapeOf = (depth: number): Arbitrary.Arbitrary<Shape> =>
  depth === 0
    ? oneOf([leaf, leaf, leaf, other])
    : oneOf([
        leaf,
        leaf,
        other,
        Arbitrary.map(
          Arbitrary.all([shapeOf(depth - 1), pick([false, true] as const)]),
          ([item, some]): Shape => ({ kind: "list", item, some })
        ),
        Arbitrary.map(
          Arbitrary.all([
            Arbitrary.array(shapeOf(depth - 1), { maxLength: 3 }),
            oneOf([
              Arbitrary.Constant(undefined),
              shapeOf(depth - 1) as Arbitrary.Arbitrary<Shape | undefined>,
            ]),
          ]),
          ([items, rest]): Shape => ({ kind: "tuple", items, rest })
        ),
      ]);

/** A schema's description, with a value to check against it. */
const checked = Arbitrary.flatMap(shapeOf(2), (shape) =>
  Arbitrary.map(valueFor(shape), (value) => ({ shape, value }))
);

/** An error as the user reads it. */
const said = (reason: Cause.Reason<unknown>) => {
  if (Cause.isFailReason(reason)) {
    return String(reason.error);
  }
  return Cause.isDieReason(reason) ? String(reason.defect) : reason._tag;
};

/** What an Exit says: the value, or each error as the user reads it. */
const outcome = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isSuccess(exit)
    ? { value: exit.value }
    : { errors: exit.cause.reasons.map(said) };

const decoded = (schema: Schema.Top, value: unknown) =>
  Effect.runSyncExit(
    Schema.decodeUnknownEffect(schema as Schema.Decoder<unknown>)(value)
  );

describe("checking arguments with a guard", () => {
  it.prop(
    "gives what the decoder gives, the same value or the same error, and goes on from it",
    { pair: checked },
    ({ pair: { shape, value } }) => {
      const schema = schemaOf(shape) as Schema.Decoder<unknown>;
      const model = decoded(schema, value);
      expect(outcome(Effect.runSyncExit(decode(schema)(value)))).toStrictEqual(
        outcome(model)
      );
      const then = (fitting: unknown) => Effect.succeed({ went: fitting });
      expect(
        outcome(Effect.runSyncExit(decode(schema, then)(value)))
      ).toStrictEqual(
        outcome(Exit.map(model, (fitting) => ({ went: fitting })))
      );
    },
    OPTIONS
  );

  it.prop(
    "is there for exactly the schemas whose decoder gives back its input, and says yes exactly when the decoder does",
    { pair: checked },
    ({ pair: { shape, value } }) => {
      const schema = schemaOf(shape);
      const guard = guardOf(schema.ast);
      expect(guard !== undefined).toBe(guarded(shape));
      if (guard !== undefined) {
        const exit = decoded(schema, value);
        expect(guard(value)).toBe(Exit.isSuccess(exit));
        if (Exit.isSuccess(exit)) {
          expect(exit.value).toStrictEqual(value);
        }
      }
    },
    OPTIONS
  );
});

/**
 * Several shapes, how many of them a call may leave out at the end, and a
 * value for each of the first ones, as many as a call gives.
 */
const parametersAndArguments = Arbitrary.flatMap(
  Arbitrary.array(shapeOf(1), { minLength: 1, maxLength: 3 }),
  (shapes) =>
    Arbitrary.flatMap(
      Arbitrary.all([
        Arbitrary.schema(
          Schema.Int.check(
            Schema.isBetween({ minimum: 0, maximum: shapes.length })
          )
        ),
        Arbitrary.schema(
          Schema.Int.check(
            Schema.isBetween({ minimum: 0, maximum: shapes.length })
          )
        ),
      ]),
      ([a, b]) => {
        const least = Math.min(a, b);
        const given = Math.max(a, b);
        return Arbitrary.map(
          Arbitrary.all(shapes.slice(0, given).map(valueFor)),
          (args) => ({ shapes, least, args })
        );
      }
    )
);

/** A shape, with one or more values for it. */
const itemAndArguments = Arbitrary.flatMap(shapeOf(1), (shape) =>
  Arbitrary.map(
    Arbitrary.array(valueFor(shape), { minLength: 1, maxLength: 4 }),
    (args) => ({ shape, args })
  )
);

/** What a library function gave, as an Exit. */
const ran = (result: unknown) =>
  Effect.runSyncExit(result as Effect.Effect<unknown, unknown>);

describe("a library function built on the guard", () => {
  it.prop(
    "over: runs on what the decoder gives for the arguments a call gives, or fails as it does",
    { pair: parametersAndArguments },
    ({ pair: { shapes, least, args } }) => {
      const parameters = shapes.map(schemaOf);
      const fn = over(parameters, (...values) => values, least) as (
        ...args: unknown[]
      ) => unknown;
      expect(outcome(ran(fn(...args)))).toStrictEqual(
        outcome(decoded(Schema.Tuple(parameters.slice(0, args.length)), args))
      );
    },
    OPTIONS
  );

  it.prop(
    "combining: combines what the decoder gives for its arguments, or fails as it does",
    { pair: itemAndArguments },
    ({ pair: { shape, args } }) => {
      const item = schemaOf(shape) as Schema.Decoder<unknown>;
      const fn = combining(item, (items) => Effect.succeed(items)) as (
        ...args: unknown[]
      ) => unknown;
      expect(outcome(ran(fn(...args)))).toStrictEqual(
        outcome(decoded(Schema.Array(item), args))
      );
    },
    OPTIONS
  );

  it.prop(
    "slicing: cuts what the decoder gives, or fails as it does",
    {
      sliced: Arbitrary.all([
        pick(["string", "list"] as const),
        Arbitrary.flatMap(pick([2, 3] as const), (count) =>
          Arbitrary.all([
            oneOf<unknown>([
              Arbitrary.schema(Schema.String),
              Arbitrary.array(scalar, { maxLength: 4 }),
              scalar,
            ]),
            ...Array.from({ length: count - 1 }, () => scalar),
          ])
        ),
      ]),
    },
    ({ sliced: [kind, args] }) => {
      const subject =
        kind === "string" ? Schema.String : Schema.Array(Schema.Any);
      const fn = slicing(subject as Schema.Decoder<string>) as (
        ...args: unknown[]
      ) => unknown;
      const parameters =
        args.length === 2
          ? [subject, Schema.Int]
          : [subject, Schema.Int, Schema.Int];
      const model = Exit.map(
        decoded(Schema.Tuple(parameters), args),
        (values) => {
          const [cut, start, end] = values as [string, number, number?];
          return cut.slice(start, end);
        }
      );
      expect(outcome(ran(fn(...args)))).toStrictEqual(outcome(model));
    },
    OPTIONS
  );
});
