/**
 * Structural and numeric induction for universal proofs in Lion.
 *
 * Inspired by the Calculus of Inductive Constructions (CIC):
 * - A recursive named schema or unbounded `schema/arrayOf` directly generates
 *   its structural induction scheme (one base case per non-recursive branch,
 *   one inductive step per recursive branch with the induction hypothesis on
 *   every strictly smaller inductive sub-value).
 * - A lower-bounded integer (`n >= base`) generates mathematical induction
 *   (`n = base`, and `n = k + 1` with `k >= base` and IH at `k`).
 * - Before admitting any recursive lambda into an inductive proof, the CIC
 *   guard condition verifies purity and termination (structural descent on
 *   strict sub-parts, or arithmetic measure descent proved by the solver) and
 *   verifies the lambda's return sort inductively.
 */
import { Effect, Result } from "effect";
import { lookup, UNBOUND } from "@/evaluation/environment";
import {
  contradictionCertificate,
  type ProofCertificate,
  refuteWithSplits,
} from "@/logic/certificate";
import type { Literal, Solved } from "@/logic/compile";
import {
  type NumberSym,
  numberSym,
  polyScale,
  polySub,
  polySubstitute,
} from "@/logic/polynomial";
import {
  type Constraint,
  constant,
  type Linear,
  minus,
  plus,
  type Sort,
  satisfiable,
  solve,
  cases as splitCases,
  times,
  toNumber,
  variable,
} from "@/logic/solver";
import {
  type Context,
  fitsOf,
  formulaOf,
  inlineLambda,
  shapeFor,
  term as symbolicTerm,
  withDefinitions,
} from "@/logic/symbolic";
import {
  and,
  atom,
  type Cases,
  FALSE,
  type Formula,
  isInductiveSchema,
  isRecursiveNamedSchema,
  isStructurallyUninhabited,
  not,
  one,
  product,
  type Sym,
  TRUE,
  throughNames,
  truthSym,
} from "@/logic/symbols";
import {
  buildOf,
  DeferredCall,
  isArgumentsOnly,
  isForm,
  isPlainObject,
  type LambdaInfo,
  type LogicForm,
  type LogicVariable,
  lambdaInfo,
  nameOf,
  schemaOf,
  show,
} from "@/logic/terms";
import {
  divide,
  isZero,
  negate,
  ONE,
  type Rational,
  ratio,
} from "@/numbers/exact";

const SUFFIX_RE = /#\d+$/;
const cleanVar = (name: string) => `?${name.replace(SUFFIX_RE, "")}`;
const errorText = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

const sortMatches = (
  got: ReturnSort | undefined,
  candidate: ReturnSort
): boolean => {
  if (got === undefined) {
    return false;
  }
  if (candidate === "integer") {
    return got === "integer";
  }
  if (candidate === "real") {
    return got === "integer" || got === "real";
  }
  return got === "truth";
};

/** Guard verification record for a recursive lambda admitted to induction. */
export interface GuardInfo {
  readonly function: string;
  readonly kind: "structural" | "numeric";
  readonly parameter: string;
}

/** Proof certificate for one case of an induction proof. */
export interface InductionCaseProof {
  readonly case: string;
  readonly certificates?: readonly ProofCertificate[];
}

/** Structured proof object produced by structural or numeric induction. */
export interface InductionProof {
  readonly basis: "schema" | "list" | "integer";
  readonly cases: readonly InductionCaseProof[];
  readonly guards: readonly GuardInfo[];
  readonly kind: "induction";
  readonly target: string;
}

export type InductionResult =
  | { readonly proof: InductionProof; readonly status: "proved" }
  | {
      readonly status: "disproved";
      readonly witness?: Record<string, unknown>;
    }
  | { readonly reason: string; readonly status: "refused" };

/** Special forms that are impure or cannot participate in pure inductive proofs. */
const IMPURE_FORMS = new Set([
  "assuming",
  "delay",
  "eval",
  "fact",
  "find",
  "invariant",
  "proof/bounds",
  "proof/prove",
  "proof/sensitivity",
  "query",
  "relation",
  "retract",
  "rule",
  "schema",
  "set!",
  "why",
]);

const isClosureSym = (
  fn: unknown
): fn is Extract<Sym, { readonly kind: "closure" }> =>
  typeof fn === "object" &&
  fn !== null &&
  (fn as { readonly kind?: unknown }).kind === "closure";

const scopeOf = (fn: unknown): ReadonlyMap<string, Cases> | undefined =>
  isClosureSym(fn) ? fn.scope : undefined;

const resolveIn = (
  name: string,
  env: LambdaInfo["environment"],
  scope?: ReadonlyMap<string, Cases>
): unknown => {
  const fromScope = scope?.get(name);
  if (fromScope !== undefined && fromScope.length === 1) {
    const sym = fromScope[0]?.sym;
    if (sym?.kind === "value") {
      return sym.value;
    }
    if (sym?.kind === "closure") {
      return sym;
    }
  }
  return env === undefined ? UNBOUND : lookup(env, name);
};

const PURE_PASS_FORMS = new Set(["begin", "and", "or", "not", "=", "match"]);

const isPureResolvedHead = (
  resolved: unknown,
  seenBodies: Set<unknown>
): boolean => {
  if (resolved === UNBOUND) {
    return true;
  }
  if (isClosureSym(resolved) && resolved.info !== undefined) {
    if (seenBodies.has(resolved.info.body)) {
      return true;
    }
    seenBodies.add(resolved.info.body);
    return isPureExpr(
      resolved.info.body,
      resolved.info.environment,
      seenBodies,
      resolved.scope
    );
  }
  if (typeof resolved !== "function") {
    return true;
  }
  const info = lambdaInfo(resolved);
  if (info === undefined) {
    return isArgumentsOnly(resolved);
  }
  if (seenBodies.has(info.body)) {
    return true;
  }
  seenBodies.add(info.body);
  return isPureExpr(info.body, info.environment, seenBodies);
};

/** Checks that a lambda body (and its pure helpers) has no side effects. */
const isPureExpr = (
  expr: unknown,
  env: LambdaInfo["environment"],
  seenBodies: Set<unknown>,
  scope?: ReadonlyMap<string, Cases>
): boolean => {
  if (expr === null || expr === undefined || typeof expr !== "object") {
    return true;
  }
  if (!Array.isArray(expr)) {
    return isPlainObject(expr)
      ? Object.values(expr).every((v) => isPureExpr(v, env, seenBodies, scope))
      : true;
  }
  if (expr.length === 0) {
    return true;
  }
  const [head, ...rest] = expr;
  if (head === "quote") {
    return true;
  }
  if (typeof head === "string" && IMPURE_FORMS.has(head)) {
    return false;
  }
  if (head === "lambda" || head === "define") {
    return rest.length >= 2 && isPureExpr(rest[1], env, seenBodies, scope);
  }
  if (typeof head === "string" && PURE_PASS_FORMS.has(head)) {
    return rest.every((part) => isPureExpr(part, env, seenBodies, scope));
  }
  if (head === "cond") {
    return rest.every(
      (clause) =>
        Array.isArray(clause) &&
        clause.length === 2 &&
        isPureExpr(clause[0], env, seenBodies, scope) &&
        isPureExpr(clause[1], env, seenBodies, scope)
    );
  }
  if (
    typeof head === "string" &&
    !isPureResolvedHead(resolveIn(head, env, scope), seenBodies)
  ) {
    return false;
  }
  return expr.every((part) => isPureExpr(part, env, seenBodies, scope));
};

export const isPureLambda = (fn: unknown, info: LambdaInfo): boolean =>
  isPureExpr(info.body, info.environment, new Set([info.body]), scopeOf(fn));

type ReturnSort = "integer" | "real" | "truth";

const sortsFor = (
  constraints: readonly Constraint[],
  sorts: ReadonlyMap<string, Sort>
) =>
  new Map(
    constraints
      .flatMap((c) => [...c.linear.coefficients.keys()])
      .map((name) => [name, sorts.get(name) ?? "real"] as const)
  );

const isIntegralLinear = (
  linear: Linear,
  sorts: ReadonlyMap<string, Sort>
): boolean =>
  linear.constant.d === 1n &&
  [...linear.coefficients].every(
    ([name, k]) => k.d === 1n && sorts.get(name) === "integer"
  );

const isIntegralPoly = (
  sym: NumberSym,
  sorts: ReadonlyMap<string, Sort>
): boolean =>
  isIntegralLinear(sym.linear, sorts) &&
  (sym.nonlinear === undefined ||
    [...sym.nonlinear].every(
      ([key, k]) =>
        k.d === 1n && key.split("*").every((v) => sorts.get(v) === "integer")
    ));

const sortOfSym = (
  sym: Sym,
  sorts: ReadonlyMap<string, Sort>
): ReturnSort | undefined => {
  if (sym.kind === "truth") {
    return "truth";
  }
  if (sym.kind === "number") {
    return isIntegralPoly(sym, sorts) ? "integer" : "real";
  }
  return undefined;
};

