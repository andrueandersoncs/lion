/**
 * Symbolic values, and the shapes schemas give them.
 *
 * A symbolic value is what a variable that a schema types, and that no
 * goal binds, stands for: a number as a sum of the solver's variables, a
 * truth as the constraints under which it holds, a value as it is, or a
 * record or list of these. A schema that cannot list the values it allows
 * can still give them a shape: `value/integer?` stands for a whole number,
 * `value/number?` for any number, a record or list of schemas for a record
 * or list of what its parts stand for, `schema/anyOf` for any of its
 * schemas' shapes, and a list of at most so many items for a list of each
 * length up to that. `logic/symbolic.ts` works goals out on these values.
 */
import { LogicError } from "@/errors/evaluation";
import { Delayed } from "@/evaluation/special-forms/delay";
import {
  isPredicate,
  listWithoutMost,
  namesItself,
  notAShape,
  openWithoutRest,
} from "@/logic/reasons";
import {
  type Constraint,
  constant,
  fromNumber,
  type Linear,
  minus,
  type Sort,
  times,
  toNumber,
  type Values,
  valueAt,
  variable,
} from "@/logic/solver";
import {
  allowedBy,
  buildOf,
  isPlainObject,
  nameOf,
  type SchemaInfo,
  sameValue,
  schemaOf,
  Unknown,
} from "@/logic/terms";
import {
  compare,
  divide,
  isNumber,
  negate,
  ONE,
  type Rational,
  ratio,
  ZERO,
} from "@/numbers/exact";

/** Constraints that hold in any one of several ways: an `or` of `and`s. */
export type Formula = readonly (readonly Constraint[])[];

export const TRUE: Formula = [[]];
export const FALSE: Formula = [];

/** The most ways a formula may hold, so that working it out ends soon. */
export const MOST_WAYS = 4096;

export const tooManyWays = () =>
  new LogicError({
    message: `The goals about values no goal binds split into more than ${MOST_WAYS.toLocaleString("en")} cases. Narrow the question.`,
  });

const positive = (r: Rational): Rational => (r.n < 0n ? negate(r) : r);

/** Canonical linear scaling so equivalent constraints share one form and key. */
const canonical = (c: Constraint): Constraint => {
  if (c.linear.coefficients.size === 0) {
    return c;
  }
  const first = [...c.linear.coefficients.keys()].sort()[0] as string;
  const lead = c.linear.coefficients.get(first) as Rational;
  const divisor =
    c.relation === "=" || c.relation === "!=" ? lead : positive(lead);
  return {
    linear: times(c.linear, divide(ONE, divisor)),
    relation: c.relation,
  };
};

const linearText = (linear: Linear) =>
  `${linear.constant.n}/${linear.constant.d}|${[...linear.coefficients]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, k]) => `${name}:${k.n}/${k.d}`)
    .join(",")}`;

const constraintKey = (c: Constraint) =>
  `${c.relation}|${linearText(c.linear)}`;

const negatedLinearText = (linear: Linear) =>
  linearText(times(linear, negate(ONE)));

/** A single constraint as a formula, simplifying constants immediately. */
export const atom = (c: Constraint): Formula => {
  if (c.linear.coefficients.size === 0) {
    return meetsValue(c, c.linear.constant) ? TRUE : FALSE;
  }
  return [[canonical(c)]];
};

const opposite = ({ linear, relation }: Constraint): Constraint => {
  switch (relation) {
    case ">=":
      return canonical({ linear: times(linear, negate(ONE)), relation: ">" });
    case ">":
      return canonical({ linear: times(linear, negate(ONE)), relation: ">=" });
    case "=":
      return canonical({ linear, relation: "!=" });
    default:
      return canonical({ linear, relation: "=" });
  }
};

/** Whether `c` directly contradicts any constraint already in `byKey`. */
const contradicts = (c: Constraint, byKey: ReadonlySet<string>): boolean => {
  if (byKey.has(constraintKey(opposite(c)))) {
    return true;
  }
  const pos = linearText(c.linear);
  const neg = negatedLinearText(c.linear);
  if (c.relation === ">") {
    return (
      byKey.has(`>|${neg}`) || byKey.has(`=|${pos}`) || byKey.has(`=|${neg}`)
    );
  }
  if (c.relation === "=") {
    return byKey.has(`>|${pos}`) || byKey.has(`>|${neg}`);
  }
  return false;
};

