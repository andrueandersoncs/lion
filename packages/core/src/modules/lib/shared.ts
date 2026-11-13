import { Effect, Schema } from "effect";
import { atLeast, type Count, takes } from "@/errors/evaluation";

export const decode =
  <A>(schema: Schema.Decoder<A>) =>
  (input: unknown) =>
    Schema.decodeUnknownEffect(schema)(input);

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
    Effect.flatMap(check(args), (values) => operate(...values))
  );
};

/** The same for a function that returns a value right away. */
export const over = <const P extends readonly Schema.Constraint[], B>(
  parameters: P,
  operate: (...args: Schema.Tuple<P>["Type"]) => B
) => overEffect(parameters, (...values) => Effect.succeed(operate(...values)));

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
    Effect.flatMap(check(args), combine)
  );
};
