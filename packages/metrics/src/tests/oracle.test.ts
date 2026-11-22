import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { load } from "../lion.ts";
import { cases, caseText, judge, samplesOf, verdictOf } from "../oracle.ts";
import { CORE, REPOSITORY } from "../sources.ts";
import { element, word } from "./generators.ts";

/** The evaluator of the working tree, loaded once. */
const lion = Effect.runPromise(load(join(REPOSITORY, CORE)));

const ALL = cases();

describe("the solver against plain code", () => {
  it.effect.prop(
    "proves no value meets a goal only where plain code finds none at the sample points, and gives only values plain code says meet it",
    { c: element(ALL) },
    ({ c }) =>
      Effect.gen(function* () {
        const verdict = yield* judge(yield* Effect.promise(() => lion), c);
        expect(
          verdict.kind === "disagrees" ? `${caseText(c)}: ${verdict.why}` : ""
        ).toBe("");
      }),
    { arbitrary: { runs: 120 } }
  );

  it.prop(
    "calls a case disagreeing when a proof that no value meets it meets a point plain code says meets it, or a value it gave fails, and no other",
    {
      met: Arbitrary.array(word, { maxLength: 2 }),
      proved: Arbitrary.schema(Schema.Boolean),
      wrong: Arbitrary.array(word, { maxLength: 2 }),
    },
    ({ met, proved, wrong }) => {
      expect(verdictOf(proved, met, wrong).kind).toBe(
        (proved && met.length > 0) || wrong.length > 0 ? "disagrees" : "agrees"
      );
    }
  );

  it.prop(
    "runs plain code only at points inside a case's bounds that its schema allows",
    { c: element(ALL) },
    ({ c }) => {
      for (const { at } of samplesOf(c)) {
        expect(at > c.bounds[0] && at < c.bounds[1]).toBe(true);
        if (c.schema === "value/integer?") {
          expect(Number.isInteger(at)).toBe(true);
        }
      }
    }
  );
});
