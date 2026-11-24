import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { loadDatabase, saveDatabase } from "@/logic/snapshot";
import { stdlib } from "@/modules";

const word = Arbitrary.schema(
  Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_-]{1,8}$/))
);

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

describe("string pattern matching and normalization", () => {
  it.effect.prop(
    "string/matches? and string/match agree with JavaScript RegExp (Unicode mode)",
    {
      prefix: word,
      digits: int(10, 9999),
      suffix: word,
      ignoreCase: Arbitrary.schema(Schema.Boolean),
    },
    ({ prefix, digits, suffix, ignoreCase }) =>
      Effect.gen(function* () {
        const text = `${prefix}-${digits}-${suffix}`;
        const pattern = "(?<head>[a-z]+)-(?<num>\\d+)";
        const flags = ignoreCase ? "i" : "";
        const re = new RegExp(pattern, `u${flags}`);
        const expectedMatch = re.exec(text);

        const fits = yield* run(
          ["string/matches?", ["quote", text], ["quote", pattern], flags],
          stdlib
        );
        expect(fits).toBe(expectedMatch !== null);

        const matched = yield* run(
          ["string/match", ["quote", text], ["quote", pattern], flags],
          stdlib
        );
        if (expectedMatch === null) {
          expect(matched).toBeNull();
        } else {
          expect(matched).toEqual({
            match: expectedMatch[0],
            index: expectedMatch.index,
            groups: expectedMatch.slice(1).map((g) => g ?? null),
            named: {
              head: expectedMatch.groups?.head ?? null,
              num: expectedMatch.groups?.num ?? null,
            },
          });
        }
      })
  );

  it.effect.prop(
    "string/matchAll extracts every non-overlapping match in order and agrees with string/match on the first",
    {
      nums: Arbitrary.array(int(100, 999), { minLength: 0, maxLength: 5 }),
    },
    ({ nums }) =>
      Effect.gen(function* () {
        const text = nums.map((n) => `ID-${n}`).join(" and ");
        const pattern = "ID-(?<id>\\d+)";
        const all = (yield* run(
          ["string/matchAll", ["quote", text], ["quote", pattern]],
          stdlib
        )) as readonly { match: string; named: { id: string } }[];
        expect(all.map((m) => Number(m.named.id))).toEqual(nums);

        const first = yield* run(
          ["string/match", ["quote", text], ["quote", pattern]],
          stdlib
        );
        expect(first).toEqual(all[0] ?? null);
      })
  );

  it.effect.prop(
    "string/normalize is idempotent and canonicalizes typographic punctuation and whitespace",
    {
      a: word,
      b: word,
      c: word,
    },
    ({ a, b, c }) =>
      Effect.gen(function* () {
        const messy = `  “${a}”\n\t—  ‘${b}’…   ${c}  `;
        const clean = `"${a}" - '${b}'... ${c}`;
        const once = yield* run(["string/normalize", ["quote", messy]], stdlib);
        const twice = yield* run(
          ["string/normalize", ["quote", once as string]],
          stdlib
        );
        expect(once).toBe(clean);
        expect(twice).toBe(once);
      })
  );

  it.effect.prop(
    "invalid regex patterns and disallowed flags fail cleanly",
    {
      badFlag: Arbitrary.map(int(0, 3), (i) => ["g", "y", "d", "x"][i] ?? "g"),
    },
    ({ badFlag }) =>
      Effect.gen(function* () {
        const flagFail = yield* Effect.flip(
          run(["string/matches?", "abc", "a", badFlag], stdlib)
        );
        expect(String(flagFail)).toContain(
          'accepts only flags from "i", "m", "s"'
        );

        const syntaxFail = yield* Effect.flip(
          run(["string/match", "abc", "[unclosed"], stdlib)
        );
        expect(String(syntaxFail)).toContain("invalid pattern");
      })
  );

  it.effect.prop(
    "string/matchAll and string/normalize compose in rules and survive snapshots",
    {
      ids: Arbitrary.array(int(10, 99), { minLength: 1, maxLength: 4 }),
    },
    ({ ids }) =>
      Effect.gen(function* () {
        const unique = [...new Set(ids)].sort((a, b) => a - b);
        const quote = `See ${unique.map((n) => `[${n}]`).join(",\n")} — confirmed.`;
        const program = [
          "begin",
          ["relation", "doc", ["id", "text"]],
          ["relation", "cite", ["id", "num"]],
          ["fact", ["doc", "d1", ["quote", quote]]],
          [
            "rule",
            ["cite", "?id", ["number/fromString", "?n"]],
            ["doc", "?id", "?t"],
            [
              "in",
              {
                match: "?_",
                index: "?_",
                groups: ["array/make", "?n"],
                named: "?_",
              },
              ["string/matchAll", ["string/normalize", "?t"], "\\[(\\d+)\\]"],
            ],
          ],
        ];
        const db = yield* loadDatabase(program, stdlib);
        const reloaded = yield* loadDatabase(yield* saveDatabase(db), stdlib);
        const out = yield* run(["find", "?n", ["cite", "d1", "?n"]], stdlib, {
          database: reloaded,
        });
        expect(out).toEqual(unique);
      })
  );
});