const freshReturnSym = (
  sort: ReturnSort,
  name: string,
  sorts: Map<string, Sort>
): Sym => {
  if (sort === "truth") {
    sorts.set(name, "integer");
    // A symbolic boolean encoded via a 0/1 integer constraint.
    return truthSym(
      atom({ linear: minus(variable(name), constant(ONE)), relation: "=" })
    );
  }
  sorts.set(name, sort);
  return numberSym(variable(name));
};

const isSelfCall = (
  targetFn: unknown,
  targetInfo: LambdaInfo,
  calledFn: unknown,
  calledInfo: LambdaInfo
): boolean =>
  calledFn === targetFn ||
  calledInfo === targetInfo ||
  calledInfo.body === targetInfo.body;

const fnLabel = (fn: unknown, info: LambdaInfo): string => {
  if (typeof fn === "function") {
    const n = nameOf(fn);
    if (n !== undefined) {
      return n;
    }
  }
  const scope = scopeOf(fn);
  if (scope !== undefined) {
    for (const [k, cases] of scope) {
      const s = cases[0]?.sym;
      if (
        s?.kind === "value" &&
        typeof s.value === "function" &&
        lambdaInfo(s.value)?.body === info.body
      ) {
        return k;
      }
    }
  }
  return `lambda(${info.parameters.join(",")})`;
};

/** Collects every `inductive` sub-value inside a constructor shape. */
const collectInductive = (
  sym: Sym,
  out: Extract<Sym, { readonly kind: "inductive" }>[] = []
): Extract<Sym, { readonly kind: "inductive" }>[] => {
  switch (sym.kind) {
    case "inductive":
      out.push(sym);
      return out;
    case "record":
      for (const field of sym.fields.values()) {
        collectInductive(field, out);
      }
      return out;
    case "list":
      for (const item of sym.items) {
        collectInductive(item, out);
      }
      if (sym.tail !== undefined) {
        out.push(sym.tail);
      }
      return out;
    default:
      return out;
  }
};

interface VerifiedFunction {
  readonly guard: GuardInfo;
  readonly paramIndex: number;
  readonly returnSort: ReturnSort;
}

const checkStructuralSort = (
  fn: unknown,
  info: LambdaInfo,
  paramIndex: number,
  paramName: string,
  fnName: string,
  candidateSort: ReturnSort,
  constructors: readonly { readonly sym: Sym; readonly when: Formula }[],
  otherArgs: readonly Sym[],
  baseContext: Context
): Effect.Effect<
  "ok" | "wrong-sort" | { readonly guardError: string },
  never
> =>
  Effect.gen(function* () {
    const extraScope = scopeOf(fn);
    let counter = 0;
    for (const ctor of constructors) {
      const subNames = new Set(collectInductive(ctor.sym).map((s) => s.name));
      const localSorts = new Map(baseContext.sorts);
      const callArgs = [...otherArgs];
      callArgs[paramIndex] = ctor.sym;
      let guardFailed: string | undefined;
      const guardCtx: Context = {
        ...baseContext,
        definitions: new Map(baseContext.definitions),
        floors: new Map(baseContext.floors),
        inductive: {
          call: (calledFn, calledInfo, args) => {
            if (!isSelfCall(fn, info, calledFn, calledInfo)) {
              return Effect.succeed(undefined);
            }
            const recArg = args[paramIndex];
            if (
              recArg === undefined ||
              recArg.kind !== "inductive" ||
              !subNames.has(recArg.name)
            ) {
              guardFailed = `${fnName} recurses on an argument that is not a strictly smaller sub-part of ${paramName}`;
              return Effect.fail(new Error(guardFailed));
            }
            counter += 1;
            return Effect.succeed(
              one(
                freshReturnSym(candidateSort, `guard$r${counter}`, localSorts)
              )
            );
          },
        },
        sorts: localSorts,
      };
      const res = yield* Effect.result(
        inlineLambda(info, callArgs, guardCtx, 0, ctor.when, extraScope)
      );
      if (Result.isFailure(res)) {
        return { guardError: guardFailed ?? errorText(res.failure) };
      }
      if (
        !res.success.every((each) =>
          sortMatches(sortOfSym(each.sym, localSorts), candidateSort)
        )
      ) {
        return "wrong-sort";
      }
    }
    return "ok";
  });

/**
 * Verifies the CIC structural guard condition and infers return sort for a
 * recursive lambda over constructor shapes (recursive schema or `arrayOf`).
 */
const verifyStructuralFunction = (
  fn: unknown,
  info: LambdaInfo,
  paramIndex: number,
  constructors: readonly { readonly sym: Sym; readonly when: Formula }[],
  otherArgs: readonly Sym[],
  baseContext: Context
): Effect.Effect<VerifiedFunction | string, never> =>
  Effect.gen(function* () {
    const params = Array.isArray(info.parameters) ? info.parameters : [];
    const paramName = params[paramIndex] ?? `arg${paramIndex}`;
    const fnName = fnLabel(fn, info);
    if (!isPureLambda(fn, info)) {
      return `${fnName} is not pure and cannot be admitted to induction`;
    }
    for (const candidateSort of ["integer", "real", "truth"] as const) {
      const outcome = yield* checkStructuralSort(
        fn,
        info,
        paramIndex,
        paramName,
        fnName,
        candidateSort,
        constructors,
        otherArgs,
        baseContext
      );
      if (typeof outcome === "object") {
        return outcome.guardError;
      }
      if (outcome === "ok") {
        return {
          guard: { function: fnName, kind: "structural", parameter: paramName },
          paramIndex,
          returnSort: candidateSort,
        };
      }
    }
    return `${fnName} does not return a uniform number or truth sort`;
  });

const checkNumericCalls = (
  recorded: readonly { readonly arg: Linear; readonly guard: Formula }[],
  pLinear: Linear,
  base: bigint,
  pGeBase: Constraint,
  pLtBase: Constraint,
  fnName: string,
  paramName: string,
  definitions: ReadonlyMap<string, readonly Constraint[]>,
  localSorts: ReadonlyMap<string, Sort>
): string | undefined => {
  const baseRat = ratio(base);
  const neverBelowBase = recorded.every(({ guard }) =>
    guard.every((conj) => {
      const all = withDefinitions([...conj, pLtBase], definitions);
      return !satisfiable(all, sortsFor(all, localSorts));
    })
  );
  for (const { arg, guard } of recorded) {
    const notDecreasing: Constraint = {
      linear: minus(arg, pLinear),
      relation: ">=",
    };
    const belowBase: Constraint = {
      linear: minus(constant(baseRat), arg),
      relation: ">",
    };
    for (const conj of guard) {
      const decCheck = withDefinitions(
        [...conj, pGeBase, notDecreasing],
        definitions
      );
      if (satisfiable(decCheck, sortsFor(decCheck, localSorts))) {
        return `${fnName} does not strictly decrease ${paramName} on every recursive call`;
      }
      if (!neverBelowBase) {
        const lbCheck = withDefinitions(
          [...conj, pGeBase, belowBase],
          definitions
        );
        if (satisfiable(lbCheck, sortsFor(lbCheck, localSorts))) {
          return `${fnName} can pass a value below ${base} to a recursive call`;
        }
      }
    }
  }
  return undefined;
};

const numericReturnMatches = (
  cases: Cases,
  candidateSort: ReturnSort,
  pGeBase: Constraint,
  definitions: ReadonlyMap<string, readonly Constraint[]>,
  localSorts: ReadonlyMap<string, Sort>
): boolean =>
  cases.every((each) => {
    const reachable = each.when.some((conj) => {
      const all = withDefinitions([...conj, pGeBase], definitions);
      return satisfiable(all, sortsFor(all, localSorts));
    });
    return (
      !reachable || sortMatches(sortOfSym(each.sym, localSorts), candidateSort)
    );
  });

const checkNumericSort = (
  fn: unknown,
  info: LambdaInfo,
  paramIndex: number,
  paramName: string,
  fnName: string,
  base: bigint,
  pName: string,
  pLinear: Linear,
  pGeBase: Constraint,
  pLtBase: Constraint,
  candidateSort: ReturnSort,
  otherArgs: readonly Sym[],
  baseContext: Context
): Effect.Effect<
  "ok" | "wrong-sort" | { readonly guardError: string },
  never
