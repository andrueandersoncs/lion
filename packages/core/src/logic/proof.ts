/**
 * Unified proof kernel (`proof/valid?`) and CIC-style rule induction
 * (`proof/rules`).
 *
 * - `verifyProof` is a small, self-contained proof checker that never invokes
 *   the solver: it checks linear Farkas / Chvátal-Gomory refutations, integer
 *   dichotomy split trees, case splits, induction proofs (schema, list,
 *   integer, and rule induction), lemma compositions, and `why` derivation
 *   trees using exact arithmetic and structural checks alone.
 * - `proveRules` proves universally over ALL databases whose base relations
 *   fit their declared schemas that every row derived by a relation (or
 *   mutually recursive relations) fits a target schema, treating each rule as
 *   an inductive constructor and returning a kernel-checkable proof object.
 */
import { Effect } from "effect";
import { LogicError, logicError } from "@/errors/evaluation";
import {
  checksProof,
  contradictionCertificate,
  type ProofCertificate,
  refuteWithSplits,
} from "@/logic/certificate";
import {
  type CompiledRule,
  compiling,
  type Literal,
  questionPlans,
  Solved,
} from "@/logic/compile";
import type { Invariant, LogicDatabase } from "@/logic/database";
import { whyGoal } from "@/logic/explain";
import { fits } from "@/logic/fit";
import { includes } from "@/logic/inclusion";
import {
  certificateOf,
  each,
  term as evalTerm,
  exampleOf,
  type LogicEffect,
  type Model,
  NO_VARS,
  stepFormulas,
  type Vars,
} from "@/logic/model";
import { numberSym, polyIntegral } from "@/logic/polynomial";
import {
  type Bounds,
  type Constraint,
  constant,
  finishBounds,
  type Linear,
  linearBoundsOf,
  makeBoundsAcc,
  mergeBoundsInto,
  minus,
  quadraticBoundsOf,
  ratioBoundsOf,
  type Sort,
  solve,
  cases as splitCases,
  times,
  type Values,
  variable,
} from "@/logic/solver";
import {
  type Context,
  fitsOf,
  formulaOf,
  shapeFor,
  term as symbolicTerm,
  withDefinitions,
} from "@/logic/symbolic";
import {
  ANY_REST_SCHEMA,
  and,
  atom as atomFormula,
  type Cases,
  concrete,
  equal,
  FALSE,
  type Formula,
  fromValue,
  not,
  one,
  or,
  product,
  type Sym,
  TRUE,
} from "@/logic/symbols";
import {
  Atom,
  buildOf,
  compareValues,
  DeferredCall,
  isForm,
  isListTerm,
  isPlainObject,
  LogicForm,
  LogicVariable,
  nameOf,
  type RelationInfo,
  recordKeys,
  relationOf,
  replaceVariables,
  sameValue,
  show,
  valueKey,
} from "@/logic/terms";
import {
  compare,
  fromRational,
  isNumber,
  negate,
  ONE,
  type Rational,
  toRational,
  ZERO,
} from "@/numbers/exact";

/** A single rule-induction case in a proof returned by `proof/rules`. */
export interface RuleProofCase {
  readonly case: string;
  readonly certificates: readonly ProofCertificate[];
}

/** Result of `proof/rules`: either a kernel-checkable induction proof or a counterexample. */
export type RuleInductionResult =
  | {
      readonly basis: "rules";
      readonly cases: readonly RuleProofCase[];
      readonly kind: "induction";
      readonly proved: true;
      readonly target: string | readonly string[];
    }
  | {
      readonly counterexample: Record<string, unknown>;
      readonly proved: false;
      readonly reason: string;
      readonly relation: string;
      readonly rule?: unknown;
    };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const VALID_BASES = new Set(["schema", "list", "integer", "rules"]);

const verifyAbsentWay = (way: unknown): boolean => {
  if (!isRecord(way)) {
    return false;
  }
  if (
    "because" in way &&
    !(Array.isArray(way.because) && way.because.every(verifyWhyPremise))
  ) {
    return false;
  }
  return !("but" in way) || verifyWhyPremise(way.but);
};

const verifyAbsentNode = (node: Record<string, unknown>): boolean => {
  if ("certificate" in node && !verifyProofValue(node.certificate)) {
    return false;
  }
  if ("induction" in node && !verifyProofValue(node.induction)) {
    return false;
  }
  if ("because" in node) {
    return Array.isArray(node.because) && node.because.every(verifyAbsentWay);
  }
  return true;
};

const isPrimitive = (v: unknown): boolean =>
  v === null ||
  typeof v === "boolean" ||
  typeof v === "number" ||
  typeof v === "string" ||
  isNumber(v);

/** Checks a `why` premise node (fact, check, same, absent, or nested derivation). */
const verifyWhyPremise = (node: unknown): boolean => {
  if (!isRecord(node)) {
    return false;
  }
  if ("check" in node) {
    if (node.check === false) {
      return false;
    }
    if (
      Array.isArray(node.check) &&
      node.check[0] === "=" &&
      node.check.length === 3 &&
      isPrimitive(node.check[1]) &&
      isPrimitive(node.check[2])
    ) {
      return sameValue(node.check[1], node.check[2]);
    }
    return true;
  }
  if ("same" in node) {
    return (
      Array.isArray(node.same) &&
      node.same.length === 2 &&
      sameValue(node.same[0], node.same[1])
    );
  }
  if ("absent" in node) {
    return verifyAbsentNode(node);
  }
  return "fact" in node ? verifyDerivation(node) : false;
};

/** Checks a `why` derivation tree (`{ fact, given | computed | rule + because/matches }`). */
const verifyDerivation = (rec: Record<string, unknown>): boolean => {
  if (
    !Array.isArray(rec.fact) ||
    rec.fact.length === 0 ||
    typeof rec.fact[0] !== "string"
  ) {
    return false;
  }
  if (rec.given === true || rec.computed === true) {
    return true;
  }
  if (
    !Array.isArray(rec.rule) ||
    rec.rule.length < 3 ||
    rec.rule[0] !== "rule" ||
    !Array.isArray(rec.rule[1])
  ) {
    return false;
  }
  const head = rec.rule[1];
  if (head[0] !== "exists" && head[0] !== rec.fact[0]) {
    return false;
  }
  if (Array.isArray(rec.because)) {
    return rec.because.every(verifyWhyPremise);
  }
  if (Array.isArray(rec.matches)) {
    return (
      rec.matches.length > 0 &&
      rec.matches.every((m) => Array.isArray(m) && m.every(verifyWhyPremise))
    );
  }
  return false;
};

/**
 * Small trusted proof kernel (`proof/valid?`): checks any Lion proof value
 * without invoking the solver.
 *
 * Accepts:
 * - Linear Farkas / Chvátal-Gomory refutations (`{ constraints, steps }` or `{ kind: "linear", ... }`)
 * - Integer dichotomy split trees (`{ kind: "split", constraints, expr, bound, low, high }`)
 * - Non-empty arrays of valid proofs / certificates (e.g. `why`'s `certificate` field)
 * - Case splits (`{ kind: "cases", cases: [...] }`)
 * - Induction proofs (`{ kind: "induction", basis, target, cases: [...] }`)
 * - Lemma compositions (`{ kind: "lemma", claim, proof, in }`)
 * - `why` derivation trees (`{ fact, given | computed | rule + because }`)
 */
const verifyInductionCase = (entry: unknown): boolean => {
  if (!isRecord(entry) || typeof entry.case !== "string") {
    return false;
  }
  if ("proof" in entry) {
    return verifyProofValue(entry.proof);
  }
  if ("certificates" in entry) {
    return (
      Array.isArray(entry.certificates) &&
      entry.certificates.length > 0 &&
      entry.certificates.every((c) => verifyProofValue(c))
    );
  }
  return false;
};

const verifyInductionProof = (proof: Record<string, unknown>): boolean => {
  if (proof.proved === false) {
    return false;
  }
  if (typeof proof.basis !== "string" || !VALID_BASES.has(proof.basis)) {
    return false;
  }
  const validTarget =
    typeof proof.target === "string" ||
    (Array.isArray(proof.target) &&
      proof.target.length > 0 &&
      proof.target.every((t) => typeof t === "string"));
  if (!validTarget) {
    return false;
  }
  if (!Array.isArray(proof.cases) || proof.cases.length === 0) {
    return false;
  }
  return proof.cases.every(verifyInductionCase);
};

const verifyBoundsResult = (rec: Record<string, unknown>): boolean => {
  if (rec.satisfiable === false) {
    return "proof" in rec && verifyProofValue(rec.proof);
  }
  if (rec.satisfiable !== true || !("min" in rec) || !("max" in rec)) {
    return false;
  }
  const hasMin = rec.min !== null;
  const hasMax = rec.max !== null;
  if (hasMin && !(isNumber(rec.min) && verifyProofValue(rec.minProof))) {
    return false;
  }
  if (hasMax && !(isNumber(rec.max) && verifyProofValue(rec.maxProof))) {
    return false;
  }
  if (
    hasMin &&
    hasMax &&
    isNumber(rec.min) &&
    isNumber(rec.max) &&
    compare(toRational(rec.min), toRational(rec.max)) > 0
  ) {
    return false;
  }
  return (
    hasMin || hasMax || isRecord(rec.witnessMin) || isRecord(rec.witnessMax)
  );
};

const verifyKindedProof = (
  proof: Record<string, unknown>,
  kind: unknown
): boolean | undefined => {
  if (kind === "linear" || kind === "split") {
    return checksProof(proof);
  }
  if (kind === "cases") {
    return (
      Array.isArray(proof.cases) &&
      proof.cases.length > 0 &&
      proof.cases.every((item) => verifyProofValue(item))
    );
  }
  if (kind === "lemma") {
    return (
      "claim" in proof &&
      verifyProofValue(proof.proof) &&
      verifyProofValue(proof.in)
    );
  }
  if (kind === "induction") {
    return verifyInductionProof(proof);
  }
  if (
    kind === "trivial" &&
    proof.value === true &&
    Object.keys(proof).length === 2
  ) {
    return true;
  }
  return undefined;
};

