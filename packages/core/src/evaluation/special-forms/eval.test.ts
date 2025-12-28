import { describe, it, expect } from "@effect/vitest";
import { evaluateEval } from "./eval.ts";
import { Effect } from "effect";

// describe("evaluateEval", () => {
//   it.effect("should evaluate an expression", () =>
//     Effect.gen(function* () {
//       const result = yield* Effect.flip(evaluateEval());
//       expect(result).toBe(3);
//     }).pipe(Effect.provide(testEnvLayer))
//   );
// });