> =>
  Effect.gen(function* () {
    const extraScope = scopeOf(fn);
    const localSorts = new Map(baseContext.sorts);
    localSorts.set(pName, "integer");
    const recorded: { readonly arg: Linear; readonly guard: Formula }[] = [];
    let guardFailed: string | undefined;
    let counter = 0;
    const callArgs = [...otherArgs];
    callArgs[paramIndex] = numberSym(pLinear);
    const guardCtx: Context = {
      ...baseContext,
      definitions: new Map(baseContext.definitions),
      floors: new Map(baseContext.floors),
      inductive: {
        call: (calledFn, calledInfo, args, _ctx, guard = TRUE) => {
          if (!isSelfCall(fn, info, calledFn, calledInfo)) {
            return Effect.succeed(undefined);
          }
          const recArg = args[paramIndex];
          if (
            recArg === undefined ||
            recArg.kind !== "number" ||
            recArg.nonlinear !== undefined ||
            !isIntegralLinear(recArg.linear, localSorts)
          ) {
            guardFailed = `${fnName} recurses on an argument that is not a linear integer expression in ${paramName}`;
            return Effect.fail(new Error(guardFailed));
          }
          recorded.push({ arg: recArg.linear, guard });
          counter += 1;
          return Effect.succeed(
            one(freshReturnSym(candidateSort, `guard$r${counter}`, localSorts))
          );
        },
      },
      sorts: localSorts,
    };
    const res = yield* Effect.result(
      inlineLambda(info, callArgs, guardCtx, 0, TRUE, extraScope)
    );
    if (Result.isFailure(res)) {
      return { guardError: guardFailed ?? errorText(res.failure) };
    }
    const callError = checkNumericCalls(
      recorded,
      pLinear,
      base,
      pGeBase,
      pLtBase,
      fnName,
      paramName,
      guardCtx.definitions,
      localSorts
    );
    if (callError !== undefined) {
      return { guardError: callError };
    }
    return numericReturnMatches(
      res.success,
      candidateSort,
      pGeBase,
      guardCtx.definitions,
      localSorts
    )
      ? "ok"
      : "wrong-sort";
  });

/**
 * Verifies the CIC numeric well-founded guard condition (`base <= arg' < n`,
 * or `arg' < n` with no recursion below `base`) and infers return sort.
 */
const verifyNumericFunction = (
  fn: unknown,
  info: LambdaInfo,
  paramIndex: number,
  base: bigint,
  otherArgs: readonly Sym[],
  baseContext: Context
): Effect.Effect<VerifiedFunction | string, never> =>
  Effect.gen(function* () {
    const params = Array.isArray(info.parameters) ? info.parameters : [];
    const paramName = params[paramIndex] ?? `arg${paramIndex}`;
    const fnName = fnLabel(fn, info);
    if (!isPureLambda(fn, info)) {
      return `${fnName} is not pure and cannot be admitted to induction`;
    }
    const baseRat = ratio(base);
    const pName = `guard$${paramName}`;
    const pLinear = variable(pName);
    const pGeBase: Constraint = {
      linear: minus(pLinear, constant(baseRat)),
      relation: ">=",
    };
    const pLtBase: Constraint = {
      linear: minus(constant(baseRat), pLinear),
      relation: ">",
    };
    for (const candidateSort of ["integer", "real", "truth"] as const) {
      const outcome = yield* checkNumericSort(
        fn,
        info,
        paramIndex,
        paramName,
        fnName,
        base,
        pName,
        pLinear,
        pGeBase,
        pLtBase,
        candidateSort,
        otherArgs,
        baseContext
      );
      if (typeof outcome === "object") {
        return outcome.guardError;
      }
      if (outcome === "ok") {
        return {
          guard: { function: fnName, kind: "numeric", parameter: paramName },
          paramIndex,
          returnSort: candidateSort,
        };
      }
    }
    return `${fnName} does not return a uniform number or truth sort`;
  });

/** Builds certificates for every conjunction in an UNSAT formula. */
const certifyUnsat = (
  formula: Formula,
  definitions: ReadonlyMap<string, readonly Constraint[]>,
  sorts: ReadonlyMap<string, Sort>
): ProofCertificate[] | undefined => {
  if (formula.length === 0) {
    return [contradictionCertificate()];
  }
  const certs: ProofCertificate[] = [];
  for (const conj of formula) {
    const full = withDefinitions(conj, definitions);
    for (const piece of splitCases(full)) {
      const cert = refuteWithSplits(piece, sortsFor(piece, sorts));
      if (cert === undefined) {
        return undefined;
      }
      certs.push(cert);
    }
  }
  return certs.length === 0 ? [contradictionCertificate()] : certs;
};

/** Checks whether a formula is UNSAT (and returns certificates if available). */
const checkFormulaUnsat = (
  formula: Formula,
  definitions: ReadonlyMap<string, readonly Constraint[]>,
  sorts: ReadonlyMap<string, Sort>
):
  | {
      readonly certificates?: readonly ProofCertificate[];
      readonly unsat: true;
    }
  | {
      readonly assignment: ReadonlyMap<string, Rational>;
      readonly unsat: false;
    } => {
  for (const conj of formula) {
    const full = withDefinitions(conj, definitions);
    const ans = solve(full, sortsFor(full, sorts));
    if (ans !== undefined) {
      return { assignment: ans, unsat: false };
    }
  }
  const certificates = certifyUnsat(formula, definitions, sorts);
  return certificates === undefined
    ? { unsat: true }
    : { certificates, unsat: true };
};

/** Evaluates a list of goals under a symbolic context into a single DNF formula. */
const evaluateGoals = (
  goals: readonly Literal[],
  defines: Solved["defines"],
  context: Context
): Effect.Effect<Formula, Error> =>
  Effect.gen(function* () {
    let formula: Formula = TRUE;
    for (const [name, value, by] of defines) {
      if (isForm(by, "in")) {
        return yield* Effect.fail(
          new Error("inductive proof does not support `in` over symbolic lists")
        );
      }
      const cases = yield* symbolicTerm(value, context);
      (context.symbols as Map<string, Cases>).set(name, cases);
    }
    for (const goal of goals) {
      const cases = yield* symbolicTerm(goal, context);
      const goalFormula = yield* formulaOf(cases);
      formula = and(formula, goalFormula);
      if (formula.length === 0) {
        return FALSE;
      }
    }
    return formula;
  });

/**
 * Extracts a linear/polynomial equality `r = poly` when `a` and `b` equate a
 * fresh IH variable `r` (coefficient ±1) to a polynomial not mentioning `r`.
 */
const extractPolyEquality = (
  a: NumberSym,
  b: NumberSym,
  ihVars: ReadonlySet<string>
): readonly [string, NumberSym] | undefined => {
  const diff = polySub(a, b);
  for (const v of ihVars) {
    const coeff = diff.linear.coefficients.get(v);
    if (coeff === undefined || isZero(coeff)) {
      continue;
    }
    const appearsNonlinear =
      diff.nonlinear !== undefined &&
      [...diff.nonlinear.keys()].some((k) => k.split("*").includes(v));
    if (appearsNonlinear) {
      continue;
    }
    // coeff * v + rest = 0  ==>  v = -rest / coeff
    const rest = polySub(diff, numberSym(times(variable(v), coeff)));
    const rhs = polyScale(rest, divide(negate(ONE), coeff));
    return [v, rhs];
  }
  return undefined;
};

const constraintLowerBound = (
  c: Constraint,
  varName: string
): bigint | undefined => {
  if (
    c.linear.coefficients.size !== 1 ||
    !c.linear.coefficients.has(varName) ||
    (c.relation !== ">=" && c.relation !== ">" && c.relation !== "=")
  ) {
    return undefined;
  }
  const a = c.linear.coefficients.get(varName) as Rational;
  if (a.n <= 0n) {
    return undefined;
  }
  const bound = divide(negate(c.linear.constant), a);
  const q = bound.n / bound.d;
  const r = bound.n % bound.d;
  if (c.relation === ">") {
    return r < 0n ? q : q + 1n;
  }
  return r > 0n ? q + 1n : q;
};

const conjunctionLowerBound = (
  conj: readonly Constraint[],
  varName: string
): bigint | undefined => {
  let conjBest: bigint | undefined;
  for (const c of conj) {
    const lb = constraintLowerBound(c, varName);
    if (lb !== undefined && (conjBest === undefined || lb > conjBest)) {
      conjBest = lb;
    }
  }
  return conjBest;
};

/**
 * Extracts a tight integer lower bound `base` for integer variable `varName`
 * from the non-recursive goals of `step`.
 */
const findIntegerLowerBound = (
  varName: string,
  schema: unknown,
  goals: readonly Literal[],
  baseContext: Context
): Effect.Effect<bigint | undefined, never> =>
  Effect.gen(function* () {
    const sorts = new Map(baseContext.sorts);
    sorts.set(varName, "integer");
    const sym = numberSym(variable(varName));
    const ctx: Context = {
      ...baseContext,
      definitions: new Map(baseContext.definitions),
      floors: new Map(baseContext.floors),
      sorts,
      symbols: new Map([[varName, one(sym)]]),
    };
    let formula: Formula = TRUE;
    const fitRes = yield* Effect.result(fitsOf(sym, schema, ctx, 0));
    if (Result.isSuccess(fitRes)) {
      formula = and(formula, fitRes.success);
    }
    for (const goal of goals) {
      const res = yield* Effect.result(
        Effect.flatMap(symbolicTerm(goal, ctx), formulaOf)
      );
      if (Result.isSuccess(res)) {
        formula = and(formula, res.success);
      }
    }
    let best: bigint | undefined;
    for (const conj of formula) {
      const conjBest = conjunctionLowerBound(conj, varName);
      if (conjBest === undefined) {
        return undefined;
      }
      if (best === undefined || conjBest < best) {
        best = conjBest;
      }
    }
    return best;
  });