const verifyProofValue = (proof: unknown): boolean => {
  if (Array.isArray(proof)) {
    return proof.length > 0 && proof.every((item) => verifyProofValue(item));
  }
  if (!isRecord(proof)) {
    return false;
  }
  const kinded = verifyKindedProof(proof, proof.kind);
  if (kinded !== undefined) {
    return kinded;
  }
  if (typeof proof.satisfiable === "boolean") {
    return verifyBoundsResult(proof);
  }
  if (proof.proved === true && "proof" in proof) {
    return verifyProofValue(proof.proof);
  }
  if ("constraints" in proof && "steps" in proof) {
    return checksProof(proof);
  }
  if ("fact" in proof) {
    return verifyDerivation(proof);
  }
  if (
    "absent" in proof &&
    ("certificate" in proof || "induction" in proof || "because" in proof)
  ) {
    return verifyWhyPremise(proof);
  }
  return false;
};

const BOUND_CLAIM_KEYS = new Set([
  "atLeast",
  "above",
  "atMost",
  "below",
  "min",
  "max",
  "unsat",
]);

const verifyLowerBoundClaim = (
  proof: Record<string, unknown>,
  key: "atLeast" | "above" | "min",
  target: Rational
): boolean => {
  if (!(isNumber(proof.min) && verifyProofValue(proof.minProof))) {
    return false;
  }
  const cmp = compare(toRational(proof.min), target);
  if (key === "atLeast") {
    return cmp >= 0;
  }
  if (key === "above") {
    return cmp > 0 || (cmp === 0 && proof.minInclusive === false);
  }
  return cmp === 0;
};

const verifyUpperBoundClaim = (
  proof: Record<string, unknown>,
  key: "atMost" | "below" | "max",
  target: Rational
): boolean => {
  if (!(isNumber(proof.max) && verifyProofValue(proof.maxProof))) {
    return false;
  }
  const cmp = compare(toRational(proof.max), target);
  if (key === "atMost") {
    return cmp <= 0;
  }
  if (key === "below") {
    return cmp < 0 || (cmp === 0 && proof.maxInclusive === false);
  }
  return cmp === 0;
};

const verifySingleBoundClaim = (
  proof: Record<string, unknown>,
  key: string,
  target: unknown
): boolean => {
  if (!isNumber(target)) {
    return false;
  }
  const tRat = toRational(target);
  if (key === "atLeast" || key === "above" || key === "min") {
    return verifyLowerBoundClaim(proof, key, tRat);
  }
  return verifyUpperBoundClaim(proof, key as "atMost" | "below" | "max", tRat);
};

const verifyBoundsClaim = (
  proof: Record<string, unknown>,
  claim: Record<string, unknown>
): boolean => {
  const keys = Object.keys(claim);
  if (
    keys.length === 0 ||
    keys.some((k) => !BOUND_CLAIM_KEYS.has(k)) ||
    typeof proof.satisfiable !== "boolean"
  ) {
    return false;
  }
  if ("unsat" in claim) {
    if (typeof claim.unsat !== "boolean") {
      return false;
    }
    if (proof.satisfiable === claim.unsat) {
      return false;
    }
  }
  const numericKeys = keys.filter((k) => k !== "unsat");
  if (numericKeys.length === 0) {
    return true;
  }
  if (proof.satisfiable !== true) {
    return false;
  }
  return numericKeys.every((key) =>
    verifySingleBoundClaim(proof, key, claim[key])
  );
};

const verifyClaimBinding = (proof: unknown, claim: unknown): boolean => {
  if (isRecord(claim)) {
    return isRecord(proof) && verifyBoundsClaim(proof, claim);
  }
  if (typeof claim === "string") {
    return (
      isRecord(proof) &&
      proof.kind === "induction" &&
      proof.basis === "rules" &&
      (proof.target === claim ||
        (Array.isArray(proof.target) && proof.target.includes(claim)))
    );
  }
  if (Array.isArray(claim)) {
    const inner =
      isRecord(proof) && proof.proved === true && "proof" in proof
        ? proof.proof
        : proof;
    return (
      isRecord(inner) &&
      (("fact" in inner && sameValue(inner.fact, claim)) ||
        ("absent" in inner && sameValue(inner.absent, claim)))
    );
  }
  return false;
};

export const verifyProof = (proof: unknown, claim?: unknown): boolean => {
  if (!verifyProofValue(proof)) {
    return false;
  }
  return claim === undefined ? true : verifyClaimBinding(proof, claim);
};

const invariantRowSchema = (
  inv: Invariant
): readonly [string, unknown] | undefined => {
  if (inv.assert !== "none" || !isForm(inv.goal, "and")) {
    return undefined;
  }
  const parts = (inv.goal as LogicForm).parts;
  if (parts.length !== 2) {
    return undefined;
  }
  const atom = parts.find((p): p is Atom => p instanceof Atom);
  const negated = parts.find((p): p is LogicForm => isForm(p, "not"));
  if (
    atom === undefined ||
    negated === undefined ||
    !atom.args.every((a): a is LogicVariable => a instanceof LogicVariable)
  ) {
    return undefined;
  }
  const inner = negated.parts[0];
  if (
    !(inner instanceof DeferredCall) ||
    typeof inner.fn !== "function" ||
    inner.args.length !== 1
  ) {
    return undefined;
  }
  const rowTerm = inner.args[0];
  const varNames = atom.args.map((v) => (v as LogicVariable).name);
  const cols = atom.relation.columns;
  const matchesDeferred =
    rowTerm instanceof DeferredCall &&
    rowTerm.args.length === cols.length &&
    rowTerm.args.every(
      (a, i) => a instanceof LogicVariable && a.name === varNames[i]
    );
  const matchesObject =
    isPlainObject(rowTerm) &&
    cols.every(
      (col, i) =>
        rowTerm[col] instanceof LogicVariable &&
        (rowTerm[col] as LogicVariable).name === varNames[i]
    );
  if (matchesDeferred || matchesObject) {
    return [atom.relation.name, inner.fn];
  }
  // Column-level schema invariant: ["and", [rel, ?c1, ..., ?ck], ["not", [S, ?ck]]].
  if (rowTerm instanceof LogicVariable && !rowTerm.anonymous) {
    const colIndices = atom.args.flatMap((v, i) =>
      !(v as LogicVariable).anonymous &&
      (v as LogicVariable).name === rowTerm.name
        ? [i]
        : []
    );
    if (colIndices.length === 1) {
      const targetIndex = colIndices[0] as number;
      const colSchema = Object.fromEntries(
        cols.map((col, i) => [
          col,
          i === targetIndex ? inner.fn : ANY_REST_SCHEMA,
        ])
      );
      return [atom.relation.name, colSchema];
    }
  }
  return undefined;
};

/**
 * Extracts declared row schemas for each relation from `database.invariants`
 * (covering both `{"schema": S}` on `relation` and equivalent hand-written
 * invariants `["and", [rel, ?c1, ...], ["not", [S, { c1: ?c1, ... }]]]`).
 */
const relationSchemasFromInvariants = (
  invariants: readonly Invariant[]
): Map<string, unknown[]> => {
  const out = new Map<string, unknown[]>();
  for (const inv of invariants) {
    const entry = invariantRowSchema(inv);
    if (entry === undefined) {
      continue;
    }
    const [relName, schemaFn] = entry;
    const list = out.get(relName) ?? [];
    list.push(schemaFn);
    out.set(relName, list);
  }
  return out;
};

const sortsFor = (
  constraints: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>
) =>
  new Map(
    constraints
      .flatMap((c) => [...c.linear.coefficients.keys()])
      .map((name) => [name, sorts.get(name) ?? "real"] as const)
  );

const anyRowSchema = (relation: RelationInfo): Record<string, unknown> =>
  Object.fromEntries(relation.columns.map((col) => [col, ANY_REST_SCHEMA]));

/** Checks a single rule `R(head) :- body` under schemas & induction hypotheses. */
const rowSchemaForAtom = (
  atom: Atom,
  targets: ReadonlyMap<
    string,
    { readonly relation: RelationInfo; readonly schema: unknown }
  >,
  baseSchemas: ReadonlyMap<string, readonly unknown[]>
): { readonly extra: readonly unknown[]; readonly primary: unknown } => {
  const relName = atom.relation.name;
  const targetEntry = targets.get(relName);
  if (targetEntry !== undefined) {
    return { extra: [], primary: targetEntry.schema };
  }
  const declared = baseSchemas.get(relName);
  if (declared !== undefined && declared.length > 0) {
    return { extra: declared.slice(1), primary: declared[0] };
  }
  return { extra: [], primary: anyRowSchema(atom.relation) };
};

/** Record fields of a symbolic value when it is a record or plain object value. */
const symRecordFields = (
  sym: Sym
):
  | { readonly fields: ReadonlyMap<string, Sym>; readonly rest?: unknown }
  | undefined => {
  if (sym.kind === "record") {
    return sym.rest === undefined
      ? { fields: sym.fields }
      : { fields: sym.fields, rest: sym.rest };
  }
  if (sym.kind === "value" && isPlainObject(sym.value)) {
    return {
      fields: new Map(
        Object.entries(sym.value).map(([k, v]) => [k, fromValue(v)])
      ),
    };
  }
  return undefined;
};

/** List items of a symbolic value when it is a fixed list or array value. */
const symListItems = (sym: Sym): readonly Sym[] | undefined => {
  if (sym.kind === "list" && sym.rest === undefined && sym.tail === undefined) {
    return sym.items;
  }
  if (sym.kind === "value" && Array.isArray(sym.value)) {
    return sym.value.map(fromValue);
  }
  return undefined;
};