/** Merges two conjunctions, dropping duplicates and rejecting contradictions. */
const mergeConjunction = (
  x: readonly Constraint[],
  y: readonly Constraint[]
): readonly Constraint[] | undefined => {
  const out: Constraint[] = [];
  const seen = new Set<string>();
  for (const raw of [...x, ...y]) {
    if (raw.linear.coefficients.size === 0) {
      if (!meetsValue(raw, raw.linear.constant)) {
        return undefined;
      }
      continue;
    }
    const c = canonical(raw);
    const key = constraintKey(c);
    if (seen.has(key)) {
      continue;
    }
    if (contradicts(c, seen)) {
      return undefined;
    }
    seen.add(key);
    out.push(c);
  }
  return out;
};

const conjunctionKey = (conj: readonly Constraint[]) =>
  conj.map(constraintKey).sort().join("&");

export const and = (a: Formula, b: Formula): Formula => {
  if (a.length === 0 || b.length === 0) {
    return FALSE;
  }
  const out: (readonly Constraint[])[] = [];
  const seen = new Set<string>();
  for (const x of a) {
    for (const y of b) {
      const merged = mergeConjunction(x, y);
      if (merged === undefined) {
        continue;
      }
      if (merged.length === 0) {
        return TRUE;
      }
      const key = conjunctionKey(merged);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(merged);
        if (out.length > MOST_WAYS) {
          throw tooManyWays();
        }
      }
    }
  }
  return out;
};

export const or = (a: Formula, b: Formula): Formula => {
  if (a.length === 0) {
    return b;
  }
  if (b.length === 0) {
    return a;
  }
  const out: (readonly Constraint[])[] = [];
  const seen = new Set<string>();
  for (const conj of [...a, ...b]) {
    if (conj.length === 0) {
      return TRUE;
    }
    const key = conjunctionKey(conj);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(conj);
      if (out.length > MOST_WAYS) {
        throw tooManyWays();
      }
    }
  }
  return out;
};

/** Normalizes every conjunction of a formula before negating it. */
const normalized = (a: Formula): readonly (readonly Constraint[])[] => {
  const out: (readonly Constraint[])[] = [];
  for (const conj of a) {
    const clean = mergeConjunction(conj, []);
    if (clean !== undefined) {
      out.push(clean);
    }
  }
  return out;
};

const negateNormalized = (a: readonly (readonly Constraint[])[]): Formula => {
  if (a.length === 0) {
    return TRUE;
  }
  if (a.some((conj) => conj.length === 0)) {
    return FALSE;
  }
  if (a.length === 1) {
    return (a[0] as readonly Constraint[]).map((c) => [opposite(c)]);
  }
  // Factor out constraints common to every conjunction: !(c & R) = !c | !R.
  const maps = a.map(
    (conj) => new Map(conj.map((c) => [constraintKey(c), c] as const))
  );
  const firstMap = maps[0] as Map<string, Constraint>;
  const commonKeys = new Set<string>();
  const common: Constraint[] = [];
  for (const [key, c] of firstMap) {
    if (maps.every((m) => m.has(key))) {
      commonKeys.add(key);
      common.push(c);
    }
  }
  if (common.length > 0) {
    const stripped = a.map((conj) =>
      conj.filter((c) => !commonKeys.has(constraintKey(c)))
    );
    return or(
      common.map((c) => [opposite(c)]),
      negateNormalized(stripped)
    );
  }
  // Shannon decomposition on any constraint appearing in both polarities:
  // !((c & P) | (!c & Q)) = (c & !P) | (!c & !Q).
  const counts = new Map<string, { c: Constraint; count: number }>();
  for (const m of maps) {
    for (const [key, c] of m) {
      const entry = counts.get(key);
      if (entry === undefined) {
        counts.set(key, { c, count: 1 });
      } else {
        entry.count += 1;
      }
    }
  }
  let pivot:
    | { c: Constraint; key: string; oppKey: string; score: number }
    | undefined;
  for (const [key, { c, count }] of counts) {
    const oppKey = constraintKey(opposite(c));
    const opp = counts.get(oppKey);
    if (opp !== undefined && count + opp.count > (pivot?.score ?? 0)) {
      pivot = { c, key, oppKey, score: count + opp.count };
    }
  }
  if (pivot !== undefined) {
    const { c, key, oppKey } = pivot;
    const pos = a
      .filter((_, at) => !(maps[at] as Map<string, Constraint>).has(oppKey))
      .map((conj) => conj.filter((each) => constraintKey(each) !== key));
    const neg = a
      .filter((_, at) => !(maps[at] as Map<string, Constraint>).has(key))
      .map((conj) => conj.filter((each) => constraintKey(each) !== oppKey));
    return or(
      and([[c]], negateNormalized(pos)),
      and([[opposite(c)]], negateNormalized(neg))
    );
  }
  return a.reduce<Formula>(
    (sofar, conjunction) =>
      and(
        sofar,
        conjunction.map((c) => [opposite(c)])
      ),
    TRUE
  );
};