const boundedUnfoldArrayOf = (
  elem: unknown,
  path: string,
  sorts: Map<string, Sort>,
  depthLeft: number
): Cases => {
  const out: { readonly sym: Sym; readonly when: Formula }[] = [];
  for (let len = 0; len <= depthLeft; len += 1) {
    const itemCases: Cases[] = [];
    for (let i = 0; i < len; i += 1) {
      itemCases.push(
        boundedUnfold(elem, `${path}#${len}.${i}`, sorts, depthLeft - 1)
      );
    }
    for (const { syms, when } of product(itemCases)) {
      out.push({ sym: { items: syms, kind: "list" }, when });
    }
  }
  return out;
};

const boundedUnfoldFn = (
  schema: (...args: never[]) => unknown,
  built: ReturnType<typeof buildOf>,
  path: string,
  sorts: Map<string, Sort>,
  depthLeft: number
): Cases => {
  const fnName = nameOf(schema);
  if (fnName === "value/integer?" || fnName === "value/number?") {
    sorts.set(path, fnName === "value/integer?" ? "integer" : "real");
    return one(numberSym(variable(path)));
  }
  if (built === undefined) {
    return [];
  }
  const bName = nameOf(built.by);
  if (bName === "schema/anyOf") {
    return built.args.flatMap((arg, i) =>
      boundedUnfold(arg, `${path}/${i}`, sorts, depthLeft)
    );
  }
  if (bName === "schema/allOf") {
    for (const arg of built.args) {
      const c = boundedUnfold(arg, path, sorts, depthLeft);
      if (c.length > 0) {
        return c;
      }
    }
  }
  return [];
};

/**
 * Generates bounded concrete/symbolic instances of a recursive schema or
 * unbounded list up to small depth to catch genuine counterexamples fast.
 */
const boundedUnfold = (
  schema: unknown,
  path: string,
  sorts: Map<string, Sort>,
  depthLeft: number
): Cases => {
  const built = buildOf(throughNames(schema));
  if (built !== undefined && nameOf(built.by) === "schema/arrayOf") {
    return boundedUnfoldArrayOf(built.args[0], path, sorts, depthLeft);
  }
  const named = schemaOf(schema);
  if (named !== undefined && named.shape !== undefined) {
    return depthLeft <= 0
      ? []
      : boundedUnfold(named.shape, path, sorts, depthLeft - 1);
  }
  if (typeof schema === "function") {
    return boundedUnfoldFn(
      schema as (...args: never[]) => unknown,
      built,
      path,
      sorts,
      depthLeft
    );
  }
  if (isPlainObject(schema)) {
    const entries = Object.entries(schema);
    const parts = entries.map(([k, v]) =>
      boundedUnfold(v, `${path}.${k}`, sorts, depthLeft)
    );
    if (parts.some((p) => p.length === 0)) {
      return [];
    }
    return product(parts).map(({ syms, when }) => ({
      sym: {
        fields: new Map(entries.map(([k], i) => [k, syms[i] as Sym])),
        kind: "record" as const,
      },
      when,
    }));
  }
  if (Array.isArray(schema)) {
    const parts = schema.map((item, i) =>
      boundedUnfold(item, `${path}.${i}`, sorts, depthLeft)
    );
    if (parts.some((p) => p.length === 0)) {
      return [];
    }
    return product(parts).map(({ syms, when }) => ({
      sym: { items: syms, kind: "list" as const },
      when,
    }));
  }
  return [{ sym: { kind: "value" as const, value: schema }, when: TRUE }];
};

const witnessValueOf = (
  domainKind: "schema" | "list" | "integer",
  sym: Sym
): unknown => {
  if (domainKind === "integer" && sym.kind === "number") {
    return toNumber(sym.linear.constant);
  }
  return sym.kind === "value" ? sym.value : undefined;
};

/**
 * Checks if any bounded concrete unfolding of the inducted variable satisfies
 * `goals` (i.e. yields a genuine counterexample).
 */
const findBoundedCounterexample = (
  varName: string,
  domain:
    | { readonly kind: "schema"; readonly schema: unknown }
    | { readonly kind: "list"; readonly schema: unknown }
    | {
        readonly base: bigint;
        readonly kind: "integer";
        readonly schema: unknown;
      },
  otherSymbols: ReadonlyMap<string, Cases>,
  goals: readonly Literal[],
  defines: Solved["defines"],
  baseContext: Context
): Effect.Effect<Record<string, unknown> | undefined, never> =>
  Effect.gen(function* () {
    const sorts = new Map(baseContext.sorts);
    const instances: Cases =
      domain.kind === "integer"
        ? [0n, 1n, 2n, 3n, 4n].map((d) => ({
            sym: numberSym(constant(ratio(domain.base + d))),
            when: TRUE,
          }))
        : boundedUnfold(domain.schema, varName, sorts, 3);
    for (const inst of instances) {
      const localSorts = new Map(sorts);
      const ctx: Context = {
        ...baseContext,
        definitions: new Map(baseContext.definitions),
        floors: new Map(baseContext.floors),
        sorts: localSorts,
        symbols: new Map([...otherSymbols, [varName, [inst]]]),
      };
      const fitRes = yield* Effect.result(
        fitsOf(inst.sym, domain.schema, ctx, 0)
      );
      if (Result.isFailure(fitRes)) {
        continue;
      }
      const goalRes = yield* Effect.result(evaluateGoals(goals, defines, ctx));
      if (Result.isFailure(goalRes)) {
        continue;
      }
      const combined = and(and(inst.when, fitRes.success), goalRes.success);
      if (!checkFormulaUnsat(combined, ctx.definitions, localSorts).unsat) {
        const val = witnessValueOf(domain.kind, inst.sym);
        return val === undefined ? {} : { [`?${varName}`]: val };
      }
    }
    return undefined;
  });

const unfoldFailure = (what: string, error: unknown): InductionResult => ({
  reason: `cannot unfold ${what}: ${error instanceof Error ? error.message : String(error)}`,
  status: "refused",
});

const stepUnproved = (label: string): InductionResult => ({
  reason: `induction step "${label}" could not be proved (the property may need a stronger invariant)`,
  status: "refused",
});

interface StructuralCtor {
  readonly label: string;
  readonly sym: Sym;
  readonly when: Formula;
}

const buildStructuralConstructors = (
  varName: string,
  schema: unknown,
  isList: boolean,
  ctorSorts: Map<string, Sort>,
  baseContext: Context
): Effect.Effect<readonly StructuralCtor[] | InductionResult, never> =>
  Effect.gen(function* () {
    const shapeCtx: Context = {
      ...baseContext,
      broad: true,
      definitions: new Map(baseContext.definitions),
      floors: new Map(baseContext.floors),
      sorts: ctorSorts,
      symbols: new Map(),
    };
    if (isList) {
      const elemSchema = buildOf(throughNames(schema))?.args[0];
      const elemShape = yield* Effect.result(
        shapeFor(`${varName}.head`, elemSchema, shapeCtx)
      );
      if (Result.isFailure(elemShape)) {
        return unfoldFailure("list element schema", elemShape.failure);
      }
      const tailLenName = `${varName}.tail#len`;
      ctorSorts.set(tailLenName, "integer");
      const tailSym: Extract<Sym, { readonly kind: "inductive" }> = {
        depth: 1,
        kind: "inductive",
        length: variable(tailLenName),
        name: `${varName}.tail`,
        schema,
      };
      const lenNonNeg = atom({ linear: variable(tailLenName), relation: ">=" });
      return [
        { label: "base: []", sym: { items: [], kind: "list" }, when: TRUE },
        ...elemShape.success.cases.map((ec, i) => ({
          label:
            elemShape.success.cases.length === 1
              ? "step(cons)"
              : `step(${i + 1}:cons)`,
          sym: {
            items: [ec.sym],
            kind: "list" as const,
            rest: elemSchema,
            tail: tailSym,
          },
          when: and(ec.when, lenNonNeg),
        })),
      ];
    }
    const shaped = yield* Effect.result(shapeFor(varName, schema, shapeCtx));
    if (Result.isFailure(shaped)) {
      return unfoldFailure("recursive schema", shaped.failure);
    }
    return shaped.success.cases.map((c, i) => ({
      label:
        collectInductive(c.sym).length === 0
          ? `base ${i + 1}`
          : `step ${i + 1}`,
      sym: c.sym,
      when: c.when,
    }));
  });