const resolveRecordField = (
  rec: NonNullable<ReturnType<typeof symRecordFields>>,
  k: string,
  localSymbols: Map<string, Cases>,
  localCtx: Context
): Effect.Effect<
  { readonly sym: Sym; readonly when: Formula } | undefined,
  Error
> =>
  Effect.gen(function* () {
    const existing = rec.fields.get(k);
    if (existing !== undefined) {
      return { sym: existing, when: TRUE };
    }
    if (rec.rest === undefined) {
      return undefined;
    }
    const shaped = yield* shapeFor(
      `rest_${k}_${localSymbols.size}`,
      rec.rest,
      localCtx
    );
    const only = shaped.cases.length === 1 ? shaped.cases[0] : undefined;
    return only === undefined ? undefined : { sym: only.sym, when: only.when };
  });

const recordKeysAllowed = (
  rec: NonNullable<ReturnType<typeof symRecordFields>>,
  keys: ReadonlySet<string>,
  open: boolean
): boolean => {
  if (open) {
    return true;
  }
  if (rec.rest === undefined && rec.fields.size !== keys.size) {
    return false;
  }
  return [...rec.fields.keys()].every((k) => keys.has(k));
};

const bindRecordEntries = (
  entries: readonly (readonly [string, unknown])[],
  open: boolean,
  colSym: Sym,
  localSymbols: Map<string, Cases>,
  localCtx: Context
): Effect.Effect<Formula, Error> =>
  Effect.gen(function* () {
    const rec = symRecordFields(colSym);
    if (
      rec === undefined ||
      !recordKeysAllowed(rec, new Set(entries.map(([k]) => k)), open)
    ) {
      return FALSE;
    }
    let f: Formula = TRUE;
    for (const [k, pat] of entries) {
      const resolved = yield* resolveRecordField(
        rec,
        k,
        localSymbols,
        localCtx
      );
      if (resolved === undefined) {
        return FALSE;
      }
      f = and(f, resolved.when);
      f = and(
        f,
        yield* bindAtomColumn(pat, resolved.sym, localSymbols, localCtx)
      );
      if (f.length === 0) {
        return FALSE;
      }
    }
    return f;
  });

const recordEntriesOf = (
  arg: unknown
):
  | {
      readonly entries: readonly (readonly [string, unknown])[];
      readonly open: boolean;
    }
  | undefined => {
  if (isPlainObject(arg)) {
    return { entries: Object.entries(arg), open: false };
  }
  if (arg instanceof DeferredCall) {
    if (nameOf(arg.fn) === "schema/open" && arg.args.length >= 1) {
      const inner = recordEntriesOf(arg.args[0]);
      if (inner !== undefined) {
        return { entries: inner.entries, open: true };
      }
    }
    const keys = recordKeys(arg.fn);
    if (keys !== undefined && keys.length === arg.args.length) {
      return {
        entries: keys.map((key, i) => [key, arg.args[i]] as const),
        open: false,
      };
    }
  }
  if (typeof arg === "function") {
    const built = buildOf(arg);
    if (
      built !== undefined &&
      nameOf(built.by) === "schema/open" &&
      built.args.length >= 1
    ) {
      const inner = recordEntriesOf(built.args[0]);
      if (inner !== undefined) {
        return { entries: inner.entries, open: true };
      }
    }
  }
  return undefined;
};

const bindVariableColumn = (
  arg: LogicVariable,
  colSym: Sym,
  localSymbols: Map<string, Cases>,
  localCtx: Context
): Formula => {
  if (arg.anonymous) {
    return TRUE;
  }
  const existing = localSymbols.get(arg.name);
  if (existing === undefined) {
    localSymbols.set(arg.name, one(colSym));
    return TRUE;
  }
  return existing.reduce<Formula>(
    (f, e) => or(f, and(e.when, equal(e.sym, colSym, localCtx.atoms))),
    FALSE
  );
};

const bindListColumn = (
  args: readonly unknown[],
  colSym: Sym,
  localSymbols: Map<string, Cases>,
  localCtx: Context
): Effect.Effect<Formula, Error> =>
  Effect.gen(function* () {
    const items = symListItems(colSym);
    if (items === undefined || items.length !== args.length) {
      return FALSE;
    }
    let f: Formula = TRUE;
    for (let i = 0; i < args.length; i += 1) {
      f = and(
        f,
        yield* bindAtomColumn(args[i], items[i] as Sym, localSymbols, localCtx)
      );
      if (f.length === 0) {
        return FALSE;
      }
    }
    return f;
  });

const bindAllOfColumn = (
  parts: readonly unknown[],
  colSym: Sym,
  localSymbols: Map<string, Cases>,
  localCtx: Context
): Effect.Effect<Formula, Error> =>
  Effect.gen(function* () {
    let f: Formula = TRUE;
    for (const part of parts) {
      f = and(f, yield* bindAtomColumn(part, colSym, localSymbols, localCtx));
      if (f.length === 0) {
        return FALSE;
      }
    }
    return f;
  });

const bindAtomColumn = (
  arg: unknown,
  colSym: Sym,
  localSymbols: Map<string, Cases>,
  localCtx: Context
): Effect.Effect<Formula, Error> =>
  Effect.gen(function* () {
    if (arg instanceof LogicVariable) {
      return bindVariableColumn(arg, colSym, localSymbols, localCtx);
    }
    const recPat = recordEntriesOf(arg);
    if (recPat !== undefined) {
      return yield* bindRecordEntries(
        recPat.entries,
        recPat.open,
        colSym,
        localSymbols,
        localCtx
      );
    }
    if (typeof arg === "function") {
      return yield* fitsOf(colSym, arg, localCtx, 0);
    }
    if (isListTerm(arg) && arg instanceof DeferredCall) {
      return yield* bindListColumn(arg.args, colSym, localSymbols, localCtx);
    }
    if (arg instanceof DeferredCall && nameOf(arg.fn) === "schema/allOf") {
      return yield* bindAllOfColumn(arg.args, colSym, localSymbols, localCtx);
    }
    const argCases = yield* symbolicTerm(arg, localCtx);
    return argCases.reduce<Formula>(
      (f, e) => or(f, and(e.when, equal(e.sym, colSym, localCtx.atoms))),
      FALSE
    );
  });

const unboundVar = (
  term: unknown,
  localSymbols: ReadonlyMap<string, Cases>
): LogicVariable | undefined =>
  term instanceof LogicVariable &&
  !term.anonymous &&
  !localSymbols.has(term.name)
    ? term
    : undefined;

const bindInFilter = (
  filter: Literal,
  elem: LogicVariable,
  listTerm: unknown,
  localSymbols: Map<string, Cases>,
  localCtx: Context
): Effect.Effect<boolean, Error> =>
  Effect.gen(function* () {
    const listCases = yield* symbolicTerm(listTerm, localCtx);
    const itemCases: { readonly sym: Sym; readonly when: Formula }[] = [];
    for (const lc of listCases) {
      const items = symListItems(lc.sym);
      if (items === undefined) {
        return yield* logicError(
          `proof/rules cannot enumerate non-fixed list in ${show(filter)}.`
        );
      }
      for (const item of items) {
        itemCases.push({ sym: item, when: lc.when });
      }
    }
    if (itemCases.length === 0) {
      return false;
    }
    localSymbols.set(elem.name, itemCases);
    return true;
  });

const tryBindEqFilter = (
  left: unknown,
  right: unknown,
  localSymbols: Map<string, Cases>,
  localCtx: Context
): Effect.Effect<boolean, Error> =>
  Effect.gen(function* () {
    const lv = unboundVar(left, localSymbols);
    if (lv !== undefined) {
      localSymbols.set(lv.name, yield* symbolicTerm(right, localCtx));
      return true;
    }
    const rv = unboundVar(right, localSymbols);
    if (rv !== undefined) {
      localSymbols.set(rv.name, yield* symbolicTerm(left, localCtx));
      return true;
    }
    return false;
  });

const tryBindFilter = (
  filter: Literal,
  localSymbols: Map<string, Cases>,
  localCtx: Context
): Effect.Effect<"bound" | "empty" | "unhandled", Error> =>
  Effect.gen(function* () {
    if (isForm(filter, "=")) {
      const [left, right] = filter.parts;
      return (yield* tryBindEqFilter(left, right, localSymbols, localCtx))
        ? "bound"
        : "unhandled";
    }
    if (isForm(filter, "schema/fits?")) {
      const [target, schema] = filter.parts;
      const tv = unboundVar(target, localSymbols);
      if (tv !== undefined) {
        localSymbols.set(
          tv.name,
          (yield* shapeFor(tv.name, schema, localCtx)).cases
        );
        return "bound";
      }
    }
    if (isForm(filter, "in")) {
      const [elem, listTerm] = filter.parts;
      const ev = unboundVar(elem, localSymbols);
      if (ev !== undefined) {
        const ok = yield* bindInFilter(
          filter,
          ev,
          listTerm,
          localSymbols,
          localCtx
        );
        return ok ? "bound" : "empty";
      }
    }
    return "unhandled";
  });

const applyRuleFilters = (
  filters: readonly Literal[],
  premiseIn: Formula,
  localSymbols: Map<string, Cases>,
  localCtx: Context
): Effect.Effect<Formula, Error> =>
  Effect.gen(function* () {
    let premise = premiseIn;
    for (const filter of filters) {
      const bound = yield* tryBindFilter(filter, localSymbols, localCtx);
      if (bound === "empty") {
        return FALSE;
      }
      if (bound === "bound") {
        continue;
      }
      const fCases = yield* symbolicTerm(filter, localCtx);
      premise = and(premise, yield* formulaOf(fCases));
      if (premise.length === 0) {
        break;
      }
    }
    return premise;
  });

