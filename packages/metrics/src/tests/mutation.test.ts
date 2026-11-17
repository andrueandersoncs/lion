/**
 * Applying a mutation to text, checked against cutting the text by hand,
 * and checking mutations in several trees at once, each a folder of files
 * here, with tests that say which files they notice.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";
import { checkAll, mutated } from "../mutation.ts";
import { between, text } from "./generators.ts";

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

describe("checkAll", () => {
  it.effect.prop(
    "breaks each file in a tree of its own, and leaves every tree as it was",
    {
      files: Arbitrary.array(Arbitrary.all({ after: around, before: around }), {
        minLength: 1,
        maxLength: 6,
      }),
      find,
      replace,
      trees: between(1, 3),
    },
    ({ files, find: found, replace: replacement, trees }) =>
      Effect.promise(async () => {
        const roots = Array.from({ length: trees }, () =>
          mkdtempSync(join(tmpdir(), "lion-mutation-"))
        );
        const whole = ({ after, before }: (typeof files)[number]) =>
          `${before}${found}${after}`;
        for (const root of roots) {
          for (const [at, file] of files.entries()) {
            writeFileSync(join(root, `${at}.txt`), whole(file));
          }
        }
        const mutations = files.map((_, at) => ({
          file: `${at}.txt`,
          find: found,
          name: `file ${at}`,
          replace: replacement,
          tests: [`${at}`],
        }));
        // The tests "pass" on a file with an even number: that one is missed.
        const seen: string[] = [];
        const verdicts = await checkAll(
          mutations,
          roots,
          () => undefined,
          (root, [at = ""]) => {
            seen.push(readFileSync(join(root, `${at}.txt`), "utf8"));
            return Promise.resolve(Number(at) % 2 === 0);
          }
        );
        expect(verdicts).toEqual(
          files.map((_, at) => (at % 2 === 0 ? "missed" : "caught"))
        );
        // The tests ran on the broken text, once for each file.
        expect([...seen].sort()).toEqual(
          files
            .map(({ after, before }) => `${before}${replacement}${after}`)
            .sort()
        );
        for (const root of roots) {
          for (const [at, file] of files.entries()) {
            expect(readFileSync(join(root, `${at}.txt`), "utf8")).toBe(
              whole(file)
            );
          }
          rmSync(root, { recursive: true });
        }
      })
  );
});