const ensureStructuralVerified = (
  fn: unknown,
  info: LambdaInfo,
  idx: number,
  args: readonly Sym[],
  constructors: readonly StructuralCtor[],
  verified: Map<unknown, VerifiedFunction & { readonly id: number }>,
  guards: GuardInfo[],
  localCtx: Context
): Effect.Effect<VerifiedFunction & { readonly id: number }, Error> =>
  Effect.gen(function* () {
    const existing = verified.get(info.body);
    if (existing !== undefined) {
      return existing;
    }
    const check = yield* verifyStructuralFunction(
      fn,
      info,
      idx,
      constructors,
      args,
      localCtx
    );
    if (typeof check === "string") {
      return yield* Effect.fail(new Error(check));
    }
    const created = { ...check, id: verified.size };
    verified.set(info.body, created);
    guards.push(check.guard);
    return created;
  });

const makeStructuralInterceptor = (
  subNames: ReadonlySet<string>,
  constructors: readonly StructuralCtor[],
  verified: Map<unknown, VerifiedFunction & { readonly id: number }>,
  guards: GuardInfo[],
  memo: Map<string, Sym>,
  localSorts: Map<string, Sort>,
  localCtx: Context
): NonNullable<Context["inductive"]> => {
  let callCounter = 0;
  return {
    call: (rawFn, rawInfo, rawArgs) =>
      Effect.gen(function* () {
        const unwrapped = unwrapRecursiveCall(rawFn, rawInfo, rawArgs);
        if (unwrapped === undefined) {
          return undefined;
        }
        const { args, fn, info } = unwrapped;
        const idx = args.findIndex(
          (a) => a.kind === "inductive" && subNames.has(a.name)
        );
        if (idx < 0) {
          return undefined;
        }
        const subArg = args[idx] as Extract<
          Sym,
          { readonly kind: "inductive" }
        >;
        const infoVerified = yield* ensureStructuralVerified(
          fn,
          info,
          idx,
          args,
          constructors,
          verified,
          guards,
          localCtx
        );
        const key = `f${infoVerified.id}#${subArg.name}#${args.map((a, i) => (i === idx ? "_" : show(a))).join(",")}`;
        let sym = memo.get(key);
        if (sym === undefined) {
          callCounter += 1;
          sym = freshReturnSym(
            infoVerified.returnSort,
            `ih$r${callCounter}`,
            localSorts
          );
          memo.set(key, sym);
        }
        return one(sym);
      }),
  };
};

const checkStructuralCtor = (
  ctor: StructuralCtor,
  constructors: readonly StructuralCtor[],
  varName: string,
  schema: unknown,
  isList: boolean,
  otherSymbols: ReadonlyMap<string, Cases>,
  goals: readonly Literal[],
  defines: Solved["defines"],
  ctorSorts: ReadonlyMap<string, Sort>,
  verified: Map<unknown, VerifiedFunction & { readonly id: number }>,
  guards: GuardInfo[],
  baseContext: Context
): Effect.Effect<InductionCaseProof | InductionResult, never> =>
  Effect.gen(function* () {
    const subValues = collectInductive(ctor.sym);
    const subNames = new Set(subValues.map((s) => s.name));
    const localSorts = new Map(ctorSorts);
    const localDefs = new Map(baseContext.definitions);
    const localFloors = new Map(baseContext.floors);
    const guardCtx: Context = {
      ...baseContext,
      definitions: localDefs,
      floors: localFloors,
      sorts: localSorts,
    };
    const interceptor = makeStructuralInterceptor(
      subNames,
      constructors,
      verified,
      guards,
      new Map<string, Sym>(),
      localSorts,
      guardCtx
    );
    const stepCtx: Context = {
      ...guardCtx,
      inductive: interceptor,
      symbols: new Map([...otherSymbols, [varName, one(ctor.sym)]]),
    };
    const badRes = yield* Effect.result(evaluateGoals(goals, defines, stepCtx));
    if (Result.isFailure(badRes)) {
      return { reason: errorText(badRes.failure), status: "refused" as const };
    }
    let combined = and(ctor.when, badRes.success);
    for (const sub of subValues) {
      const ihCtx: Context = {
        ...guardCtx,
        inductive: interceptor,
        symbols: new Map([...otherSymbols, [varName, one(sub)]]),
      };
      const subBad = yield* Effect.result(evaluateGoals(goals, defines, ihCtx));
      if (Result.isFailure(subBad)) {
        return {
          reason: errorText(subBad.failure),
          status: "refused" as const,
        };
      }
      combined = and(combined, not(subBad.success));
    }
    const verdict = checkFormulaUnsat(combined, localDefs, localSorts);
    if (!verdict.unsat) {
      const witness = yield* findBoundedCounterexample(
        varName,
        { kind: isList ? "list" : "schema", schema },
        otherSymbols,
        goals,
        defines,
        baseContext
      );
      return witness === undefined
        ? stepUnproved(ctor.label)
        : { status: "disproved" as const, witness };
    }
    return {
      case: ctor.label,
      ...(verdict.certificates === undefined
        ? {}
        : { certificates: verdict.certificates }),
    } satisfies InductionCaseProof;
  });

/**
 * Attempts structural induction over a recursive schema or unbounded `arrayOf`.
 */
const proveStructural = (
  varName: string,
  schema: unknown,
  isList: boolean,
  otherSymbols: ReadonlyMap<string, Cases>,
  goals: readonly Literal[],
  defines: Solved["defines"],
  baseContext: Context
): Effect.Effect<InductionResult, never> =>
  Effect.gen(function* () {
    if (isStructurallyUninhabited(schema)) {
      return {
        proof: {
          basis: "schema",
          cases: [{ case: "uninhabited" }],
          guards: [],
          kind: "induction",
          target: cleanVar(varName),
        },
        status: "proved",
      } satisfies InductionResult;
    }

    const ctorSorts = new Map(baseContext.sorts);
    const builtCtors = yield* buildStructuralConstructors(
      varName,
      schema,
      isList,
      ctorSorts,
      baseContext
    );
    if (!Array.isArray(builtCtors)) {
      return builtCtors as InductionResult;
    }

    const verified = new Map<
      unknown,
      VerifiedFunction & { readonly id: number }
    >();
    const guards: GuardInfo[] = [];
    const caseProofs: InductionCaseProof[] = [];

    for (const ctor of builtCtors) {
      const res = yield* checkStructuralCtor(
        ctor,
        builtCtors,
        varName,
        schema,
        isList,
        otherSymbols,
        goals,
        defines,
        ctorSorts,
        verified,
        guards,
        baseContext
      );
      if ("status" in res) {
        return res;
      }
      caseProofs.push(res);
    }

    return {
      proof: {
        basis: isList ? "list" : "schema",
        cases: caseProofs,
        guards,
        kind: "induction",
        target: `?${varName}`,
      },
      status: "proved",
    };
  });

const isExactLinearK = (linear: Linear, kLinear: Linear): boolean => {
  const diff = minus(linear, kLinear);
  return diff.coefficients.size === 0 && isZero(diff.constant);
};

const findNumericParamIndex = (
  args: readonly Sym[],
  kName: string,
  kLinear: Linear,
  discoverOnly: boolean
): number => {
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === undefined || a.kind !== "number" || a.nonlinear !== undefined) {
      continue;
    }
    if (
      isExactLinearK(a.linear, kLinear) ||
      (discoverOnly && a.linear.coefficients.has(kName))
    ) {
      return i;
    }
  }
  return -1;
};

interface NumericInductiveState {
  readonly base: bigint;
  readonly baseContext: Context;
  callCounter: number;
  readonly guards: GuardInfo[];
  readonly ihVars: Set<string>;
  readonly kLinear: Linear;
  readonly kName: string;
  readonly localDefs: Map<string, readonly Constraint[]>;
  readonly localFloors: Map<string, string>;
  readonly localSorts: Map<string, Sort>;
  readonly memo: Map<string, { readonly sym: Sym; readonly varName: string }>;
  readonly verified: Map<unknown, VerifiedFunction & { readonly id: number }>;
}

const ensureNumericVerified = (
  state: NumericInductiveState,
  fn: unknown,
  info: LambdaInfo,
  idx: number,
  args: readonly Sym[]
): Effect.Effect<VerifiedFunction & { readonly id: number }, Error> =>
  Effect.gen(function* () {
    const existing = state.verified.get(info.body);
    if (existing !== undefined) {
      return existing;
    }
    const check = yield* verifyNumericFunction(
      fn,
      info,
      idx,
      state.base,
      args,
      {
        ...state.baseContext,
        definitions: state.localDefs,
        floors: state.localFloors,
        sorts: state.localSorts,
      }
    );
    if (typeof check === "string") {
      return yield* Effect.fail(new Error(check));
    }
    const created = { ...check, id: state.verified.size };
    state.verified.set(info.body, created);
    state.guards.push(check.guard);
    return created;
  });