const bindAtomRows = (
  atomShapes: readonly { readonly atom: Atom; readonly cases: Cases }[],
  rowSyms: readonly Sym[],
  premiseIn: Formula,
  localSymbols: Map<string, Cases>,
  localCtx: Context
): Effect.Effect<Formula, Error> =>
  Effect.gen(function* () {
    let premise = premiseIn;
    for (const [at, { atom }] of atomShapes.entries()) {
      const rowSym = rowSyms[at] as Sym;
      if (rowSym.kind !== "record") {
        return FALSE;
      }
      for (const [colIdx, colName] of atom.relation.columns.entries()) {
        const colSym =
          rowSym.fields.get(colName) ??
          ({ kind: "value", value: undefined } satisfies Sym);
        premise = and(
          premise,
          yield* bindAtomColumn(
            atom.args[colIdx],
            colSym,
            localSymbols,
            localCtx
          )
        );
        if (premise.length === 0) {
          return FALSE;
        }
      }
    }
    return premise;
  });

const concreteCounterexample = (
  headRecord: Extract<Sym, { readonly kind: "record" }>,
  ans: Values
): Record<string, unknown> =>
  Object.fromEntries(
    [...headRecord.fields].map(([col, sym]) => {
      const val = concrete(sym, ans);
      return [col, val === undefined ? `<${sym.kind}>` : val];
    })
  );

const checkHeadRecord = (
  rule: CompiledRule,
  headRecord: Extract<Sym, { readonly kind: "record" }>,
  targetSchema: unknown,
  premiseAndHead: Formula,
  localCtx: Context,
  localDefs: ReadonlyMap<string, readonly Constraint[]>,
  localSorts: ReadonlyMap<string, Sort>,
  allCerts: ProofCertificate[]
): Effect.Effect<
  | { readonly counterexample: Record<string, unknown>; readonly ok: false }
  | { readonly ok: true },
  Error
> =>
  Effect.gen(function* () {
    const headFits = yield* fitsOf(headRecord, targetSchema, localCtx, 0);
    const violation = and(premiseAndHead, not(headFits));
    for (const conj of violation) {
      const full = withDefinitions(conj, localDefs);
      const ans = solve(full, sortsFor(full, localSorts));
      if (ans !== undefined) {
        return {
          counterexample: concreteCounterexample(headRecord, ans),
          ok: false,
        } as const;
      }
      for (const piece of splitCases(full)) {
        const cert = refuteWithSplits(piece, sortsFor(piece, localSorts));
        if (cert === undefined) {
          return yield* logicError(
            `proof/rules could not construct a certificate for rule ${show(rule.source)}.`
          );
        }
        allCerts.push(cert);
      }
    }
    return { ok: true } as const;
  });

const SUPPORTED_RULE_AGGREGATES = new Set([
  "min",
  "max",
  "count",
  "countUnique",
  "sum",
  "mean",
  "median",
  "unique",
  "collect",
  "argMin",
  "argMax",
]);

/** Projects sound bounds of a linear numeric sym under `premise` across disjuncts. */
const numericBoundsUnder = (
  sym: Extract<Sym, { readonly kind: "number" }>,
  premise: Formula,
  localDefs: ReadonlyMap<string, readonly Constraint[]>,
  localSorts: ReadonlyMap<string, Sort>
): Bounds | undefined => {
  if (sym.nonlinear !== undefined || sym.denominator !== undefined) {
    return undefined;
  }
  const acc = makeBoundsAcc();
  for (const conj of premise) {
    const full = withDefinitions(conj, localDefs);
    const b = linearBoundsOf(full, sortsFor(full, localSorts), sym.linear);
    if (b !== undefined) {
      mergeBoundsInto(acc, b.low, b.high);
    }
  }
  return finishBounds(acc);
};

const aggregateBoundFormula = (
  vName: string,
  kind: "sum" | "mean" | "median",
  bounds: Bounds | undefined
): Formula => {
  if (bounds === undefined) {
    return TRUE;
  }
  let when: Formula = TRUE;
  const keepLow =
    bounds.low !== undefined &&
    (kind !== "sum" || compare(bounds.low.value, ZERO) >= 0);
  if (keepLow && bounds.low !== undefined) {
    when = and(
      when,
      atomFormula({
        linear: minus(variable(vName), constant(bounds.low.value)),
        relation: bounds.low.strict ? ">" : ">=",
      })
    );
  }
  const keepHigh =
    bounds.high !== undefined &&
    (kind !== "sum" || compare(bounds.high.value, ZERO) <= 0);
  if (keepHigh && bounds.high !== undefined) {
    when = and(
      when,
      atomFormula({
        linear: minus(constant(bounds.high.value), variable(vName)),
        relation: bounds.high.strict ? ">" : ">=",
      })
    );
  }
  return when;
};

const abstractNumericAggregate = (
  kind: "sum" | "mean" | "median",
  at: number,
  elemCases: Cases,
  premise: Formula,
  localDefs: ReadonlyMap<string, readonly Constraint[]>,
  localSorts: Map<string, Sort>
): Effect.Effect<Cases, Error> =>
  Effect.gen(function* () {
    const out: { readonly sym: Sym; readonly when: Formula }[] = [];
    for (const ec of elemCases) {
      if (ec.sym.kind !== "number") {
        return yield* logicError(
          `proof/rules expects a numeric argument for aggregate/${kind}.`
        );
      }
      const vName = `__agg_${kind}_${at}_${localSorts.size}`;
      const isInt = kind === "sum" && polyIntegral(ec.sym, localSorts);
      localSorts.set(vName, isInt ? "integer" : "real");
      const bounds = numericBoundsUnder(
        ec.sym,
        and(premise, ec.when),
        localDefs,
        localSorts
      );
      const when = and(ec.when, aggregateBoundFormula(vName, kind, bounds));
      out.push({ sym: numberSym(variable(vName)), when });
    }
    return out;
  });

const abstractArgExtremum = (
  kind: "argMin" | "argMax",
  elemCases: Cases
): Effect.Effect<Cases, Error> =>
  Effect.gen(function* () {
    const out: { readonly sym: Sym; readonly when: Formula }[] = [];
    for (const ec of elemCases) {
      const items = symListItems(ec.sym);
      if (items === undefined || items.length !== 2) {
        return yield* logicError(
          `proof/rules expects a 2-element pair for aggregate/${kind}.`
        );
      }
      out.push({ sym: items[0] as Sym, when: ec.when });
    }
    return out;
  });

/** Sound abstract symbolic output for an aggregate in a rule head. */
const abstractAggregateHead = (
  aggCall: DeferredCall,
  at: number,
  premise: Formula,
  localCtx: Context,
  localDefs: ReadonlyMap<string, readonly Constraint[]>,
  localSorts: Map<string, Sort>
): Effect.Effect<Cases, Error> =>
  Effect.gen(function* () {
    const kind = aggCall.aggregate;
    const arg = aggCall.args[0];
    if (kind === "min" || kind === "max") {
      return yield* symbolicTerm(arg, localCtx);
    }
    if (kind === "count" || kind === "countUnique") {
      const vName = `__agg_count_${at}_${localSorts.size}`;
      localSorts.set(vName, "integer");
      return [
        {
          sym: numberSym(variable(vName)),
          when: atomFormula({
            linear: minus(variable(vName), constant(ONE)),
            relation: ">=",
          }),
        },
      ];
    }
    const elemCases = yield* symbolicTerm(arg, localCtx);
    if (kind === "argMin" || kind === "argMax") {
      return yield* abstractArgExtremum(kind, elemCases);
    }
    if (kind === "unique" || kind === "collect") {
      return elemCases.map((ec) => ({
        sym: { items: [ec.sym], kind: "list" } as Sym,
        when: ec.when,
      }));
    }
    if (kind === "sum" || kind === "mean" || kind === "median") {
      return yield* abstractNumericAggregate(
        kind,
        at,
        elemCases,
        premise,
        localDefs,
        localSorts
      );
    }
    return yield* logicError(
      `proof/rules cannot prove aggregate/${kind ?? "unknown"}.`
    );
  });

const checkRuleCombo = (
  rule: CompiledRule,
  targetSchema: unknown,
  atomShapes: readonly { readonly atom: Atom; readonly cases: Cases }[],
  filters: readonly Literal[],
  rowSyms: readonly Sym[],
  baseWhen: Formula,
  context: Context,
  sorts: ReadonlyMap<string, Sort>,
  allCerts: ProofCertificate[]
): Effect.Effect<
  | { readonly counterexample: Record<string, unknown>; readonly ok: false }
  | { readonly ok: true },
  Error
> =>
  Effect.gen(function* () {
    const localSorts = new Map(sorts);
    const localDefs = new Map(context.definitions);
    const localSymbols = new Map<string, Cases>();
    const localCtx: Context = {
      ...context,
      definitions: localDefs,
      floors: new Map(context.floors),
      sorts: localSorts,
      symbols: localSymbols,
    };
    const afterAtoms = yield* bindAtomRows(
      atomShapes,
      rowSyms,
      baseWhen,
      localSymbols,
      localCtx
    );
    if (afterAtoms.length === 0) {
      return { ok: true } as const;
    }
    const premise = yield* applyRuleFilters(
      filters,
      afterAtoms,
      localSymbols,
      localCtx
    );
    if (premise.length === 0) {
      return { ok: true } as const;
    }
    const headArgCases: Cases[] = [];
    for (const [at, arg] of rule.head.args.entries()) {
      if (
        rule.aggregates.includes(at) &&
        arg instanceof DeferredCall &&
        arg.aggregate !== undefined
      ) {
        headArgCases.push(
          yield* abstractAggregateHead(
            arg,
            at,
            premise,
            localCtx,
            localDefs,
            localSorts
          )
        );
      } else {
        headArgCases.push(yield* symbolicTerm(arg, localCtx));
      }
    }
    const headCols = rule.head.relation.columns;
    for (const { syms: headVals, when: headWhen } of product(headArgCases)) {
      const headRecord: Extract<Sym, { readonly kind: "record" }> = {
        fields: new Map(headCols.map((col, i) => [col, headVals[i] as Sym])),
        kind: "record",
      };
      const res = yield* checkHeadRecord(
        rule,
        headRecord,
        targetSchema,
        and(premise, headWhen),
        localCtx,
        localDefs,
        localSorts,
        allCerts
      );
      if (!res.ok) {
        return res;
      }
    }
    return { ok: true } as const;
  });

