/**
 * Static diagnostics and warnings over an analyzed program: declaration and
 * options validation shared with the runtime, rule-head / find-template /
 * ground-fact safety, duplicate lambda parameters, unreachable `cond`
 * branches after `else`, and near-miss spelling suggestions for bare calls.
 */
import { Effect, Exit, Option } from "effect";
import type {
  SemanticChild,
  SemanticNode,
  StructuralPath,
} from "@/analysis/analyze";
import { nearestName } from "@/evaluation/base-forms/primitive";
import { boundNames, type Scope } from "@/evaluation/environment";
import { anonymousRuleHead, unsafeFind, unsafeRuleHead } from "@/logic/compile";
import { factNotDataMessage } from "@/logic/database";
import {
  parseInvariantOptions,
  parseQueryOptions,
  parseQueryOptionsShape,
  parseRelationDeclaration,
} from "@/logic/query-options";
import { isNamespacedName, LogicVariable, relationOf } from "@/logic/terms";
import { SPECIAL_FORM_NAMES } from "@/schemas/evaluation";
import type { LionExpressionType } from "@/schemas/lion-expression";

const partAt = (expression: unknown, path: StructuralPath): unknown =>
  path.reduce(
    (part: unknown, step) =>
      (part as Record<string | number, unknown> | undefined)?.[step],
    expression
  );

const errorOf = <A>(effect: Effect.Effect<A, { readonly message: string }>) =>
  Option.getOrUndefined(Exit.findErrorOption(Effect.runSyncExit(effect)))
    ?.message;

/**
 * Near-miss spelling suggestion for an unbound bare (non-namespaced) call
 * head, checked against special forms and bare names declared in scope.
 */
export const suggestBareCallHead = (
  name: string,
  scope: Scope
): string | undefined => {
  if (isNamespacedName(name) || name.length < 2) {
    return undefined;
  }
  const maxEdits = name.length >= 5 ? 2 : 1;
  const candidates = [
    ...SPECIAL_FORM_NAMES,
    ...[...boundNames(scope)].filter(
      (candidate) => !isNamespacedName(candidate)
    ),
  ].filter((candidate) => candidate.length >= 2);
  const nearest = nearestName(name, candidates, maxEdits);
  return nearest === null
    ? undefined
    : `Nothing in scope binds "${name}". Did you mean "${nearest}"?`;
};

const CHILD_BY_ROLE = (node: SemanticNode, role: string) =>
  node.children.find((child) => child.role === role)?.node;

/** Collects declared relation column lists by binding id. */
export const collectRelationColumns = (
  nodes: readonly SemanticNode[],
  expression: LionExpressionType
): ReadonlyMap<string, readonly string[]> => {
  const columns = new Map<string, readonly string[]>();
  for (const node of nodes) {
    if (node.specialForm !== "relation" || node.quoted) {
      continue;
    }
    const nameNode = CHILD_BY_ROLE(node, "binding");
    const colsNode = CHILD_BY_ROLE(node, "columns");
    const cols =
      colsNode === undefined ? undefined : partAt(expression, colsNode.path);
    if (
      nameNode?.meaning?.kind === "binding" &&
      nameNode.meaning.binding.kind === "relation" &&
      Array.isArray(cols)
    ) {
      columns.set(nameNode.meaning.binding.id, cols as readonly string[]);
    }
  }
  return columns;
};

/** Marks repeated parameter names in a `lambda` parameter list with warnings. */
export const warnDuplicateParams = (
  children: readonly SemanticChild[]
): SemanticChild[] =>
  children.map((child) => {
    if (child.role !== "parameters" || child.node.kind !== "array") {
      return child;
    }
    const seen = new Set<string>();
    const params = child.node.children.map((param) => {
      const target =
        param.node.kind === "array" ? param.node.children[0]?.node : param.node;
      const name = typeof target?.value === "string" ? target.value : undefined;
      if (name === undefined) {
        return param;
      }
      if (!seen.has(name)) {
        seen.add(name);
        return param;
      }
      const warning = `Parameter "${name}" is listed more than once; only the last value is bound.`;
      if (param.node.kind === "array" && param.node.children[0] !== undefined) {
        const [first, ...rest] = param.node.children;
        return {
          ...param,
          node: {
            ...param.node,
            children: [{ ...first, node: { ...first.node, warning } }, ...rest],
          },
        };
      }
      return { ...param, node: { ...param.node, warning } };
    });
    return { ...child, node: { ...child.node, children: params } };
  });

