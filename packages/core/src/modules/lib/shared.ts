import { Effect, Schema, type SchemaAST } from "effect";
import {
  atLeast,
  type Count,
  type LogicError,
  takes,
  wrongArgument,
} from "@/errors/evaluation";
import { argumentOf, expected } from "@/modules/lib/expected";
import { guardOf } from "@/modules/lib/guard";

/**
 * Checks a value against a schema, and goes on with `then` on the value it
 * decodes to; without `then`, gives that value. A check that is done right
 * away gives a finished Effect, so a library function on values of the
 * right kinds finishes right away too, and compiled code goes on in direct
 * style.
 *
 * A value the schema's guard accepts goes to `then` as it is, with no
 * decoder run: for such a schema, the decoder would give back the same
 * value. Any other value, and any value of a schema with no guard, goes
 * through the decoder, which says what does not fit. Given `refuse`, a value
 * that does not fit fails with what `refuse` makes of the decoder's error.
 */
export const decode = <A, B = A, E = never, R = never, F = Schema.SchemaError>(
  schema: Schema.Decoder<A>,
  then: (value: A) => Effect.Effect<B, E, R> = Effect.succeed as never,
  refuse?: (error: Schema.SchemaError, input: unknown) => F
) => {
  const decode = Schema.decodeUnknownEffect(schema);
  const check =
    refuse === undefined
      ? (decode as (input: unknown) => Effect.Effect<A, F>)
      : (input: unknown) =>
          Effect.mapErrorEager(decode(input), (error) => refuse(error, input));
  const decoded = (input: unknown) => Effect.flatMapEager(check(input), then);
  const fits = guardOf(schema.ast);
  return fits === undefined
    ? decoded
    : (input: unknown) => (fits(input) ? then(input as A) : decoded(input));
};

/**
 * The failure of a call to `fn` whose arguments do not fit: it names the
 * argument and what `fn` takes there, which `at` gives for each argument.
 */
const refusing =
  (fn: () => unknown, at: (index: number) => SchemaAST.AST | undefined) =>
  (
    error: Schema.SchemaError,
    input: unknown
  ): LogicError | Schema.SchemaError => {
    const index = argumentOf(error.issue);
    const ast = index === undefined ? undefined : at(index);
    return index === undefined || ast === undefined
      ? error
      : wrongArgument(
          fn(),
          index,
          expected(ast),
          (input as readonly unknown[])[index]
        );
  };

/**
 * A library function over arguments of the given kinds: it takes one
 * argument for each schema, and runs on them when each fits its schema.
 * Given `least`, it takes as few as that many, and an argument left out is
 * undefined, so `operate` gives it its default, as `(text, separator = "")`
 * does.
 */
export const overEffect = <
  const P extends readonly Schema.Constraint[],
  B,
  E,
  R,
>(
  parameters: P,
  operate: (...args: Schema.Tuple<P>["Type"]) => Effect.Effect<B, E, R>,
  least = parameters.length
) => {
  const named: { fn?: unknown } = {};
  const refuse = refusing(
    () => named.fn,
    (index) => parameters[index]?.ast
  );
  const runs = Array.from(
    { length: parameters.length - least + 1 },
    (_, more) =>
      decode(
        Schema.Tuple(
          parameters.slice(0, least + more)
        ) as unknown as Schema.Decoder<Schema.Tuple<P>["Type"]>,
        (values) => operate(...values),
        refuse
      )
  );
  const self = takes([least, parameters.length], (...args: unknown[]) =>
    (runs[args.length - least] as (typeof runs)[number])(args)
  );
  named.fn = self;
  return self;
};

/** The same for a function that returns a value right away. */
export const over = <const P extends readonly Schema.Constraint[], B>(
  parameters: P,
  operate: (...args: Schema.Tuple<P>["Type"]) => B,
  least = parameters.length
) =>
  overEffect(
    parameters,
    (...values) => Effect.succeed(operate(...values)),
    least
  );

/**
 * A library function that cuts a part out of a string or a list, from
 * `start` up to, but not including, `end`, as JavaScript's `slice` does: a
 * negative position counts from the end, and a position past either end
 * stops there. Without `end`, the part runs to the end.
 */
export const slicing = <A extends string | readonly unknown[]>(
  subject: Schema.Decoder<A>
) =>
  over(
    [subject as Schema.Codec<A>, Schema.Int, Schema.Int],
    (value, start, end) => value.slice(start, end),
    2
  );

/**
 * A library function that combines arguments of one kind: one or more of
 * them unless `count` says otherwise, as `+` and `string-append` take any
 * number in Scheme.
 */
export const combining = <A, B, E = never>(
  item: Schema.Decoder<A>,
  combine: (items: readonly A[]) => Effect.Effect<B, E>,
  count: Count = atLeast(1)
) => {
  const named: { fn?: unknown } = {};
  const run = decode(
    Schema.Array(item),
    combine,
    refusing(
      () => named.fn,
      () => item.ast
    )
  );
  const self = takes(count, (...args: unknown[]) => run(args));
  named.fn = self;
  return self;
};