const pruneUnusedAnyColumns = (atom: Atom, schema: unknown): unknown => {
  if (!isPlainObject(schema)) {
    return schema;
  }
  const cols = atom.relation.columns;
  let changed = false;
  const out: Record<string, unknown> = { ...schema };
  for (let i = 0; i < cols.length; i += 1) {
    const col = cols[i] as string;
    const arg = atom.args[i];
    if (
      out[col] === ANY_REST_SCHEMA &&
      arg instanceof LogicVariable &&
      arg.anonymous
    ) {
      out[col] = null;
      changed = true;
    }
  }
  return changed ? out : schema;
};

const shapeBodyAtoms = (
  atoms: readonly Atom[],
  targets: ReadonlyMap<
    string,
    { readonly relation: RelationInfo; readonly schema: unknown }
  >,
  baseSchemas: ReadonlyMap<string, readonly unknown[]>,
  caseIndex: number,
  context: Context
): Effect.Effect<
  readonly { readonly atom: Atom; readonly cases: Cases }[],
  Error
> =>
  Effect.gen(function* () {
    const atomShapes: { readonly atom: Atom; readonly cases: Cases }[] = [];
    for (const [at, atom] of atoms.entries()) {
      const { primary, extra } = rowSchemaForAtom(atom, targets, baseSchemas);
      let cases = (yield* shapeFor(
        `r${caseIndex}_a${at}`,
        pruneUnusedAnyColumns(atom, primary),
        context
      )).cases;
      for (const extraSchema of extra) {
        const next: { readonly sym: Sym; readonly when: Formula }[] = [];
        for (const c of cases) {
          const both = and(
            c.when,
            yield* fitsOf(c.sym, extraSchema, context, 0)
          );
          if (both.length > 0) {
            next.push({ sym: c.sym, when: both });
          }
        }
        cases = next;
      }
      atomShapes.push({ atom, cases });
    }
    return atomShapes;
  });

const checkRuleByInduction = (
  rule: CompiledRule,
  targetSchema: unknown,
  targets: ReadonlyMap<
    string,
    { readonly relation: RelationInfo; readonly schema: unknown }
  >,
  baseSchemas: ReadonlyMap<string, readonly unknown[]>,
  caseIndex: number
): Effect.Effect<
  | { readonly ok: true; readonly proof: RuleProofCase }
  | { readonly counterexample: Record<string, unknown>; readonly ok: false },
  LogicError
> =>
  Effect.gen(function* () {
    const supportedAggregates = rule.aggregates.every((at) => {
      const arg = rule.head.args[at];
      return (
        arg instanceof DeferredCall &&
        arg.aggregate !== undefined &&
        SUPPORTED_RULE_AGGREGATES.has(arg.aggregate) &&
        arg.args.length === 1
      );
    });
    if (!supportedAggregates || rule.invents !== undefined) {
      return yield* logicError(
        `proof/rules cannot prove a rule with this aggregate or existential head: ${show(rule.source)}.`
      );
    }

    const sorts = new Map<string, Sort>();
    const context: Context = {
      atoms: new Map(),
      broad: true,
      checkIncludes: (a, b) => includes(a, b),
      definitions: new Map(),
      evaluate: (part) =>
        Effect.fail(
          new LogicError({ message: `${show(part)} has no value here.` })
        ),
      floors: new Map(),
      sorts,
      symbols: new Map(),
    };

    const atoms = rule.body.filter((lit): lit is Atom => lit instanceof Atom);
    const filters = rule.body.filter(
      (lit) =>
        !(
          lit instanceof Atom ||
          (isForm(lit, "not") && lit.parts[0] instanceof Atom)
        )
    );
    const atomShapes = yield* shapeBodyAtoms(
      atoms,
      targets,
      baseSchemas,
      caseIndex,
      context
    );

    const allCerts: ProofCertificate[] = [];
    const combos =
      atomShapes.length === 0
        ? [{ syms: [] as Sym[], when: TRUE }]
        : product(atomShapes.map((a) => a.cases));

    for (const { syms: rowSyms, when: baseWhen } of combos) {
      const res = yield* checkRuleCombo(
        rule,
        targetSchema,
        atomShapes,
        filters,
        rowSyms,
        baseWhen,
        context,
        sorts,
        allCerts
      );
      if (!res.ok) {
        return res;
      }
    }

    return {
      ok: true as const,
      proof: {
        case: `rule ${caseIndex + 1}: ${show(rule.source)}`,
        certificates:
          allCerts.length === 0 ? [contradictionCertificate()] : allCerts,
      },
    };
  }).pipe(
    Effect.mapError((e) =>
      e instanceof LogicError
        ? e
        : new LogicError({
            message: `proof/rules could not prove rule ${show(rule.source)}: ${e instanceof Error ? e.message : String(e)}`,
          })
    )
  );

const parseRuleTargets = (
  database: LogicDatabase,
  target: unknown,
  schema?: unknown
): Effect.Effect<
  Map<string, { readonly relation: RelationInfo; readonly schema: unknown }>,
  LogicError
> =>
  Effect.gen(function* () {
    const targets = new Map<
      string,
      { readonly relation: RelationInfo; readonly schema: unknown }
    >();
    const expects = (found: unknown) =>
      logicError(
        `proof/rules expects a relation and a schema, or a non-empty record of relation names to schemas, but found ${show(found)}.`
      );
    if (schema !== undefined) {
      const rel = relationOf(target);
      if (rel === undefined) {
        return yield* expects(target);
      }
      targets.set(rel.name, { relation: rel, schema });
      return targets;
    }
    if (!isPlainObject(target)) {
      return yield* expects(target);
    }
    const entries = Object.entries(target);
    if (entries.length === 0) {
      return yield* expects(target);
    }
    for (const [name, relSchema] of entries) {
      const rel = database.relations.get(name);
      if (rel === undefined) {
        return yield* logicError(
          `proof/rules found no declared relation named "${name}".`
        );
      }
      targets.set(name, { relation: rel, schema: relSchema });
    }
    return targets;
  });

const checkExistingFacts = (
  database: LogicDatabase,
  targets: ReadonlyMap<
    string,
    { readonly relation: RelationInfo; readonly schema: unknown }
  >
): Effect.Effect<RuleInductionResult | undefined, LogicError> =>
  Effect.gen(function* () {
    for (const [name, { relation, schema: targetSchema }] of targets) {
      const facts = database.facts.get(name);
      if (facts === undefined) {
        continue;
      }
      for (const tuple of facts.values()) {
        const row = Object.fromEntries(
          relation.columns.map((col, i) => [col, tuple[i]])
        );
        const ok = yield* (
          fits(targetSchema, row) as unknown as Effect.Effect<unknown, Error>
        ).pipe(
          Effect.mapError((e) =>
            e instanceof LogicError
              ? e
              : new LogicError({
                  message: e instanceof Error ? e.message : String(e),
                })
          )
        );
        if (ok !== true) {
          return {
            counterexample: row,
            proved: false,
            reason: `existing fact in "${name}" does not fit schema`,
            relation: name,
          } satisfies RuleInductionResult;
        }
      }
    }
    return undefined;
  });

const checkBaseRelationTarget = (
  name: string,
  targetSchema: unknown,
  baseSchemas: ReadonlyMap<string, readonly unknown[]>
): Effect.Effect<RuleProofCase | RuleInductionResult, LogicError> =>
  Effect.gen(function* () {
    const declared = baseSchemas.get(name);
    if (declared === undefined || declared.length === 0) {
      return yield* logicError(
        `proof/rules cannot prove "${name}": it has no rules and no declared row schema.`
      );
    }
    if (!(yield* includes(declared[0], targetSchema))) {
      return {
        counterexample: {},
        proved: false,
        reason: `declared schema of "${name}" is not included in target schema`,
        relation: name,
      } satisfies RuleInductionResult;
    }
    return {
      case: `base(${name})`,
      certificates: [contradictionCertificate()],
    } satisfies RuleProofCase;
  });

/**
 * CIC-style rule induction (`proof/rules`): proves that every row derived in
 * a relation (or mutually recursive map of relations) satisfies its target
 * schema across ALL databases whose base relations fit their declared schemas.
 */
export const proveRules = (
  database: LogicDatabase,
  target: unknown,
  schema?: unknown
): Effect.Effect<RuleInductionResult, LogicError> =>
  Effect.gen(function* () {
    const targets = yield* parseRuleTargets(database, target, schema);
    const baseSchemas = relationSchemasFromInvariants(database.invariants);
    const cases: RuleProofCase[] = [];

    const badFact = yield* checkExistingFacts(database, targets);
    if (badFact !== undefined) {
      return badFact;
    }

    let ruleIndex = 0;
    for (const [name, { schema: targetSchema }] of targets) {
      const rules = database.rules.filter(
        (r) => !r.given && r.head.relation.name === name
      );
      if (rules.length === 0) {
        const baseRes = yield* checkBaseRelationTarget(
          name,
          targetSchema,
          baseSchemas
        );
        if ("proved" in baseRes) {
          return baseRes;
        }
        cases.push(baseRes);
        continue;
      }
      for (const rule of rules) {
        const res = yield* checkRuleByInduction(
          rule,
          targetSchema,
          targets,
          baseSchemas,
          ruleIndex
        );
        ruleIndex += 1;
        if (!res.ok) {
          return {
            counterexample: res.counterexample,
            proved: false,
            reason: `rule for "${name}" can produce a row outside the target schema`,
            relation: name,
            rule: rule.source,
          };
        }
        cases.push(res.proof);
      }
    }

    const names = [...targets.keys()];
    return {
      basis: "rules",
      cases,
      kind: "induction",
      proved: true,
      target: names.length === 1 ? (names[0] as string) : names,
    };
  });

