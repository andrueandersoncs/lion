/**
 * Programs whose keys and equality rules make invented unknowns one, and a
 * plain TypeScript model of what they mean.
 *
 * Two rules invent: one an unknown for each row of `b1`, and one an unknown
 * that describes each of those, so unknowns nest two deep. Equality rules
 * and keys then make values one, across both depths. The model is Lion's
 * restricted, parallel chase with a different way of making values one: it
 * collects every pair a key or an equality rule makes one, and writes each
 * class of values as its least member, by one order. Since the class decides
 * the value it is written as, the model's answer cannot depend on the order
 * in which pairs were found.
 */
import { Arbitrary, Schema } from "effect";
import { compareValues } from "@/logic/terms";
import { element, oneOf } from "./programs";

export interface Unknown {
  /** The head's values, with `null` where the variable stands. */
  readonly args: readonly (Value | null)[];
  readonly relation: string;
  readonly variable: string;
}
export type Value = string | Unknown;
export type Term = { readonly variable: string } | { readonly value: string };
export interface Call {
  readonly args: readonly Term[];
  readonly relation: string;
}
export type Rule =
  | {
      readonly kind: "plain";
      readonly head: Call;
      readonly body: readonly Call[];
    }
  | {
      readonly kind: "invent";
      readonly variable: string;
      readonly head: Call;
      readonly body: readonly Call[];
    }
  | {
      readonly kind: "equal";
      readonly left: string;
      readonly right: string;
      readonly body: readonly Call[];
    };
export interface MergeProgram {
  readonly facts: readonly (readonly [string, string])[];
  /** The relations keyed by their first column. */
  readonly keyed: readonly string[];
  readonly rules: readonly Rule[];
}

export const RELATIONS = ["b1", "m1", "m2", "t1"] as const;

const isUnknown = (value: Value | null): value is Unknown =>
  typeof value === "object" && value !== null;

/** How Lion writes a value, as a query gives it back. */
export const written = (value: Value): unknown =>
  isUnknown(value)
    ? [
        "some",
        value.variable,
        [
          value.relation,
          ...value.args.map((arg) =>
            arg === null ? value.variable : written(arg)
          ),
        ],
      ]
    : value;
const keyOf = (value: Value) => JSON.stringify(written(value));

/** How many unknowns an unknown nests, itself included. */
const depth = (value: Value): number =>
  isUnknown(value)
    ? 1 +
      Math.max(
        0,
        ...value.args.map((arg) =>
          arg === null || !isUnknown(arg) ? 0 : depth(arg)
        )
      )
    : 0;

/**
 * The order a class of values is written by its least member in: known
 * values, then unknowns that nest fewer unknowns, then the order values sort
 * in.
 */
export const keptBefore = (a: Value, b: Value) =>
  depth(a) - depth(b) || compareValues(written(a), written(b));

// ------------------------------------------------------------ the model

type Rows = Map<string, Map<string, Value[]>>;
type Bindings = Map<string, Value>;
type Pair = readonly [Value, Value];

const rowsIn = (rows: Rows, relation: string) => [
  ...(rows.get(relation)?.values() ?? []),
];

const addRow = (rows: Rows, relation: string, row: Value[]) => {
  const key = JSON.stringify(row.map(written));
  const held = rows.get(relation) ?? new Map<string, Value[]>();
  rows.set(relation, held);
  if (held.has(key)) {
    return false;
  }
  held.set(key, row);
  return true;
};

/** The answer a row gives a call, from the variables bound so far. */
const bindRow = (
  args: readonly Term[],
  row: readonly Value[],
  bound: Bindings
) => {
  const next = new Map(bound);
  for (const [at, term] of args.entries()) {
    const given = row[at] as Value;
    const held = "value" in term ? term.value : next.get(term.variable);
    if (held === undefined) {
      next.set((term as { variable: string }).variable, given);
    } else if (keyOf(held) !== keyOf(given)) {
      return undefined;
    }
  }
  return next;
};

const matches = (body: readonly Call[], rows: Rows): Bindings[] =>
  body.reduce<Bindings[]>(
    (answers, { args, relation }) =>
      answers.flatMap((bound) =>
        rowsIn(rows, relation).flatMap((row) => bindRow(args, row, bound) ?? [])
      ),
    [new Map()]
  );

const termValue = (term: Term, bound: Bindings): Value =>
  "value" in term ? term.value : (bound.get(term.variable) as Value);

/** Classes of values, each a tree of members under its root. */
class Classes {
  readonly members = new Map<string, Value>();
  private readonly parent = new Map<string, string>();

