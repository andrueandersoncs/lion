import { Schema } from "effect";
import {
  BeginFormSchema,
  CondFormSchema,
  DefineFormSchema,
  EvalFormSchema,
  LambdaFormSchema,
  MatchFormSchema,
  QuoteFormSchema,
} from "@/schemas/evaluation";
import type { LionExpressionType } from "@/schemas/lion-expression";

export type StructuralPath = readonly (number | string)[];

export type SemanticKind =
  | "primitive"
  | "record"
  | "empty-array"
  | "call"
  | "special-form"
  | "invalid-call";

export type SpecialFormName =
  | "begin"
  | "cond"
  | "define"
  | "eval"
  | "lambda"
  | "match"
  | "quote";

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

interface FormDefinition {
  readonly matches: (value: unknown) => boolean;
  readonly name: SpecialFormName;
  readonly role: (index: number, length: number) => string;
}

const roleByIndex =
  (roles: readonly string[], fallback: string) => (index: number) =>
    roles[index] ?? fallback;

const SPECIAL_FORMS: readonly FormDefinition[] = [
  {
    name: "eval",
    matches: Schema.is(EvalFormSchema),
    role: roleByIndex(["operator", "expression"], "argument"),
  },
  {
    name: "quote",
    matches: Schema.is(QuoteFormSchema),
    role: roleByIndex(["operator", "quoted-value"], "quoted-value"),
  },
  {
    name: "begin",
    matches: Schema.is(BeginFormSchema),
    role: roleByIndex(["operator"], "sequence-item"),
  },
  {
    name: "define",
    matches: Schema.is(DefineFormSchema),
    role: roleByIndex(["operator", "binding", "value"], "value"),
  },
  {
    name: "lambda",
    matches: Schema.is(LambdaFormSchema),
    role: roleByIndex(["operator", "parameters", "body"], "body"),
  },
  {
    name: "cond",
    matches: Schema.is(CondFormSchema),
    role: roleByIndex(["operator"], "branch"),
  },
  {
    name: "match",
    matches: Schema.is(MatchFormSchema),
    role: (index, length) => {
      if (index === 0) {
        return "operator";
      }
      if (index === 1) {
        return "subject";
      }
      return index === length - 1 ? "fallback" : "pattern";
    },
  },
];

const SPECIAL_FORM_NAMES: Readonly<Record<SpecialFormName, true>> = {
  begin: true,
  cond: true,
  define: true,
  eval: true,
  lambda: true,
  match: true,
  quote: true,
};

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
  if (
    !Array.isArray(expression) &&
    (expression === null || typeof expression !== "object")
  ) {
    const relationships: SemanticRelationship[] = [];
    if (typeof expression === "string") {
      relationships.push({ kind: "reference-candidate", name: expression });
    }
    return {
      path,
      pointer: pathToPointer(path),
      kind: "primitive",
      label: primitiveLabel(expression),
      value: expression,
      quoted,
      children: [],
      relationships,
    };
  }

  if (!Array.isArray(expression)) {
    const entries = Object.entries(expression);
    return {
      path,
      pointer: pathToPointer(path),
      kind: "record",
      label:
        entries.length === 0 ? "empty record" : `record · ${entries.length}`,
      quoted,
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
      path,
      pointer: pathToPointer(path),
      kind: "empty-array",
      label: "empty array",
      quoted,
      children: [],
      relationships: [],
    };
  }

  const head = expression[0];
  const namedForm = SPECIAL_FORMS.find(({ name }) => name === head);
  const validForm = SPECIAL_FORMS.find(({ matches }) => matches(expression));
  const relationships: SemanticRelationship[] = [];
  if (validForm?.name === "define" && typeof expression[1] === "string") {
    relationships.push({ kind: "definition", name: expression[1] });
  }
  const nextQuoted = quoted || validForm?.name === "quote";
  const role = validForm?.role ?? roleByIndex(["callee"], "argument");
  const children = expression.map((value, order) => ({
    role: role(order, expression.length),
    order,
    node: analyzeNode(value, [...path, order], nextQuoted && order > 0),
  }));

  if (namedForm && !validForm) {
    return {
      path,
      pointer: pathToPointer(path),
      kind: "invalid-call",
      label: `invalid ${namedForm.name}`,
      specialForm: namedForm.name,
      quoted,
      children,
      relationships,
      diagnostic: `The ${namedForm.name} form has an invalid structure.`,
    };
  }

  if (validForm) {
    return {
      path,
      pointer: pathToPointer(path),
      kind: "special-form",
      label: validForm.name,
      specialForm: validForm.name,
      quoted,
      children,
      relationships,
    };
  }

  const label = typeof head === "string" ? head : "call";
  return {
    path,
    pointer: pathToPointer(path),
    kind: "call",
    label,
    quoted,
    children,
    relationships,
  };
};

export const isSpecialFormName = (value: unknown): value is SpecialFormName =>
  typeof value === "string" &&
  Object.hasOwn(SPECIAL_FORM_NAMES, value as SpecialFormName);

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
