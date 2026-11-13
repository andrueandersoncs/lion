/**
 * Names: a string of the form `module/name` that is bound is its value.
 * Unbound, it is data like any other string, unless it reads as a misspelled
 * name: other names of its module are bound, or a bound name is a letter or
 * two away. Then it is an error that says so, wherever it is met: in plain
 * code, as a predicate, inside a lambda that a schema or `match` calls, and
 * in a form a rule holds. Inside `quote` it is always the string.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { isNamespacedName } from "@/logic/terms";
import { stdlib } from "@/modules";

const OPTIONS = { timeout: 120_000, arbitrary: { runs: 200 } };

const NAMES = Object.keys(stdlib).filter((name) => typeof name === "string");

const index = (count: number) =>
  Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: count - 1 }))
  );

const bound = Arbitrary.map(index(NAMES.length), (at) => NAMES[at] as string);

/** A string of the form `module/name` that the standard library lacks. */
const unbound = Arbitrary.filter(
  Arbitrary.schema(
    Schema.String.check(
      Schema.isPattern(/^[a-z][a-z0-9-]{0,5}\/[A-Za-z][\w-]{0,6}[?!]?$/)
    )
  ),
  (name) => !Object.hasOwn(stdlib, name)
);

/** A name with one letter left out, changed, or added, at a place. */
const edit = (name: string, place: number, how: number) => {
  const at = 1 + (place % (name.length - 1));
  const rest = how === 2 ? name.slice(at) : name.slice(at + 1);
  return name.slice(0, at) + (how === 0 ? "" : "q") + rest;
};

/** A bound name with that many letters left out, changed, or added. */
const misspelledBy = (times: number) =>
  Arbitrary.filter(
    Arbitrary.map(
      Arbitrary.all([
        bound,
        Arbitrary.array(Arbitrary.all([index(40), index(3)]), {
          minLength: times,
          maxLength: times,
        }),
      ]),
      ([name, changes]) =>
        changes.reduce((made, [place, how]) => edit(made, place, how), name)
    ),
    (name) => isNamespacedName(name) && !Object.hasOwn(stdlib, name)
  );

const misspelled = misspelledBy(1);

const MODULES = [...new Set(NAMES.map((name) => name.split("/")[0] as string))];

/** A name the standard library lacks, in a module it has. */
const inKnownModule = Arbitrary.filter(
  Arbitrary.map(
    Arbitrary.all([
      index(MODULES.length),
      Arbitrary.schema(Schema.String.check(Schema.isPattern(/^[a-z]{1,8}$/))),
    ]),
    ([at, name]) => `${MODULES[at]}/${name}`
  ),
  (name) => !Object.hasOwn(stdlib, name)
);

/** Strings with a slash that are data, and name nothing. */
const DATA = ["n/a", "km/h", "and/or", "text/plain", "image/png", "w/o"];

/**
 * A string of the form `module/name` that nothing is bound to: any at all,
 * data that happens to have the form, a name in a module that is there, or
 * a bound name with one to three letters changed.
 */
const oneOfNames = () =>
  Arbitrary.flatMap(index(7), (pick) => {
    if (pick < 3) {
      return [
        unbound,
        inKnownModule,
        Arbitrary.map(index(DATA.length), (at) => DATA[at] as string),
      ][pick] as Arbitrary.Arbitrary<string>;
    }
    return misspelledBy(1 + (pick % 3));
  });

/** How many single-letter edits turn one string into another. */
const edits = (a: string, b: string): number => {
  const rows = [Array.from({ length: b.length + 1 }, (_, at) => at)];
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const above = rows[i - 1] as number[];
      row.push(
        Math.min(
          (above[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1),
          (above[j] as number) + 1,
          (row[j - 1] as number) + 1
        )
      );
    }
    rows.push(row);
  }
  return (rows[a.length] as number[])[b.length] as number;
};

interface Failure {
  readonly _tag?: string;
  readonly message?: string;
  /** What kind of error it is, as every Error says. */
  readonly name?: string;
  readonly nearest?: string | null;
  readonly unbound?: string;
}

/** The error a program fails with, or undefined when it does not fail. */
const failure = (program: unknown, environment: Record<string, unknown>) =>
  run(program, environment).pipe(
    Effect.map((): Failure | undefined => undefined),
    Effect.catch((error) => Effect.succeed(error as Failure))
  );

/**
 * The name a misspelling should suggest: the bound name the fewest edits
 * away, two at most, and the first of those in order. Null when none is.
 */
const nearestTo = (name: string): string | null => {
  const [nearest] = NAMES.map((other) => ({ edits: edits(name, other), other }))
    .filter((each) => each.edits <= 2)
    .sort((a, b) => a.edits - b.edits || (a.other < b.other ? -1 : 1));
  return nearest?.other ?? null;
};

const moduleOf = (name: string) => name.slice(0, name.indexOf("/") + 1);

/** Whether an unbound string reads as a misspelled name. */
const readsAsName = (name: string) =>
  NAMES.some((other) => other.startsWith(moduleOf(name))) ||
  nearestTo(name) !== null;

/** A form that waits for `?x`, and gives `value` when `?x` is 1. */
const whenOne = (value: unknown) => [
  "cond",
  [["=", "?x", 1], value],
  ["else", 0],
];

/** The values of `?x`, of 1 and 2, for which a waiting form gives the string. */
const waitsFor = (name: string, value: unknown) => [
  "find",
  "?x",
  [
    "and",
    ["in", "?x", ["array/make", 1, 2]],
    ["=", ["quote", name], whenOne(value)],
  ],
];

