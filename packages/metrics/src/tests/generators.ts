/** Generators shared by the property tests of the measuring tools. */
import { Arbitrary, Schema } from "effect";

/** A whole number from `minimum` to `maximum`. */
export const between = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

/** One of the given items. */
export const element = <A>(items: readonly A[]): Arbitrary.Arbitrary<A> =>
  Arbitrary.map(between(0, items.length - 1), (at) => items[at] as A);

/** A value from one of the given generators. */
export const oneOf = <A>(
  ...choices: readonly Arbitrary.Arbitrary<A>[]
): Arbitrary.Arbitrary<A> =>
  Arbitrary.flatMap(
    between(0, choices.length - 1),
    (at) => choices[at] as Arbitrary.Arbitrary<A>
  );

/** Text made only of the characters a pattern allows. */
export const text = (pattern: RegExp) =>
  Arbitrary.schema(Schema.String.check(Schema.isPattern(pattern)));

const WORD = /^[a-z]{1,8}$/;

/** A short lowercase word. */
export const word = text(WORD);
