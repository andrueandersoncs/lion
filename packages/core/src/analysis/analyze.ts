/**
 * What each part of a program is, read without running it: its kind, the
 * special form it is, the role each part plays in its form, and what each
 * string means. A string means what the evaluator makes of it, by the same
 * scopes, found by the same functions (`bodyNames`, `definedIn`,
 * `declaredIn`): a name that a scope around it declares, a logic variable,
 * data, or, where it can only have been meant as a name, an error.
 */
import { Exit, Option } from "effect";
import { MalformedFormError, unboundSet } from "@/errors/evaluation";
import { nameOrString } from "@/evaluation/base-forms/primitive";
import { declares, type Scope, scopeWith } from "@/evaluation/environment";
import { bodyNames, declaredIn, definedIn } from "@/evaluation/hoisting";
import { isLogicVariableName, isNamespacedName } from "@/logic/terms";
import {
  fitsForm,
  isSpecialFormName,
  type SpecialFormName,
  USAGE,
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

/**
 * What binds a name: a lambda's parameter, a `define` in a lambda's body or
 * at the top of the program, a `relation` or `schema` form, or the host's
 * environment.
 */
export type BindingKind =
  | "parameter"
  | "define"
  | "relation"
  | "schema"
  | "environment";

/** A binding a scope declares. */
export interface SemanticBinding {
  /** The pointers of the strings that bind it; none for the environment's. */
  readonly at: readonly string[];
  /** The same for every string that means this binding. */
  readonly id: string;
  readonly kind: BindingKind;
  readonly name: string;
  /** True for a binding of the run's top scope. */
  readonly top: boolean;
}

/**
 * What a string means where it is written:
 * - `name`: a scope around it declares it, so it evaluates to, or `set!`
 *   changes, that binding;
 * - `binding`: it binds a name, as a parameter, a `define`, a `relation`, or
 *   a `schema` does;
 * - `logic-variable`: a `?name` no scope declares;
 * - `data`: it evaluates to itself, or the form reads it as written;
 * - `unbound`: only a name can stand there, and no scope declares it, so
 *   evaluating it fails: a `module/name` that reads as a misspelled name, or
 *   the name a `set!` changes;
 * - `form`: the name of the special form an array is;
 * - `keyword`: `else` as a condition of `cond`, which always holds.
 */
export type StringMeaning =
  | { readonly kind: "name"; readonly binding: SemanticBinding }
  | { readonly kind: "binding"; readonly binding: SemanticBinding }
  | {
      readonly kind: "logic-variable" | "data" | "unbound" | "form" | "keyword";
    };

export interface SemanticChild {
  readonly node: SemanticNode;
  readonly order: number;
  readonly role: string;
}

export interface SemanticNode {
  readonly children: readonly SemanticChild[];
  /** What fails when the part runs: a malformed form, or a name nothing binds. */
  readonly diagnostic?: string;
  readonly kind: SemanticKind;
  readonly label: string;
  /** What a string means; only strings have one. */
  readonly meaning?: StringMeaning;
  readonly path: StructuralPath;
  readonly pointer: string;
  /** True for a part that is data, never evaluated: inside quote, or read as written. */
  readonly quoted: boolean;
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
  "set!": roleByIndex(["operator", "binding", "value"], "value"),
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
  schema: (index) => {
    if (index === 0) {
      return "operator";
    }
    return index % 2 === 1 ? "binding" : "shape";
  },
  rule: roleByIndex(["operator", "head"], "goal"),
  fact: roleByIndex(["operator"], "fact"),
  retract: roleByIndex(["operator"], "fact"),
  query: roleByIndex(["operator", "goal", "options"], "options"),
  find: roleByIndex(["operator", "template", "goal"], "goal"),
  assuming: (index, length) => {
    if (index === 0) {
      return "operator";
    }
    return index === length - 1 ? "expression" : "change";
  },
  exists: roleByIndex(["operator", "variables", "goal"], "goal"),
  some: roleByIndex(["operator", "variable", "goal"], "goal"),
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

/** The parts of a `cond` case and of a `match` case, by position. */
const CASE_ROLES: Record<string, readonly [string, string]> = {
  branch: ["condition", "result"],
  pattern: ["schema", "function"],
};

/** The parts a form reads as written, never evaluated. */
const WRITTEN = new Set(["quoted-value", "columns", "options"]);

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

/** A binding as it is found: its sites are added as the program is read. */
interface Binding extends SemanticBinding {
  readonly at: string[];
  kind: BindingKind;
}

/** A scope of the program, with the binding each of its names holds. */
interface Frame extends Scope {
  readonly bindings: Map<string, Binding>;
  readonly parent: Frame | undefined;
}

/**
 * A scope declaring `names`, written at `owner`: the run's top scope, a
 * lambda's body, or a schema's shape.
 */
const frame = (
  names: Iterable<string>,
  kindOf: (name: string) => BindingKind,
  owner: string | undefined,
  parent: Frame | undefined
): Frame => ({
  bindings: new Map(
    [...names].map((name) => [
      name,
      {
        at: [],
        id: `${owner ?? ""}#${name}`,
        kind: kindOf(name),
        name,
        top: owner === undefined,
      },
    ])
  ),
  parent,
});

/** The binding of the nearest scope that declares a name. */
const bindingOf = (scope: Frame | undefined, name: string) => {
  for (let at = scope; at !== undefined; at = at.parent) {
    const binding = at.bindings.get(name);
    if (binding !== undefined) {
      return binding;
    }
  }
  return undefined;
};

/** Where a part is written. */
interface Context {
  /** The scope a `define` binds in: the nearest lambda's body, or the top. */
  readonly body: Frame;
  readonly quoted: boolean;
  /** The scopes around the part. */
  readonly scope: Frame;
  /** The run's top scope, where a relation or schema is bound. */
  readonly top: Frame;
}

const DATA: StringMeaning = { kind: "data" };

/**
 * What a string evaluates to in a scope, as `compileReference` reads it:
 * the binding a scope declares, a logic variable, a misspelled name, or
 * itself.
 */
const evaluated = (
  name: string,
  scope: Frame
): readonly [StringMeaning, string?] => {
  const binding = bindingOf(scope, name);
  if (binding !== undefined) {
    return [{ kind: "name", binding }];
  }
  if (isLogicVariableName(name)) {
    return [{ kind: "logic-variable" }];
  }
  const misspelled = isNamespacedName(name)
    ? Option.getOrUndefined(Exit.findErrorOption(nameOrString(scope, name)))
    : undefined;
  return misspelled === undefined
    ? [DATA]
    : [{ kind: "unbound" }, misspelled.message];
};

const stringNode = (
  value: string,
  path: StructuralPath,
  quoted: boolean,
  [meaning, diagnostic]: readonly [StringMeaning, string?]
): SemanticNode => ({
  path,
  pointer: pathToPointer(path),
  quoted,
  kind: "primitive",
  label: primitiveLabel(value),
  value,
  children: [],
  meaning,
  ...(diagnostic === undefined ? {} : { diagnostic }),
});

const arrayNode = (
  expression: readonly LionExpressionType[],
  path: StructuralPath,
  quoted: boolean,
  part: (value: LionExpressionType, order: number) => SemanticChild
): SemanticNode => ({
  path,
  pointer: pathToPointer(path),
  quoted,
  kind: expression.length === 0 ? "empty-array" : "array",
  label:
    expression.length === 0 ? "empty array" : `array · ${expression.length}`,
  children: expression.map(part),
});

/**
 * A string that binds a name: a parameter, or the name of a define, a
 * relation, or a schema. A binding no scope declares, as when the form that
 * makes it is found where the scope's own names were not looked for, binds
 * the name only when it runs: no string written before means it.
 */
const site = (
  name: string,
  path: StructuralPath,
  binding: Binding | undefined,
  kind: BindingKind = "define"
): SemanticNode => {
  const pointer = pathToPointer(path);
  const bound = binding ?? {
    at: [],
    id: pointer,
    kind,
    name,
    top: kind !== "define",
  };
  bound.at.push(pointer);
  return stringNode(name, path, false, [{ kind: "binding", binding: bound }]);
};

/** Reads an expression, written in `context`. */
const analyzeNode = (
  expression: LionExpressionType,
  path: StructuralPath,
  context: Context
): SemanticNode => {
  const { quoted } = context;
  if (typeof expression === "string") {
    return stringNode(
      expression,
      path,
      quoted,
      quoted ? [DATA] : evaluated(expression, context.scope)
    );
  }
  const base = { path, pointer: pathToPointer(path), quoted };
  if (expression === null || typeof expression !== "object") {
    return {
      ...base,
      kind: "primitive",
      label: primitiveLabel(expression),
      value: expression,
      children: [],
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
        node: analyzeNode(value, [...path, key], context),
      })),
    };
  }
  const head = expression[0];
  if (quoted || expression.length === 0) {
    return arrayNode(expression, path, quoted, (value, order) => ({
      role: "item",
      order,
      node: analyzeNode(value, [...path, order], context),
    }));
  }
  if (!isSpecialFormName(head) || declares(context.scope, head)) {
    return {
      ...base,
      kind: "call",
      label: typeof head === "string" ? head : "call",
      children: expression.map((value, order) => ({
        role: CALL_ROLE(order, expression.length),
        order,
        node: analyzeNode(value, [...path, order], context),
      })),
    };
  }
  if (!fitsForm(head, expression)) {
    const error = new MalformedFormError({
      expression,
      form: head,
      usage: USAGE[head],
    });
    return {
      ...base,
      kind: "invalid-call",
      label: `invalid ${head}`,
      specialForm: head,
      diagnostic: error.message,
      children: expression.map((value, order) => ({
        role: order === 0 ? "operator" : "argument",
        order,
        node:
          order === 0
            ? stringNode(head, [...path, order], false, [{ kind: "form" }])
            : analyzeNode(value, [...path, order], context),
      })),
    };
  }
  return formNode(head, expression, path, context);
};

