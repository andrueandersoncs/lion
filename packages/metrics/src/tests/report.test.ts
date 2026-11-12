/** How the tools print changes and read their command lines. */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary } from "effect";
import { change, readArguments, table } from "../report.ts";
import { between, element, word } from "./generators.ts";

const LEADING_NUMBER = /^[+−][\d,]+/;
const SPACES = /\s+/;

/** Reads the amount a change starts with back into a number. */
const amount = (shown: string) => {
  const [text = "0"] = LEADING_NUMBER.exec(shown) ?? [];
  return Number(text.replace("−", "-").replaceAll(",", ""));
};

describe("change", () => {
  it.prop(
    "starts with how much a number moved, and which way",
    { after: between(0, 5_000_000), before: between(0, 5_000_000) },
    ({ after, before }) => {
      expect(amount(change(before, after))).toBe(after - before);
    }
  );

  it.prop(
    "gives a percentage of where the number started",
    { after: between(0, 9999), before: between(1, 9999) },
    ({ after, before }) => {
      const percent = `${((Math.abs(after - before) / before) * 100).toFixed(1)}%)`;
      expect(change(before, after).endsWith(percent)).toBe(after !== before);
    }
  );
});

describe("table", () => {
  it.prop(
    "ends every column but the first at the same place in each row",
    {
      rows: Arbitrary.array(
        Arbitrary.all([word, between(0, 99_999), between(0, 99)]),
        { maxLength: 6, minLength: 1 }
      ),
    },
    ({ rows }) => {
      const lines = table(
        rows.map(([name, first, second]) => [name, `${first}`, `${second}`])
      ).split("\n");
      expect(new Set(lines.map((line) => line.length)).size).toBe(1);
      expect(lines.map((line) => line.trim().split(SPACES))).toEqual(
        rows.map(([name, first, second]) => [name, `${first}`, `${second}`])
      );
    }
  );
});

const OPTIONS = ["against", "file"];

/** One piece of a command line: a flag, an option with its value, or a word. */
const piece = Arbitrary.all({
  kind: element(["flag", "option", "word"] as const),
  name: word,
  option: element(OPTIONS),
});

describe("readArguments", () => {
  it.prop(
    "reads back the flags, the options, and the other words it was given",
    { pieces: Arbitrary.array(piece, { maxLength: 6 }) },
    ({ pieces }) => {
      // A flag's name is kept apart from the names of the options.
      const words = pieces.flatMap(({ kind, name, option }) => {
        if (kind === "flag") {
          return [`--flag-${name}`];
        }
        return kind === "option" ? [`--${option}`, name] : [name];
      });
      const args = readArguments(words, OPTIONS);
      const of = (wanted: string) =>
        pieces.filter(({ kind }) => kind === wanted);
      expect(args.rest).toEqual(of("word").map(({ name }) => name));
      for (const { name } of of("flag")) {
        expect(args.flag(`flag-${name}`)).toBe(true);
      }
      for (const option of OPTIONS) {
        const last = of("option").findLast((item) => item.option === option);
        expect(args.option(option)).toBe(last?.name);
      }
    }
  );
});