/** Walks structural explanation fields (`because`, `matches`, `but`) of a `why` tree. */
const walkExplanation = (
  node: unknown,
  visit: (record: Record<string, unknown>) => void
) => {
  if (!isRecord(node)) {
    return;
  }
  visit(node);
  if (Array.isArray(node.because)) {
    for (const child of node.because) {
      walkExplanation(child, visit);
    }
  }
  if (Array.isArray(node.matches)) {
    for (const group of node.matches) {
      if (Array.isArray(group)) {
        for (const child of group) {
          walkExplanation(child, visit);
        }
      }
    }
  }
  if ("but" in node) {
    walkExplanation(node.but, visit);
  }
};

/** Sorted unique list of every `given: true` base fact in a `why` tree. */
export const extractExplanationFacts = (
  explanation: Record<string, unknown>
): readonly unknown[] => {
  const found = new Map<string, unknown>();
  walkExplanation(explanation, (node) => {
    if (node.given === true && Array.isArray(node.fact)) {
      found.set(valueKey(node.fact), node.fact);
    }
  });
  return [...found.values()].sort(compareValues);
};

/** Sorted unique list of every leaf absent goal in a `why` tree (excluding solver-proved impossibilities). */
export const extractExplanationAssumptions = (
  explanation: Record<string, unknown>
): readonly unknown[] => {
  const found = new Map<string, unknown>();
  walkExplanation(explanation, (node) => {
    if (
      "absent" in node &&
      !("certificate" in node || "induction" in node) &&
      (!Array.isArray(node.because) || node.because.length === 0)
    ) {
      found.set(valueKey(node.absent), node.absent);
    }
  });
  return [...found.values()].sort(compareValues);
};

const LENGTH_MARK = /#\d+$/;

const formatWitnessVars = (
  found: Vars,
  ownNames: readonly string[],
  outerVars: Vars
): Record<string, unknown> => {
  const picked =
    ownNames.length > 0
      ? ownNames
      : [...found.keys()].filter((name) => !outerVars.has(name));
  return Object.fromEntries(
    picked
      .filter((name) => found.has(name))
      .map((name) => [`?${name.replace(LENGTH_MARK, "")}`, found.get(name)])
  );
};

const firstBodyWitness = (
  model: Model,
  body: readonly Literal[],
  ownNames: readonly string[],
  vars: Vars
): LogicEffect<Record<string, unknown> | undefined> =>
  Effect.gen(function* () {
    const [only, ...rest] = body;
    if (rest.length === 0 && only instanceof Solved) {
      return yield* exampleOf(model, only, vars);
    }
    let first: Vars | undefined;
    yield* each(
      model,
      body,
      (answers) =>
        Effect.sync(() => {
          if (first === undefined && answers.length > 0) {
            first = answers[0];
          }
        }),
      vars
    );
    return first === undefined
      ? undefined
      : formatWitnessVars(first, ownNames, vars);
  });

