import { createHash } from "node:crypto";
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Exit, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { safeStdlib } from "@/modules";

const anyText = Arbitrary.schema(Schema.String.check(Schema.isMaxLength(200)));

describe("string/sha256 and string/base64-*", () => {
  it.effect.prop(
    "string/sha256 matches Node crypto SHA-256 identically for all UTF-8 strings and inside Datalog rules",
    { text: anyText },
    ({ text }) =>
      Effect.gen(function* () {
        const expected = createHash("sha256")
          .update(text, "utf8")
          .digest("hex");
        const direct = yield* run(
          ["string/sha256", ["quote", text]],
          safeStdlib
        );
        expect(direct).toBe(expected);

        const derived = yield* run(
          [
            "begin",
            ["relation", "doc", ["id", "body"]],
            ["relation", "digest", ["id", "hash"]],
            [
              "rule",
              ["digest", "?id", ["string/sha256", "?b"]],
              ["doc", "?id", "?b"],
            ],
            ["fact", ["doc", "d1", ["quote", text]]],
            ["query", ["digest", "d1", "?h"]],
          ],
          safeStdlib
        );
        expect(derived).toEqual([{ h: expected }]);
      })
  );

  it.effect.prop(
    "string/base64-encode and string/base64-decode round-trip every UTF-8 string",
    { text: anyText },
    ({ text }) =>
      Effect.gen(function* () {
        const encoded = yield* run(
          ["string/base64-encode", ["quote", text]],
          safeStdlib
        );
        expect(encoded).toBe(Buffer.from(text, "utf8").toString("base64"));
        const decoded = yield* run(
          ["string/base64-decode", ["quote", encoded]],
          safeStdlib
        );
        expect(decoded).toBe(text.toWellFormed());

        const bad = yield* Effect.exit(
          run(["string/base64-decode", "!!!not-base64!!!"], safeStdlib)
        );
        expect(Exit.isFailure(bad)).toBe(true);
      })
  );
});
