/**
 * `why` tells how a fact holds, or why it does not: every rule that could
 * have given it, and the goal that stopped each one. What a tree says is
 * true as it stands, and an absence that could end once an unknown is known
 * says so, with `assumed`.
 *
 * The programs here are the existential rules of `existentials.ts`, which
 * invent unknowns, with rules on top that ask questions about them: `not`
 * over a relation and over "=", a filter on an unknown, recursion, and an
 * aggregate. Saying what an unknown is, is a fact: what the unknown's form
 * describes, with a value in place of its variable.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { LogicDatabase } from "@/logic/database";
import {
  declarationsOf,
  type Facts,
  factForms,
  facts,
  join,
  joinForm,
  NAMES,
  RELATIONS,
  RULE_POOL,
  type RuleSpec,
  ruleForm,
} from "./existentials";
import { attempt, element, type Outcome } from "./programs";
import {
  isAssumed,
  sayingItIs,
  type Told,
  toldIn,
  unknownsIn,
  type Way,
  waysOf,
} from "./trees";

type Form = readonly unknown[];

/**
 * Relations that rules derive by asking about the others, and `guardian`,
 * which holds given rows and every parent, so a child's guardians can be
 * known and unknown at once.
 */
const ASKED: Readonly<Record<string, readonly string[]>> = {
  lonely: ["x"],
  apart: ["a", "b"],
  other: ["x"],
  hidden: ["x"],
  settled: ["x"],
  reach: ["a", "b"],
  guardian: ["x", "p"],
  wards: ["x", "n"],
  nameless: ["x"],
};

const ASKING: readonly Form[] = [
  ["rule", ["lonely", "?x"], ["person", "?x"], ["not", ["parent", "?x", "?p"]]],
  [
    "rule",
    ["apart", "?a", "?b"],
    ["person", "?a"],
    ["person", "?b"],
    ["not", ["same", "?a", "?b"]],
  ],
  [
    "rule",
    ["other", "?x"],
    ["parent", "?x", "?p"],
    ["not", ["=", "?p", "eve"]],
  ],
  ["rule", ["hidden", "?x"], ["parent", "?x", "?p"], ["value/unknown?", "?p"]],
  ["rule", ["settled", "?x"], ["person", "?x"], ["not", ["hidden", "?x"]]],
  ["rule", ["reach", "?a", "?b"], ["link", "?a", "?b"]],
  ["rule", ["reach", "?a", "?c"], ["link", "?a", "?b"], ["reach", "?b", "?c"]],
  ["rule", ["guardian", "?x", "?p"], ["parent", "?x", "?p"]],
  [
    "rule",
    ["wards", "?x", ["aggregate/count", "?p"]],
    ["guardian", "?x", "?p"],
  ],
  [
    "rule",
    ["nameless", "?x"],
    ["person", "?x"],
    ["not", ["and", ["parent", "?x", "?p"], ["named", "?p", "?n"]]],
  ],
];

/** Some of a list's items, each as likely to be among them as not. */
const some = <A>(items: readonly A[]) =>
  Arbitrary.map(
    Arbitrary.array(Arbitrary.schema(Schema.Boolean), {
      minLength: items.length,
      maxLength: items.length,
    }),
    (kept) => items.filter((_, at) => kept[at])
  );

const asking = some(ASKING);

const rules = some(RULE_POOL);

const COLUMNS = { ...RELATIONS, ...ASKED };

/**
 * How a child's parents are made one: not at all, by a key on `parent`, or
 * by the equality rule that says two parents of a child are the same.
 */
type Keying = boolean | "rule";

const KEYING = element<Keying>([false, false, true, "rule"]);

const SAME_PARENT: Form = [
  "rule",
  ["=", "?p", "?q"],
  ["parent", "?x", "?p"],
  ["parent", "?x", "?q"],
];

type Guards = readonly (readonly [string, string])[];

const program = (
  given: Facts,
  picked: readonly RuleSpec[],
  asked: readonly Form[],
  keyed: Keying = false,
  guarded: Guards = []
): Form[] => [
  ...(declarationsOf(keyed === true) as Form[]),
  ...Object.entries(ASKED).map(([name, columns]) => [
    "relation",
    name,
    columns,
  ]),
  ...(factForms(given) as Form[]),
  ...(guarded.length === 0
    ? []
    : [["fact", ...guarded.map(([x, p]) => ["guardian", x, p])]]),
  ...picked.map(ruleForm),
  ...asked,
  ...(keyed === "rule" ? [SAME_PARENT] : []),
];

