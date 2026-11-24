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
import type { CompiledRule, Literal } from "@/logic/compile";
import type { Invariant, LogicDatabase } from "@/logic/database";
import { fits } from "@/logic/fit";
import { includes } from "@/logic/inclusion";
import {
  type Constraint,
  type Sort,
  solve,
  cases as splitCases,
  type Values,
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
  type Cases,
  concrete,
  equal,
  FALSE,
  type Formula,
  not,
  one,
  or,
  product,
  type Sym,
  TRUE,
} from "@/logic/symbols";
import {
  Atom,
  DeferredCall,
  isForm,
  isPlainObject,
  type LogicForm,
  LogicVariable,
  type RelationInfo,
  relationOf,
  show,
} from "@/logic/terms";

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
  if ("certificate" in node && !verifyProof(node.certificate)) {
    return false;
  }
  if ("induction" in node && !verifyProof(node.induction)) {
    return false;
  }
  if ("because" in node) {
    return Array.isArray(node.because) && node.because.every(verifyAbsentWay);
  }
  return true;
};

/** Checks a `why` premise node (fact, check, same, absent, or nested derivation). */
const verifyWhyPremise = (node: unknown): boolean => {
  if (!isRecord(node)) {
    return false;
  }
  if ("check" in node) {
    return true;
  }
  if ("same" in node) {
    return Array.isArray(node.same) && node.same.length === 2;
  }
  if ("absent" in node) {
    return verifyAbsentNode(node);
  }
  return "fact" in node ? verifyDerivation(node) : false;
};

/** Checks a `why` derivation tree (`{ fact, given | computed | rule + because/matches }`). */
const verifyDerivation = (rec: Record<string, unknown>): boolean => {
  if (!Array.isArray(rec.fact) || rec.fact.length === 0) {
    return false;
  }
  if (rec.given === true || rec.computed === true) {
    return true;
  }
  if (!Array.isArray(rec.rule)) {
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
    return verifyProof(entry.proof);
  }
  if ("certificates" in entry) {
    return (
      Array.isArray(entry.certificates) &&
      entry.certificates.length > 0 &&
      entry.certificates.every(verifyProof)
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

export const verifyProof = (proof: unknown): boolean => {
  if (Array.isArray(proof)) {
    return proof.length > 0 && proof.every(verifyProof);
  }
  if (!isRecord(proof)) {
    return false;
  }
  const kind = proof.kind;
  if (kind === "linear" || kind === "split") {
    return checksProof(proof);
  }
  if (kind === "cases") {
    return (
      Array.isArray(proof.cases) &&
      proof.cases.length > 0 &&
      proof.cases.every(verifyProof)
    );
  }
  if (kind === "lemma") {
    return (
      "claim" in proof && verifyProof(proof.proof) && verifyProof(proof.in)
    );
  }
  if (kind === "induction") {
    return verifyInductionProof(proof);
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
  return matchesDeferred || matchesObject
    ? [atom.relation.name, inner.fn]
    : undefined;
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

const bindAtomColumn = (
  arg: unknown,
  colSym: Sym,
  localSymbols: Map<string, Cases>,
  localCtx: Context
): Effect.Effect<Formula, Error> =>
  Effect.gen(function* () {
    if (arg instanceof LogicVariable) {
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
    }
    if (typeof arg === "function") {
      return yield* fitsOf(colSym, arg, localCtx, 0);
    }
    const argCases = yield* symbolicTerm(arg, localCtx);
    return argCases.reduce<Formula>(
      (f, e) => or(f, and(e.when, equal(e.sym, colSym, localCtx.atoms))),
      FALSE
    );
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
      if (isForm(filter, "=")) {
        const [left, right] = filter.parts;
        if (
          left instanceof LogicVariable &&
          !left.anonymous &&
          !localSymbols.has(left.name)
        ) {
          localSymbols.set(left.name, yield* symbolicTerm(right, localCtx));
          continue;
        }
        if (
          right instanceof LogicVariable &&
          !right.anonymous &&
          !localSymbols.has(right.name)
        ) {
          localSymbols.set(right.name, yield* symbolicTerm(left, localCtx));
          continue;
        }
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
      const expr =
        rule.aggregates.includes(at) &&
        arg instanceof DeferredCall &&
        (arg.aggregate === "min" || arg.aggregate === "max")
          ? arg.args[0]
          : arg;
      headArgCases.push(yield* symbolicTerm(expr, localCtx));
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
      let cases = (yield* shapeFor(`r${caseIndex}_a${at}`, primary, context))
        .cases;
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
    const elementPreserving = rule.aggregates.every((at) => {
      const arg = rule.head.args[at];
      return (
        arg instanceof DeferredCall &&
        (arg.aggregate === "min" || arg.aggregate === "max") &&
        arg.args.length === 1
      );
    });
    if (!elementPreserving || rule.invents !== undefined) {
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
