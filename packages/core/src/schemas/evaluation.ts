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
  "assuming",
  "exists",
  "some",
  "why",
  "not",
  "and",
  "or",
  "=",
  "in",
  "snapshot",
  "invariant",
  "set!",
] as const;

export type SpecialFormName = (typeof SPECIAL_FORM_NAMES)[number];

/**
 * A name a `define`, a `set!`, or a lambda's parameter binds: any string but
 * the empty one and `__proto__`. A name that is a special form's shadows
 * the form where the binding is in scope.
 */
export const NameSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((name) => name !== "__proto__"),
    Schema.isMinLength(1)
  )
);

// A relation's or schema's name is bound for every run of its database, so
// it cannot be a special form's name, which it would hide everywhere.
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

// ["cond", [<condition>, <result>], ..., ["else", <result>]]. A condition is
// true or false; "else", unless a scope declares it, always holds.
const Pair = Schema.Tuple([Expression, Expression]);

export const EvalFormSchema = form("eval", Expression);
export const QuoteFormSchema = form("quote", Expression);
export const BeginFormSchema = formWithMore("begin");
export const DefineFormSchema = form("define", NameSchema, Expression);
export const SetFormSchema = form("set!", NameSchema, Expression);
export const LambdaFormSchema = form(
  "lambda",
  Schema.Array(NameSchema),
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
// ["assuming", ["fact", <goal>, ...], ["retract", <goal>, ...], or
// ["rule", <head>, <goal>, ...], ..., <expression>]. Each change has the
// shape of its own form, which is checked as that form checks it.
const Change = Schema.TupleWithRest(
  Schema.Tuple([Schema.Literals(["fact", "retract", "rule"])]),
  [Expression]
);
export const AssumingFormSchema = Schema.TupleWithRest(
  Schema.Tuple([Schema.Literal("assuming"), Change]),
  [Expression]
);
// ["exists", [<variable>, ...], <goal>]
export const ExistsFormSchema = form(
  "exists",
  Schema.Array(Schema.String),
  Expression
);
// ["some", <variable>, <goal>]
export const SomeFormSchema = form("some", Schema.String, Expression);
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
  assuming: Schema.is(AssumingFormSchema),
  exists: Schema.is(ExistsFormSchema),
  some: Schema.is(SomeFormSchema),
  why: Schema.is(WhyFormSchema),
  not: Schema.is(NotFormSchema),
  and: Schema.is(AndFormSchema),
  or: Schema.is(OrFormSchema),
  "=": Schema.is(UnifyFormSchema),
  in: Schema.is(InFormSchema),
  snapshot: Schema.is(form("snapshot")),
  invariant: Schema.is(InvariantFormSchema),
  "set!": Schema.is(SetFormSchema),
};

/** What each special form takes, said when an array names it but has another shape. */
export const USAGE: Record<SpecialFormName, string> = {
  begin:
    'begin takes any number of expressions, as in ["begin", ["define", "x", 1], "x"].',
  define:
    'define takes a name and an expression, as in ["define", "answer", 42].',
  eval: 'eval takes one expression, whose value it evaluates, as in ["eval", ["quote", ["number/add", 1, 2]]].',
  quote: 'quote takes one value, as in ["quote", ["a", "b"]].',
  lambda:
    'lambda takes a list of parameter names and a body, as in ["lambda", ["x"], ["number/add", "x", 1]].',
  cond: 'cond takes one or more cases, each a condition and a result, as in ["cond", [["number/greaterThan", "x", 0], "positive"], ["else", "other"]].',
  match:
    'match takes a value, one or more cases of a schema and a function, and a fallback function, as in ["match", "x", ["value/number?", "value/identity"], ["lambda", ["v"], null]].',
  relation:
    'relation takes a name, a list of columns, and maybe options, as in ["relation", "edge", ["from", "to"]].',
  schema:
    'schema takes a name and a shape for each schema it declares, as in ["schema", "Order", {"id": "value/integer?"}].',
  rule: 'rule takes a head and one or more goals, as in ["rule", ["path", "?x", "?y"], ["edge", "?x", "?y"]].',
  fact: 'fact takes one or more goals, as in ["fact", ["edge", "a", "b"]].',
  retract:
    'retract takes one or more goals, as in ["retract", ["edge", "a", "b"]].',
  query:
    'query takes a goal and maybe options, as in ["query", ["edge", "a", "?to"]].',
  find: 'find takes a template and a goal, as in ["find", "?to", ["edge", "a", "?to"]].',
  assuming:
    'assuming takes one or more fact, retract, and rule forms, then an expression, as in ["assuming", ["fact", ["edge", "c", "d"]], ["find", "?t", ["edge", "c", "?t"]]].',
  exists:
    'exists takes a list of variables and a goal, as in ["exists", ["?m"], ["mother", "ben", "?m"]].',
  some: 'some takes a variable and a goal, as in ["some", "?m", ["mother", "ben", "?m"]].',
  why: 'why takes one goal, as in ["why", ["path", "a", "c"]].',
  not: 'not takes one goal, as in ["not", ["edge", "a", "b"]].',
  and: 'and takes goals or booleans, as in ["and", ["edge", "?x", "?y"], ["edge", "?y", "?z"]].',
  or: 'or takes goals or booleans, as in ["or", ["edge", "?x", "b"], ["edge", "b", "?x"]].',
  "=": '= takes two terms, as in ["=", "?x", 1].',
  in: 'in takes an element and a list, as in ["in", "?tag", ["array/make", "a", "b"]].',
  snapshot: 'snapshot takes nothing, as in ["snapshot"].',
  invariant:
    'invariant takes a goal and its options, as in ["invariant", ["broken", "?x"], {"assert": "none"}].',
  "set!":
    'set! takes a name a scope binds and an expression, as in ["set!", "count", ["number/add", "count", 1]].',
};

/** True when an array has the shape of the special form it names. */
export const fitsForm = (name: SpecialFormName, expression: unknown) =>
  SHAPES[name](expression);

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