export const not = (a: Formula): Formula => negateNormalized(normalized(a));

/** Infinite atomic value kinds represented by an integer identity variable. */
export type OpaqueKind =
  | "string"
  | "function"
  | "symbol"
  | "promise"
  | "unknown";

/** Sentinel schema meaning any value, used as the rest of open records/lists. */
export const ANY_REST_SCHEMA = Symbol("any rest schema");

/** The opaque kind of a concrete value, or undefined if it is another kind. */
export const opaqueKindOf = (value: unknown): OpaqueKind | undefined => {
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "function") {
    return "function";
  }
  if (typeof value === "symbol") {
    return "symbol";
  }
  if (value instanceof Delayed) {
    return "promise";
  }
  if (value instanceof Unknown) {
    return "unknown";
  }
  return undefined;
};

/** What a symbolic value is: a number, a truth, a value, an opaque kind, or a record or list of these. */
export type Sym =
  | { readonly kind: "number"; readonly linear: Linear }
  | { readonly kind: "truth"; readonly formula: Formula }
  | { readonly kind: "value"; readonly value: unknown }
  | {
      readonly kind: "opaque";
      readonly of: OpaqueKind;
      readonly id: Linear;
    }
  | {
      readonly kind: "record";
      readonly fields: ReadonlyMap<string, Sym>;
      /** Schema for any extra keys not in `fields`; undefined for an exact record. */
      readonly rest?: unknown;
    }
  | {
      readonly kind: "list";
      readonly items: readonly Sym[];
      /** Schema for zero or more trailing items; undefined for a fixed-length list. */
      readonly rest?: unknown;
    }
  /**
   * A lambda written where the solver runs, over values it works out: its
   * body runs on the arguments it is given, in the scope it was written in.
   */
  | {
      readonly kind: "closure";
      readonly apply: (args: readonly Sym[], depth: number) => unknown;
    };

/** A value in each of several cases, each with when it holds. */
export type Cases = readonly { readonly when: Formula; readonly sym: Sym }[];

export const one = (sym: Sym): Cases => [{ sym, when: TRUE }];

export const numberSym = (linear: Linear): Sym => ({ kind: "number", linear });

export const truthSym = (formula: Formula): Sym => ({ formula, kind: "truth" });

/** A value as a symbolic value: a number as a sum, a truth as a formula. */
export const fromValue = (value: unknown): Sym => {
  if (isNumber(value)) {
    return numberSym(constant(fromNumber(value)));
  }
  if (typeof value === "boolean") {
    return truthSym(value ? TRUE : FALSE);
  }
  return { kind: "value", value };
};

/** The value a symbolic value has once its variables have values; undefined when one has none. */
export const concrete = (sym: Sym, values: Values): unknown => {
  switch (sym.kind) {
    case "number": {
      const value = valueAt(sym.linear, values);
      return value === undefined ? undefined : toNumber(value);
    }
    case "truth":
      return sym.formula.some((conjunction) =>
        conjunction.every((c) => {
          const value = valueAt(c.linear, values);
          return value !== undefined && meetsValue(c, value);
        })
      );
    case "value":
      return sym.value;
    case "closure":
    case "opaque":
      return undefined;
    case "record": {
      if (sym.rest !== undefined) {
        return undefined;
      }
      const out: Record<string, unknown> = {};
      for (const [key, field] of sym.fields) {
        const value = concrete(field, values);
        if (value === undefined) {
          return undefined;
        }
        out[key] = value;
      }
      return out;
    }
    default: {
      if (sym.rest !== undefined) {
        return undefined;
      }
      const items = sym.items.map((item) => concrete(item, values));
      return items.includes(undefined) ? undefined : items;
    }
  }
};