/** Marks `cond` branches that follow an unshadowed `else` branch. */
export const warnUnreachableCond = (
  children: readonly SemanticChild[]
): SemanticChild[] => {
  let sawElse = false;
  return children.map((child) => {
    if (child.role !== "branch") {
      return child;
    }
    if (sawElse) {
      return {
        ...child,
        node: {
          ...child.node,
          warning:
            'This branch can never be reached: an "else" branch comes first and always matches.',
        },
      };
    }
    if (child.node.children[0]?.node.meaning?.kind === "keyword") {
      sawElse = true;
    }
    return child;
  });
};

interface GoalInfo {
  readonly transparent: boolean;
  readonly vars: ReadonlySet<string>;
}

const EMPTY_GOAL: GoalInfo = { transparent: true, vars: new Set() };
const OPAQUE_GOAL: GoalInfo = { transparent: false, vars: new Set() };

const mergeGoals = (parts: readonly GoalInfo[]): GoalInfo => {
  const vars = new Set<string>();
  let transparent = true;
  for (const part of parts) {
    transparent = transparent && part.transparent;
    for (const name of part.vars) {
      vars.add(name);
    }
  }
  return { transparent, vars };
};

const listedNames = (node: SemanticNode | undefined): ReadonlySet<string> => {
  const names = new Set<string>();
  if (node === undefined) {
    return names;
  }
  if (typeof node.value === "string" && node.value.startsWith("?")) {
    names.add(node.value.slice(1));
  }
  for (const child of node.children) {
    if (
      typeof child.node.value === "string" &&
      child.node.value.startsWith("?")
    ) {
      names.add(child.node.value.slice(1));
    }
  }
  return names;
};

const subtractVars = (
  info: GoalInfo,
  bound: ReadonlySet<string>
): GoalInfo => ({
  transparent: info.transparent,
  vars: new Set([...info.vars].filter((name) => !bound.has(name))),
});

const primitiveGoalVars = (node: SemanticNode): GoalInfo => {
  const { meaning } = node;
  if (meaning?.kind === "logic-variable") {
    const name = (node.value as string).slice(1);
    return {
      transparent: true,
      vars: name.startsWith("_") ? new Set() : new Set([name]),
    };
  }
  const opaque =
    meaning?.kind === "unbound" ||
    (meaning?.kind === "name" &&
      (meaning.binding.kind === "define" ||
        meaning.binding.kind === "parameter"));
  return opaque ? OPAQUE_GOAL : EMPTY_GOAL;
};

const scopedGoalVars = (
  node: SemanticNode,
  varRole: "variables" | "variable",
  skipNot: boolean
): GoalInfo => {
  const bound = listedNames(CHILD_BY_ROLE(node, varRole));
  const inner = CHILD_BY_ROLE(node, "goal");
  return inner === undefined
    ? EMPTY_GOAL
    : subtractVars(goalVars(inner, skipNot), bound);
};

const callGoalVars = (node: SemanticNode, skipNot: boolean): GoalInfo => {
  const callee = node.children[0]?.node;
  const kind =
    callee?.meaning?.kind === "name" ? callee.meaning.binding.kind : undefined;
  if (kind !== "relation" && kind !== "schema" && kind !== "environment") {
    return OPAQUE_GOAL;
  }
  return mergeGoals(
    node.children.slice(1).map((child) => goalVars(child.node, skipNot))
  );
};

/**
 * Free logic variables of a goal or term, and whether the subtree is
 * statically transparent (contains no dynamic call/reference that could hide
 * variables). When `skipNot` is true (for `query` output columns), variables
 * that appear only inside `not` are excluded.
 */
const goalVars = (node: SemanticNode, skipNot: boolean): GoalInfo => {
  if (
    node.quoted ||
    node.specialForm === "quote" ||
    node.specialForm === "find" ||
    node.specialForm === "lambda"
  ) {
    return EMPTY_GOAL;
  }
  if (node.kind === "primitive") {
    return primitiveGoalVars(node);
  }
  if (
    node.kind === "invalid-call" ||
    node.specialForm === "eval" ||
    node.specialForm === "delay"
  ) {
    return OPAQUE_GOAL;
  }
  if (node.specialForm === "not" && skipNot) {
    const inner = CHILD_BY_ROLE(node, "goal");
    return inner === undefined
      ? EMPTY_GOAL
      : { transparent: goalVars(inner, true).transparent, vars: new Set() };
  }
  if (node.specialForm === "exists") {
    return scopedGoalVars(node, "variables", skipNot);
  }
  if (node.specialForm === "some") {
    return scopedGoalVars(node, "variable", skipNot);
  }
  if (node.kind === "call") {
    return callGoalVars(node, skipNot);
  }
  return mergeGoals(
    node.children
      .filter((child) => child.role !== "operator")
      .map((child) => goalVars(child.node, skipNot))
  );
};