describe("a string of the form module/name", () => {
  it.effect.prop(
    "is its value when bound, and always the string inside quote",
    { name: oneOfNames() },
    ({ name }) =>
      Effect.gen(function* () {
        expect(yield* run(name, { ...stdlib, [name]: 7 })).toBe(7);
        expect(yield* run(["quote", name], stdlib)).toBe(name);
        // Also in a form that waits, which is looked through when written.
        expect(yield* run(waitsFor(name, ["quote", name]), stdlib)).toEqual([
          1,
        ]);
      }),
    OPTIONS
  );

  it.effect.prop(
    "unbound, is an error when it reads as a misspelled name, and otherwise the string",
    { name: oneOfNames() },
    ({ name }) =>
      Effect.gen(function* () {
        const error = yield* failure(name, stdlib);
        if (readsAsName(name)) {
          const nearest = nearestTo(name);
          // The error says what kind it is where every Error does, so code
          // that shows `name: message` shows the kind, and not the string.
          expect(error).toMatchObject({
            _tag: "UnboundNameError",
            name: "UnboundNameError",
            nearest,
            unbound: name,
          });
          expect(error?.message).toContain(
            nearest === null
              ? `Other names begin with "${moduleOf(name)}"`
              : `Did you mean "${nearest}"?`
          );
          expect(error?.message).toContain(`["quote", "${name}"]`);
          return;
        }
        // Data: a value, a row of a relation, and a part of a form that waits.
        expect(error).toBeUndefined();
        expect(yield* run(name, stdlib)).toBe(name);
        expect(
          yield* run(
            [
              "begin",
              ["relation", "seen", ["what"]],
              ["fact", ["seen", name]],
              ["find", "?what", ["seen", "?what"]],
            ],
            stdlib
          )
        ).toEqual([name]);
        expect(yield* run(waitsFor(name, name), stdlib)).toEqual([1]);
        // It stays data beside a bound name one letter away that is not of
        // the form module/name, and is a misspelled name beside one that is.
        const near = name.replace("/", "-");
        expect(yield* run(name, { ...stdlib, [near]: 1 })).toBe(name);
        const sibling = name.replace("/", "/x");
        expect(yield* failure(name, { ...stdlib, [sibling]: 1 })).toMatchObject(
          { _tag: "UnboundNameError", nearest: sibling }
        );
      }),
    OPTIONS
  );

  it.effect.prop(
    "suggests a bound name a letter or two away when it is misspelled",
    { name: misspelled },
    ({ name }) =>
      Effect.gen(function* () {
        const error = yield* failure(name, stdlib);
        expect(error).toMatchObject({
          _tag: "UnboundNameError",
          unbound: name,
        });
        const nearest = error?.nearest ?? "";
        expect(Object.hasOwn(stdlib, nearest)).toBe(true);
        expect(edits(name, nearest)).toBeLessThanOrEqual(2);
        // No bound name is nearer than the one suggested.
        expect(
          NAMES.every((other) => edits(name, other) >= edits(name, nearest))
        ).toBe(true);
        expect(error?.message).toContain(`Did you mean "${nearest}"?`);
      }),
    OPTIONS
  );

  /** Places a name can stand where it is not evaluated right away. */
  const PLACES: Record<string, (name: string) => unknown> = {
    "a predicate for a schema": (name) => ["schema/fits?", 1, name],
    "a lambda that a schema calls": (name) => [
      "schema/fits?",
      1,
      ["lambda", ["v"], [name, "v"]],
    ],
    "a lambda that match calls": (name) => [
      "match",
      1,
      [
        ["lambda", ["v"], [name, "v"]],
        ["lambda", ["v"], "yes"],
      ],
      ["lambda", ["v"], "no"],
    ],
    "a schema declared by name": (name) => [
      "begin",
      ["schema", "S", { a: ["lambda", ["v"], [name, "v"]] }],
      ["S", { a: 1 }],
    ],
    "a filter in a query": (name) => [
      "query",
      ["and", ["in", "?x", ["array/make", 1, 2]], [name, "?x"]],
    ],
    "a cond that waits in a find": (name) => [
      "find",
      "?x",
      [
        "and",
        ["in", "?x", ["array/make", 1, 2]],
        ["=", "yes", ["cond", [[name, "?x"], "yes"], ["else", "no"]]],
      ],
    ],
    "a rule that never runs": (name) => [
      "begin",
      ["relation", "p", ["x"]],
      ["relation", "r", ["x"]],
      [
        "rule",
        ["r", "?x"],
        ["p", "?x"],
        ["=", "yes", ["cond", [[name, "?x"], "yes"], ["else", "no"]]],
      ],
      ["find", "?x", ["r", "?x"]],
    ],
    "a schema that checks no value": (name) => [
      "begin",
      ["schema", "S", { a: ["lambda", ["v"], [name, "v"]] }],
      true,
    ],
    "a lambda handed to a call that waits": (name) => [
      "find",
      "?x",
      [
        "and",
        ["in", "?x", ["array/make", 1, 2]],
        [
          "=",
          "?x",
          [
            "array/length",
            [
              "array/map",
              ["array/range", 0, "?x"],
              ["lambda", ["i"], [name, "i"]],
            ],
          ],
        ],
      ],
    ],
  };

  it.effect.prop(
    "that reads as a misspelled name fails wherever it is met, and is never taken for a value that does not fit",
    {
      name: Arbitrary.filter(oneOfNames(), readsAsName),
      place: Arbitrary.map(
        index(Object.keys(PLACES).length),
        (at) => Object.keys(PLACES)[at] as string
      ),
    },
    ({ name, place }) =>
      Effect.gen(function* () {
        const program = (PLACES[place] as (name: string) => unknown)(name);
        const error = yield* failure(program, stdlib);
        expect(error?.message).toContain(`Nothing is bound to "${name}".`);
      }),
    OPTIONS
  );
});
