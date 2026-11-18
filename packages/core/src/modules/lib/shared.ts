import { Effect, Schema } from "effect";
import { atLeast, type Count, takes } from "@/errors/evaluation";

/**
 * Checks a value against a schema. A check that is done right away gives a
 * finished Effect, so a library function on values of the right kinds
 * finishes right away too, and compiled code goes on in direct style.
 */
export const decode = <A>(schema: Schema.Decoder<A>) => {
  const check = Schema.decodeUnknownEffect(schema);
  return (input: unknown) => check(input);
};

/**
 * A library function over arguments of the given kinds: it takes one
 * argument for each schema, and runs on them when each fits its schema.
 */
export const overEffect = <
  const P extends readonly Schema.Constraint[],
  B,
  E,
  R,
>(
  parameters: P,
  operate: (...args: Schema.Tuple<P>["Type"]) => Effect.Effect<B, E, R>
) => {
  const check = decode(
    Schema.Tuple(parameters) as unknown as Schema.Decoder<
      Schema.Tuple<P>["Type"]
    >
  );
  return takes(parameters.length, (...args: unknown[]) =>
    Effect.flatMapEager(check(args), (values) => operate(...values))
  );
};

/** The same for a function that returns a value right away. */
export const over = <const P extends readonly Schema.Constraint[], B>(
  parameters: P,
  operate: (...args: Schema.Tuple<P>["Type"]) => B
) => overEffect(parameters, (...values) => Effect.succeed(operate(...values)));

/**
 * A library function that cuts a part out of a string or a list, from
 * `start` up to, but not including, `end`, as JavaScript's `slice` does: a
 * negative position counts from the end, and a position past either end
 * stops there. Without `end`, the part runs to the end.
 */
export const slicing = <A extends string | readonly unknown[]>(
  subject: Schema.Decoder<A>
) => {
  const toEnd = decode(Schema.Tuple([subject, Schema.Int]));
  const between = decode(Schema.Tuple([subject, Schema.Int, Schema.Int]));
  return takes([2, 3], (...args: unknown[]) =>
    args.length === 2
      ? Effect.mapEager(toEnd(args), ([value, start]) => value.slice(start))
      : Effect.mapEager(between(args), ([value, start, end]) =>
          value.slice(start, end)
        )
  );
};

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
  const check = decode(Schema.Array(item));
  return takes(count, (...args: unknown[]) =>
    Effect.flatMapEager(check(args), combine)
  );
};