  find(key: string): string {
    const up = this.parent.get(key) as string;
    return up === key ? key : this.find(up);
  }
  see(value: Value) {
    const key = keyOf(value);
    if (!this.members.has(key)) {
      this.members.set(key, value);
      this.parent.set(key, key);
    }
    return key;
  }
  union(a: Value, b: Value) {
    const [x, y] = [this.find(this.see(a)), this.find(this.see(b))];
    if (x !== y) {
      this.parent.set(x, y);
    }
    return x !== y;
  }
  /** Each class's least member, by its root. */
  least() {
    const least = new Map<string, Value>();
    for (const [key, member] of this.members) {
      const root = this.find(key);
      const held = least.get(root);
      if (held === undefined || keptBefore(member, held) < 0) {
        least.set(root, member);
      }
    }
    return least;
  }
}

const withArgs = (
  unknown: Unknown,
  settle: (value: Value) => Value
): Unknown => ({
  ...unknown,
  args: unknown.args.map((arg) => (arg === null ? null : settle(arg))),
});

/** What a value is written as: its class's least member, also inside what it describes. */
const settler = (classes: Classes, least: Map<string, Value>) => {
  const settle = (value: Value): Value => {
    const inner = isUnknown(value) ? withArgs(value, settle) : value;
    const key = keyOf(inner);
    return classes.members.has(key)
      ? (least.get(classes.find(key)) as Value)
      : inner;
  };
  return settle;
};

/** The unknowns a value describes, however deep. */
const inside = (value: Value): Value[] =>
  isUnknown(value)
    ? value.args.flatMap((arg) => (arg === null ? [] : [arg, ...inside(arg)]))
    : [];

/** True when a class holds two known values, or its least member holds a member. */
const contradicts = (classes: Classes, least: Map<string, Value>) =>
  [...classes.members].some(([key, member]) => {
    const kept = least.get(classes.find(key)) as Value;
    const twoKnown = !(isUnknown(member) || isUnknown(kept)) && member !== kept;
    const holdsItself =
      key === keyOf(kept) &&
      inside(kept).some(
        (part) =>
          classes.members.has(keyOf(part)) &&
          classes.find(keyOf(part)) === classes.find(key)
      );
    return twoKnown || holdsItself;
  });

/**
 * What each value is written as once the pairs are one, or undefined when
 * values that cannot be one are made one. An unknown whose description
 * rewrites to another unknown's is that unknown, so the classes grow until
 * no rewriting makes one more.
 */
const classesOf = (pairs: readonly Pair[]) => {
  const classes = new Classes();
  for (const [a, b] of pairs) {
    classes.union(a, b);
  }
  for (;;) {
    const least = classes.least();
    const settle = settler(classes, least);
    const grew = [...classes.members.values()]
      .filter(isUnknown)
      .map((member) => classes.union(member, withArgs(member, settle)))
      .some(Boolean);
    if (!grew) {
      return contradicts(classes, least) ? undefined : settle;
    }
  }
};

const addPair = (pairs: Pair[], a: Value, b: Value) => {
  const known = pairs.some(
    ([x, y]) => keyOf(x) === keyOf(a) && keyOf(y) === keyOf(b)
  );
  if (keyOf(a) !== keyOf(b) && !known) {
    pairs.push([a, b]);
  }
};

/** The pairs equality rules and keys make one in the rows. */
const findPairs = (
  { keyed, rules }: MergeProgram,
  rows: Rows,
  pairs: Pair[]
) => {
  for (const rule of rules) {
    if (rule.kind === "equal") {
      for (const bound of matches(rule.body, rows)) {
        addPair(
          pairs,
          bound.get(rule.left) as Value,
          bound.get(rule.right) as Value
        );
      }
    }
  }
  for (const relation of keyed) {
    const first = new Map<string, Value[]>();
    for (const row of rowsIn(rows, relation)) {
      const key = keyOf(row[0] as Value);
      const held = first.get(key) ?? row;
      first.set(key, held);
      addPair(pairs, held[1] as Value, row[1] as Value);
    }
  }
};

const applyRules = ({ rules }: MergeProgram, rows: Rows) => {
  let changed = false;
  for (const rule of rules) {
    if (rule.kind === "plain") {
      for (const bound of matches(rule.body, rows)) {
        const row = rule.head.args.map((term) => termValue(term, bound));
        changed = addRow(rows, rule.head.relation, row) || changed;
      }
    }
  }
  return changed;
};

const settledRows = (rows: Rows, settle: (value: Value) => Value) => {
  const next: Rows = new Map();
  for (const [relation, held] of rows) {
    for (const row of held.values()) {
      addRow(next, relation, row.map(settle));
    }
  }
  return next;
};

