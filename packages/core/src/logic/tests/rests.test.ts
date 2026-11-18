/**
 * The rest of a record or list: a record or list of schemas names some
 * parts of a value, and what it leaves over fits the schema of its rest.
 * On its own the rest must be empty; `schema/open` with one argument lets
 * it be anything, and with two it must fit the second. Each is checked
 * against a model that splits the value in plain TypeScript.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";
import { LogicDatabase } from "@/logic/database";
import { attempt, element, type Outcome, oneOf } from "./programs";
import {
  fits,
  type Json,
  json,
  keyOf,
  lion,
  misfitKey,
  misfitOfProblem,
  misfits,
  PRELUDE,
  quote,
  type Shape,
  shape,
  valueFor,
} from "./shapes";

type Form = unknown;

const OPTIONS = { timeout: 120_000, arbitrary: { runs: 200 } };

const MODES = [true, false];

const evaluate = (forms: readonly Form[], database = new LogicDatabase()) =>
  attempt(["begin", ...PRELUDE, ...forms], database);

const resultOf = (outcome: Outcome): unknown => {
  expect(outcome).toMatchObject({ ok: true });
  return outcome.ok ? outcome.value : undefined;
};

const isRecord = (value: unknown): value is { readonly [key: string]: Json } =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type Named = Extract<Shape, { kind: "record" | "tuple" }>;

/** The same record or list of schemas, with nothing said of its rest. */
const closed = (given: Named): Named =>
  given.kind === "record"
    ? { kind: "record", open: false, fields: given.fields }
    : { kind: "tuple", open: false, items: given.items };

/** A record or list of schemas with nothing said of its rest, and a value. */
const named: Arbitrary.Arbitrary<{
  readonly given: Named;
  readonly value: Json;
}> = Arbitrary.flatMap(
  Arbitrary.filter(
    shape(2),
    (given) => given.kind === "record" || given.kind === "tuple"
  ),
  (given) => {
    const plain = closed(given as Named);
    return Arbitrary.map(
      oneOf(valueFor(plain), valueFor({ ...plain, open: true } as Named)),
      (value) => ({ given: plain, value })
    );
  }
);

/** The written form of a record or list of schemas, as `schema/open` takes it. */
const namedPart = (given: Named) => lion({ ...given, open: false } as Shape);

const nothing = (given: Named) => (given.kind === "record" ? {} : []);