/** A well-formed special form, each part read as the form reads it. */
const formNode = (
  form: SpecialFormName,
  expression: readonly LionExpressionType[],
  path: StructuralPath,
  context: Context
): SemanticNode => ({
  path,
  pointer: pathToPointer(path),
  quoted: false,
  kind: "special-form",
  label: form,
  specialForm: form,
  children: formParts(form, expression, path, context),
});

/**
 * The scope of a lambda's body, as `compileLambda` makes it: its
 * parameters and the names its body defines.
 */
const lambdaContext = (
  [, parameters, body]: readonly LionExpressionType[],
  path: StructuralPath,
  context: Context
): Context => {
  const names = parameters as readonly string[];
  const scope = frame(
    bodyNames(names, body, context.scope),
    (name) => (names.includes(name) ? "parameter" : "define"),
    pathToPointer(path),
    context.scope
  );
  return { ...context, body: scope, scope };
};

/**
 * The scope of a schema's shape, as `evaluateSchema` makes it: the schemas
 * of its form, inside the scope the form is written in. A shape runs as a
 * lambda of its own, so what it defines it defines for itself.
 */
const shapeContext = (
  form: readonly LionExpressionType[],
  shape: LionExpressionType,
  path: StructuralPath,
  context: Context
): Context => {
  const schemas: Frame = {
    bindings: new Map(
      form.flatMap((name, at) => {
        const binding =
          at % 2 === 1 && typeof name === "string"
            ? context.top.bindings.get(name)
            : undefined;
        return binding === undefined ? [] : [[name as string, binding]];
      })
    ),
    parent: context.scope,
  };
  const scope = frame(
    definedIn(shape, schemas),
    () => "define",
    pathToPointer(path),
    schemas
  );
  return { ...context, body: scope, scope };
};