const sameRows = (a: Rows, b: Rows) =>
  RELATIONS.every((relation) => {
    const [x, y] = [a.get(relation), b.get(relation)];
    return (
      (x?.size ?? 0) === (y?.size ?? 0) &&
      [...(x?.keys() ?? [])].every((key) => y?.has(key))
    );
  });

/**
 * One round's fixpoint: the rules that invent nothing, and the classes the
 * keys and equality rules make, until neither changes the rows.
 */
const closeRound = (program: MergeProgram, start: Rows, pairs: Pair[]) => {
  let rows = start;
  for (;;) {
    const changed = applyRules(program, rows);
    const before = pairs.length;
    findPairs(program, rows, pairs);
    const settle = classesOf(pairs);
    if (settle === undefined) {
      return undefined;
    }
    const next = settledRows(rows, settle);
    const settledAlready = sameRows(next, rows);
    rows = next;
    if (!changed && settledAlready && pairs.length === before) {
      return rows;
    }
  }
};

/** The rows the rules that invent give, for every answer whose head does not hold. */
const inventions = ({ rules }: MergeProgram, rows: Rows) =>
  rules.flatMap((rule) =>
    rule.kind === "invent"
      ? matches(rule.body, rows).flatMap((bound) => {
          const known = rule.head.args.map((term) =>
            "variable" in term && term.variable === rule.variable
              ? null
              : termValue(term, bound)
          );
          const holds = rowsIn(rows, rule.head.relation).some((row) =>
            known.every(
              (given, at) =>
                given === null || keyOf(given) === keyOf(row[at] as Value)
            )
          );
          const unknown: Unknown = {
            variable: rule.variable,
            relation: rule.head.relation,
            args: known,
          };
          return holds
            ? []
            : [
                [
                  rule.head.relation,
                  known.map((given) => given ?? unknown),
                ] as const,
              ];
        })
      : []
  );

/**
 * The rows of every relation, each written as Lion gives it, or undefined
 * when values that cannot be one are made one.
 */
export const model = (program: MergeProgram) => {
  let rows: Rows = new Map();
  for (const [a, b] of program.facts) {
    addRow(rows, "b1", [a, b]);
  }
  const pairs: Pair[] = [];
  for (let round = 0; round < 8; round++) {
    const closed = closeRound(program, rows, pairs);
    if (closed === undefined) {
      return undefined;
    }
    rows = closed;
    const more = inventions(program, rows)
      .map(([relation, row]) => addRow(rows, relation, [...row]))
      .some(Boolean);
    if (!more) {
      return Object.fromEntries(
        RELATIONS.map((relation) => [
          relation,
          rowsIn(rows, relation).map((row) => row.map(written)),
        ])
      );
    }
  }
  return undefined;
};

// ------------------------------------------------------------ programs

const variable = (name: string): Term => ({ variable: name });
const value = (name: string): Term => ({ value: name });
const call = (relation: string, ...args: Term[]): Call => ({ relation, args });

const NAMES = ["a", "b", "c"] as const;

/** Where an equality rule finds one side of what it makes one. */
const SIDES: readonly (readonly Call[])[] = [
  [call("m1", variable("?x"), variable("?v"))],
  [call("m2", variable("?x"), variable("?v"))],
  [call("m1", value("a"), variable("?v"))],
  [call("m1", value("b"), variable("?v"))],
  [
    call("m2", variable("?y"), variable("?v")),
    call("m1", value("c"), variable("?y")),
  ],
  [call("b1", variable("?v"), variable("?x"))],
];

const renamed = (calls: readonly Call[], suffix: string) =>
  calls.map((it) => ({
    ...it,
    args: it.args.map((term) =>
      "variable" in term ? variable(`${term.variable}${suffix}`) : term
    ),
  }));

/**
 * An equality rule between two sides. With `late`, it also asks for a row
 * of `m2`, so it first holds in the round that invents the deeper unknowns,
 * beside the merges they bring.
 */
const equalityRuleWith = (
  late: Arbitrary.Arbitrary<boolean>
): Arbitrary.Arbitrary<Rule> =>
  Arbitrary.map(
    Arbitrary.all([element(SIDES), element(SIDES), late]),
    ([left, right, isLate]) => ({
      kind: "equal",
      left: "?v1",
      right: "?v2",
      body: [
        ...renamed(left, "1"),
        ...renamed(right, "2"),
        ...(isLate ? [call("m2", variable("?late"), variable("?any"))] : []),
      ],
    })
  );
const equalityRule = equalityRuleWith(Arbitrary.schema(Schema.Boolean));

