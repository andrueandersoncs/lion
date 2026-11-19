/**
 * What the model leaves out when a document changes: a claim that quotes a
 * document, such as the README, in words it no longer holds waits until
 * someone reads the new words, and nothing fails. Checked against a plain
 * model: such a claim is unsaid exactly when its source is a document and
 * its words are not in the document's text.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { unsaidClaims } from "../model.ts";
import { REPOSITORY } from "../record.ts";
import { skillScripts } from "../research.ts";

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));
const pick = <A>(items: readonly A[]) =>
  Arbitrary.map(int(0, items.length - 1), (at) => items[at] as A);

const WORDS = ["lion", "rule", "fact", "a", "key", "merge", "row"];
/** A word no document holds, so a quote with it is never said. */
const GONE = "unwritten";
const DOCS = ["doc-readme", "doc-agents"];
const SOURCES = [...DOCS, "notes/own", "abc1234"];

interface Quote {
  readonly from: number;
  /** Whether the quote holds a word the document never had. */
  readonly gone: boolean;
  readonly length: number;
  readonly source: string;
}

const docText = Arbitrary.array(pick(WORDS), { maxLength: 12, minLength: 1 });

const quote = Arbitrary.map(
  Arbitrary.all([
    int(0, 11),
    int(1, 4),
    Arbitrary.schema(Schema.Boolean),
    pick(SOURCES),
  ]),
  ([from, length, gone, source]): Quote => ({ from, gone, length, source })
);

const scripts = Effect.promise(() => skillScripts(REPOSITORY));

describe("unsaidClaims", () => {
  it.effect.prop(
    "leaves out a claim exactly when it quotes a document in words the document no longer holds",
    {
      files: Arbitrary.array(Arbitrary.array(quote, { maxLength: 4 }), {
        maxLength: 3,
      }),
      readme: docText,
      agents: docText,
    },
    ({ agents, files, readme }) =>
      Effect.gen(function* () {
        const { problemsOf } = yield* scripts;
        const texts = new Map([
          ["doc-readme", readme],
          ["doc-agents", agents],
        ]);
        const wordsOf = (q: Quote) => {
          const words = texts.get(q.source) ?? WORDS;
          const from = q.from % words.length;
          const taken = words.slice(from, from + q.length);
          return [...taken, ...(q.gone ? [GONE] : [])].join(" ");
        };
        const entries = files.map((quotes, at) => ({
          data: {
            claims: quotes.map((q) => ({
              quote: wordsOf(q),
              says: {},
              source: q.source,
            })),
          },
          path: `history/notes/f${at}.json`,
        }));
        const expected = files.flatMap((quotes, at) =>
          quotes.flatMap((q, n) =>
            DOCS.includes(q.source) && q.gone ? [`f${at}-${n + 1}`] : []
          )
        );
        const unsaid = unsaidClaims(
          entries,
          new Map([...texts].map(([id, words]) => [id, words.join(" ")])),
          problemsOf
        );
        expect([...unsaid].sort()).toEqual(expected.sort());
      })
  );
});
