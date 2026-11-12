import {
  isSpecialFormName,
  type SpecialFormName,
  specialFormOf,
} from "@/schemas/evaluation";
import type { LionExpressionType } from "@/schemas/lion-expression";

export type StructuralPath = readonly (number | string)[];

export type SemanticKind =
  | "primitive"
  | "record"
  | "array"
  | "empty-array"
  | "call"
  | "special-form"
  | "invalid-call";

export interface SemanticRelationship {
  readonly kind: "definition" | "reference-candidate";
  readonly name: string;
}

export interface SemanticChild {
  readonly node: SemanticNode;
  readonly order: number;
  readonly role: string;
}

export interface SemanticNode {
  readonly children: readonly SemanticChild[];
  readonly diagnostic?: string;
  readonly kind: SemanticKind;
  readonly label: string;
  readonly path: StructuralPath;
  readonly pointer: string;
  readonly quoted: boolean;
  readonly relationships: readonly SemanticRelationship[];
  readonly specialForm?: SpecialFormName;
  readonly value?: boolean | null | number | string;
}

type Role = (index: number, length: number) => string;

const roleByIndex =
  (roles: readonly string[], fallback: string): Role =>
  (index) =>
    roles[index] ?? fallback;

/** What each element of a special form is, by position. */
const ROLES: Record<SpecialFormName, Role> = {
  eval: roleByIndex(["operator", "expression"], "argument"),
  quote: roleByIndex(["operator", "quoted-value"], "quoted-value"),
  begin: roleByIndex(["operator"], "sequence-item"),
  define: roleByIndex(["operator", "binding", "value"], "value"),
  lambda: roleByIndex(["operator", "parameters", "body"], "body"),
  cond: roleByIndex(["operator"], "branch"),
  match: (index, length) => {
    if (index < 2) {
      return index === 0 ? "operator" : "subject";
    }
    return index === length - 1 ? "fallback" : "pattern";
  },
  relation: roleByIndex(
    ["operator", "binding", "columns", "options"],
    "options"
  ),
  rule: roleByIndex(["operator", "head"], "goal"),
  fact: roleByIndex(["operator"], "fact"),
  retract: roleByIndex(["operator"], "fact"),
  query: roleByIndex(["operator", "goal", "options"], "options"),
  why: roleByIndex(["operator", "fact"], "fact"),
  not: roleByIndex(["operator", "goal"], "goal"),
  and: roleByIndex(["operator"], "goal"),
  or: roleByIndex(["operator"], "goal"),
  "=": roleByIndex(["operator", "left", "right"], "right"),
  in: roleByIndex(["operator", "element", "list"], "list"),
  snapshot: roleByIndex(["operator"], "argument"),
  invariant: roleByIndex(["operator", "goal", "options"], "options"),
};

const CALL_ROLE = roleByIndex(["callee"], "argument");

const escapePointerSegment = (segment: number | string) =>
  String(segment).replaceAll("~", "~0").replaceAll("/", "~1");

export const pathToPointer = (path: StructuralPath): string =>
  path.length === 0 ? "" : `/${path.map(escapePointerSegment).join("/")}`;

const primitiveLabel = (value: boolean | null | number | string) => {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  return String(value);
};

const analyzeNode = (
  expression: LionExpressionType,
  path: StructuralPath,
  quoted: boolean
): SemanticNode => {
  const base = { path, pointer: pathToPointer(path), quoted };
  if (expression === null || typeof expression !== "object") {
    return {
      ...base,
      kind: "primitive",
      label: primitiveLabel(expression),
      value: expression,
      children: [],
      relationships:
        typeof expression === "string"
          ? [{ kind: "reference-candidate", name: expression }]
          : [],
    };
  }
  if (!Array.isArray(expression)) {
    const entries = Object.entries(expression);
    return {
      ...base,
      kind: "record",
      label:
        entries.length === 0 ? "empty record" : `record · ${entries.length}`,
      children: entries.map(([key, value], order) => ({
        role: key,
        order,
        node: analyzeNode(value, [...path, key], quoted),
      })),
      relationships: [],
    };
  }
  if (expression.length === 0) {
    return {
      ...base,
      kind: "empty-array",
      label: "empty array",
      children: [],
      relationships: [],
    };
  }

  const [head, name] = expression;
  const form = specialFormOf(expression);
  const defines = (form === "define" || form === "relation") && !quoted;
  let role = form === undefined ? CALL_ROLE : ROLES[form];
  if (quoted) {
    role = () => "item";
  }
  const array = {
    ...base,
    children: expression.map((value, order) => ({
      role: role(order, expression.length),
      order,
      node: analyzeNode(
        value,
        [...path, order],
        quoted || (form === "quote" && order > 0)
      ),
    })),
    relationships:
      defines && typeof name === "string"
        ? [{ kind: "definition" as const, name }]
        : [],
  };
  if (quoted) {
    return { ...array, kind: "array", label: `array · ${expression.length}` };
  }
  if (form !== undefined) {
    return { ...array, kind: "special-form", label: form, specialForm: form };
  }
  if (isSpecialFormName(head)) {
    return {
      ...array,
      kind: "invalid-call",
      label: `invalid ${head}`,
      specialForm: head,
      diagnostic: `The ${head} form has an invalid structure.`,
    };
  }
  return {
    ...array,
    kind: "call",
    label: typeof head === "string" ? head : "call",
  };
};

export const analyze = (expression: LionExpressionType): SemanticNode =>
  analyzeNode(expression, [], false);

export const flattenAnalysis = (
  root: SemanticNode
): readonly SemanticNode[] => {
  const nodes: SemanticNode[] = [];
  const visit = (node: SemanticNode) => {
    nodes.push(node);
    for (const child of node.children) {
      visit(child.node);
    }
  };
  visit(root);
  return nodes;
};
