import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { module as aggregate } from "../aggregate.ts";
import { module as array } from "../array.ts";
import { module as boolean } from "../boolean.ts";
import { module as console } from "../console.ts";
import { module as func } from "../func.ts";
import { module as graph } from "../graph.ts";
import { namespaceEntries, stdlib } from "../index.ts";
import { module as number } from "../number.ts";
import { module as object } from "../object.ts";
import { module as quantity } from "../quantity.ts";
import { module as schema } from "../schema.ts";
import { module as string } from "../string.ts";
import { module as value } from "../value.ts";

const modules: Record<string, Record<string, unknown>> = {
  aggregate,
  array,
  boolean,
  console,
  func,
  graph,
  number,
  object,
  quantity,
  schema,
  string,
  value,
};

/** A namespace is a name with no slash, and a record maps names to values. */
const labeled = {
  namespace: Arbitrary.schema(
    Schema.String.check(Schema.isPattern(/^[a-z][a-z-]{0,8}$/))
  ),
  record: Arbitrary.schema(
    Schema.Record(Schema.String, Schema.Union([Schema.Number, Schema.String]))
  ),
};

describe("namespaceEntries", () => {
  it.prop(
    "names each entry of a record by its namespace, in the record's order, and keeps its value",
    labeled,
    ({ namespace, record }) => {
      const entries = Object.entries(namespaceEntries(namespace, record));
      expect(entries).toStrictEqual(
        Object.entries(record).map(([key, entry]) => [
          `${namespace}/${key}`,
          entry,
        ])
      );
    }
  );
});

describe("the stdlib", () => {
  it.prop(
    "is every function of every module named by its module, and no two names collide",
    {
      name: Arbitrary.schema(Schema.Literals(Object.keys(stdlib) as [string])),
    },
    ({ name }) => {
      const slash = name.indexOf("/");
      const owner = modules[name.slice(0, slash)];
      expect(owner?.[name.slice(slash + 1)]).toBe(
        stdlib[name as keyof typeof stdlib]
      );
      expect(Object.keys(stdlib).length).toBe(
        Object.values(modules).reduce(
          (total, entries) => total + Object.keys(entries).length,
          0
        )
      );
    }
  );

  it.effect.prop(
    "gives each of its names, written as a Lion program, the module's function",
    {
      name: Arbitrary.schema(Schema.Literals(Object.keys(stdlib) as [string])),
    },
    ({ name }) =>
      Effect.gen(function* () {
        expect(yield* run(name, stdlib)).toBe(
          stdlib[name as keyof typeof stdlib]
        );
      })
  );
});