/** Reads the part at `order` of a well-formed special form. */
const formPart = (
  form: SpecialFormName,
  expression: readonly LionExpressionType[],
  order: number,
  path: StructuralPath,
  context: Context
): SemanticNode => {
  const value = expression[order] as LionExpressionType;
  const at = [...path, order];
  const role = ROLES[form](order, expression.length);
  if (role === "operator") {
    return stringNode(value as string, at, false, [{ kind: "form" }]);
  }
  if (WRITTEN.has(role)) {
    return analyzeNode(value, at, { ...context, quoted: true });
  }
  if (role === "binding") {
    return binding(form, value as string, at, context);
  }
  if (role === "parameters" || role === "variables") {
    return arrayNode(
      value as string[],
      at,
      role === "variables",
      (name, n) => ({
        role: role === "parameters" ? "parameter" : "variable",
        order: n,
        node:
          role === "parameters"
            ? site(
                name as string,
                [...at, n],
                context.scope.bindings.get(name as string)
              )
            : variable(name as string, [...at, n]),
      })
    );
  }
  if (role === "variable") {
    return variable(value as string, at);
  }
  if (role === "branch" || role === "pattern") {
    return casePart(role, value as LionExpressionType[], at, context);
  }
  if (role === "shape") {
    return analyzeNode(value, at, shapeContext(expression, value, at, context));
  }
  if (role === "change") {
    // A change `assuming` makes is read by its first element, `fact` or
    // `retract`, whatever a scope binds that name to.
    const parts = value as LionExpressionType[];
    return formNode(parts[0] as "fact" | "retract", parts, at, context);
  }
  return analyzeNode(value, at, context);
};