const VALUES = [...NAMES, "eve"];

/** The guardians that are given, each a child and a name. */
const guards = Arbitrary.array(
  Arbitrary.all([element(NAMES), element(VALUES)]),
  { maxLength: 4 }
);

/** A fact to ask about: a relation, and a value for each of its columns. */
const fact = Arbitrary.map(
  Arbitrary.all([
    element(Object.keys(COLUMNS)),
    element(VALUES),
    element(VALUES),
    element([0, 1, 2]),
  ]),
  ([relation, first, second, count]): Form => {
    if (relation === "wards") {
      return [relation, first, count];
    }
    return [relation, first, second].slice(
      0,
      (COLUMNS[relation]?.length ?? 0) + 1
    );
  }
);

/** Facts that the rules which ask could give, about every name. */
const LIKELY: readonly Form[] = [
  ...["lonely", "other", "hidden", "settled", "nameless"].flatMap((relation) =>
    NAMES.map((x) => [relation, x])
  ),
  ...["reach", "same", "apart"].flatMap((relation) =>
    NAMES.flatMap((a) => NAMES.map((b) => [relation, a, b]))
  ),
];

/** Facts to ask about: mostly ones a rule could give, and any others. */
const asked = Arbitrary.map(
  Arbitrary.all([
    Arbitrary.array(element(LIKELY), { minLength: 12, maxLength: 12 }),
    Arbitrary.array(fact, { minLength: 4, maxLength: 4 }),
  ]),
  ([likely, any]) => [...likely, ...any]
);

const succeeded = (outcome: Outcome) => {
  if (!outcome.ok) {
    throw new Error(outcome.message);
  }
  return outcome.value;
};

const ask = (form: unknown, database: LogicDatabase) =>
  Effect.map(attempt(form, database), succeeded);

/** Whether a goal holds, asked as plain code asks it. */
const holdsIn = (goal: unknown, database: LogicDatabase) =>
  ask(["value/identity", goal], database);

/** Asks for every row of every relation. */
const ROWS = Object.fromEntries(
  Object.entries(COLUMNS).map(([name, columns]) => [
    name,
    [
      "find",
      ["array/make", ...columns.map((column) => `?${column}`)],
      [name, ...columns.map((column) => `?${column}`)],
    ],
  ])
);

/** Every row of every relation, as one written value. */
const everyRow = (database: LogicDatabase) =>
  ask(ROWS, database) as Effect.Effect<Record<string, unknown[][]>>;

const NEVER_FINISHES = "in its head while recursing, which may never finish";

/**
 * Runs a program in a database of its own. Undefined for a program Lion
 * refuses: one that may never finish, or with a key or an equality rule,
 * one whose facts break it or that asks a question it would decide.
 */
const started = (forms: readonly Form[], keyed: Keying = false) =>
  Effect.gen(function* () {
    const database = new LogicDatabase();
    // Reading every row finds what only shows once rules run: a broken key.
    const outcome = yield* attempt(["begin", ...forms, ROWS], database);
    if (!outcome.ok && (keyed || outcome.message.includes(NEVER_FINISHES))) {
      return undefined;
    }
    succeeded(outcome);
    return database;
  });

/**
 * The facts that say what each unknown of a database is, the values taken
 * in turn from `picks`.
 */
const saying = (rows: unknown, picks: readonly string[]) => {
  const unknowns = [...unknownsIn(rows)];
  const values = new Map(
    unknowns.map(([key], at) => [key, picks[at % picks.length]])
  );
  return unknowns.flatMap(([key, form]) =>
    sayingItIs(form, values.get(key), values)
  );
};

const picks = Arbitrary.array(element([...VALUES, "fay", "zed"]), {
  minLength: 1,
  maxLength: 6,
});

/** The relation calls a rule's head adds rows to, as written. */
const headsOf = (rule: Form) => {
  const head = rule[1] as unknown[];
  const [own, goal] =
    head[0] === "exists"
      ? [head[1] as string[], head[2] as unknown[]]
      : [[], head];
  const calls = (goal[0] === "and" ? goal.slice(1) : [goal]) as unknown[][];
  return calls.map((call) => ({ call, own }));
};

/**
 * True when a rule's head can give a fact: a variable takes the fact's
 * value, the same one wherever it stands, and what the head invents or
 * combines is not compared.
 */
