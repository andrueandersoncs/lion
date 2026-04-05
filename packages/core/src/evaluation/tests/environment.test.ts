import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Ref } from "effect";
import {
  getBinding,
  makeEnvironment,
  setGlobalBinding,
  setLocalBinding,
} from "@/evaluation/environment";

describe("environment", () => {
  it.effect("should set a local binding", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment({});
      const newEnvironment = yield* setLocalBinding(environment, "x", 1);
      const binding = yield* getBinding(newEnvironment, "x");
      expect(Option.getOrUndefined(binding)).toBe(1);
    })
  );
  it.effect("should set a global binding", () =>
    Effect.gen(function* () {
      const parentEnvironment = yield* makeEnvironment({});
      const environment = yield* makeEnvironment({}, parentEnvironment);
      const newEnvironment = yield* setGlobalBinding(environment, "x", 1);
      const bindings = yield* Ref.get(newEnvironment.bindingsRef);
      const binding = yield* getBinding(newEnvironment, "x");
      expect(bindings.x).toBeUndefined();
      expect(Option.getOrUndefined(binding)).toBe(1);
    })
  );
  it.effect("should get a binding from a triple-nested environment", () =>
    Effect.gen(function* () {
      const e1 = yield* makeEnvironment({});
      const e2 = yield* makeEnvironment({}, e1);
      const e3 = yield* makeEnvironment({}, e2);
      const e4 = yield* makeEnvironment({}, e3);
      const newEnvironment = yield* setGlobalBinding(e4, "x", 1);
      const bindings = yield* Ref.get(newEnvironment.bindingsRef);
      const binding = yield* getBinding(newEnvironment, "x");
      expect(bindings.x).toBeUndefined();
      expect(Option.getOrUndefined(binding)).toBe(1);
    })
  );
});

describe("makeEnvironment", () => {
  it.effect("should create nested environments", () =>
    Effect.gen(function* () {
      const e1 = yield* makeEnvironment({});
      const e2 = yield* makeEnvironment({}, e1);
      const e3 = yield* makeEnvironment({}, e2);
      const e4 = yield* makeEnvironment({}, e3);
      expect(e4.parent).toEqual(e3);
      expect(e3.parent).toEqual(e2);
      expect(e2.parent).toEqual(e1);
    })
  );
});
