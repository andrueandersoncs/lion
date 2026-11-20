/**
 * Generators of programs whose strings mean different things in different
 * places: a few names that lambdas, `define`, relations, and schemas bind,
 * shadow, and change with `set!`, read before and after they are bound, as
 * data, as logic variables, and at the head of arrays that would otherwise
 * be special forms. Each lambda's body lists its parameters and what it
 * defines, and each program ends by listing every name, so what the names
 * mean is part of what a program gives.
 *
 * A lambda's body calls only its own parameters, and only on numbers, so no
 * program runs forever: whatever a parameter holds, the function it calls
 * gets a number, which it cannot call in turn.
 */
import { Arbitrary, Effect, Schema } from "effect";
import { raisedAs } from "@/errors/evaluation";
import { run } from "@/evaluation/evaluate";
import { LogicValue, LogicVariable } from "@/logic/terms";
import { element, oneOf } from "@/logic/tests/programs";
import { stdlib } from "@/modules";

export type Expression = unknown;

type Arb = Arbitrary.Arbitrary<Expression>;

/**
 * The names programs bind: plain words, a logic variable's name, and the
 * names of special forms that a binding shadows. The forms that say which
 * names a body declares, `define`, `lambda`, `quote`, `relation`, and
 * `schema`, are left out: binding one changes which names are declared.
 * So are the forms these programs are built of, since a binding would make
 * them calls, and a lambda's body could then call itself.
 */
export const BOUND = ["x", "y", "f", "?x", "retract", "in", "else", "not"];

/** Strings no program binds: data, and the library's names. */
export const FREE = ["a", "n/a", "array/make", "value/identity"];

/** A string that reads as a misspelled name of the library. */
const MISSPELLED = "number/ad";

/** Arrays that name a special form but do not have its shape. */
export const MALFORMED: readonly Expression[] = [
  ["define", "x"],
  ["=", 1],
  ["lambda", "x", "x"],
  ["set!", 1, 2],
  ["cond", 1],
  ["relation", "fact", ["a"]],
  ["quote"],
  ["exists", "?x", true],
];

/** A choice among generators, each as often as its weight. */
const weighted = (...choices: readonly (readonly [number, Arb])[]): Arb =>
  oneOf(
    ...choices.flatMap(([weight, choice]) =>
      new Array<Arb>(weight).fill(choice)
    )
  );

const constant = (value: Expression): Arb => Arbitrary.Constant(value);

const small = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -3, maximum: 3 }))
);

const boolean = Arbitrary.schema(Schema.Boolean);

const name = element(BOUND);

const leaf = weighted([2, small], [5, name], [2, element(FREE)], [1, boolean]);

/** Up to two names a lambda takes. */
const parameters = Arbitrary.array(name, { maxLength: 2 });

/** Where an expression is written. */
interface Place {
  /** The names it may call: a lambda's own parameters, or any at the top. */
  readonly callable: readonly string[] | "any";
  /** The relation `r` and the schema `S`, when the program declares them. */
  readonly declared: readonly ("r" | "S")[];
  /** The names its `define` forms bind. */
  readonly defines: readonly string[];
  /** Whether it may hold arrays that name a form but lack its shape. */
  readonly malformed: boolean;
}

/** A call with two arguments, as many as any lambda here takes. */
const call = (head: Arb, argument: Arb): Arb =>
  Arbitrary.all([head, argument, argument]);

/**
 * A lambda over its parameters: its body may call them, defines what it
 * likes, and lists the parameters, what it defined, and now and then a name
 * it may read before anything defines it.
 */
const lambda = (depth: number, place: Place): Arb =>
  Arbitrary.flatMap(parameters, (names) => {
    const inner: Place = { ...place, callable: names, defines: BOUND };
    const body = weighted(
      [1, expression(depth, inner)],
      [
        2,
        Arbitrary.map(
          Arbitrary.all([
            Arbitrary.array(statement(depth, inner), { maxLength: 2 }),
            Arbitrary.array(name, { maxLength: 1 }),
            boolean,
          ]),
          ([items, other, early]) => {
            const defined = items.flatMap((item) =>
              Array.isArray(item) && item[0] === "define" ? [item[1]] : []
            );
            return [
              "begin",
              ...items,
              ["array/make", ...names, ...defined, ...(early ? other : [])],
            ];
          }
        ),
      ]
    );
    return Arbitrary.map(body, (made) => ["lambda", names, made]);
  });