const makeNumericInterceptor = (
  state: NumericInductiveState,
  allowOnK: boolean,
  substitutions?: ReadonlyMap<string, NumberSym>,
  discoverOnly = false
): NonNullable<Context["inductive"]> => ({
  call: (rawFn, rawInfo, rawArgs) =>
    Effect.gen(function* () {
      const unwrapped = unwrapRecursiveCall(rawFn, rawInfo, rawArgs);
      if (unwrapped === undefined) {
        return undefined;
      }
      const { args, fn, info } = unwrapped;
      const idx = findNumericParamIndex(
        args,
        state.kName,
        state.kLinear,
        discoverOnly
      );
      if (idx < 0) {
        return undefined;
      }
      const entry = yield* ensureNumericVerified(state, fn, info, idx, args);
      if (
        !allowOnK &&
        discoverOnly &&
        !isExactLinearK((args[idx] as NumberSym).linear, state.kLinear)
      ) {
        return undefined;
      }
      const key = `f${entry.id}#k#${args.map((a, i) => (i === idx ? "_" : show(a))).join(",")}`;
      let cached = state.memo.get(key);
      if (cached === undefined) {
        state.callCounter += 1;
        const rName = `ih$r${state.callCounter}`;
        const sym = freshReturnSym(entry.returnSort, rName, state.localSorts);
        cached = { sym, varName: rName };
        state.memo.set(key, cached);
        state.ihVars.add(rName);
      }
      const sub = substitutions?.get(cached.varName);
      return one(sub ?? cached.sym);
    }),
  ...(substitutions === undefined ? {} : { substitutions }),
});

const checkNumericBaseCase = (
  varName: string,
  schema: unknown,
  base: bigint,
  otherSymbols: ReadonlyMap<string, Cases>,
  goals: readonly Literal[],
  defines: Solved["defines"],
  baseContext: Context
): Effect.Effect<InductionCaseProof | InductionResult, never> =>
  Effect.gen(function* () {
    const baseRat = ratio(base);
    const baseSorts = new Map(baseContext.sorts);
    const baseDefs = new Map(baseContext.definitions);
    const baseFloors = new Map(baseContext.floors);
    const baseSym = numberSym(constant(baseRat));
    const baseCtx: Context = {
      ...baseContext,
      definitions: baseDefs,
      floors: baseFloors,
      sorts: baseSorts,
      symbols: new Map([...otherSymbols, [varName, one(baseSym)]]),
    };
    const fitRes = yield* Effect.result(fitsOf(baseSym, schema, baseCtx, 0));
    if (Result.isFailure(fitRes)) {
      return { reason: errorText(fitRes.failure), status: "refused" as const };
    }
    const badRes = yield* Effect.result(evaluateGoals(goals, defines, baseCtx));
    if (Result.isFailure(badRes)) {
      return { reason: errorText(badRes.failure), status: "refused" as const };
    }
    const verdict = checkFormulaUnsat(
      and(fitRes.success, badRes.success),
      baseDefs,
      baseSorts
    );
    if (!verdict.unsat) {
      return {
        status: "disproved" as const,
        witness: { [`?${varName}`]: toNumber(baseRat) },
      };
    }
    return {
      case: `base(?${varName}=${base})`,
      ...(verdict.certificates === undefined
        ? {}
        : { certificates: verdict.certificates }),
    } satisfies InductionCaseProof;
  });

const checkNumericStepBranch = (
  branch: IHBranch,
  state: NumericInductiveState,
  varName: string,
  schema: unknown,
  kPlus1Sym: Sym,
  kGeBaseFormula: Formula,
  otherSymbols: ReadonlyMap<string, Cases>,
  goals: readonly Literal[],
  defines: Solved["defines"]
): Effect.Effect<
  | { readonly certificates?: readonly ProofCertificate[]; readonly ok: true }
  | InductionResult,
  never
> =>
  Effect.gen(function* () {
    const stepCtx: Context = {
      ...state.baseContext,
      definitions: new Map(state.localDefs),
      floors: new Map(state.localFloors),
      inductive: makeNumericInterceptor(state, false, branch.subs),
      sorts: new Map(state.localSorts),
      symbols: new Map([...otherSymbols, [varName, one(kPlus1Sym)]]),
    };
    const fitRes = yield* Effect.result(fitsOf(kPlus1Sym, schema, stepCtx, 0));
    if (Result.isFailure(fitRes)) {
      return { reason: errorText(fitRes.failure), status: "refused" as const };
    }
    const stepRes = yield* evaluateStepUnderBranch(
      goals,
      defines,
      and(and(kGeBaseFormula, branch.when), fitRes.success),
      stepCtx
    );
    if (typeof stepRes === "string") {
      return { reason: stepRes, status: "refused" as const };
    }
    if (stepRes.unsat) {
      return {
        ...(stepRes.certificates === undefined
          ? {}
          : { certificates: stepRes.certificates }),
        ok: true as const,
      };
    }
    if (branch.unique) {
      const kVal = stepRes.assignment.get(state.kName);
      return {
        status: "disproved" as const,
        witness:
          kVal === undefined
            ? {}
            : {
                [`?${varName}`]: toNumber(
                  plus(constant(kVal), constant(ONE)).constant
                ),
              },
      };
    }
    const witness = yield* findBoundedCounterexample(
      varName,
      { base: state.base, kind: "integer", schema },
      otherSymbols,
      goals,
      defines,
      state.baseContext
    );
    return witness === undefined
      ? stepUnproved(`?${varName}=k+1`)
      : { status: "disproved" as const, witness };
  });

const runNumericStepBranches = (
  ihBranches: readonly IHBranch[],
  state: NumericInductiveState,
  varName: string,
  schema: unknown,
  kPlus1Sym: Sym,
  kGeBaseFormula: Formula,
  otherSymbols: ReadonlyMap<string, Cases>,
  goals: readonly Literal[],
  defines: Solved["defines"]
): Effect.Effect<InductionCaseProof | InductionResult, never> =>
  Effect.gen(function* () {
    let stepCerts: ProofCertificate[] | undefined = [];
    for (const branch of ihBranches) {
      const res = yield* checkNumericStepBranch(
        branch,
        state,
        varName,
        schema,
        kPlus1Sym,
        kGeBaseFormula,
        otherSymbols,
        goals,
        defines
      );
      if ("status" in res) {
        return res;
      }
      if (stepCerts !== undefined && res.certificates !== undefined) {
        stepCerts.push(...res.certificates);
      } else {
        stepCerts = undefined;
      }
    }
    return {
      case: `step(?${varName}=k+1)`,
      ...(stepCerts === undefined ? {} : { certificates: stepCerts }),
    } satisfies InductionCaseProof;
  });

/**
 * Attempts numeric induction on integer `?n >= base` for goals calling a
 * guarded recursive lambda on `?n`. Supports both linear inequalities and
 * polynomial equality cancellation (`sum-odd(n) = n^2`, etc.).
 */
const proveNumeric = (
  varName: string,
  schema: unknown,
  base: bigint,
  otherSymbols: ReadonlyMap<string, Cases>,
  goals: readonly Literal[],
  defines: Solved["defines"],
  baseContext: Context
): Effect.Effect<InductionResult, never> =>
  Effect.gen(function* () {
    const baseRat = ratio(base);
    const kName = `${varName}$k`;
    const kLinear = variable(kName);
    const kSym = numberSym(kLinear);
    const kPlus1Sym = numberSym(plus(kLinear, constant(ONE)));
    const kGeBaseFormula = atom({
      linear: minus(kLinear, constant(baseRat)),
      relation: ">=",
    });

    const localSorts = new Map(baseContext.sorts);
    localSorts.set(kName, "integer");
    const state: NumericInductiveState = {
      base,
      baseContext,
      callCounter: 0,
      guards: [],
      ihVars: new Set<string>(),
      kLinear,
      kName,
      localDefs: new Map(baseContext.definitions),
      localFloors: new Map(baseContext.floors),
      localSorts,
      memo: new Map(),
      verified: new Map(),
    };

    const probeCtx: Context = {
      ...baseContext,
      definitions: state.localDefs,
      floors: state.localFloors,
      inductive: makeNumericInterceptor(state, false, undefined, true),
      sorts: state.localSorts,
      symbols: new Map([...otherSymbols, [varName, one(kPlus1Sym)]]),
    };
    const probeRes = yield* Effect.result(
      evaluateGoals(goals, defines, probeCtx)
    );
    if (state.verified.size === 0) {
      return {
        reason: Result.isFailure(probeRes)
          ? errorText(probeRes.failure)
          : "no guarded recursive function found for numeric induction",
        status: "refused",
      };
    }

    const baseCase = yield* checkNumericBaseCase(
      varName,
      schema,
      base,
      otherSymbols,
      goals,
      defines,
      baseContext
    );
    if ("status" in baseCase) {
      return baseCase;
    }

    const ihBranches = yield* buildNumericIHBranches(
      varName,
      schema,
      kSym,
      kGeBaseFormula,
      otherSymbols,
      goals,
      defines,
      state
    );
    if (typeof ihBranches === "string") {
      return { reason: ihBranches, status: "refused" };
    }

    const stepCase = yield* runNumericStepBranches(
      ihBranches,
      state,
      varName,
      schema,
      kPlus1Sym,
      kGeBaseFormula,
      otherSymbols,
      goals,
      defines
    );
    if ("status" in stepCase) {
      return stepCase;
    }

    return {
      proof: {
        basis: "integer",
        cases: [baseCase, stepCase],
        guards: state.guards,
        kind: "induction",
        target: `?${varName}`,
      },
      status: "proved",
    };
  });

