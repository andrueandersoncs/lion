/** Counting messages, checked against the messages a file was written with. */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary } from "effect";
import { messagesIn } from "../vocabulary.ts";
import { between, element, word } from "./generators.ts";

/** A string of a source file: its words, and how it is written. */
interface Literal {
  readonly quote: string;
  /** A template holds a value among its words. */
  readonly template: boolean;
  readonly words: readonly string[];
}

const literal: Arbitrary.Arbitrary<Literal> = Arbitrary.all({
  quote: element(['"', "`"]),
  template: element([false, true]),
  words: Arbitrary.array(word, { maxLength: 6 }),
});

const write = ({ quote, template, words }: Literal) => {
  if (template) {
    const [first = "", ...rest] = words;
    return `\`${first} \${value} ${rest.join(" ")}\``;
  }
  return `${quote}${words.join(" ")}${quote}`;
};

/** How `messagesIn` reads a string back: `…` stands where a value goes. */
const read = ({ template, words }: Literal) => {
  if (template) {
    const [first = "", ...rest] = words;
    return `${first} … ${rest.join(" ")}`;
  }
  return words.join(" ");
};

/** The words a reader counts: a template's value is one more. */
const wordCount = ({ template, words }: Literal) =>
  template
    ? [words[0] ?? "", "…", ...words.slice(1)].filter((item) => item !== "")
        .length
    : words.length;

describe("messagesIn", () => {
  it.prop(
    "finds each string of four words or more once, and no shorter one",
    {
      files: Arbitrary.array(Arbitrary.array(literal, { maxLength: 5 }), {
        maxLength: 3,
      }),
      repeat: between(1, 2),
    },
    ({ files, repeat }) => {
      const sources = files.map((literals, at) => ({
        path: `file${at}.ts`,
        text: literals
          .flatMap((item, index) =>
            Array.from(
              { length: repeat },
              (_, copy) => `const m${index}_${copy} = ${write(item)};`
            )
          )
          .join('\n// "a comment is not a message at all"\n'),
      }));
      const expected = new Set(
        files
          .flat()
          .filter((item) => wordCount(item) >= 4)
          .map(read)
      );
      expect(messagesIn(sources)).toEqual([...expected].sort());
    }
  );
});
