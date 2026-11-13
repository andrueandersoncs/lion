import { Schema } from "effect";
import { LionExpressionSchema } from "@/schemas/lion-expression.ts";
import type { EvaluateResult } from "@/types/evaluation.ts";

export type LionFunctionValueType = (...args: unknown[]) => EvaluateResult;

export const LionFunctionValueSchema = Schema.declare(
  (input: unknown): input is LionFunctionValueType => {
    return typeof input === "function";
  }
);

const Expression = LionExpressionSchema;

/** An array that starts with a form's name, then has exactly these parts. */
const form = <const Parts extends Schema.Tuple.Elements>(
  name: string,
  ...parts: Parts
) => Schema.Tuple([Schema.Literal(name), ...parts]);

/** A form with these parts, then any number of expressions. */
const formWithMore = <const Parts extends Schema.Tuple.Elements>(
  name: string,
  ...parts: Parts
) => Schema.TupleWithRest(form(name, ...parts), [Expression]);

export const FunctionCallFormSchema = Schema.TupleWithRest(
  Schema.Tuple([Expression]),
  [Expression]
);

/** The special forms, by the name an array starts with. */
export const SPECIAL_FORM_NAMES = [
  "begin",
  "define",
  "eval",
  "quote",
  "lambda",
  "cond",
  "match",
  "relation",
  "schema",
  "rule",
  "fact",
  "retract",
  "query",
  "find",
  "why",
  "not",
  "and",
  "or",
  "=",
  "in",
  "snapshot",
  "invariant",
] as const;

export type SpecialFormName = (typeof SPECIAL_FORM_NAMES)[number];

// A special form's name cannot be defined or used as a parameter.
const DISALLOWED_IDENTIFIERS: readonly string[] = [
  ...SPECIAL_FORM_NAMES,
  "__proto__",
];

export const ValidIdentifierSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter(
      (identifier) => !DISALLOWED_IDENTIFIERS.includes(identifier)
    ),
    Schema.isMinLength(1)
  )
);

// ["cond", [<predicate>, <result>], ..., ["else", <result>]]. "else" is a
// string like any other: it holds unless the environment binds it.
const Pair = Schema.Tuple([Expression, Expression]);

export const EvalFormSchema = form("eval", Expression);
export const QuoteFormSchema = form("quote", Expression);
export const BeginFormSchema = formWithMore("begin");
export const DefineFormSchema = form(
  "define",
  ValidIdentifierSchema,
  Expression
);
export const LambdaFormSchema = form(
  "lambda",
  Schema.Array(ValidIdentifierSchema),
  Expression
);
export const CondFormSchema = Schema.TupleWithRest(form("cond", Pair), [Pair]);
// ["match", <value>, [<predicate>, <fn>], ..., <fallback-fn>]
export const MatchFormSchema = Schema.TupleWithRest(
  form("match", Expression, Pair),
  [Pair, Expression]
);
// ["relation", <name>, [<column>, ...]], or with options such as
// {"key": [<column>, ...]}
const Relation = [ValidIdentifierSchema, Schema.Array(Schema.String)] as const;
export const RelationFormSchema = Schema.Union([
  form("relation", ...Relation),
  form("relation", ...Relation, Expression),
]);
// ["schema", <name>, <shape>], or with more names and shapes after it
export const SchemaFormSchema = formWithMore(
  "schema",
  ValidIdentifierSchema,
  Expression
);
// ["rule", <head>, <goal>, ...]
export const RuleFormSchema = formWithMore("rule", Expression, Expression);
export const FactFormSchema = formWithMore("fact", Expression);
export const RetractFormSchema = formWithMore("retract", Expression);
// ["query", <goal>], or with options
export const QueryFormSchema = Schema.Union([
  form("query", Expression),
  form("query", Expression, Expression),
]);
// ["find", <template>, <goal>]
export const FindFormSchema = form("find", Expression, Expression);
export const WhyFormSchema = form("why", Expression);
export const NotFormSchema = form("not", Expression);
export const AndFormSchema = formWithMore("and", Expression);
export const OrFormSchema = formWithMore("or", Expression);
export const UnifyFormSchema = form("=", Expression, Expression);
// ["in", <element>, <list>]
export const InFormSchema = form("in", Expression, Expression);
// ["invariant", <goal>, <options>]
export const InvariantFormSchema = form("invariant", Expression, Expression);

/** The shape an array must have to be each special form. */
const SHAPES: Record<SpecialFormName, (value: unknown) => boolean> = {
  begin: Schema.is(BeginFormSchema),
  define: Schema.is(DefineFormSchema),
  eval: Schema.is(EvalFormSchema),
  quote: Schema.is(QuoteFormSchema),
  lambda: Schema.is(LambdaFormSchema),
  cond: Schema.is(CondFormSchema),
  match: Schema.is(MatchFormSchema),
  relation: Schema.is(RelationFormSchema),
  schema: Schema.is(SchemaFormSchema),
  rule: Schema.is(RuleFormSchema),
  fact: Schema.is(FactFormSchema),
  retract: Schema.is(RetractFormSchema),
  query: Schema.is(QueryFormSchema),
  find: Schema.is(FindFormSchema),
  why: Schema.is(WhyFormSchema),
  not: Schema.is(NotFormSchema),
  and: Schema.is(AndFormSchema),
  or: Schema.is(OrFormSchema),
  "=": Schema.is(UnifyFormSchema),
  in: Schema.is(InFormSchema),
  snapshot: Schema.is(form("snapshot")),
  invariant: Schema.is(InvariantFormSchema),
};

export const isSpecialFormName = (value: unknown): value is SpecialFormName =>
  typeof value === "string" && Object.hasOwn(SHAPES, value);

/**
 * The special form an array is: its first element names the form, and the
 * array has the form's shape. Any other array is a function call.
 */
export const specialFormOf = (
  expression: readonly unknown[]
): SpecialFormName | undefined => {
  const [name] = expression;
  return isSpecialFormName(name) && SHAPES[name](expression) ? name : undefined;
};