const meetsValue = (c: Constraint, value: Rational) => {
  const sign = compare(value, ZERO);
  switch (c.relation) {
    case ">=":
      return sign >= 0;
    case ">":
      return sign > 0;
    case "=":
      return sign === 0;
    default:
      return sign !== 0;
  }
};

/** The solver variables a symbolic value holds. */
export const leavesOf = (sym: Sym): string[] => {
  switch (sym.kind) {
    case "number":
      return [...sym.linear.coefficients.keys()];
    case "opaque":
      return [...sym.id.coefficients.keys()];
    case "truth":
      return sym.formula.flatMap((conjunction) =>
        conjunction.flatMap((c) => [...c.linear.coefficients.keys()])
      );
    case "value":
    case "closure":
      return [];
    case "record":
      return [...sym.fields.values()].flatMap(leavesOf);
    default:
      return sym.items.flatMap(leavesOf);
  }
};

const atomId = (atoms: Map<unknown, number>, value: unknown): number => {
  const known = atoms.get(value);
  if (known !== undefined) {
    return known;
  }
  const next = atoms.size;
  atoms.set(value, next);
  return next;
};

const equalOpaque = (
  a: Extract<Sym, { readonly kind: "opaque" }>,
  b: Sym,
  atoms?: Map<unknown, number>
): Formula => {
  if (b.kind === "opaque") {
    return a.of === b.of
      ? atom({ linear: minus(a.id, b.id), relation: "=" })
      : FALSE;
  }
  if (b.kind !== "value" || opaqueKindOf(b.value) !== a.of) {
    return FALSE;
  }
  const id = atoms === undefined ? 0 : atomId(atoms, b.value);
  return atom({
    linear: minus(a.id, constant(ratio(BigInt(id)))),
    relation: "=",
  });
};

/** The formula that two symbolic values are the same value. */
export const equal = (
  a: Sym,
  b: Sym,
  atoms?: Map<unknown, number>
): Formula => {
  if (a.kind === "number" && b.kind === "number") {
    return atom({ linear: minus(a.linear, b.linear), relation: "=" });
  }
  if (a.kind === "truth" && b.kind === "truth") {
    return or(and(a.formula, b.formula), and(not(a.formula), not(b.formula)));
  }
  if (a.kind === "opaque") {
    return equalOpaque(a, b, atoms);
  }
  if (b.kind === "opaque") {
    return equalOpaque(b, a, atoms);
  }
  if (a.kind === "record" || b.kind === "record") {
    const [left, right] = [fieldsOf(a), fieldsOf(b)];
    if (
      left === undefined ||
      right === undefined ||
      left.size !== right.size ||
      ![...left.keys()].every((key) => right.has(key))
    ) {
      return FALSE;
    }
    return [...left].reduce<Formula>(
      (sofar, [key, field]) =>
        and(sofar, equal(field, right.get(key) as Sym, atoms)),
      TRUE
    );
  }
  if (a.kind === "list" || b.kind === "list") {
    const [left, right] = [itemsOf(a), itemsOf(b)];
    if (
      left === undefined ||
      right === undefined ||
      left.length !== right.length
    ) {
      return FALSE;
    }
    return left.reduce<Formula>(
      (sofar, item, at) => and(sofar, equal(item, right[at] as Sym, atoms)),
      TRUE
    );
  }
  if (a.kind === "value" && b.kind === "value") {
    return sameValue(a.value, b.value) ? TRUE : FALSE;
  }
  // A number or a truth is never the same as a value of another kind.
  return FALSE;
};

export const fieldsOf = (sym: Sym): ReadonlyMap<string, Sym> | undefined => {
  if (sym.kind === "record") {
    return sym.rest === undefined ? sym.fields : undefined;
  }
  if (sym.kind === "value" && isPlainObject(sym.value)) {
    return new Map(
      Object.entries(sym.value).map(([key, value]) => [key, fromValue(value)])
    );
  }
  return undefined;
};

