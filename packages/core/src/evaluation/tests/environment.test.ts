import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import {
  getBinding,
  makeEnvironment,
  setGlobalBinding,
  setLocalBinding,
} from "@/evaluation/environment";

describe("environment", () => {
  it.effect("should set a local binding", () =>
    Effect.gen(function* () {
      const environment = makeEnvironment({});
      const newEnvironment = setLocalBinding(environment, "x", 1);
      expect(yield* getBinding(newEnvironment, "x")).toBe(1);
    })
  );
  it.effect("should set a global binding", () =>
    Effect.gen(function* () {
      const parentEnvironment = makeEnvironment({});
      const environment = makeEnvironment({}, parentEnvironment);
      const newEnvironment = setGlobalBinding(environment, "x", 1);
      expect(newEnvironment.bindings.x).toBeUndefined();
      expect(yield* getBinding(newEnvironment, "x")).toBe(1);
    })
  );
  it.effect("should get a binding from a triple-nested environment", () =>
    Effect.gen(function* () {
      const e1 = makeEnvironment({});
      const e2 = makeEnvironment({}, e1);
      const e3 = makeEnvironment({}, e2);
      const e4 = makeEnvironment({}, e3);
      const newEnvironment = setGlobalBinding(e4, "x", 1);
      expect(newEnvironment.bindings.x).toBeUndefined();
      expect(yield* getBinding(newEnvironment, "x")).toBe(1);
    })
  );
});

describe("makeEnvironment", () => {
  it("should create nested environments", () => {
    const e1 = makeEnvironment({});
    const e2 = makeEnvironment({}, e1);
    const e3 = makeEnvironment({}, e2);
    const e4 = makeEnvironment({}, e3);
    expect(e4.parent).toEqual(e3);
    expect(e3.parent).toEqual(e2);
    expect(e2.parent).toEqual(e1);
  });
});