const canGive = (rule: Form, [relation, ...values]: Form) =>
  headsOf(rule).some(({ call: [name, ...args], own }) => {
    const bound = new Map<unknown, unknown>();
    return (
      name === relation &&
      args.every((arg, at) => {
        if (typeof arg !== "string" || own.includes(arg)) {
          return true;
        }
        if (!bound.has(arg)) {
          bound.set(arg, values[at]);
        }
        return bound.get(arg) === values[at];
      })
    );
  });

const RUNS = { timeout: 120_000, arbitrary: { runs: 150 } };

/**
 * Expects `why` to tell every row that holds, and each fact asked about,
 * the same way in a database given the facts in their order as in one
 * given them the other way round.
 */
const tellsAlike = (
  given: Facts,
  forms: (facts: Facts) => Form[],
  about: readonly Form[],
  keyed: Keying = false
) =>
  Effect.gen(function* () {
    const turned: Facts = {
      links: [...given.links].reverse(),
      parents: [...given.parents].reverse(),
      people: [...given.people].reverse(),
    };
    const database = yield* started(forms(given), keyed);
    const other = yield* started(forms(turned), keyed);
    if (database === undefined || other === undefined) {
      return;
    }
    // Every row that holds, which several answers may give, and facts
    // that may not.
    const rows = Object.entries(yield* everyRow(database)).flatMap(
      ([relation, found]) => found.map((row): Form => [relation, ...row])
    );
    for (const goal of [...rows, ...about]) {
      expect(yield* ask(["why", goal], other)).toEqual(
        yield* ask(["why", goal], database)
      );
    }
  });

/**
 * Rules under which two links into one child can pass it the same parent,
 * beside a rule that invents a parent for everyone.
 */
const PASSED_ON = ["everyone has a parent", "a link passes a parent on"];

const MORE = { timeout: 120_000, arbitrary: { runs: 300 } };