export const itemsOf = (sym: Sym): readonly Sym[] | undefined => {
  if (sym.kind === "list") {
    return sym.rest === undefined ? sym.items : undefined;
  }
  if (sym.kind === "value" && Array.isArray(sym.value)) {
    return sym.value.map(fromValue);
  }
  return undefined;
};

/** Every way of choosing one case of each, with when all of them hold. */
export const product = (
  all: readonly Cases[]
): readonly { when: Formula; syms: Sym[] }[] => {
  let out: { when: Formula; syms: Sym[] }[] = [{ syms: [], when: TRUE }];
  for (const cases of all) {
    const next: { when: Formula; syms: Sym[] }[] = [];
    for (const sofar of out) {
      for (const { sym, when } of cases) {
        const both = and(sofar.when, when);
        if (both.length > 0) {
          next.push({ syms: [...sofar.syms, sym], when: both });
        }
        // Stops at the first way past the most, before making the rest.
        if (next.length > MOST_WAYS) {
          throw tooManyWays();
        }
      }
    }
    out = next;
  }
  return out;
};

/** Whether a symbolic value holds a closure, opaque kind, or open rest. */
const isAbstract = (sym: Sym): boolean => {
  switch (sym.kind) {
    case "closure":
    case "opaque":
      return true;
    case "record":
      return (
        sym.rest !== undefined || [...sym.fields.values()].some(isAbstract)
      );
    case "list":
      return sym.rest !== undefined || sym.items.some(isAbstract);
    default:
      return false;
  }
};

export const isConcrete = (sym: Sym) =>
  leavesOf(sym).length === 0 && !isAbstract(sym);

/** A value that has no unknown in it, as a plain value. */
export const plainOf = (sym: Sym): unknown => concrete(sym, new Map());

/** What a schema is through its names. */
export const throughNames = (
  schema: unknown,
  seen = new Set<unknown>()
): unknown => {
  const named = schemaOf(schema);
  if (named?.shape === undefined || seen.has(schema)) {
    return schema;
  }
  seen.add(schema);
  return throughNames(named.shape, seen);
};

// Shapes: what a schema stands for when it cannot list its values.

/** A schema that cannot give its values a shape, and why. */
export class Shapeless {
  readonly why: string;
  constructor(why: string) {
    this.why = why;
  }
}

/** A shape in each of several cases, with the sorts of its numbers. */
interface Shaped {
  readonly cases: readonly { readonly when: Formula; readonly sym: Sym }[];
  /** True when some number in it is unknown, so it cannot simply be listed. */
  readonly unknown: boolean;
}

const MOST_SHAPES = 4096;

const OPAQUE_PREDICATES: Readonly<Record<string, OpaqueKind>> = {
  "value/function?": "function",
  "value/promise?": "promise",
  "value/string?": "string",
  "value/symbol?": "symbol",
  "value/unknown?": "unknown",
};

const opaqueShape = (
  of: OpaqueKind,
  path: string,
  sorts: Map<string, Sort>
): Shaped => {
  sorts.set(path, "integer");
  return {
    cases: [{ sym: { id: variable(path), kind: "opaque", of }, when: TRUE }],
    unknown: true,
  };
};

/** Every disjoint kind a Lion value can have, for `value/any?` in broad mode. */
const anyShape = (path: string, sorts: Map<string, Sort>): Shaped => {
  sorts.set(`${path}#num`, "real");
  const opaques = (
    ["string", "function", "symbol", "promise", "unknown"] as const
  ).map((of) => {
    const id = `${path}#${of}`;
    sorts.set(id, "integer");
    return {
      sym: { id: variable(id), kind: "opaque" as const, of },
      when: TRUE,
    };
  });
  return {
    cases: [
      { sym: fromValue(null), when: TRUE },
      { sym: fromValue(false), when: TRUE },
      { sym: fromValue(true), when: TRUE },
      { sym: fromValue(undefined), when: TRUE },
      { sym: numberSym(variable(`${path}#num`)), when: TRUE },
      ...opaques,
      {
        sym: { items: [], kind: "list", rest: ANY_REST_SCHEMA },
        when: TRUE,
      },
      {
        sym: { fields: new Map(), kind: "record", rest: ANY_REST_SCHEMA },
        when: TRUE,
      },
    ],
    unknown: true,
  };
};