/** Finds one concrete witness matching `goal` (unwrapping top-level `exists`), if any. */
const witnessOf = (
  model: Model,
  goal: unknown,
  vars: Vars
): LogicEffect<Record<string, unknown> | undefined> =>
  Effect.gen(function* () {
    const ownNames = isForm(goal, "exists")
      ? (goal.parts[0] as readonly string[])
      : [];
    const inner = isForm(goal, "exists") ? goal.parts[1] : goal;
    const plans = yield* compiling(() =>
      questionPlans(inner as LogicForm, (name) => vars.has(name))
    );
    for (const { body } of plans) {
      const found = yield* firstBodyWitness(model, body, ownNames, vars);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  });

/** Normalizes a `whyGoal` tree so every proved result is accepted by `proof/valid?`. */
const ensureKernelProof = (tree: unknown): unknown => {
  if (
    isRecord(tree) &&
    Array.isArray(tree.certificate) &&
    tree.certificate.length === 0
  ) {
    return { ...tree, certificate: [contradictionCertificate()] };
  }
  if (verifyProof(tree)) {
    return tree;
  }
  if (isRecord(tree) && "absent" in tree) {
    return { ...tree, because: [] };
  }
  return { kind: "trivial", value: true };
};

const heldProofRecord = (
  proof: unknown,
  treeRecord: Record<string, unknown> | undefined,
  facts: readonly unknown[],
  assumptions: readonly unknown[],
  example: Record<string, unknown> | undefined
): Record<string, unknown> => ({
  proved: true,
  proof,
  ...(treeRecord?.vacuous === true ? { vacuous: true } : {}),
  ...(Array.isArray(treeRecord?.contradicting)
    ? { contradicting: treeRecord.contradicting }
    : {}),
  ...(facts.length > 0 ? { facts } : {}),
  ...(assumptions.length > 0 ? { assumptions } : {}),
  ...(example === undefined ? {} : { example }),
});

const unprovedRecord = (
  counterexample: Record<string, unknown> | undefined,
  treeRecord: Record<string, unknown> | undefined,
  assumptions: readonly unknown[]
): Record<string, unknown> => ({
  proved: false,
  ...(counterexample === undefined ? {} : { counterexample }),
  ...(treeRecord === undefined ? {} : { reason: treeRecord }),
  ...(assumptions.length > 0 ? { assumptions } : {}),
});

/**
 * First-class goal prover (`proof/prove`): proves or refutes any closed goal,
 * returning a kernel-verifiable `proof` (linear/split certificate, induction
 * proof, or `why` derivation), ground `facts`, closed-world `assumptions`,
 * `vacuous` / `contradicting` metadata, or a concrete `counterexample` witness.
 */
export const proveGoal = (
  model: Model,
  goal: unknown,
  vars: Vars = NO_VARS
): LogicEffect<Record<string, unknown>> =>
  Effect.gen(function* () {
    if (typeof goal === "boolean") {
      return goal
        ? { proof: { kind: "trivial", value: true }, proved: true }
        : { proved: false };
    }
    const { held, tree } = yield* whyGoal(model, goal, vars);
    const treeRecord = isRecord(tree) ? tree : undefined;
    const facts =
      treeRecord === undefined ? [] : extractExplanationFacts(treeRecord);
    const assumptions =
      treeRecord === undefined ? [] : extractExplanationAssumptions(treeRecord);

    if (held) {
      const example = isForm(goal, "exists")
        ? yield* witnessOf(model, goal, vars)
        : undefined;
      return heldProofRecord(
        ensureKernelProof(tree),
        treeRecord,
        facts,
        assumptions,
        example
      );
    }
    const counterexample = isForm(goal, "not")
      ? yield* witnessOf(model, goal.parts[0], vars)
      : undefined;
    return unprovedRecord(counterexample, treeRecord, assumptions);
  });

const witnessRecord = (
  symbols: ReadonlyMap<string, Cases>,
  values: Values | undefined,
  outerVars: Vars
): Record<string, unknown> | undefined => {
  if (values === undefined) {
    return undefined;
  }
  const out: Record<string, unknown> = {};
  for (const [name, symCases] of symbols) {
    const first = symCases[0];
    if (first === undefined) {
      continue;
    }
    const v = concrete(first.sym, values);
    if (v !== undefined) {
      out[`?${name.replace(LENGTH_MARK, "")}`] = v;
    }
  }
  for (const [name, v] of outerVars) {
    const key = `?${name.replace(LENGTH_MARK, "")}`;
    if (!(key in out)) {
      out[key] = v;
    }
  }
  return out;
};

interface BoundEntry {
  readonly inclusive: boolean;
  readonly value: Rational;
  readonly witness?: Record<string, unknown> | undefined;
}

interface BoundAccumulator {
  anySat: boolean;
  high: BoundEntry | undefined;
  highUnbounded: boolean;
  low: BoundEntry | undefined;
  lowUnbounded: boolean;
}

const mergeBoundAcc = (
  acc: BoundAccumulator,
  low: BoundAccumulator["low"],
  high: BoundAccumulator["high"]
) => {
  if (!acc.anySat) {
    acc.anySat = true;
    if (low === undefined) {
      acc.lowUnbounded = true;
    } else {
      acc.low = low;
    }
    if (high === undefined) {
      acc.highUnbounded = true;
    } else {
      acc.high = high;
    }
    return;
  }
  if (low === undefined) {
    acc.lowUnbounded = true;
    acc.low = undefined;
  } else if (!acc.lowUnbounded && acc.low !== undefined) {
    const cmp = compare(low.value, acc.low.value);
    if (cmp < 0 || (cmp === 0 && low.inclusive && !acc.low.inclusive)) {
      acc.low = low;
    }
  }
  if (high === undefined) {
    acc.highUnbounded = true;
    acc.high = undefined;
  } else if (!acc.highUnbounded && acc.high !== undefined) {
    const cmp = compare(high.value, acc.high.value);
    if (cmp > 0 || (cmp === 0 && high.inclusive && !acc.high.inclusive)) {
      acc.high = high;
    }
  }
};

interface SymbolicBoundCase {
  readonly constraints: readonly Constraint[];
  readonly den?: ReturnType<typeof constant>;
  readonly num: ReturnType<typeof constant>;
  readonly sorts: ReadonlyMap<string, Sort>;
}

const refuteAllPieces = (
  constraints: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>,
  out: ProofCertificate[]
): boolean => {
  for (const piece of splitCases(constraints)) {
    const cert = refuteWithSplits(piece, sortsFor(piece, sorts));
    if (cert === undefined) {
      return false;
    }
    out.push(cert);
  }
  return true;
};

const boundViolationBranches = (
  item: SymbolicBoundCase,
  bound: Rational,
  inclusive: boolean,
  isMin: boolean
): readonly (readonly Constraint[])[] => {
  const rhs = item.den === undefined ? constant(bound) : times(item.den, bound);
  const violation: Constraint = {
    linear: isMin ? minus(rhs, item.num) : minus(item.num, rhs),
    relation: inclusive ? ">" : ">=",
  };
  if (item.den === undefined) {
    return [[...item.constraints, violation]];
  }
  return [
    [...item.constraints, { linear: item.den, relation: ">" }, violation],
    [
      ...item.constraints,
      { linear: times(item.den, negate(ONE)), relation: ">" },
      {
        linear: times(violation.linear, negate(ONE)),
        relation: violation.relation,
      },
    ],
  ];
};

const proveSymbolicBound = (
  casesList: readonly SymbolicBoundCase[],
  bound: Rational,
  inclusive: boolean,
  isMin: boolean
): readonly ProofCertificate[] | undefined => {
  const certs: ProofCertificate[] = [];
  for (const item of casesList) {
    for (const branch of boundViolationBranches(
      item,
      bound,
      inclusive,
      isMin
    )) {
      if (!refuteAllPieces(branch, item.sorts, certs)) {
        return undefined;
      }
    }
  }
  return certs.length > 0 ? certs : undefined;
};

interface BoundsRunState {
  readonly acc: BoundAccumulator;
  allSymbolic: boolean;
  readonly symbolicCases: SymbolicBoundCase[];
  unsatCertComplete: boolean;
  readonly unsatCerts: ProofCertificate[];
}

const collectMatches = (
  model: Model,
  body: readonly Literal[],
  vars: Vars
): LogicEffect<readonly Vars[]> =>
  Effect.gen(function* () {
    if (body.length === 0) {
      return [vars];
    }
    const found: Vars[] = [];
    yield* each(
      model,
      body,
      (batch) =>
        Effect.sync(() => {
          found.push(...batch);
        }),
      vars
    );
    return found;
  });

const accumulateGroundBounds = (
  model: Model,
  target: unknown,
  body: readonly Literal[],
  vars: Vars,
  state: BoundsRunState
): LogicEffect<void> =>
  Effect.gen(function* () {
    state.allSymbolic = false;
    const foundAnswers = yield* collectMatches(model, body, vars);
    for (const ans of foundAnswers) {
      const val = yield* evalTerm(model, target, ans);
      if (!isNumber(val)) {
        return yield* logicError(
          `proof/bounds expects a numeric target, but found ${show(val)}.`
        );
      }
      const r = toRational(val);
      const witness = Object.fromEntries(
        [...ans.entries()].map(([k, v]) => [
          `?${k.replace(LENGTH_MARK, "")}`,
          v,
        ])
      );
      mergeBoundAcc(
        state.acc,
        { inclusive: true, value: r, witness },
        { inclusive: true, value: r, witness }
      );
    }
  });

const sortsWithTarget = (
  constraints: readonly Constraint[],
  num: ReturnType<typeof constant>,
  den: ReturnType<typeof constant> | undefined,
  baseSorts: ReadonlyMap<string, Sort>
): Map<string, Sort> => {
  const fullSorts = sortsFor(constraints, baseSorts);
  for (const name of num.coefficients.keys()) {
    if (!fullSorts.has(name)) {
      fullSorts.set(name, baseSorts.get(name) ?? "real");
    }
  }
  if (den !== undefined) {
    for (const name of den.coefficients.keys()) {
      if (!fullSorts.has(name)) {
        fullSorts.set(name, baseSorts.get(name) ?? "real");
      }
    }
  }
  return fullSorts;
};

const toBoundEntry = (
  end:
    | {
        readonly strict: boolean;
        readonly value: Rational;
        readonly witness?: Values;
      }
    | undefined,
  symbols: ReadonlyMap<string, Cases>,
  bVars: Vars
): BoundEntry | undefined =>
  end === undefined
    ? undefined
    : {
        inclusive: !end.strict,
        value: end.value,
        ...(end.witness === undefined
          ? {}
          : { witness: witnessRecord(symbols, end.witness, bVars) }),
      };

const solveTargetConjunction = (
  full: readonly Constraint[],
  num: ReturnType<typeof constant>,
  den: ReturnType<typeof constant> | undefined,
  evalCtx: Context,
  symbols: ReadonlyMap<string, Cases>,
  bVars: Vars,
  state: BoundsRunState
): void => {
  const fullSorts = sortsWithTarget(full, num, den, evalCtx.sorts);
  const res =
    den === undefined
      ? linearBoundsOf(full, fullSorts, num)
      : ratioBoundsOf(full, fullSorts, num, den);
  if (res === undefined) {
    if (!refuteAllPieces(full, fullSorts, state.unsatCerts)) {
      state.unsatCertComplete = false;
    }
    return;
  }
  state.symbolicCases.push({
    constraints: full,
    ...(den === undefined ? {} : { den }),
    num,
    sorts: fullSorts,
  });
  mergeBoundAcc(
    state.acc,
    toBoundEntry(res.low, symbols, bVars),
    toBoundEntry(res.high, symbols, bVars)
  );
};

const sortsWithNonlinear = (
  full: readonly Constraint[],
  linear: Linear,
  nonlinear: ReadonlyMap<string, Rational>,
  baseSorts: ReadonlyMap<string, Sort>
): Map<string, Sort> => {
  const fullSorts = sortsWithTarget(full, linear, undefined, baseSorts);
  for (const key of nonlinear.keys()) {
    for (const name of key.split("*")) {
      if (!fullSorts.has(name)) {
        fullSorts.set(name, baseSorts.get(name) ?? "real");
      }
    }
  }
  return fullSorts;
};

const solveNonlinearConjunctions = (
  formula: Formula,
  when: Formula,
  linear: Linear,
  nonlinear: ReadonlyMap<string, Rational>,
  evalCtx: Context,
  symbols: ReadonlyMap<string, Cases>,
  bVars: Vars,
  state: BoundsRunState
): void => {
  state.allSymbolic = false;
  for (const conj of formula) {
    for (const tConj of when) {
      const full = withDefinitions([...conj, ...tConj], evalCtx.definitions);
      const fullSorts = sortsWithNonlinear(
        full,
        linear,
        nonlinear,
        evalCtx.sorts
      );
      const res = quadraticBoundsOf(full, fullSorts, linear, nonlinear);
      if (res === undefined) {
        if (!refuteAllPieces(full, fullSorts, state.unsatCerts)) {
          state.unsatCertComplete = false;
        }
      } else {
        mergeBoundAcc(
          state.acc,
          toBoundEntry(res.low, symbols, bVars),
          toBoundEntry(res.high, symbols, bVars)
        );
      }
    }
  }
};

const solveLinearConjunctions = (
  formula: Formula,
  when: Formula,
  linear: Linear,
  denominator: Linear | undefined,
  evalCtx: Context,
  symbols: ReadonlyMap<string, Cases>,
  bVars: Vars,
  state: BoundsRunState
): void => {
  for (const conj of formula) {
    for (const tConj of when) {
      const full = withDefinitions([...conj, ...tConj], evalCtx.definitions);
      solveTargetConjunction(
        full,
        linear,
        denominator,
        evalCtx,
        symbols,
        bVars,
        state
      );
    }
  }
};

const processSymbolicChoice = (
  model: Model,
  target: unknown,
  choice: {
    readonly definitions: ReadonlyMap<string, readonly Constraint[]>;
    readonly formula: Formula;
    readonly symbols: ReadonlyMap<string, Cases>;
    readonly waiting: readonly {
      readonly goal: unknown;
      readonly why: string;
    }[];
  },
  sorts: ReadonlyMap<string, Sort>,
  bVars: Vars,
  state: BoundsRunState
): LogicEffect<void> =>
  Effect.gen(function* () {
    if (choice.waiting.length > 0) {
      return yield* logicError(
        `proof/bounds cannot solve waiting goal ${show(choice.waiting[0]?.goal)}: ${choice.waiting[0]?.why ?? ""}`
      );
    }
    const evalCtx: Context = {
      definitions: new Map(choice.definitions),
      evaluate: (part) =>
        evalTerm(model, part, bVars) as unknown as Effect.Effect<
          unknown,
          Error
        >,
      floors: new Map(),
      sorts: new Map(sorts),
      symbols: new Map(choice.symbols),
    };
    const targetCases = yield* symbolicTerm(target, evalCtx).pipe(
      Effect.mapError((e) =>
        e instanceof LogicError ? e : new LogicError({ message: e.message })
      )
    );
    for (const tc of targetCases) {
      if (tc.sym.kind !== "number") {
        return yield* logicError(
          `proof/bounds expects a numeric target, but found a ${tc.sym.kind}.`
        );
      }
      if (tc.sym.nonlinear === undefined) {
        solveLinearConjunctions(
          choice.formula,
          tc.when,
          tc.sym.linear,
          tc.sym.denominator,
          evalCtx,
          choice.symbols,
          bVars,
          state
        );
      } else {
        if (tc.sym.denominator !== undefined) {
          return yield* logicError(
            "proof/bounds does not support nonlinear fractions with both a nonlinear numerator and symbolic denominator."
          );
        }
        solveNonlinearConjunctions(
          choice.formula,
          tc.when,
          tc.sym.linear,
          tc.sym.nonlinear,
          evalCtx,
          choice.symbols,
          bVars,
          state
        );
      }
    }
  });

const accumulateSolvedPlan = (
  model: Model,
  target: unknown,
  prefix: readonly Literal[],
  step: Solved,
  hasSuffix: boolean,
  vars: Vars,
  state: BoundsRunState
): LogicEffect<void> =>
  Effect.gen(function* () {
    if (hasSuffix) {
      state.allSymbolic = false;
    }
    const prefixAnswers = yield* collectMatches(model, prefix, vars);
    for (const bVars of prefixAnswers) {
      const { choices, sorts } = yield* stepFormulas(model, step, bVars).pipe(
        Effect.mapError((e) =>
          e instanceof LogicError
            ? e
            : new LogicError({
                message: e instanceof Error ? e.message : String(e),
              })
        )
      );
      for (const choice of choices) {
        yield* processSymbolicChoice(
          model,
          target,
          choice,
          sorts,
          bVars,
          state
        );
      }
      if (!state.acc.anySat && state.unsatCerts.length === 0) {
        const fallback = yield* certificateOf(model, step, bVars);
        if (fallback !== undefined) {
          state.unsatCerts.push(...fallback);
        }
      }
    }
  });

const formatBoundsResult = (state: BoundsRunState): Record<string, unknown> => {
  const { acc } = state;
  if (!acc.anySat) {
    return {
      satisfiable: false,
      ...(state.unsatCertComplete && state.unsatCerts.length > 0
        ? { proof: state.unsatCerts }
        : {}),
    };
  }
  const minProof =
    state.allSymbolic && !acc.lowUnbounded && acc.low !== undefined
      ? proveSymbolicBound(
          state.symbolicCases,
          acc.low.value,
          acc.low.inclusive,
          true
        )
      : undefined;
  const maxProof =
    state.allSymbolic && !acc.highUnbounded && acc.high !== undefined
      ? proveSymbolicBound(
          state.symbolicCases,
          acc.high.value,
          acc.high.inclusive,
          false
        )
      : undefined;
  return {
    max:
      acc.highUnbounded || acc.high === undefined
        ? null
        : fromRational(acc.high.value),
    maxInclusive:
      !acc.highUnbounded && acc.high !== undefined && acc.high.inclusive,
    min:
      acc.lowUnbounded || acc.low === undefined
        ? null
        : fromRational(acc.low.value),
    minInclusive:
      !acc.lowUnbounded && acc.low !== undefined && acc.low.inclusive,
    satisfiable: true,
    ...(acc.low?.witness === undefined ? {} : { witnessMin: acc.low.witness }),
    ...(acc.high?.witness === undefined
      ? {}
      : { witnessMax: acc.high.witness }),
    ...(minProof === undefined ? {} : { minProof }),
    ...(maxProof === undefined ? {} : { maxProof }),
  };
};

/**
 * Exact symbolic & relational interval bounds (`proof/bounds`): projects Lion's
 * Fourier-Motzkin / Omega / Charnes-Cooper solver onto `target` under `goal`,
 * returning tight `[min, max]` bounds, endpoint witnesses, and kernel-checkable
 * bound or unsat certificates.
 */
export const boundsGoal = (
  model: Model,
  target: unknown,
  goal: unknown,
  vars: Vars = NO_VARS
): LogicEffect<Record<string, unknown>> =>
  Effect.gen(function* () {
    const plans = yield* compiling(() =>
      questionPlans(goal as LogicForm, (name) => vars.has(name))
    );
    const state: BoundsRunState = {
      acc: {
        anySat: false,
        high: undefined,
        highUnbounded: false,
        low: undefined,
        lowUnbounded: false,
      },
      allSymbolic: true,
      symbolicCases: [],
      unsatCertComplete: true,
      unsatCerts: [],
    };

    for (const { body } of plans) {
      const solvedIdx = body.findIndex((lit) => lit instanceof Solved);
      if (solvedIdx === -1) {
        yield* accumulateGroundBounds(model, target, body, vars, state);
      } else {
        yield* accumulateSolvedPlan(
          model,
          target,
          body.slice(0, solvedIdx),
          body[solvedIdx] as Solved,
          solvedIdx + 1 < body.length,
          vars,
          state
        );
      }
    }
    return formatBoundsResult(state);
  });

const MAX_SENSITIVITY_PAIRS = 64;

const factToAtom = (
  database: LogicDatabase,
  fact: unknown
): Atom | undefined => {
  if (
    !Array.isArray(fact) ||
    fact.length === 0 ||
    typeof fact[0] !== "string"
  ) {
    return undefined;
  }
  const rel = database.relations.get(fact[0]);
  if (rel === undefined || rel.columns.length !== fact.length - 1) {
    return undefined;
  }
  return new Atom(rel, fact.slice(1));
};

const substituteGoalVars = (goal: unknown, vars: Vars): unknown =>
  vars.size === 0
    ? goal
    : replaceVariables(goal, (v) =>
        vars.has(v.name) ? vars.get(v.name) : undefined
      );

const classifySingleFactSensitivity = (
  database: LogicDatabase,
  assume: NonNullable<Model["assume"]>,
  instantiated: unknown,
  facts: readonly unknown[]
): LogicEffect<{
  readonly altDerivations: Map<string, readonly unknown[]>;
  readonly critical: unknown[];
  readonly redundant: unknown[];
}> =>
  Effect.gen(function* () {
    const critical: unknown[] = [];
    const redundant: unknown[] = [];
    const altDerivations = new Map<string, readonly unknown[]>();

    for (const fact of facts) {
      const atom = factToAtom(database, fact);
      if (atom === undefined) {
        continue;
      }
      const change = new LogicForm("retract", [atom]);
      const probe = (yield* assume(
        [change],
        new LogicForm("proof/prove", [instantiated])
      )) as { readonly facts?: readonly unknown[]; readonly proved?: boolean };
      if (probe.proved === true) {
        redundant.push(fact);
        altDerivations.set(valueKey(fact), probe.facts ?? []);
      } else {
        critical.push(fact);
      }
    }
    critical.sort(compareValues);
    redundant.sort(compareValues);
    return { altDerivations, critical, redundant };
  });

const collectCandidatePairs = (
  redundant: readonly unknown[],
  altDerivations: ReadonlyMap<string, readonly unknown[]>
): (readonly [unknown, unknown])[] => {
  const seen = new Set<string>();
  const pairs: (readonly [unknown, unknown])[] = [];
  for (const f1 of redundant) {
    const k1 = valueKey(f1);
    for (const f2 of altDerivations.get(k1) ?? []) {
      if (pairs.length >= MAX_SENSITIVITY_PAIRS) {
        return pairs;
      }
      if (valueKey(f2) === k1) {
        continue;
      }
      const pair = ([f1, f2] as [unknown, unknown]).sort(compareValues) as [
        unknown,
        unknown,
      ];
      const key = valueKey(pair);
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push(pair);
      }
    }
  }
  return pairs;
};