describe("why", () => {
  it.effect.prop(
    "tells a fact that holds as a fact, one that does not as absent, and nothing that is not so",
    {
      given: facts,
      picked: rules,
      questions: asking,
      about: asked,
      keyed: KEYING,
      guarded: guards,
    },
    ({ about, given, guarded, keyed, picked, questions }) =>
      Effect.gen(function* () {
        const forms = program(given, picked, questions, keyed, guarded);
        const database = yield* started(forms, keyed);
        if (database === undefined) {
          return;
        }
        // Every row that holds, unknowns included, and facts that may not.
        const rows = Object.entries(yield* everyRow(database)).flatMap(
          ([relation, found]) => found.map((row): Form => [relation, ...row])
        );
        for (const goal of [...rows, ...about]) {
          const holds = yield* holdsIn(goal, database);
          const tree = (yield* ask(["why", goal], database)) as Told;
          expect(holds ? tree.fact : tree.absent).toEqual(goal);
          const told = toldIn(tree);
          for (const { absent, check, computed, fact: row } of told) {
            // Each goal reads as the Lion that asks it again.
            const [form, expected] =
              absent === undefined ? [check ?? row, true] : [absent, false];
            if (computed === undefined && form !== undefined) {
              expect(yield* holdsIn(form, database)).toBe(expected);
            }
          }
          // An absent goal is told once, however often the tree comes to it.
          const explained = told
            .filter((node) => node.absent !== undefined && node.because)
            .map((node) => JSON.stringify(node.absent));
          expect(new Set(explained).size).toBe(explained.length);
          for (const { because, but, rule } of waysOf(tree)) {
            if (rule === undefined) {
              continue;
            }
            // A way through a rule names it, and stops before its body ends
            // or gives another row.
            expect(forms).toContainEqual(rule);
            if (because === undefined) {
              expect(but.fact).toBeDefined();
            } else {
              expect(because.length).toBeLessThan((rule as Form).length - 2);
            }
          }
          if (!holds) {
            // Every rule that could give the fact is among the ways.
            const tried = ((tree.because ?? []) as Way[]).map(({ rule }) =>
              JSON.stringify(rule)
            );
            for (const rule of [...picked.map(ruleForm), ...questions]) {
              expect(tried.includes(JSON.stringify(rule))).toBe(
                canGive(rule, goal)
              );
            }
          }
        }
      }),
    RUNS
  );

  it.effect.prop(
    "tells the same ways whatever order the facts were added in",
    { given: facts, picked: rules, questions: asking, about: asked },
    ({ about, given, picked, questions }) =>
      tellsAlike(given, (some) => program(some, picked, questions), about),
    RUNS
  );

  it.effect.prop(
    "tells a row that several answers give alike, beside a rule that invents",
    { given: facts, picked: rules, keyed: KEYING },
    ({ given, keyed, picked }) =>
      tellsAlike(
        // A child has one given parent, so that a key, which keeps the
        // fact added last, keeps the same facts in either order.
        {
          ...given,
          parents: [
            ...new Map(given.parents.map((row) => [row[0], row])).values(),
          ],
        },
        (some) =>
          program(
            some,
            RULE_POOL.filter(
              (rule) => PASSED_ON.includes(rule.name) || picked.includes(rule)
            ),
            [],
            keyed
          ),
        [],
        keyed
      ),
    RUNS
  );

  it.effect.prop(
    "marks as assumed whatever could change once an unknown is known",
    {
      given: facts,
      picked: rules,
      questions: asking,
      about: asked,
      values: picks,
      keyed: KEYING,
      guarded: guards,
    },
    ({ about, given, guarded, keyed, picked, questions, values }) =>
      Effect.gen(function* () {
        const forms = program(given, picked, questions, keyed, guarded);
        const database = yield* started(forms, keyed);
        if (database === undefined) {
          return;
        }
        const said = saying(yield* everyRow(database), values);
        const learned = new LogicDatabase();
        const outcome = yield* attempt(
          [
            "begin",
            ...forms,
            ...(said.length > 0 ? [["fact", ...said]] : []),
            ROWS,
          ],
          learned
        );
        if (!outcome.ok) {
          return;
        }
        // A fact of a keyed relation takes the place of the row with its
        // key, so a value a key rules out would take a given fact away.
        for (const stated of factForms(given).flatMap(
          (form) => (form as Form).slice(1) as Form[]
        )) {
          if (!(yield* holdsIn(stated, learned))) {
            return;
          }
        }
        // Every fact without an unknown that holds in one database and not
        // in the other, and a few others.
        const [before, after] = yield* Effect.all([
          everyRow(database),
          everyRow(learned),
        ]);
        const changed = Object.keys(COLUMNS).flatMap((relation) => {
          const rows = (found: Record<string, unknown[][]>) =>
            new Map(
              (found[relation] ?? [])
                .filter((row) => unknownsIn(row).size === 0)
                .map((row) => [JSON.stringify(row), [relation, ...row]])
            );
          const [held, holds] = [rows(before), rows(after)];
          return [...held, ...holds].flatMap(([key, goal]) =>
            held.has(key) && holds.has(key) ? [] : [goal]
          );
        });
        for (const goal of [...changed, ...about]) {
          const tree = (yield* ask(["why", goal], database)) as Told;
          if (!isAssumed(tree)) {
            // Nothing the tree rests on is assumed, so the fact holds, or
            // is absent, whatever the unknowns are.
            expect(yield* holdsIn(goal, learned)).toBe(
              yield* holdsIn(goal, database)
            );
          }
        }
      }),
    MORE
  );
});

describe("an answer that holds no unknown", () => {
  it.effect.prop(
    "of rules that ask no question is still an answer once the unknowns are known",
    { given: facts, picked: rules, goal: join, values: picks },
    ({ given, goal, picked, values }) =>
      Effect.gen(function* () {
        const forms = program(given, picked, []);
        const database = yield* started(forms);
        if (database === undefined) {
          return;
        }
        const said = saying(yield* everyRow(database), values);
        const learned = new LogicDatabase();
        const outcome = yield* attempt(
          ["begin", ...forms, ...(said.length > 0 ? [["fact", ...said]] : [])],
          learned
        );
        expect(outcome.ok).toBe(true);
        const answers = (store: LogicDatabase) =>
          Effect.all([
            everyRow(store),
            ask(["find", ["array/make", "?l", "?r"], joinForm(goal)], store),
          ]);
        const [rows, joined] = yield* answers(database);
        const [after, joinedAfter] = yield* answers(learned);
        const certain = (found: unknown) =>
          (found as unknown[][])
            .filter((row) => unknownsIn(row).size === 0)
            .map((row) => JSON.stringify(row));
        const all = (found: unknown) =>
          (found as unknown[][]).map((row) => JSON.stringify(row));
        for (const relation of Object.keys(RELATIONS)) {
          expect(all(after[relation])).toEqual(
            expect.arrayContaining(certain(rows[relation]))
          );
        }
        expect(all(joinedAfter)).toEqual(
          expect.arrayContaining(certain(joined))
        );
      }),
    MORE
  );
});