const extraRule: Arbitrary.Arbitrary<Rule> = element<Rule>([
  // Known values into a relation that a rule invents rows of.
  {
    kind: "plain",
    head: call("m1", variable("?x"), variable("?y")),
    body: [call("b1", variable("?x"), variable("?y"))],
  },
  // A relation derived from the invented ones, that an equality rule can read.
  {
    kind: "plain",
    head: call("t1", variable("?x"), variable("?y")),
    body: [
      call("m1", variable("?w"), variable("?x")),
      call("m2", variable("?x"), variable("?y")),
    ],
  },
  {
    kind: "equal",
    left: "?a",
    right: "?b",
    body: [
      call("t1", variable("?x"), variable("?a")),
      call("m1", value("a"), variable("?b")),
    ],
  },
]);

/** A whole number, to shuffle with. */
export const seed = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1_000_000 }))
);

const mergeProgramOf = (
  equalities: number
): Arbitrary.Arbitrary<MergeProgram> =>
  Arbitrary.map(
    Arbitrary.all([
      // The variables of the two inventing rules: their names decide how
      // the unknowns sort, so a deeper unknown can sort first or last.
      element(["?m", "?f"]),
      element(["?g", "?n"]),
      Arbitrary.array(equalityRule, { minLength: 1, maxLength: equalities }),
      Arbitrary.array(extraRule, { maxLength: 2 }),
      Arbitrary.array(Arbitrary.all([element(NAMES), element(NAMES)]), {
        minLength: 1,
        maxLength: 3,
      }),
      oneOf(element([[] as string[]]), element([["m1"], ["m2"], ["m1", "m2"]])),
    ]),
    ([first, second, equalities, extra, facts, keyed]) => ({
      keyed,
      facts: [
        ...new Map(
          facts.map(([a, b]) => [`${a}${b}`, [a, b] as const])
        ).values(),
      ],
      rules: [
        {
          kind: "invent",
          variable: first,
          head: call("m1", variable("?p"), variable(first)),
          body: [call("b1", variable("?p"), variable("?q"))],
        },
        {
          kind: "invent",
          variable: second,
          head: call("m2", variable("?x"), variable(second)),
          body: [call("m1", variable("?w"), variable("?x"))],
        },
        ...equalities,
        ...extra,
      ],
    })
  );

export const mergeProgram = mergeProgramOf(3);

/**
 * Programs aimed at races: every name has a row, and two or three equality
 * rules first hold in one round, so the order they are applied in could
 * matter.
 */
export const racingProgram: Arbitrary.Arbitrary<MergeProgram> = Arbitrary.map(
  Arbitrary.all([
    mergeProgramOf(1),
    Arbitrary.array(equalityRuleWith(element([true])), {
      minLength: 2,
      maxLength: 3,
    }),
  ]),
  ([program, late]) => ({
    ...program,
    facts: NAMES.map((name) => [name, name] as const),
    rules: [...program.rules.filter((rule) => rule.kind === "invent"), ...late],
  })
);

/** The same items in an order the seed picks. */
export const shuffled = <A>(items: readonly A[], from: number) => {
  const out = [...items];
  let state = from;
  for (let at = out.length - 1; at > 0; at--) {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    const other = state % (at + 1);
    [out[at], out[other]] = [out[other] as A, out[at] as A];
  }
  return out;
};

const termForm = (term: Term) => ("value" in term ? term.value : term.variable);
const callForm = ({ args, relation }: Call) => [
  relation,
  ...args.map(termForm),
];

const ruleForm = (rule: Rule) => {
  const body = rule.body.map(callForm);
  if (rule.kind === "plain") {
    return ["rule", callForm(rule.head), ...body];
  }
  if (rule.kind === "invent") {
    return ["rule", ["exists", [rule.variable], callForm(rule.head)], ...body];
  }
  return ["rule", ["=", rule.left, rule.right], ...body];
};

/** The program as Lion forms, with a query of every relation's rows. */
export const mergeForms = ({ facts, keyed, rules }: MergeProgram) => [
  ...RELATIONS.map((relation) => [
    "relation",
    relation,
    ["c0", "c1"],
    ...(keyed.includes(relation) ? [{ key: "c0" }] : []),
  ]),
  ...(facts.length > 0
    ? [["fact", ...facts.map(([a, b]) => ["b1", a, b])]]
    : []),
  ...rules.map(ruleForm),

  Object.fromEntries(
    RELATIONS.map((relation) => [
      relation,
      ["find", ["array/make", "?c0", "?c1"], [relation, "?c0", "?c1"]],
    ])
  ),
];