const findSizeTwoCuts = (
  database: LogicDatabase,
  assume: NonNullable<Model["assume"]>,
  instantiated: unknown,
  redundant: readonly unknown[],
  altDerivations: ReadonlyMap<string, readonly unknown[]>
): LogicEffect<unknown[][]> =>
  Effect.gen(function* () {
    const minimalCuts: unknown[][] = [];
    for (const [f1, f2] of collectCandidatePairs(redundant, altDerivations)) {
      const atom1 = factToAtom(database, f1);
      const atom2 = factToAtom(database, f2);
      if (atom1 === undefined || atom2 === undefined) {
        continue;
      }
      const stillHolds = yield* assume(
        [new LogicForm("retract", [atom1, atom2])],
        instantiated
      );
      if (stillHolds === false) {
        minimalCuts.push([f1, f2]);
      }
    }
    minimalCuts.sort(compareValues);
    return minimalCuts;
  });

/**
 * All-derivations epistemic sensitivity analysis (`proof/sensitivity`):
 * tests which base facts in the derivation are single points of failure
 * (`critical`), which have surviving alternative derivations (`redundant`),
 * and discovers minimal size-1 and size-2 retraction cut-sets (`minimalCuts`).
 */
export const sensitivityGoal = (
  database: LogicDatabase,
  model: Model,
  goal: unknown,
  vars: Vars = NO_VARS
): LogicEffect<Record<string, unknown>> =>
  Effect.gen(function* () {
    if (typeof goal === "boolean") {
      return {
        critical: [],
        holds: goal,
        minCutSize: goal ? null : 0,
        minimalCuts: [],
        redundant: [],
        resilient: goal,
      };
    }
    const { held, tree } = yield* whyGoal(model, goal, vars);
    if (!held) {
      return {
        critical: [],
        holds: false,
        minCutSize: 0,
        minimalCuts: [],
        redundant: [],
        resilient: false,
      };
    }
    const assume = (model.base ?? model).assume;
    const facts = isRecord(tree) ? extractExplanationFacts(tree) : [];
    if (facts.length === 0 || assume === undefined) {
      return {
        critical: [],
        holds: true,
        minCutSize: null,
        minimalCuts: [],
        redundant: [],
        resilient: true,
      };
    }
    const instantiated = substituteGoalVars(goal, vars);
    const { altDerivations, critical, redundant } =
      yield* classifySingleFactSensitivity(
        database,
        assume,
        instantiated,
        facts
      );
    if (critical.length > 0) {
      return {
        critical,
        holds: true,
        minCutSize: 1,
        minimalCuts: critical.map((f) => [f]),
        redundant,
        resilient: false,
      };
    }
    const minimalCuts = yield* findSizeTwoCuts(
      database,
      assume,
      instantiated,
      redundant,
      altDerivations
    );
    return {
      critical,
      holds: true,
      minCutSize: minimalCuts.length > 0 ? 2 : null,
      minimalCuts,
      redundant,
      resilient: true,
    };
  });