/**
 * What a schema stands for as symbolic values, with a fresh variable of
 * the solver for each number it leaves open, named by where it stands under
 * `path`. With `broad`, also represents opaque kinds, `value/any?`, open
 * schemas without a rest, and unbounded lists/records for `schema/includes?`.
 * Fails, saying why, when the schema cannot give its values a shape.
 */
const broadPredicateShape = (
  name: string,
  path: string,
  sorts: Map<string, Sort>
): Shaped | undefined => {
  const opaque = OPAQUE_PREDICATES[name];
  if (opaque !== undefined) {
    return opaqueShape(opaque, path, sorts);
  }
  if (name === "value/undefined?") {
    return {
      cases: [{ sym: fromValue(undefined), when: TRUE }],
      unknown: false,
    };
  }
  if (name === "value/array?") {
    return {
      cases: [
        {
          sym: { items: [], kind: "list", rest: ANY_REST_SCHEMA },
          when: TRUE,
        },
      ],
      unknown: true,
    };
  }
  if (name === "value/object?") {
    return {
      cases: [
        {
          sym: { fields: new Map(), kind: "record", rest: ANY_REST_SCHEMA },
          when: TRUE,
        },
      ],
      unknown: true,
    };
  }
  return name === "value/any?" ? anyShape(path, sorts) : undefined;
};

const shapeFunction = (
  schema: (...args: never[]) => unknown,
  path: string,
  sorts: Map<string, Sort>,
  seen: ReadonlySet<SchemaInfo>,
  broad: boolean
): Shaped | Shapeless => {
  const allowed = allowedBy(schema);
  if (allowed !== undefined) {
    return {
      cases: allowed.map((v) => ({ sym: fromValue(v), when: TRUE })),
      unknown: false,
    };
  }
  const name = nameOf(schema);
  if (name === "value/integer?" || name === "value/number?") {
    const sort: Sort = name === "value/integer?" ? "integer" : "real";
    sorts.set(path, sort);
    return {
      cases: [{ sym: numberSym(variable(path)), when: TRUE }],
      unknown: true,
    };
  }
  if (broad && name !== undefined) {
    const broadShape = broadPredicateShape(name, path, sorts);
    if (broadShape !== undefined) {
      return broadShape;
    }
  }
  const built = buildOf(schema);
  if (built !== undefined) {
    return shapeBuilt(
      nameOf(built.by),
      schema,
      built.args,
      path,
      sorts,
      seen,
      broad
    );
  }
  return new Shapeless(isPredicate(schema));
};

export const shapeOf = (
  schema: unknown,
  path: string,
  sorts: Map<string, Sort>,
  seen: ReadonlySet<SchemaInfo>,
  broad = false
): Shaped | Shapeless => {
  if (schema === ANY_REST_SCHEMA) {
    return anyShape(path, sorts);
  }
  const named = schemaOf(schema);
  if (named !== undefined) {
    if (named.definition === undefined) {
      return new Shapeless(`"${named.name}" is still being declared`);
    }
    if (seen.has(named)) {
      return new Shapeless(namesItself(named.name));
    }
    return shapeOf(named.shape, path, sorts, new Set([...seen, named]), broad);
  }
  if (typeof schema === "function") {
    return shapeFunction(
      schema as (...args: never[]) => unknown,
      path,
      sorts,
      seen,
      broad
    );
  }
  if (isPlainObject(schema)) {
    return shapeRecord(
      Object.entries(schema),
      undefined,
      path,
      sorts,
      seen,
      broad
    );
  }
  if (Array.isArray(schema)) {
    return shapeList(schema, path, sorts, seen, broad);
  }
  return { cases: [{ sym: fromValue(schema), when: TRUE }], unknown: false };
};

export const combine = (
  parts: readonly Shaped[],
  build: (syms: Sym[]) => Sym
): Shaped => {
  let out: { when: Formula; syms: Sym[] }[] = [{ syms: [], when: TRUE }];
  for (const part of parts) {
    out = out.flatMap((sofar) =>
      part.cases.map((each) => ({
        syms: [...sofar.syms, each.sym],
        when: and(sofar.when, each.when),
      }))
    );
    if (out.length > MOST_SHAPES) {
      throw tooManyWays();
    }
  }
  return {
    cases: out.map(({ syms, when }) => ({ sym: build(syms), when })),
    unknown: parts.some((part) => part.unknown),
  };
};