/** An expression `depth` deep, written at `place`. */
export const expression = (depth: number, place: Place): Arb => {
  if (depth === 0) {
    return leaf;
  }
  const e = expression(depth - 1, place);
  const made = lambda(depth - 1, place);
  const condition = weighted(
    [3, Arbitrary.map(Arbitrary.all([e, e]), ([a, b]) => ["=", a, b])],
    [1, name],
    [1, boolean]
  );
  const choices: [number, Arb][] = [
    [3, leaf],
    [2, Arbitrary.map(Arbitrary.all([e, e]), ([a, b]) => ["array/make", a, b])],
    [1, Arbitrary.map(e, (value) => ["quote", value])],
    // A lambda, called at once with as many arguments as it takes.
    [
      3,
      Arbitrary.map(
        Arbitrary.all([made, weighted([2, e], [1, made]), e]),
        ([fn, a, b]) => [
          fn,
          ...[a, b].slice(0, ((fn as unknown[])[1] as unknown[]).length),
        ]
      ),
    ],
    [1, made],
    [
      2,
      Arbitrary.map(
        Arbitrary.all([
          Arbitrary.array(statement(depth - 1, place), { maxLength: 3 }),
          e,
        ]),
        ([items, last]) => ["begin", ...items, last]
      ),
    ],
    [
      1,
      Arbitrary.map(Arbitrary.all([condition, e, e]), ([test, then, other]) => [
        "cond",
        [test, then],
        ["else", other],
      ]),
    ],
    [1, Arbitrary.map(Arbitrary.all([e, e]), ([a, b]) => ({ k: a, j: b }))],
    [
      1,
      Arbitrary.map(e, (value) => [
        "find",
        "?v",
        ["=", "?v", ["array/make", value, 1]],
      ]),
    ],
    [
      1,
      Arbitrary.map(
        Arbitrary.all([e, made, made]),
        ([subject, then, other]) => [
          "match",
          subject,
          ["value/number?", then],
          other,
        ]
      ),
    ],
    [
      1,
      place.callable === "any"
        ? call(element(["f", "x", "in", "not", "retract", "array/make"]), e)
        : call(element(["array/make", ...place.callable]), small),
    ],
  ];
  if (place.declared.includes("r")) {
    choices.push(
      [1, constant(["query", ["r", "?v"]])],
      [1, constant(["find", "?v", ["r", "?v"]])]
    );
  }
  if (place.declared.includes("S")) {
    choices.push([1, Arbitrary.map(e, (value) => ["S", value])]);
  }
  if (place.malformed) {
    choices.push([1, element(MALFORMED)], [1, constant(MISSPELLED)]);
  }
  return weighted(...choices);
};

/** What a body does before its last expression. */
const statement = (depth: number, place: Place): Arb => {
  const e = expression(depth, place);
  const defined = place.defines.length === 0 ? name : element(place.defines);
  const choices: [number, Arb][] = [
    [
      3,
      Arbitrary.map(Arbitrary.all([defined, e]), ([bound, value]) => [
        "define",
        bound,
        value,
      ]),
    ],
    [
      1,
      Arbitrary.map(Arbitrary.all([name, e]), ([bound, value]) => [
        "set!",
        bound,
        value,
      ]),
    ],
    [2, e],
  ];
  if (place.declared.includes("r")) {
    choices.push([1, Arbitrary.map(e, (value) => ["fact", ["r", value]])]);
  }
  return weighted(...choices);
};

/** The declarations of `r` and `S` a program starts with. */
const declarations = (place: Place) =>
  Arbitrary.map(
    oneOf<Expression>(
      constant("value/integer?"),
      constant(["schema/arrayOf", "S"]),
      expression(1, place)
    ),
    (shape) => [
      ...(place.declared.includes("r") ? [["relation", "r", ["a"]]] : []),
      ...(place.declared.includes("S") ? [["schema", "S", shape]] : []),
    ]
  );

/** Some of the given items, in their order. */
const some = <A>(items: readonly A[]) =>
  Arbitrary.map(
    Arbitrary.array(boolean, {
      minLength: items.length,
      maxLength: items.length,
    }),
    (picked) => items.filter((_, at) => picked[at])
  );

/**
 * A program: it may declare `r` and `S`, defines some names, each a number
 * or a lambda, then runs some statements, which define only those names
 * again at its top, and lists what every name, the relation, and the schema
 * evaluate to at its end. With `malformed`, some of its arrays name a form
 * without its shape, and some strings read as misspelled names.
 */
export const program = (malformed = false) =>
  Arbitrary.flatMap(
    Arbitrary.all([some(BOUND), some(["r", "S"] as const)]),
    ([defines, declared]) => {
      const place: Place = { callable: "any", declared, defines, malformed };
      const value = weighted([1, small], [1, lambda(1, place)]);
      return Arbitrary.map(
        Arbitrary.all([
          declarations(place),
          Arbitrary.all(defines.map(() => value)),
          Arbitrary.array(statement(2, place), { minLength: 1, maxLength: 4 }),
        ]),
        ([first, values, items]): Expression => [
          "begin",
          ...first,
          ...defines.map((bound, at) => ["define", bound, values[at]]),
          ...items,
          ["array/make", ...BOUND, "r", "S"],
        ]
      );
    }
  );

/**
 * A value as two runs can compare it: a function or a term that waits
 * shows its kind, since how it is written names its parameters.
 */
const comparable = (value: unknown): unknown => {
  if (typeof value === "function") {
    return "<function>";
  }
  if (value instanceof LogicVariable) {
    return `?${value.name}`;
  }
  if (value instanceof LogicValue) {
    return "<term>";
  }
  if (Array.isArray(value)) {
    return value.map(comparable);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, comparable(item)])
    );
  }
  return value;
};

export type Outcome =
  | { readonly value: unknown }
  | { readonly error: string; readonly message: string };

/** What a program gives with the standard library, or how it fails. */
export const outcome = (expression: Expression) =>
  Effect.map(
    Effect.result(run(expression, stdlib)),
    (result): Outcome =>
      result._tag === "Success"
        ? { value: comparable(result.success) }
        : {
            error: (result.failure as { _tag: string })._tag,
            // A static diagnostic says what the failure said where it was
            // raised, not the functions it left on its way out.
            message: raisedAs(result.failure as Error),
          }
  );
