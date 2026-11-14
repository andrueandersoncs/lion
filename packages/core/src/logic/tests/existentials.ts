/**
 * Generators of small programs with existential rules, and a plain
 * TypeScript model of what they mean.
 *
 * A rule is written once as a description, which becomes the Lion `rule`
 * form and also drives the model: the semi-oblivious chase, which invents a
 * value for every answer of a rule's body, whether or not the head already
 * holds, naming it by the rule and the values the head is given. Lion
 * invents only where the head does not hold yet. The two give different
 * rows, but the same rows without an unknown in them, and the same answers
 * to a goal that joins through unknowns, since each maps into the other.
 */
import { Arbitrary } from "effect";
import { element } from "./programs";

/** A variable, written without its "?", or a value. */
export type Term = { readonly variable: string } | { readonly value: Value };

export type Value = string | number | { readonly invented: string };

export interface Call {
  readonly args: readonly Term[];
  readonly relation: string;
}

export interface RuleSpec {
  readonly body: readonly Call[];
  /** The variables the head invents a value for. */
  readonly exists: readonly string[];
  readonly head: readonly Call[];
  readonly name: string;
}

const v = (variable: string): Term => ({ variable });
const call = (relation: string, ...args: Term[]): Call => ({ args, relation });

/** The relations every generated program declares, with their columns. */
export const RELATIONS: Readonly<Record<string, readonly string[]>> = {
  person: ["x"],
  link: ["from", "to"],
  parent: ["child", "parent"],
  named: ["x", "name"],
  same: ["a", "b"],
  pair: ["x", "y"],
};

/**
 * Rules without negation over the relations above. Together some of them
 * recurse through an invented value, which Lion refuses, so a program that
 * holds them is not run.
 */
export const RULE_POOL: readonly RuleSpec[] = [
  {
    name: "everyone has a parent",
    exists: ["p"],
    head: [call("parent", v("x"), v("p"))],
    body: [call("person", v("x"))],
  },
  {
    name: "a parent is a person",
    exists: [],
    head: [call("person", v("p"))],
    body: [call("parent", v("x"), v("p"))],
  },
  {
    name: "a child has a name",
    exists: ["n"],
    head: [call("named", v("x"), v("n"))],
    body: [call("parent", v("x"), v("q"))],
  },
  {
    name: "siblings share a parent",
    exists: [],
    head: [call("same", v("a"), v("b"))],
    body: [call("parent", v("a"), v("p")), call("parent", v("b"), v("p"))],
  },
  {
    name: "a link passes a parent on",
    exists: [],
    head: [call("parent", v("b"), v("p"))],
    body: [call("link", v("a"), v("b")), call("parent", v("a"), v("p"))],
  },
  {
    name: "a linked node pairs with a child of its own",
    exists: ["y"],
    head: [call("pair", v("x"), v("y")), call("parent", v("y"), v("x"))],
    body: [call("link", v("x"), v("z"))],
  },
  {
    name: "a pair is a parent",
    exists: [],
    head: [call("parent", v("x"), v("y"))],
    body: [call("pair", v("x"), v("y"))],
  },
  {
    name: "a loop names itself",
    exists: [],
    head: [call("named", v("x"), v("x"))],
    body: [call("link", v("x"), v("x"))],
  },
  {
    name: "two names make a pair",
    exists: ["w"],
    head: [call("pair", v("a"), v("w")), call("pair", v("w"), v("b"))],
    body: [call("named", v("a"), v("b"))],
  },
];

const termForm = (term: Term): unknown =>
  "variable" in term ? `?${term.variable}` : term.value;

const callForm = ({ args, relation }: Call) => [
  relation,
  ...args.map(termForm),
];

const goalForm = (calls: readonly Call[]) =>
  calls.length === 1
    ? callForm(calls[0] as Call)
    : ["and", ...calls.map(callForm)];

/** The rule as Lion writes it. */
export const ruleForm = ({ body, exists, head }: RuleSpec): unknown[] => {
  const goal = goalForm(head);
  return [
    "rule",
    exists.length === 0
      ? goal
      : ["exists", exists.map((name) => `?${name}`), goal],
    ...body.map(callForm),
  ];
};

/**
 * A goal that holds when some answer of the rule's body does not hold its
 * head: none should, in a database that has run the rule.
 */
export const brokenForm = ({ body, exists, head }: RuleSpec): unknown => {
  const goal = goalForm(head);
  return [
    "and",
    ...body.map(callForm),
    [
      "not",
      exists.length === 0
        ? goal
        : ["exists", exists.map((name) => `?${name}`), goal],
    ],
  ];
};

export const NAMES = ["a", "b", "c", "d"] as const;

export interface Facts {
  readonly links: readonly (readonly [string, string])[];
  /** Children whose parent is given, with that parent. */
  readonly parents: readonly (readonly [string, string])[];
  readonly people: readonly string[];
}

const someNames = Arbitrary.map(
  Arbitrary.array(element(NAMES), { maxLength: 4 }),
  (items) => [...new Set(items)].sort()
);

export const facts: Arbitrary.Arbitrary<Facts> = Arbitrary.all({
  links: Arbitrary.array(Arbitrary.all([element(NAMES), element(NAMES)]), {
    maxLength: 4,
  }),
  parents: Arbitrary.array(
    Arbitrary.all([element(NAMES), element(["eve", "fay", "a", "b"])]),
    { maxLength: 3 }
  ),
  people: someNames,
});

/** A few rules of the pool, each once, in the order the pool lists them. */
export const rules: Arbitrary.Arbitrary<readonly RuleSpec[]> = Arbitrary.map(
  Arbitrary.array(element(RULE_POOL), { minLength: 1, maxLength: 5 }),
  (picked) => RULE_POOL.filter((rule) => picked.includes(rule))
);