const shapeRecord = (
  fields: readonly (readonly [string, unknown])[],
  rest: Shaped | undefined,
  path: string,
  sorts: Map<string, Sort>,
  seen: ReadonlySet<SchemaInfo>,
  broad = false
): Shaped | Shapeless => {
  const parts: Shaped[] = [];
  const optional: boolean[] = [];
  for (const [key, part] of fields) {
    const built = buildOf(throughNames(part));
    const inner =
      built !== undefined && nameOf(built.by) === "schema/optional"
        ? built.args[0]
        : undefined;
    const shaped = shapeOf(inner ?? part, `${path}.${key}`, sorts, seen, broad);
    if (shaped instanceof Shapeless) {
      return shaped;
    }
    // An optional key is there or not: a missing one is a case of its own.
    parts.push(
      inner === undefined
        ? shaped
        : {
            cases: [
              ...shaped.cases,
              { sym: { kind: "value", value: MISSING }, when: TRUE },
            ],
            unknown: shaped.unknown,
          }
    );
    optional.push(inner !== undefined);
  }
  const keys = fields.map(([key]) => key);
  const record = combine(parts, (syms) => ({
    fields: new Map(
      keys.flatMap((key, at): [string, Sym][] => {
        const sym = syms[at] as Sym;
        return sym.kind === "value" && sym.value === MISSING
          ? []
          : [[key, sym]];
      })
    ),
    kind: "record",
  }));
  if (rest === undefined) {
    return record;
  }
  return combine([record, rest], ([named, other]) => ({
    fields: new Map([
      ...(other?.kind === "record" ? other.fields : []),
      ...(named?.kind === "record" ? named.fields : []),
    ]),
    kind: "record",
    ...(other?.kind === "record" && other.rest !== undefined
      ? { rest: other.rest }
      : {}),
  }));
};

const MISSING = Symbol("missing");

export const shapeList = (
  items: readonly unknown[],
  path: string,
  sorts: Map<string, Sort>,
  seen: ReadonlySet<SchemaInfo>,
  broad = false
): Shaped | Shapeless => {
  const parts: Shaped[] = [];
  for (const [at, item] of items.entries()) {
    const shaped = shapeOf(item, `${path}.${at}`, sorts, seen, broad);
    if (shaped instanceof Shapeless) {
      return shaped;
    }
    parts.push(shaped);
  }
  return combine(parts, (syms) => ({ items: syms, kind: "list" }));
};

/**
 * The cases of every shape, as one shape; the first that cannot stand, when
 * one cannot. The shapes are made one at a time, so none after it is.
 */
const union = (shapes: Iterable<Shaped | Shapeless>): Shaped | Shapeless => {
  const cases: { when: Formula; sym: Sym }[] = [];
  let unknown = false;
  for (const shaped of shapes) {
    if (shaped instanceof Shapeless) {
      return shaped;
    }
    cases.push(...shaped.cases);
    unknown ||= shaped.unknown;
    if (cases.length > MOST_SHAPES) {
      throw tooManyWays();
    }
  }
  return { cases, unknown };
};

function* shapesOf(
  parts: readonly unknown[],
  path: string,
  sorts: Map<string, Sort>,
  seen: ReadonlySet<SchemaInfo>,
  broad = false
): Generator<Shaped | Shapeless> {
  for (const [at, part] of parts.entries()) {
    yield shapeOf(part, `${path}/${at}`, sorts, seen, broad);
  }
}

function* listsUpTo(
  item: unknown,
  most: number,
  path: string,
  sorts: Map<string, Sort>,
  seen: ReadonlySet<SchemaInfo>,
  broad = false
): Generator<Shaped | Shapeless> {
  for (let length = 0; length <= most; length += 1) {
    const items = Array.from({ length }, () => item);
    yield shapeList(items, `${path}#${length}`, sorts, seen, broad);
  }
}

/**
 * The first part of a schema/allOf that gives a shape gives it; the others are
 * checked. In broad mode, prefers an exact/narrow shape before a broad one so
 * `allOf(value/any?, value/integer?)` shapes directly as an integer.
 */
