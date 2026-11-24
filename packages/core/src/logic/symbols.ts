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
  type LambdaInfo,
  nameOf,
  type SchemaInfo,
  sameValue,
  schemaOf,
  Unknown,
} from "@/logic/terms";
import {
  add,
  compare,
  divide,
  isNumber,
  isZero,
  multiply,
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
  | {
      readonly kind: "number";
      readonly linear: Linear;
      /** Higher-degree monomial terms (sorted `"a*b"` keys); omitted when purely linear. */
      readonly nonlinear?: ReadonlyMap<string, Rational>;
    }
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
      /** Strictly smaller inductive tail list (from structural list induction). */
      readonly tail?: Extract<Sym, { readonly kind: "inductive" }>;
    }
  /**
   * A strictly smaller sub-value fitting a recursive schema (or unbounded list)
   * encountered during inductive inclusion or structural induction.
   */
  | {
      readonly kind: "inductive";
      readonly schema: unknown;
      readonly depth: number;
      readonly name: string;
      readonly length?: Linear;
    }
  /**
   * A lambda written where the solver runs, over values it works out: its
   * body runs on the arguments it is given, in the scope it was written in.
   */
  | {
      readonly kind: "closure";
      readonly apply: (args: readonly Sym[], depth: number) => unknown;
      readonly info?: LambdaInfo;
      readonly scope?: ReadonlyMap<string, Cases>;
    };

/** A value in each of several cases, each with when it holds. */
export type Cases = readonly { readonly when: Formula; readonly sym: Sym }[];

export const one = (sym: Sym): Cases => [{ sym, when: TRUE }];

export type NumberSym = Extract<Sym, { readonly kind: "number" }>;

export const numberSym = (
  linear: Linear,
  nonlinear?: ReadonlyMap<string, Rational>
): NumberSym =>
  nonlinear !== undefined && nonlinear.size > 0
    ? { kind: "number", linear, nonlinear }
    : { kind: "number", linear };

const monomialKey = (factors: readonly string[]): string =>
  [...factors].sort().join("*");

const polyTerms = (sym: NumberSym): [readonly string[], Rational][] => {
  const out: [readonly string[], Rational][] = [];
  if (!isZero(sym.linear.constant)) {
    out.push([[], sym.linear.constant]);
  }
  for (const [name, k] of sym.linear.coefficients) {
    if (!isZero(k)) {
      out.push([[name], k]);
    }
  }
  if (sym.nonlinear !== undefined) {
    for (const [key, k] of sym.nonlinear) {
      if (!isZero(k)) {
        out.push([key.split("*"), k]);
      }
    }
  }
  return out;
};

const fromPolyTerms = (
  terms: Iterable<readonly [readonly string[], Rational]>
): NumberSym => {
  let constantVal: Rational = ZERO;
  const coeffs = new Map<string, Rational>();
  const nonlinear = new Map<string, Rational>();
  for (const [factors, k] of terms) {
    if (isZero(k)) {
      continue;
    }
    if (factors.length === 0) {
      constantVal = add(constantVal, k);
    } else if (factors.length === 1) {
      const name = factors[0] as string;
      const next = add(coeffs.get(name) ?? ZERO, k);
      if (isZero(next)) {
        coeffs.delete(name);
      } else {
        coeffs.set(name, next);
      }
    } else {
      const key = monomialKey(factors);
      const next = add(nonlinear.get(key) ?? ZERO, k);
      if (isZero(next)) {
        nonlinear.delete(key);
      } else {
        nonlinear.set(key, next);
      }
    }
  }
  return numberSym(
    { coefficients: coeffs, constant: constantVal },
    nonlinear.size > 0 ? nonlinear : undefined
  );
};

export const polyAdd = (a: NumberSym, b: NumberSym): NumberSym => {
  if (a.nonlinear === undefined && b.nonlinear === undefined) {
    const coeffs = new Map(a.linear.coefficients);
    for (const [name, k] of b.linear.coefficients) {
      const next = add(coeffs.get(name) ?? ZERO, k);
      if (isZero(next)) {
        coeffs.delete(name);
      } else {
        coeffs.set(name, next);
      }
    }
    return numberSym({
      coefficients: coeffs,
      constant: add(a.linear.constant, b.linear.constant),
    });
  }
  return fromPolyTerms([...polyTerms(a), ...polyTerms(b)]);
};