const isRelationCall = (node: SemanticNode) => {
  if (node.kind !== "call") {
    return false;
  }
  const callee = node.children[0]?.node;
  return (
    callee?.meaning?.kind === "name" &&
    callee.meaning.binding.kind === "relation"
  );
};

/** Top-level atom arguments of a rule head (unwrapping `and`). */
const headArgNodes = (node: SemanticNode): SemanticNode[] => {
  if (node.specialForm === "and") {
    return node.children
      .filter((child) => child.role !== "operator")
      .flatMap((child) => headArgNodes(child.node));
  }
  if (node.specialForm === "=" || node.kind === "call") {
    return node.children.slice(1).map((child) => child.node);
  }
  return [node];
};

/** Free logic variables directly used by a rule-head argument or find template. */
const freeTermVars = (
  node: SemanticNode,
  includeAnonymous: boolean
): string[] => {
  if (
    node.quoted ||
    node.specialForm === "quote" ||
    node.specialForm === "some" ||
    node.specialForm === "find" ||
    node.specialForm === "lambda" ||
    node.specialForm === "assuming" ||
    isRelationCall(node)
  ) {
    return [];
  }
  if (node.meaning?.kind === "logic-variable") {
    const name = (node.value as string).slice(1);
    return includeAnonymous || !name.startsWith("_") ? [name] : [];
  }
  if (node.specialForm === "exists") {
    const bound = listedNames(CHILD_BY_ROLE(node, "variables"));
    const inner = CHILD_BY_ROLE(node, "goal");
    return inner === undefined
      ? []
      : freeTermVars(inner, includeAnonymous).filter(
          (name) => !bound.has(name)
        );
  }
  const allowAnon =
    includeAnonymous && node.specialForm !== "=" && node.specialForm !== "in";
  return node.children
    .filter((child) => child.role !== "operator")
    .flatMap((child) => freeTermVars(child.node, allowAnon));
};

const uniqueNames = (names: readonly string[]) => [...new Set(names)];

const relationDiagnostic = (
  node: SemanticNode,
  expression: LionExpressionType
): string | undefined => {
  const parts = partAt(expression, node.path) as readonly unknown[];
  const [, name, columns, options] = parts;
  if (typeof name !== "string" || !Array.isArray(columns)) {
    return undefined;
  }
  return errorOf(
    parseRelationDeclaration(name, columns as readonly string[], options)
  );
};

const invariantDiagnostic = (
  node: SemanticNode,
  expression: LionExpressionType
): string | undefined => {
  const optionsNode = CHILD_BY_ROLE(node, "options");
  if (optionsNode === undefined) {
    return undefined;
  }
  return errorOf(parseInvariantOptions(partAt(expression, optionsNode.path)));
};

const queryDiagnostic = (
  node: SemanticNode,
  expression: LionExpressionType
): string | undefined => {
  const optionsNode = CHILD_BY_ROLE(node, "options");
  if (optionsNode === undefined) {
    return undefined;
  }
  const options = partAt(expression, optionsNode.path);
  const goalNode = CHILD_BY_ROLE(node, "goal");
  const info = goalNode === undefined ? OPAQUE_GOAL : goalVars(goalNode, true);
  return errorOf(
    info.transparent
      ? parseQueryOptions(options, [...info.vars])
      : parseQueryOptionsShape(options)
  );
};

const ruleDiagnostic = (
  node: SemanticNode,
  expression: LionExpressionType,
  inAssuming: boolean
): string | undefined => {
  const headNode = CHILD_BY_ROLE(node, "head");
  if (headNode === undefined) {
    return undefined;
  }
  const headText = JSON.stringify(partAt(expression, headNode.path));
  const invented =
    headNode.specialForm === "exists"
      ? listedNames(CHILD_BY_ROLE(headNode, "variables"))
      : new Set<string>();
  const innerHead =
    headNode.specialForm === "exists"
      ? CHILD_BY_ROLE(headNode, "goal")
      : headNode;
  if (innerHead === undefined) {
    return undefined;
  }
  const allHead = uniqueNames(
    headArgNodes(innerHead).flatMap((arg) => freeTermVars(arg, true))
  );
  if (allHead.some((name) => name.startsWith("_"))) {
    return anonymousRuleHead(headText);
  }
  if (inAssuming) {
    return undefined;
  }
  const bodyNodes = node.children
    .filter((child) => child.role === "goal")
    .map((child) => child.node);
  const body = mergeGoals(bodyNodes.map((goal) => goalVars(goal, false)));
  if (!body.transparent) {
    return undefined;
  }
  const missing = allHead.filter(
    (name) => !(invented.has(name) || body.vars.has(name))
  );
  return missing.length === 0
    ? undefined
    : unsafeRuleHead(headText, missing.map((name) => `?${name}`).join(", "));
};