const candidateFromArg = (arg: Sym): unknown => {
  if (arg.kind === "value" && typeof arg.value === "function") {
    return arg.value;
  }
  return isClosureSym(arg) ? arg : undefined;
};

const mapWrapperArgs = (
  innerInfo: LambdaInfo,
  outerInfo: LambdaInfo,
  args: readonly Sym[]
): readonly Sym[] | undefined => {
  const mapped: Sym[] = [];
  for (const p of innerInfo.parameters) {
    const at = outerInfo.parameters.indexOf(p);
    if (at < 0 || args[at] === undefined) {
      return undefined;
    }
    mapped.push(args[at] as Sym);
  }
  return mapped;
};

/**
 * Normalizes a call `(fn, info, args)` when `fn` is either a recursive lambda
 * directly or a `suspendIn`-created wrapper carrying the recursive lambda and
 * its closed-over bindings as extra parameters. Returns the canonical recursive
 * `{ fn, info, args }` (matching `info.parameters`), or undefined if not recursive.
 */
const unwrapRecursiveCall = (
  fn: unknown,
  info: LambdaInfo,
  args: readonly Sym[]
):
  | {
      readonly args: readonly Sym[];
      readonly fn: unknown;
      readonly info: LambdaInfo;
    }
  | undefined => {
  for (const arg of args) {
    const candidate = candidateFromArg(arg);
    if (candidate === undefined) {
      continue;
    }
    const innerInfo = isClosureSym(candidate)
      ? candidate.info
      : lambdaInfo(candidate);
    if (
      innerInfo !== undefined &&
      innerInfo.body === info.body &&
      innerInfo.parameters.length < info.parameters.length
    ) {
      const mappedArgs = mapWrapperArgs(innerInfo, info, args);
      return mappedArgs === undefined
        ? undefined
        : { args: mappedArgs, fn: candidate, info: innerInfo };
    }
  }
  return mentionsSelf(fn, info) ? { args, fn, info } : undefined;
};

/** True when `info.body` mentions a name that resolves to a lambda with the same body. */
const mentionsSelf = (fn: unknown, info: LambdaInfo): boolean => {
  const scope = scopeOf(fn);
  const walk = (node: unknown): boolean => {
    if (typeof node === "string") {
      const resolved = resolveIn(node, info.environment, scope);
      if (resolved === UNBOUND) {
        return false;
      }
      if (resolved === fn) {
        return true;
      }
      if (isClosureSym(resolved) && resolved.info?.body === info.body) {
        return true;
      }
      return (
        typeof resolved === "function" &&
        lambdaInfo(resolved)?.body === info.body
      );
    }
    if (Array.isArray(node)) {
      return node[0] !== "quote" && node.some(walk);
    }
    if (isPlainObject(node)) {
      return Object.values(node).some(walk);
    }
    return false;
  };
  return walk(info.body);
};

interface IHBranch {
  readonly subs: ReadonlyMap<string, NumberSym>;
  readonly unique: boolean;
  readonly when: Formula;
}

/** Extracts `[left, right]` from `not (= a b)` or `not (number/equals? a b)`. */
const extractDeniedEquality = (
  goal: Literal
): readonly [unknown, unknown] | undefined => {
  if (!isForm(goal, "not")) {
    return undefined;
  }
  const inner = goal.parts[0];
  if (isForm(inner, "=")) {
    return [inner.parts[0], inner.parts[1]];
  }
  if (
    inner instanceof DeferredCall &&
    nameOf(inner.fn) === "number/equals?" &&
    inner.args.length === 2
  ) {
    return [inner.args[0], inner.args[1]];
  }
  return undefined;
};

const extractBranchesFromPairs = (
  leftCases: Cases,
  rightCases: Cases,
  kGeBaseFormula: Formula,
  state: NumericInductiveState
): readonly IHBranch[] | undefined => {
  const branches: IHBranch[] = [];
  for (const {
    syms: [a, b],
    when,
  } of product([leftCases, rightCases])) {
    const cond = and(kGeBaseFormula, when);
    if (checkFormulaUnsat(cond, state.localDefs, state.localSorts).unsat) {
      continue;
    }
    if (a?.kind !== "number" || b?.kind !== "number") {
      return undefined;
    }
    const eq = extractPolyEquality(a, b, state.ihVars);
    if (eq === undefined) {
      return undefined;
    }
    branches.push({
      subs: new Map([eq]),
      unique: state.ihVars.size === 1,
      when: cond,
    });
  }
  return branches.length > 0 ? branches : undefined;
};

const tryPolyEqualityIHBranches = (
  eqGoalIndex: number,
  varName: string,
  schema: unknown,
  kSym: Sym,
  kGeBaseFormula: Formula,
  otherSymbols: ReadonlyMap<string, Cases>,
  goals: readonly Literal[],
  state: NumericInductiveState
): Effect.Effect<readonly IHBranch[] | undefined, never> =>
  Effect.gen(function* () {
    const [eqLeft, eqRight] = extractDeniedEquality(
      goals[eqGoalIndex] as Literal
    ) as readonly [unknown, unknown];
    const preGoals = goals.filter((_, i) => i !== eqGoalIndex);
    const preCtx: Context = {
      ...state.baseContext,
      definitions: state.localDefs,
      floors: state.localFloors,
      inductive: makeNumericInterceptor(state, true),
      sorts: state.localSorts,
      symbols: new Map([...otherSymbols, [varName, one(kSym)]]),
    };
    const fitK = yield* Effect.result(fitsOf(kSym, schema, preCtx, 0));
    const preRes = yield* Effect.result(evaluateGoals(preGoals, [], preCtx));
    if (Result.isFailure(fitK) || Result.isFailure(preRes)) {
      return undefined;
    }
    const preFormula = and(and(kGeBaseFormula, fitK.success), preRes.success);
    if (
      !checkFormulaUnsat(
        and(kGeBaseFormula, not(preFormula)),
        state.localDefs,
        state.localSorts
      ).unsat
    ) {
      return undefined;
    }
    const leftCases = yield* Effect.result(symbolicTerm(eqLeft, preCtx));
    const rightCases = yield* Effect.result(symbolicTerm(eqRight, preCtx));
    if (Result.isFailure(leftCases) || Result.isFailure(rightCases)) {
      return undefined;
    }
    return extractBranchesFromPairs(
      leftCases.success,
      rightCases.success,
      kGeBaseFormula,
      state
    );
  });

/**
 * Builds the Induction Hypothesis branches for `¬Bad(k)`.
 * Handles both standard linear IH formulas and nonlinear equality IHs
 * (`not (sum-odd(k) = f(k))` -> `IH: r_0 = f(k)` per branch of `f(k)`).
 */
const buildNumericIHBranches = (
  varName: string,
  schema: unknown,
  kSym: Sym,
  kGeBaseFormula: Formula,
  otherSymbols: ReadonlyMap<string, Cases>,
  goals: readonly Literal[],
  defines: Solved["defines"],
  state: NumericInductiveState
): Effect.Effect<readonly IHBranch[] | string, never> =>
  Effect.gen(function* () {
    const eqGoalIndex = goals.findIndex(
      (g) => extractDeniedEquality(g) !== undefined
    );
    if (eqGoalIndex >= 0 && defines.length === 0) {
      const polyBranches = yield* tryPolyEqualityIHBranches(
        eqGoalIndex,
        varName,
        schema,
        kSym,
        kGeBaseFormula,
        otherSymbols,
        goals,
        state
      );
      if (polyBranches !== undefined) {
        return polyBranches;
      }
    }
    const ihCtx: Context = {
      ...state.baseContext,
      definitions: state.localDefs,
      floors: state.localFloors,
      inductive: makeNumericInterceptor(state, true),
      sorts: state.localSorts,
      symbols: new Map([...otherSymbols, [varName, one(kSym)]]),
    };
    const badK = yield* Effect.result(evaluateGoals(goals, defines, ihCtx));
    if (Result.isFailure(badK)) {
      return errorText(badK.failure);
    }
    return [
      {
        subs: new Map(),
        unique: false,
        when: and(kGeBaseFormula, not(badK.success)),
      },
    ];
  });

