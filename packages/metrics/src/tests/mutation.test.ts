/** Applying a mutation to text, checked against cutting the text by hand. */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary } from "effect";
import { mutated } from "../mutation.ts";
import { text } from "./generators.ts";

// The text around a mutation never holds the letters the mutation looks for.
const around = text(/^[ab \n]{0,12}$/);
const find = text(/^[xyz]{1,4}$/);
const replace = text(/^[a-z ]{0,6}$/);

describe("mutated", () => {
  it.prop(
    "replaces the one place the text occurs, and nothing else",
    { after: around, before: around, find, replace },
    ({ after, before, find: found, replace: replacement }) => {
      expect(
        mutated(`${before}${found}${after}`, {
          find: found,
          replace: replacement,
        })
      ).toBe(`${before}${replacement}${after}`);
    }
  );

  it.prop(
    "is stale when the text occurs more than once, or not at all",
    {
      copies: Arbitrary.array(around, { maxLength: 3 }),
      find,
      first: around,
      replace,
    },
    ({ copies, find: found, first, replace: replacement }) => {
      // One piece gives no occurrence; three or more give at least two.
      const pieces = copies.length === 1 ? [first] : [first, ...copies, first];
      const source = pieces.length === 1 ? first : pieces.join(found);
      const occurrences = pieces.length - 1;
      expect(mutated(source, { find: found, replace: replacement })).toBe(
        occurrences === 1 ? `${first}${replacement}${first}` : undefined
      );
    }
  );
});