const findDiagnostic = (
  node: SemanticNode,
  expression: LionExpressionType,
  inScope: boolean
): string | undefined => {
  if (inScope) {
    return undefined;
  }
  const templateNode = CHILD_BY_ROLE(node, "template");
  const goalNode = CHILD_BY_ROLE(node, "goal");
  if (templateNode === undefined || goalNode === undefined) {
    return undefined;
  }
  const goal = goalVars(goalNode, false);
  if (!goal.transparent) {
    return undefined;
  }
  const missing = uniqueNames(freeTermVars(templateNode, false)).filter(
    (name) => !goal.vars.has(name)
  );
  return missing.length === 0
    ? undefined
    : unsafeFind(
        JSON.stringify(partAt(expression, node.path)),
        missing.map((name) => `?${name}`).join(", ")
      );
};

/** Whether a fact argument definitely evaluates to a value holding a logic variable. */
const guaranteedLogicVar = (node: SemanticNode): boolean => {
  if (node.quoted) {
    return false;
  }
  if (node.meaning?.kind === "logic-variable") {
    return true;
  }
  if (node.kind === "record") {
    return node.children.some((child) => guaranteedLogicVar(child.node));
  }
  if (node.kind === "call") {
    const callee = node.children[0]?.node;
    if (
      callee?.meaning?.kind === "name" &&
      callee.meaning.binding.kind === "environment" &&
      callee.meaning.binding.name === "array/make"
    ) {
      return node.children
        .slice(1)
        .some((child) => guaranteedLogicVar(child.node));
    }
  }
  return false;
};

const asStaticTerm = (
  node: SemanticNode,
  expression: LionExpressionType
): unknown => {
  if (node.meaning?.kind === "logic-variable") {
    return new LogicVariable((node.value as string).slice(1));
  }
  if (node.kind === "record") {
    return Object.fromEntries(
      node.children.map((child) => [
        child.role,
        asStaticTerm(child.node, expression),
      ])
    );
  }
  if (node.kind === "call" || node.kind === "array") {
    return node.children.map((child) => asStaticTerm(child.node, expression));
  }
  return partAt(expression, node.path);
};

const factDiagnostic = (
  node: SemanticNode,
  expression: LionExpressionType,
  inAssuming: boolean,
  relationColumns: ReadonlyMap<string, readonly string[]>,
  environment: Readonly<Record<string, unknown>>
): string | undefined => {
  if (inAssuming) {
    return undefined;
  }
  for (const child of node.children) {
    if (child.role !== "fact" || child.node.kind !== "call") {
      continue;
    }
    const atom = child.node;
    const callee = atom.children[0]?.node;
    if (callee?.meaning?.kind !== "name") {
      continue;
    }
    const { binding } = callee.meaning;
    const columns =
      binding.kind === "environment"
        ? relationOf(environment[binding.name])?.columns
        : relationColumns.get(binding.id);
    if (columns === undefined) {
      continue;
    }
    const args = atom.children.slice(1);
    for (let at = 0; at < args.length && at < columns.length; at += 1) {
      const arg = args[at]?.node as SemanticNode;
      if (!guaranteedLogicVar(arg)) {
        continue;
      }
      return factNotDataMessage(
        columns[at] as string,
        JSON.stringify(partAt(expression, atom.path)),
        asStaticTerm(arg, expression)
      );
    }
  }
  return undefined;
};

/** Static diagnostic for a special-form node, sharing the runtime's exact messages. */
export const formDiagnostic = (
  node: SemanticNode,
  expression: LionExpressionType,
  options: {
    readonly environment: Readonly<Record<string, unknown>>;
    readonly inAssuming: boolean;
    readonly inScope: boolean;
    readonly relationColumns: ReadonlyMap<string, readonly string[]>;
  }
): string | undefined => {
  if (node.quoted || node.diagnostic !== undefined) {
    return undefined;
  }
  switch (node.specialForm) {
    case "relation":
      return relationDiagnostic(node, expression);
    case "invariant":
      return invariantDiagnostic(node, expression);
    case "query":
      return queryDiagnostic(node, expression);
    case "rule":
      return ruleDiagnostic(node, expression, options.inAssuming);
    case "find":
      return findDiagnostic(node, expression, options.inScope);
    case "fact":
      return factDiagnostic(
        node,
        expression,
        options.inAssuming,
        options.relationColumns,
        options.environment
      );
    default:
      return undefined;
  }
};
