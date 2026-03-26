import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { evaluate } from "@/evaluation/evaluate";
import { LionArrayExpressionSchema } from "@/schemas/lion-expression";
import {
  LionEnvironmentService,
  makeEnvironmentRef,
} from "@/services/evaluation";
import { LionOplogService, makeOplogRef } from "@/services/oplog";

describe("array evaluation", () => {
  it.effect.prop(
    "primitive array expressions should evaluate to themselves (autoquote)",
    [LionArrayExpressionSchema],
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
