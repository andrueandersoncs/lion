import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { evaluate } from "@/evaluation/evaluate";
import { JsonPrimitiveSchema } from "@/schemas/json-primitive";
import {
  LionEnvironmentService,
  makeEnvironmentRef,
} from "@/services/evaluation";
import { LionOplogService, makeOplogRef } from "@/services/oplog";

describe("primitive evaluation", () => {
  it.effect.prop(
    "primitives should evaluate to themselves",
    [JsonPrimitiveSchema],
    ([expression]) =>
      Effect.gen(function* () {
        const result = yield* evaluate(expression);
        expect(result).toEqual(expression);
      }).pipe(
        Effect.provideServiceEffect(
          LionEnvironmentService,
          makeEnvironmentRef({})
        ),
        Effect.provideServiceEffect(LionOplogService, makeOplogRef([]))
      )
  );
});