describe("the rest of a record or list", () => {
  it.effect.prop(
    "a record or list of schemas on its own leaves nothing for its rest, and schema/open alone leaves anything",
    { given: named },
    ({ given: { given, value } }) =>
      Effect.gen(function* () {
        const result = resultOf(
          yield* evaluate([
            {
              alone: ["schema/fits?", quote(value), namedPart(given)],
              nothing: [
                "schema/fits?",
                quote(value),
                ["schema/open", namedPart(given), quote(nothing(given))],
              ],
              open: [
                "schema/fits?",
                quote(value),
                ["schema/open", namedPart(given)],
              ],
              anything: [
                "schema/fits?",
                quote(value),
                ["schema/open", namedPart(given), "value/any?"],
              ],
            },
          ])
        ) as Record<string, boolean>;
        expect(result.nothing).toBe(result.alone);
        expect(result.anything).toBe(result.open);
        expect(result.alone).toBe(fits(given, value));
        expect(result.open).toBe(
          fits({ ...given, open: true } as Shape, value)
        );
      }),
    OPTIONS
  );

  /** Records whose keys are variables named after them, with values for them. */
  const split = Arbitrary.flatMap(
    Arbitrary.all([
      Arbitrary.array(element(["a", "b", "id"]), { maxLength: 3 }),
      element(["record", "list"] as const),
    ]),
    ([keys, kind]) =>
      Arbitrary.map(
        oneOf<Json>(
          Arbitrary.map(
            Arbitrary.array(
              Arbitrary.all([element(["a", "b", "id", "x", ""]), json(1)]),
              {
                maxLength: 4,
              }
            ),
            (entries) => Object.fromEntries(entries)
          ),
          Arbitrary.array(json(1), { maxLength: 4 }),
          json(1)
        ),
        (value) => ({ keys: [...new Set(keys)], kind, value })
      )
  );

  it.effect.prop(
    "a variable for the rest takes what the named parts leave over, and the two together are the value",
    { given: split, goalDirected: element(MODES) },
    ({ given: { keys, kind, value }, goalDirected }) =>
      Effect.gen(function* () {
        const part =
          kind === "record"
            ? Object.fromEntries(keys.map((key) => [key, `?${key || "empty"}`]))
            : ["array/make", ...keys.map((key) => `?${key || "empty"}`)];
        const answers = resultOf(
          yield* evaluate(
            [
              ["relation", "held", ["v"]],
              ["fact", ["held", quote(value)]],
              ["query", ["held", ["schema/open", part, "?rest"]]],
            ],
            new LogicDatabase({ goalDirected })
          )
        ) as Record<string, Json>[];
        // The model: a record with every named key, or a list at least as
        // long as the names, splits in exactly one way.
        const splits =
          kind === "record"
            ? isRecord(value) && keys.every((key) => Object.hasOwn(value, key))
            : Array.isArray(value) && value.length >= keys.length;
        expect(answers.length).toBe(splits ? 1 : 0);
        for (const answered of answers) {
          const named = keys.map((key) => answered[key || "empty"] as Json);
          const whole =
            kind === "record"
              ? {
                  ...(answered.rest as Record<string, Json>),
                  ...Object.fromEntries(
                    keys.map((key, at) => [key, named[at]])
                  ),
                }
              : [...named, ...(answered.rest as Json[])];
          expect(keyOf(whole)).toBe(keyOf(value));
          // What the rest holds is never a named part.
          if (kind === "record") {
            for (const key of keys) {
              expect(Object.hasOwn(answered.rest as object, key)).toBe(false);
            }
          }
        }
      }),
    OPTIONS
  );

  /** A record of schemas, some of whose keys may be left out. */
  const recordShape = Arbitrary.map(
    Arbitrary.array(
      Arbitrary.all([
        element(["a", "b", "id", "", "x"]),
        shape(1),
        element([false, false, true]),
      ]),
      { maxLength: 3 }
    ),
    (entries): Named & { kind: "record" } => ({
      kind: "record",
      open: false,
      fields: Object.fromEntries(
        entries.map(([key, part, optional]) => [key, { optional, shape: part }])
      ),
    })
  );

  /** Two records of schemas with no key in common, and a value. */
  const disjoint = Arbitrary.flatMap(
    Arbitrary.all([recordShape, recordShape]),
    ([one, second]) => {
      const fields = Object.fromEntries(
        Object.entries(second.fields).filter(
          ([key]) => !Object.hasOwn(one.fields, key)
        )
      );
      const other: Shape = { kind: "record", open: false, fields };
      const both: Shape = {
        kind: "record",
        open: false,
        fields: { ...one.fields, ...fields },
      };
      return Arbitrary.map(
        oneOf(valueFor(both), valueFor(both), valueFor(one), json(2)),
        (value) => ({ one, other, both, value })
      );
    }
  );

  it.effect.prop(
    "two records of schemas with no key in common compose, as one record of schemas with the keys of both",
    { given: disjoint },
    ({ given: { one, other, both, value } }) =>
      Effect.gen(function* () {
        const result = resultOf(
          yield* evaluate([
            ["schema", "One", lion(one)],
            ["schema", "Other", lion(other)],
            {
              composed: [
                "schema/fits?",
                quote(value),
                ["schema/open", "One", "Other"],
              ],
              both: ["schema/fits?", quote(value), lion(both)],
            },
          ])
        ) as Record<string, boolean>;
        expect(result.composed).toBe(result.both);
        expect(result.both).toBe(fits(both, value));
      }),
    OPTIONS
  );

  it.effect.prop(
    "a rule that takes the rest gives the same rows before and after a snapshot",
    { given: split },
    ({ given: { keys, kind, value } }) =>
      Effect.gen(function* () {
        const part =
          kind === "record"
            ? Object.fromEntries(keys.map((key) => [key, "?_"]))
            : ["array/make", ...keys.map(() => "?_")];
        const program = [
          ["relation", "held", ["v"]],
          ["relation", "left", ["v"]],
          ["fact", ["held", quote(value)]],
          ["rule", ["left", "?rest"], ["held", ["schema/open", part, "?rest"]]],
        ];
        const direct = resultOf(
          yield* evaluate([...program, ["query", ["left", "?v"]]])
        );
        const snapshot = resultOf(yield* evaluate([...program, ["snapshot"]]));
        const again = resultOf(
          yield* evaluate([snapshot, ["query", ["left", "?v"]]])
        );
        expect(again).toEqual(direct);
      }),
    OPTIONS
  );

  /** A list of schemas that names its first items, and leaves the rest to a list of one kind. */
  const listWithRest = Arbitrary.flatMap(
    Arbitrary.all([
      Arbitrary.array(element(["value/number?", "value/string?"] as const), {
        maxLength: 3,
      }),
      element(["value/number?", "value/string?", "value/boolean?"] as const),
    ]),
    ([firsts, kind]) =>
      Arbitrary.map(
        Arbitrary.array(
          oneOf<Json>(
            element<Json>([1, 2, 3]),
            element<Json>(["a", "b"]),
            element<Json>([true, false])
          ),
          { maxLength: 6 }
        ),
        (value): { readonly given: Shape; readonly value: Json } => ({
          given: {
            kind: "tuple",
            open: true,
            items: firsts.map((name): Shape => ({ kind: "predicate", name })),
            rest: { kind: "arrayOf", item: { kind: "predicate", name: kind } },
          },
          value,
        })
      )
  );

  it.effect.prop(
    "a part of the rest that does not fit is shown where it stands in the value",
    { given: listWithRest },
    ({ given: { given, value } }) =>
      Effect.gen(function* () {
        const problems = resultOf(
          yield* evaluate([["schema/problems", quote(value), lion(given)]])
        ) as { path: (number | string)[] }[];
        expect(problems.map(misfitOfProblem).map(misfitKey).sort()).toEqual(
          misfits(given, value).map(misfitKey).sort()
        );
      }),
    OPTIONS
  );
});