const shapeAll = (
  parts: readonly unknown[],
  path: string,
  sorts: Map<string, Sort>,
  seen: ReadonlySet<SchemaInfo>,
  broad = false
): Shaped | Shapeless => {
  for (const part of parts) {
    const shaped = shapeOf(part, path, sorts, seen, false);
    if (!(shaped instanceof Shapeless)) {
      return shaped;
    }
  }
  if (broad) {
    for (const part of parts) {
      const shaped = shapeOf(part, path, sorts, seen, true);
      if (!(shaped instanceof Shapeless)) {
        return shaped;
      }
    }
  }
  return new Shapeless("no part of schema/allOf says what kind its values are");
};

const shapeOpen = (
  schema: unknown,
  [shape, ...rest]: readonly unknown[],
  path: string,
  sorts: Map<string, Sort>,
  seen: ReadonlySet<SchemaInfo>,
  broad = false
): Shaped | Shapeless => {
  if (rest.length === 0 && !broad) {
    return new Shapeless(openWithoutRest(schema));
  }
  const items = throughNames(shape);
  if (isPlainObject(items)) {
    const restShape: Shaped | Shapeless =
      rest.length === 0
        ? {
            cases: [
              {
                sym: {
                  fields: new Map(),
                  kind: "record",
                  rest: ANY_REST_SCHEMA,
                },
                when: TRUE,
              },
            ],
            unknown: true,
          }
        : shapeOf(rest[0], `${path}.~`, sorts, seen, broad);
    if (restShape instanceof Shapeless) {
      return restShape;
    }
    return shapeRecord(
      Object.entries(items),
      restShape,
      path,
      sorts,
      seen,
      broad
    );
  }
  if (!Array.isArray(items)) {
    return new Shapeless(notAShape(shape));
  }
  const restShape: Shaped | Shapeless =
    rest.length === 0
      ? {
          cases: [
            {
              sym: { items: [], kind: "list", rest: ANY_REST_SCHEMA },
              when: TRUE,
            },
          ],
          unknown: true,
        }
      : shapeOf(rest[0], `${path}.~`, sorts, seen, broad);
  if (restShape instanceof Shapeless) {
    return restShape;
  }
  const named = shapeList(items, path, sorts, seen, broad);
  if (named instanceof Shapeless) {
    return named;
  }
  return combine([named, restShape], ([a, b]) => ({
    items: [
      ...(a?.kind === "list" ? a.items : []),
      ...(b?.kind === "list" ? b.items : []),
    ],
    kind: "list",
    ...(b?.kind === "list" && b.rest !== undefined ? { rest: b.rest } : {}),
  }));
};

const shapeBuilt = (
  name: string | undefined,
  schema: unknown,
  args: readonly unknown[],
  path: string,
  sorts: Map<string, Sort>,
  seen: ReadonlySet<SchemaInfo>,
  broad = false
): Shaped | Shapeless => {
  switch (name) {
    case "schema/anyOf":
      return union(shapesOf(args, path, sorts, seen, broad));
    case "schema/allOf":
      return shapeAll(args, path, sorts, seen, broad);
    case "schema/optional":
      return shapeOf(args[0], path, sorts, seen, broad);
    case "schema/arrayOf": {
      const [item, most] = args;
      if (most === undefined) {
        return broad
          ? {
              cases: [
                { sym: { items: [], kind: "list", rest: item }, when: TRUE },
              ],
              unknown: true,
            }
          : new Shapeless(listWithoutMost(schema, item));
      }
      return union(listsUpTo(item, most as number, path, sorts, seen, broad));
    }
    case "schema/recordOf":
      return broad
        ? {
            cases: [
              {
                sym: { fields: new Map(), kind: "record", rest: args[0] },
                when: TRUE,
              },
            ],
            unknown: true,
          }
        : new Shapeless(`${name} does not say what kind its values are`);
    case "schema/open":
      return shapeOpen(schema, args, path, sorts, seen, broad);
    default:
      return new Shapeless(
        `${name ?? "this schema"} does not say what kind its values are`
      );
  }
};

/**
 * Why a schema cannot stand for symbolic values, or undefined when it can
 * and leaves some number open, so a variable it types is solved for.
 */
export const symbolic = (schema: unknown): string | undefined => {
  try {
    const shaped = shapeOf(schema, "v", new Map(), new Set());
    if (shaped instanceof Shapeless) {
      return shaped.why;
    }
    return shaped.unknown ? undefined : "it leaves no number open";
  } catch (error) {
    return error instanceof LogicError ? error.message : String(error);
  }
};