/**
 * The relations declared, with `parent` keyed by child when `keyed` is
 * set: a child then has one parent, and a key makes unknowns one.
 */
export const declarationsOf = (keyed = false) =>
  Object.entries(RELATIONS).map(([name, columns]) =>
    keyed && name === "parent"
      ? ["relation", name, columns, { key: "child" }]
      : ["relation", name, columns]
  );

export const declarations = declarationsOf();

/** The facts as `fact` forms. */
export const factForms = ({ links, parents, people }: Facts): unknown[] => {
  const rows = [
    ...people.map((name) => ["person", name]),
    ...links.map(([from, to]) => ["link", from, to]),
    ...parents.map(([child, parent]) => ["parent", child, parent]),
  ];
  return rows.length === 0 ? [] : [["fact", ...rows]];
};

const keyOf = (value: unknown) => JSON.stringify(value);

type Rows = Map<string, Map<string, readonly Value[]>>;

const add = (rows: Rows, relation: string, tuple: readonly Value[]) => {
  let set = rows.get(relation);
  if (set === undefined) {
    set = new Map();
    rows.set(relation, set);
  }
  const key = keyOf(tuple);
  if (set.has(key)) {
    return false;
  }
  set.set(key, tuple);
  return true;
};

/** Every answer of a body, as values for its variables. */
const answers = (
  rows: Rows,
  body: readonly Call[],
  start: ReadonlyMap<string, Value> = new Map()
): ReadonlyMap<string, Value>[] => {
  let found: ReadonlyMap<string, Value>[] = [start];
  for (const { args, relation } of body) {
    const next: ReadonlyMap<string, Value>[] = [];
    for (const vars of found) {
      for (const tuple of rows.get(relation)?.values() ?? []) {
        const bound = new Map(vars);
        const fits = args.every((term, at) => {
          const value = tuple[at] as Value;
          if ("value" in term) {
            return keyOf(term.value) === keyOf(value);
          }
          const held = bound.get(term.variable);
          if (held === undefined) {
            bound.set(term.variable, value);
            return true;
          }
          return keyOf(held) === keyOf(value);
        });
        if (fits) {
          next.push(bound);
        }
      }
    }
    found = next;
  }
  return found;
};

/** The rows of the given facts, as the model holds them. */
export const factRows = (given: Facts): Rows => {
  const rows: Rows = new Map();
  for (const name of given.people) {
    add(rows, "person", [name]);
  }
  for (const [from, to] of given.links) {
    add(rows, "link", [from, to]);
  }
  for (const [child, parent] of given.parents) {
    add(rows, "parent", [child, parent]);
  }
  return rows;
};

/**
 * The semi-oblivious chase: every rule runs on every answer of its body
 * until nothing new comes, and a rule that invents names each value by the
 * rule, the variable, and the values its head is given. Undefined when it
 * has not finished after many rounds.
 */
export const chase = (given: Facts, program: readonly RuleSpec[]) => {
  const rows = factRows(given);
  for (let round = 0; round < 40; round += 1) {
    let changed = false;
    for (const rule of program) {
      for (const vars of answers(rows, rule.body)) {
        const frontier = rule.head
          .flatMap(({ args }) => args)
          .flatMap((term) =>
            "variable" in term && !rule.exists.includes(term.variable)
              ? [[term.variable, vars.get(term.variable)]]
              : []
          );
        const named = new Map(vars);
        for (const name of rule.exists) {
          named.set(name, {
            invented: `${rule.name}|${name}|${keyOf(frontier)}`,
          });
        }
        for (const { args, relation } of rule.head) {
          const tuple = args.map((term) =>
            "value" in term ? term.value : (named.get(term.variable) as Value)
          );
          changed = add(rows, relation, tuple) || changed;
        }
      }
    }
    if (!changed) {
      return rows;
    }
    if ([...rows.values()].reduce((sum, set) => sum + set.size, 0) > 2000) {
      return undefined;
    }
  }
  return undefined;
};

const isInvented = (value: unknown) =>
  typeof value === "object" && value !== null;

/** The rows of a relation that hold no invented value, sorted. */
export const knownRows = (rows: Rows, relation: string) =>
  [...(rows.get(relation)?.values() ?? [])]
    .filter((tuple) => !tuple.some(isInvented))
    .map((tuple) => keyOf(tuple))
    .sort();

/** A goal of two relation calls that share a variable, and what it keeps. */
export interface Join {
  readonly calls: readonly Call[];
  /** The variables an answer keeps; the shared one is not among them. */
  readonly kept: readonly string[];
}

const joinable = ["parent", "named", "same", "pair"];

export const join: Arbitrary.Arbitrary<Join> = Arbitrary.map(
  Arbitrary.all([
    element(joinable),
    element(joinable),
    element([0, 1]),
    element([0, 1]),
  ]),
  ([first, second, at, other]) => {
    const left = at === 0 ? [v("s"), v("l")] : [v("l"), v("s")];
    const right = other === 0 ? [v("s"), v("r")] : [v("r"), v("s")];
    return {
      calls: [call(first, ...left), call(second, ...right)],
      kept: ["l", "r"],
    };
  }
);

/**
 * The answers of a join with the shared variable left out, keeping only
 * those that hold no invented value: the answers that hold for certain.
 */
export const certain = (rows: Rows, { calls, kept }: Join) =>
  [
    ...new Set(
      answers(rows, calls)
        .map((vars) => kept.map((name) => vars.get(name)))
        .filter((values) => !values.some(isInvented))
        .map((values) => keyOf(values))
    ),
  ].sort();

/** The Lion goal of a join, with the shared variable its own. */
export const joinForm = ({ calls }: Join) => [
  "exists",
  ["?s"],
  goalForm(calls),
];