type StepVerdict =
  | {
      readonly certificates?: readonly ProofCertificate[];
      readonly unsat: true;
    }
  | {
      readonly assignment: ReadonlyMap<string, Rational>;
      readonly unsat: false;
    };

const applyPolySubs = (
  sym: NumberSym,
  subs: ReadonlyMap<string, NumberSym> | undefined
): NumberSym => {
  if (subs === undefined) {
    return sym;
  }
  let current = sym;
  for (const [v, rep] of subs) {
    current = polySubstitute(current, v, rep);
  }
  return current;
};

const checkStepEqualityCase = (
  a: Sym | undefined,
  b: Sym | undefined,
  cond: Formula,
  stepCtx: Context,
  fallbackError: string
): StepVerdict | string => {
  const condVerdict = checkFormulaUnsat(
    cond,
    stepCtx.definitions,
    stepCtx.sorts
  );
  if (condVerdict.unsat) {
    return condVerdict;
  }
  if (a?.kind !== "number" || b?.kind !== "number") {
    return fallbackError;
  }
  const subs = stepCtx.inductive?.substitutions;
  const diff = polySub(applyPolySubs(a, subs), applyPolySubs(b, subs));
  if (diff.nonlinear === undefined) {
    const neq = not(atom({ linear: diff.linear, relation: "=" }));
    return checkFormulaUnsat(
      and(cond, neq),
      stepCtx.definitions,
      stepCtx.sorts
    );
  }
  const val = evalPolyAt(diff, condVerdict.assignment);
  return val !== undefined && !isZero(val)
    ? { assignment: condVerdict.assignment, unsat: false }
    : fallbackError;
};

/**
 * Evaluates `Bad(k + 1)` under an IH branch `branchCond` (and its polynomial
 * substitutions). If a branch pins all linear variables to unique constants
 * (e.g. `k = 999999`), evaluates any remaining nonlinear comparison directly
 * at that concrete point!
 */
const evaluateStepUnderBranch = (
  goals: readonly Literal[],
  defines: Solved["defines"],
  branchCond: Formula,
  stepCtx: Context
): Effect.Effect<StepVerdict | string, never> =>
  Effect.gen(function* () {
    const direct = yield* Effect.result(evaluateGoals(goals, defines, stepCtx));
    if (Result.isSuccess(direct)) {
      return checkFormulaUnsat(
        and(branchCond, direct.success),
        stepCtx.definitions,
        stepCtx.sorts
      );
    }
    const fallbackError = errorText(direct.failure);
    const eqGoalIndex = goals.findIndex(
      (g) => extractDeniedEquality(g) !== undefined
    );
    if (eqGoalIndex < 0 || defines.length > 0) {
      return fallbackError;
    }
    const [eqLeft, eqRight] = extractDeniedEquality(
      goals[eqGoalIndex] as Literal
    ) as readonly [unknown, unknown];
    const preGoals = goals.filter((_, i) => i !== eqGoalIndex);
    const preRes = yield* Effect.result(evaluateGoals(preGoals, [], stepCtx));
    const leftRes = yield* Effect.result(symbolicTerm(eqLeft, stepCtx));
    const rightRes = yield* Effect.result(symbolicTerm(eqRight, stepCtx));
    if (
      Result.isFailure(preRes) ||
      Result.isFailure(leftRes) ||
      Result.isFailure(rightRes)
    ) {
      return fallbackError;
    }

    let allCerts: ProofCertificate[] | undefined = [];
    for (const {
      syms: [a, b],
      when,
    } of product([leftRes.success, rightRes.success])) {
      const verdict = checkStepEqualityCase(
        a,
        b,
        and(and(branchCond, preRes.success), when),
        stepCtx,
        fallbackError
      );
      if (typeof verdict === "string" || !verdict.unsat) {
        return verdict;
      }
      if (allCerts !== undefined && verdict.certificates !== undefined) {
        allCerts.push(...verdict.certificates);
      } else {
        allCerts = undefined;
      }
    }
    return allCerts === undefined
      ? { unsat: true }
      : { certificates: allCerts, unsat: true };
  });

const evalPolyAt = (
  poly: NumberSym,
  values: ReadonlyMap<string, Rational>
): Rational | undefined => {
  let total = poly.linear.constant;
  for (const [name, k] of poly.linear.coefficients) {
    const v = values.get(name);
    if (v === undefined) {
      return undefined;
    }
    total = plus(constant(total), times(constant(v), k)).constant;
  }
  if (poly.nonlinear !== undefined) {
    for (const [key, k] of poly.nonlinear) {
      let term = k;
      for (const factor of key.split("*")) {
        const v = values.get(factor);
        if (v === undefined) {
          return undefined;
        }
        term = times(constant(term), v).constant;
      }
      total = plus(constant(total), constant(term)).constant;
    }
  }
  return total;
};

const shapeOtherVars = (
  typedSchemas: readonly { readonly name: string; readonly schema: unknown }[],
  skipName: string,
  baseContext: Context
): Effect.Effect<Map<string, Cases> | string, never> =>
  Effect.gen(function* () {
    const otherSymbols = new Map<string, Cases>();
    for (const { name, schema } of typedSchemas) {
      if (name === skipName) {
        continue;
      }
      const shaped = yield* Effect.result(shapeFor(name, schema, baseContext));
      if (Result.isFailure(shaped)) {
        return errorText(shaped.failure);
      }
      otherSymbols.set(name, shaped.success.cases);
    }
    return otherSymbols;
  });

const tryNumericCandidates = (
  typedSchemas: readonly { readonly name: string; readonly schema: unknown }[],
  goals: readonly Literal[],
  defines: Solved["defines"],
  baseContext: Context
): Effect.Effect<InductionResult | undefined, never> =>
  Effect.gen(function* () {
    for (const candidate of typedSchemas) {
      const base = yield* findIntegerLowerBound(
        candidate.name,
        candidate.schema,
        goals,
        baseContext
      );
      if (base === undefined) {
        continue;
      }
      const otherSymbols = yield* shapeOtherVars(
        typedSchemas,
        candidate.name,
        baseContext
      );
      if (typeof otherSymbols === "string") {
        continue;
      }
      return yield* proveNumeric(
        candidate.name,
        candidate.schema,
        base,
        otherSymbols,
        goals,
        defines,
        baseContext
      );
    }
    return undefined;
  });

/**
 * Entry point called by `model.ts` when a universal proof step (`keeps === []`)
 * involves an inductive schema (`Tree`, `PosList`, unbounded `arrayOf`) or a
 * recursive lambda on a lower-bounded integer.
 */
export const proveByInduction = (
  step: Solved,
  evaluate: (part: unknown) => Effect.Effect<unknown, Error>
): Effect.Effect<InductionResult, never> =>
  Effect.gen(function* () {
    const baseContext: Context = {
      definitions: new Map(),
      evaluate,
      floors: new Map(),
      sorts: new Map<string, Sort>(),
      symbols: new Map(),
    };
    const typing = (literal: unknown) =>
      isForm(literal, "schema/fits?") &&
      step.symbols.includes((literal.parts[0] as LogicVariable).name);

    const typedSchemas: { readonly name: string; readonly schema: unknown }[] =
      [];
    for (const literal of step.parts) {
      if (!typing(literal)) {
        continue;
      }
      const form = literal as LogicForm;
      const schemaRes = yield* Effect.result(evaluate(form.parts[1]));
      if (Result.isFailure(schemaRes)) {
        return { reason: errorText(schemaRes.failure), status: "refused" };
      }
      typedSchemas.push({
        name: (form.parts[0] as LogicVariable).name,
        schema: schemaRes.success,
      });
    }

    const goals = (step.parts as readonly Literal[]).filter(
      (literal) =>
        !(typing(literal) || step.defines.some(([, , by]) => by === literal))
    );

    const inductiveVar = typedSchemas.find(({ schema }) =>
      isInductiveSchema(schema)
    );
    if (inductiveVar !== undefined) {
      const otherSymbols = yield* shapeOtherVars(
        typedSchemas,
        inductiveVar.name,
        baseContext
      );
      if (typeof otherSymbols === "string") {
        return { reason: otherSymbols, status: "refused" };
      }
      return yield* proveStructural(
        inductiveVar.name,
        inductiveVar.schema,
        !isRecursiveNamedSchema(inductiveVar.schema),
        otherSymbols,
        goals,
        step.defines,
        baseContext
      );
    }

    const numeric = yield* tryNumericCandidates(
      typedSchemas,
      goals,
      step.defines,
      baseContext
    );
    return (
      numeric ?? {
        reason: "no inductive schema or lower-bounded integer variable found",
        status: "refused",
      }
    );
  });