export const polySub = (a: NumberSym, b: NumberSym): NumberSym =>
  a.nonlinear === undefined && b.nonlinear === undefined
    ? numberSym(minus(a.linear, b.linear))
    : fromPolyTerms([
        ...polyTerms(a),
        ...polyTerms(b).map(([f, k]) => [f, negate(k)] as const),
      ]);

export const polyScale = (a: NumberSym, factor: Rational): NumberSym => {
  if (isZero(factor)) {
    return numberSym(constant(ZERO));
  }
  if (a.nonlinear === undefined) {
    return numberSym(times(a.linear, factor));
  }
  const nonlinear = new Map<string, Rational>();
  for (const [key, k] of a.nonlinear) {
    const next = multiply(k, factor);
    if (!isZero(next)) {
      nonlinear.set(key, next);
    }
  }
  return numberSym(times(a.linear, factor), nonlinear);
};

export const polyMul = (a: NumberSym, b: NumberSym): NumberSym => {
  const ta = polyTerms(a);
  const tb = polyTerms(b);
  const prod: [readonly string[], Rational][] = [];
  for (const [fa, ka] of ta) {
    for (const [fb, kb] of tb) {
      prod.push([[...fa, ...fb], multiply(ka, kb)]);
    }
  }
  return fromPolyTerms(prod);
};

export const polySubstitute = (
  sym: NumberSym,
  varName: string,
  replacement: NumberSym
): NumberSym => {
  let acc: NumberSym = numberSym(constant(ZERO));
  for (const [factors, k] of polyTerms(sym)) {
    let termVal: NumberSym = numberSym(constant(k));
    const kept: string[] = [];
    for (const f of factors) {
      if (f === varName) {
        termVal = polyMul(termVal, replacement);
      } else {
        kept.push(f);
      }
    }
    if (kept.length > 0) {
      termVal = polyMul(termVal, fromPolyTerms([[kept, ONE]]));
    }
    acc = polyAdd(acc, termVal);
  }
  return acc;
};

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

const concreteNumber = (sym: NumberSym, values: Values): unknown => {
  let total = valueAt(sym.linear, values);
  if (total === undefined) {
    return undefined;
  }
  if (sym.nonlinear === undefined) {
    return toNumber(total);
  }
  for (const [key, k] of sym.nonlinear) {
    let term = k;
    for (const factor of key.split("*")) {
      const v = values.get(factor);
      if (v === undefined) {
        return undefined;
      }
      term = multiply(term, v);
    }
    total = add(total, term);
  }
  return toNumber(total);
};

