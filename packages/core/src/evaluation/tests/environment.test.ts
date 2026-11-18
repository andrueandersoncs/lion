import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Schema } from "effect";
import {
  boundNames,
  type Environment,
  isBound,
  lookup,
  makeEnvironment,
  setGlobalBinding,
  UNBOUND,
} from "@/evaluation/environment";

/** A few names, so that scopes often bind the same one. */
const Name = Schema.Literals(["a", "b", "c", "d", "constructor"]);

/** Scopes from the outermost in, each with some names bound. */
const Scopes = Schema.Array(Schema.Record(Name, Schema.Int)).check(
  Schema.isMinLength(1)
);

/** The scopes as nested environments, with the innermost one returned. */
const nest = (scopes: readonly Record<string, number>[]) =>
  scopes.reduce<Environment | undefined>(
    (parent, bindings) => makeEnvironment(bindings, parent),
    undefined
  ) as Environment;

/** The model: the innermost scope that has the name gives its value. */
const modelLookup = (scopes: readonly Record<string, number>[], name: string) =>
  scopes.findLast((scope) => Object.hasOwn(scope, name))?.[name] ?? UNBOUND;

describe("environment", () => {
  it.prop(
    "a name has the value of the innermost scope that binds it",
    { scopes: Arbitrary.schema(Scopes), name: Arbitrary.schema(Name) },
    ({ scopes, name }) => {
      const environment = nest(scopes);
      expect(lookup(environment, name)).toBe(modelLookup(scopes, name));
      expect(isBound(environment, name)).toBe(
        modelLookup(scopes, name) !== UNBOUND
      );
      expect([...boundNames(environment)].sort()).toEqual(
        [...new Set(scopes.flatMap(Object.keys))].sort()
      );
    }
  );

  it.prop(
    "a global binding goes to the outermost scope, under any inner one",
    {
      scopes: Arbitrary.schema(Scopes),
      name: Arbitrary.schema(Name),
      value: Arbitrary.schema(Schema.Int),
    },
    ({ scopes, name, value }) => {
      const environment = nest(scopes);
      setGlobalBinding(environment, name, value);
      const model = [{ ...scopes[0], [name]: value }, ...scopes.slice(1)];
      for (const other of Name.literals) {
        expect(lookup(environment, other)).toBe(modelLookup(model, other));
      }
    }
  );
});