/** The parts of a well-formed special form, each read as the form reads it. */
const formParts = (
  form: SpecialFormName,
  expression: readonly LionExpressionType[],
  path: StructuralPath,
  context: Context
): SemanticChild[] => {
  const inner =
    form === "lambda" ? lambdaContext(expression, path, context) : context;
  return expression.map((_, order) => ({
    role: ROLES[form](order, expression.length),
    order,
    node: formPart(
      form,
      expression,
      order,
      path,
      order === 0 ? context : inner
    ),
  }));
};

/**
 * The name a `define`, `set!`, `relation`, or `schema` form binds: a define
 * binds in its body, a relation or schema in the run's top scope, and a
 * `set!` changes the nearest binding, or fails when no scope declares one.
 */
const binding = (
  form: SpecialFormName,
  name: string,
  path: StructuralPath,
  context: Context
): SemanticNode => {
  if (form === "set!") {
    const changed = bindingOf(context.scope, name);
    return changed === undefined
      ? stringNode(name, path, false, [
          { kind: "unbound" },
          unboundSet(name).message,
        ])
      : stringNode(name, path, false, [{ kind: "name", binding: changed }]);
  }
  if (form === "define") {
    return site(name, path, context.body.bindings.get(name));
  }
  const kind = form === "schema" ? "schema" : "relation";
  const declared = context.top.bindings.get(name);
  if (declared !== undefined && declared.kind !== "define") {
    declared.kind = kind;
  }
  return site(name, path, declared, kind);
};

/** A variable `exists` or `some` lists, read as written. */
const variable = (name: string, path: StructuralPath) =>
  stringNode(name, path, true, [
    isLogicVariableName(name) ? { kind: "logic-variable" } : DATA,
  ]);

/** A case of `cond` or `match`: two expressions, and `else` for a condition. */
const casePart = (
  role: string,
  parts: readonly LionExpressionType[],
  path: StructuralPath,
  context: Context
) =>
  arrayNode(parts, path, false, (value, order) => {
    const at = [...path, order];
    const isElse =
      role === "branch" &&
      order === 0 &&
      value === "else" &&
      !declares(context.scope, "else");
    return {
      role: CASE_ROLES[role]?.[order] ?? "part",
      order,
      node: isElse
        ? stringNode("else", at, false, [{ kind: "keyword" }])
        : analyzeNode(value, at, context),
    };
  });

/**
 * Reads a program as a run with `environment` reads it: its top scope
 * declares the names the environment binds, the names the program defines
 * at its top, and the relations and schemas it declares, and each lambda's
 * body declares its parameters and what it defines.
 */
export const analyze = (
  expression: LionExpressionType,
  environment: Readonly<Record<string, unknown>> = {}
): SemanticNode => {
  const host = scopeWith(Object.keys(environment), undefined);
  const defined = new Set(definedIn(expression, host));
  const declared = new Set(declaredIn(expression, host));
  const top = frame(
    new Set([...host.bindings.keys(), ...defined, ...declared]),
    (name) => {
      if (defined.has(name)) {
        return "define";
      }
      return declared.has(name) ? "relation" : "environment";
    },
    undefined,
    undefined
  );
  return analyzeNode(expression, [], {
    body: top,
    quoted: false,
    scope: top,
    top,
  });
};

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