/** The value a symbolic value has once its variables have values; undefined when one has none. */
export const concrete = (sym: Sym, values: Values): unknown => {
  switch (sym.kind) {
    case "number":
      return concreteNumber(sym, values);
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
    case "inductive":
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
      if (sym.rest !== undefined || sym.tail !== undefined) {
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
      return [
        ...sym.linear.coefficients.keys(),
        ...(sym.nonlinear === undefined
          ? []
          : [...sym.nonlinear.keys()].flatMap((k) => k.split("*"))),
      ];
    case "opaque":
      return [...sym.id.coefficients.keys()];
    case "truth":
      return sym.formula.flatMap((conjunction) =>
        conjunction.flatMap((c) => [...c.linear.coefficients.keys()])
      );
    case "value":
    case "closure":
      return [];
    case "inductive":
      return sym.length === undefined
        ? []
        : [...sym.length.coefficients.keys()];
    case "record":
      return [...sym.fields.values()].flatMap(leavesOf);
    default:
      return [
        ...sym.items.flatMap(leavesOf),
        ...(sym.tail === undefined ? [] : leavesOf(sym.tail)),
      ];
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

const isEmptyListSym = (sym: Sym): boolean =>
  (sym.kind === "value" &&
    Array.isArray(sym.value) &&
    sym.value.length === 0) ||
  (sym.kind === "list" && sym.items.length === 0 && sym.rest === undefined);

const equalInductive = (a: Sym, b: Sym): Formula | undefined => {
  if (a.kind === "inductive" && b.kind === "inductive" && a.name === b.name) {
    return TRUE;
  }
  if (a.kind === "inductive" && a.length !== undefined && isEmptyListSym(b)) {
    return atom({ linear: a.length, relation: "=" });
  }
  if (b.kind === "inductive" && b.length !== undefined && isEmptyListSym(a)) {
    return atom({ linear: b.length, relation: "=" });
  }
  return undefined;
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
  const ind = equalInductive(a, b);
  if (ind !== undefined) {
    return ind;
  }
  if (a.kind === "opaque") {
    return equalOpaque(a, b, atoms);
  }
  if (b.kind === "opaque") {
    return equalOpaque(b, a, atoms);
  }
  if (a.kind === "record" || b.kind === "record") {
    return equalRecords(a, b, atoms);
  }
  if (a.kind === "list" || b.kind === "list") {
    return equalLists(a, b, atoms);
  }
  if (a.kind === "value" && b.kind === "value") {
    return sameValue(a.value, b.value) ? TRUE : FALSE;
  }
  // A number or a truth is never the same as a value of another kind.
  return FALSE;
};

const equalRecords = (
  a: Sym,
  b: Sym,
  atoms?: Map<unknown, number>
): Formula => {
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
};

const equalLists = (a: Sym, b: Sym, atoms?: Map<unknown, number>): Formula => {
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
    return sym.rest === undefined && sym.tail === undefined
      ? sym.items
      : undefined;
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

/** Whether a symbolic value holds a closure, opaque kind, inductive value, or open rest. */
const isAbstract = (sym: Sym): boolean => {
  switch (sym.kind) {
    case "closure":
    case "inductive":
    case "opaque":
      return true;
    case "record":
      return (
        sym.rest !== undefined || [...sym.fields.values()].some(isAbstract)
      );
    case "list":
      return (
        sym.rest !== undefined ||
        sym.tail !== undefined ||
        sym.items.some(isAbstract)
      );
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

const schemaChildren = (schema: unknown): readonly unknown[] => {
  if (typeof schema === "function") {
    return buildOf(schema)?.args ?? [];
  }
  if (Array.isArray(schema)) {
    return schema;
  }
  return isPlainObject(schema) ? Object.values(schema) : [];
};

/** Collects all named schemas structurally reachable from `schema`. */
const collectNamed = (
  schema: unknown,
  found: Set<SchemaInfo>,
  visited = new Set<unknown>()
): void => {
  if (
    schema === null ||
    schema === undefined ||
    (typeof schema !== "object" && typeof schema !== "function") ||
    visited.has(schema)
  ) {
    return;
  }
  visited.add(schema);
  const named = schemaOf(schema);
  if (named !== undefined) {
    if (!found.has(named)) {
      found.add(named);
      if (named.definition !== undefined) {
        collectNamed(named.shape, found, visited);
      }
    }
    return;
  }
  for (const child of schemaChildren(schema)) {
    collectNamed(child, found, visited);
  }
};

/** Whether a schema shape is inhabited assuming only named schemas in `alive` are inhabited. */
const shapeInhabited = (
  schema: unknown,
  alive: ReadonlySet<SchemaInfo>
): boolean => {
  if (schema === ANY_REST_SCHEMA) {
    return true;
  }
  const named = schemaOf(schema);
  if (named !== undefined) {
    return named.definition === undefined ? true : alive.has(named);
  }
  if (typeof schema === "function") {
    const allowed = allowedBy(schema);
    if (allowed !== undefined) {
      return allowed.length > 0;
    }
    const built = buildOf(schema);
    if (built === undefined) {
      return true;
    }
    switch (nameOf(built.by)) {
      case "schema/anyOf":
        return built.args.some((arg) => shapeInhabited(arg, alive));
      case "schema/allOf":
        return built.args.every((arg) => shapeInhabited(arg, alive));
      case "schema/optional":
      case "schema/arrayOf":
      case "schema/recordOf":
        return true;
      case "schema/open":
        return (
          shapeInhabited(built.args[0], alive) &&
          (built.args.length < 2 || shapeInhabited(built.args[1], alive))
        );
      default:
        return true;
    }
  }
  if (Array.isArray(schema)) {
    return schema.every((item) => shapeInhabited(item, alive));
  }
  if (isPlainObject(schema)) {
    return Object.values(schema).every((value) => {
      const built = buildOf(throughNames(value));
      return (
        (built !== undefined && nameOf(built.by) === "schema/optional") ||
        shapeInhabited(value, alive)
      );
    });
  }
  return true;
};

/**
 * True when a positive schema structurally allows no finite values (least
 * fixed point is empty), such as `["schema", "Void", {"next": "Void"}]`.
 */
export const isStructurallyUninhabited = (schema: unknown): boolean => {
  const named = new Set<SchemaInfo>();
  collectNamed(schema, named);
  if (named.size === 0) {
    return !shapeInhabited(schema, named);
  }
  const alive = new Set<SchemaInfo>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const info of named) {
      if (
        !alive.has(info) &&
        (info.definition === undefined || shapeInhabited(info.shape, alive))
      ) {
        alive.add(info);
        grew = true;
      }
    }
  }
  return !shapeInhabited(schema, alive);
};

/** True when `schema` (a named schema) refers to itself structurally. */
export const isRecursiveNamedSchema = (
  schema: unknown,
  seen = new Set<SchemaInfo>(),
  visited = new Set<unknown>()
): boolean => {
  if (
    schema === null ||
    schema === undefined ||
    (typeof schema !== "object" && typeof schema !== "function")
  ) {
    return false;
  }
  const named = schemaOf(schema);
  if (named !== undefined) {
    if (seen.has(named)) {
      return true;
    }
    if (named.definition === undefined) {
      return false;
    }
    const next = new Set(seen);
    next.add(named);
    return isRecursiveNamedSchema(named.shape, next, visited);
  }
  if (visited.has(schema)) {
    return false;
  }
  visited.add(schema);
  if (typeof schema === "function") {
    return (
      buildOf(schema)?.args.some((arg) =>
        isRecursiveNamedSchema(arg, seen, visited)
      ) ?? false
    );
  }
  if (Array.isArray(schema)) {
    return schema.some((item) => isRecursiveNamedSchema(item, seen, visited));
  }
  if (isPlainObject(schema)) {
    return Object.values(schema).some((value) =>
      isRecursiveNamedSchema(value, seen, visited)
    );
  }
  return false;
};

const shapeFunction = (
  schema: (...args: never[]) => unknown,
  path: string,
  sorts: Map<string, Sort>,
  seen: ReadonlyMap<SchemaInfo, number>,
  broad: boolean,
  depth: number
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
      broad,
      depth
    );
  }
  return new Shapeless(isPredicate(schema));
};

const toSeenMap = (
  seen: ReadonlySet<SchemaInfo> | ReadonlyMap<SchemaInfo, number>
): ReadonlyMap<SchemaInfo, number> =>
  seen instanceof Map
    ? seen
    : new Map([...seen].map((info) => [info, 0] as const));

export const shapeOf = (
  schema: unknown,
  path: string,
  sorts: Map<string, Sort>,
  seen: ReadonlySet<SchemaInfo> | ReadonlyMap<SchemaInfo, number>,
  broad = false,
  depth = 0
): Shaped | Shapeless => {
  const seenMap = toSeenMap(seen);
  if (schema === ANY_REST_SCHEMA) {
    return anyShape(path, sorts);
  }
  const named = schemaOf(schema);
  if (named !== undefined) {
    if (named.definition === undefined) {
      return new Shapeless(`"${named.name}" is still being declared`);
    }
    if (broad && isStructurallyUninhabited(schema)) {
      return { cases: [], unknown: false };
    }
    const openedAt = seenMap.get(named);
    if (openedAt !== undefined) {
      if (!broad) {
        return new Shapeless(namesItself(named.name));
      }
      if (depth <= openedAt) {
        // Unguarded self-cycle has no finite derivation under least fixed point.
        return { cases: [], unknown: false };
      }
      return {
        cases: [
          {
            sym: { depth, kind: "inductive", name: path, schema },
            when: TRUE,
          },
        ],
        unknown: true,
      };
    }
    const next = new Map(seenMap);
    next.set(named, depth);
    return shapeOf(named.shape, path, sorts, next, broad, depth);
  }
  if (typeof schema === "function") {
    return shapeFunction(
      schema as (...args: never[]) => unknown,
      path,
      sorts,
      seenMap,
      broad,
      depth
    );
  }
  if (isPlainObject(schema)) {
    return shapeRecord(
      Object.entries(schema),
      undefined,
      path,
      sorts,
      seenMap,
      broad,
      depth
    );
  }
  if (Array.isArray(schema)) {
    return shapeList(schema, path, sorts, seenMap, broad, depth);
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
  seen: ReadonlyMap<SchemaInfo, number>,
  broad = false,
  depth = 0
): Shaped | Shapeless => {
  const parts: Shaped[] = [];
  const optional: boolean[] = [];
  for (const [key, part] of fields) {
    const built = buildOf(throughNames(part));
    const inner =
      built !== undefined && nameOf(built.by) === "schema/optional"
        ? built.args[0]
        : undefined;
    const shaped = shapeOf(
      inner ?? part,
      `${path}.${key}`,
      sorts,
      seen,
      broad,
      depth + 1
    );
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
  seen: ReadonlySet<SchemaInfo> | ReadonlyMap<SchemaInfo, number>,
  broad = false,
  depth = 0
): Shaped | Shapeless => {
  const seenMap = toSeenMap(seen);
  const parts: Shaped[] = [];
  for (const [at, item] of items.entries()) {
    const shaped = shapeOf(
      item,
      `${path}.${at}`,
      sorts,
      seenMap,
      broad,
      depth + 1
    );
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
  seen: ReadonlyMap<SchemaInfo, number>,
  broad = false,
  depth = 0
): Generator<Shaped | Shapeless> {
  for (const [at, part] of parts.entries()) {
    yield shapeOf(part, `${path}/${at}`, sorts, seen, broad, depth);
  }
}

function* listsUpTo(
  item: unknown,
  most: number,
  path: string,
  sorts: Map<string, Sort>,
  seen: ReadonlyMap<SchemaInfo, number>,
  broad = false,
  depth = 0
): Generator<Shaped | Shapeless> {
  for (let length = 0; length <= most; length += 1) {
    const items = Array.from({ length }, () => item);
    yield shapeList(items, `${path}#${length}`, sorts, seen, broad, depth);
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
  seen: ReadonlyMap<SchemaInfo, number>,
  broad = false,
  depth = 0
): Shaped | Shapeless => {
  for (const part of parts) {
    const shaped = shapeOf(part, path, sorts, seen, false, depth);
    if (!(shaped instanceof Shapeless)) {
      return shaped;
    }
  }
  if (broad) {
    for (const part of parts) {
      const shaped = shapeOf(part, path, sorts, seen, true, depth);
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
  seen: ReadonlyMap<SchemaInfo, number>,
  broad = false,
  depth = 0
): Shaped | Shapeless => {
  if (rest.length === 0 && !broad) {
    return new Shapeless(openWithoutRest(schema));
  }
  const items = throughNames(shape);
  if (isPlainObject(items)) {
    const entries = Object.entries(items);
    const hasRequired = entries.some(([, part]) => {
      const built = buildOf(throughNames(part));
      return !(built !== undefined && nameOf(built.by) === "schema/optional");
    });
    const restDepth = depth + (hasRequired ? 1 : 0);
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
        : shapeOf(rest[0], `${path}.~`, sorts, seen, broad, restDepth);
    if (restShape instanceof Shapeless) {
      return restShape;
    }
    return shapeRecord(entries, restShape, path, sorts, seen, broad, depth);
  }
  if (!Array.isArray(items)) {
    return new Shapeless(notAShape(shape));
  }
  const restDepth = depth + (items.length > 0 ? 1 : 0);
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
      : shapeOf(rest[0], `${path}.~`, sorts, seen, broad, restDepth);
  if (restShape instanceof Shapeless) {
    return restShape;
  }
  const named = shapeList(items, path, sorts, seen, broad, depth);
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
  seen: ReadonlyMap<SchemaInfo, number>,
  broad = false,
  depth = 0
): Shaped | Shapeless => {
  switch (name) {
    case "schema/anyOf":
      return union(shapesOf(args, path, sorts, seen, broad, depth));
    case "schema/allOf":
      return shapeAll(args, path, sorts, seen, broad, depth);
    case "schema/optional":
      return shapeOf(args[0], path, sorts, seen, broad, depth);
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
      return union(
        listsUpTo(item, most as number, path, sorts, seen, broad, depth)
      );
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
      return shapeOpen(schema, args, path, sorts, seen, broad, depth);
    default:
      return new Shapeless(
        `${name ?? "this schema"} does not say what kind its values are`
      );
  }
};

/**
 * True when `schema` is an inductive schema that cannot be given a fixed finite
 * shape without unfolding: a recursive named schema or an unbounded `schema/arrayOf`.
 */
export const isInductiveSchema = (schema: unknown): boolean => {
  if (isRecursiveNamedSchema(schema)) {
    return true;
  }
  const built = buildOf(throughNames(schema));
  return (
    built !== undefined &&
    nameOf(built.by) === "schema/arrayOf" &&
    built.args[1] === undefined
  );
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
