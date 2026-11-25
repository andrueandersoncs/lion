import { Schema } from "effect";
import { Exact } from "@/numbers/exact";
import { LionExpressionSchema } from "@/schemas/lion-expression.ts";
import type { EvaluateResult } from "@/types/evaluation.ts";

export type LionFunctionValueType = (...args: unknown[]) => EvaluateResult;

export const LionFunctionValueSchema = Schema.declare(
  (input: unknown): input is LionFunctionValueType => {
    return typeof input === "function";
  }
);

const Expression = LionExpressionSchema;

/** Whether a value holds a number no JavaScript number writes, such as 1/3. */
const holdsExact = (value: unknown): boolean => {
  if (value instanceof Exact) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some(holdsExact);
  }
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.values(value).some(holdsExact)
  );
};

/** The value with each exact number as 0, which stands where any number can. */
const asPlainNumbers = (value: unknown): unknown => {
  if (value instanceof Exact) {
    return 0;
  }
  if (Array.isArray(value)) {
    return value.map(asPlainNumbers);
  }
  return typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
    ? Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, asPlainNumbers(item)])
      )
    : value;
};

/**
 * Whether a value has a form's shape. A form holds an exact number where it
 * can hold any number, so one that holds one, which is rare, is checked with
 * each as 0, and a form that holds none is checked as it is.
 */
const shaped = (schema: Schema.Top) => {
  const is = Schema.is(schema);
  return (value: unknown) =>
    is(value) || (holdsExact(value) && is(asPlainNumbers(value)));
};

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
  "delay",
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
export const DelayFormSchema = form("delay", Expression);
export const BeginFormSchema = formWithMore("begin");
export const DefineFormSchema = Schema.Union([
  form("define", NameSchema, Expression),
  form("define", NameSchema, Expression, Expression),
]);
export const SetFormSchema = form("set!", NameSchema, Expression);
/**
 * A lambda's parameter: a name, or a name and the schema its argument must
 * fit, a contract the call checks as `schema/assert` does.
 */
export const ParameterSchema = Schema.Union([
  NameSchema,
  Schema.Tuple([NameSchema, Expression]),
]);

/**
 * ["lambda", [<parameter>, ...], <body>], or ["lambda", <name>, <body>],
 * whose one name is bound to the list of every argument, as
 * `(lambda args body)` takes any number of them in Scheme.
 */
export const LambdaFormSchema = Schema.Union([
  form("lambda", Schema.Array(ParameterSchema), Expression),
  form("lambda", NameSchema, Expression),
]);

/**
 * A lambda form's parameters, as written: names, or names with schemas, or
 * one name for all its arguments.
 */
export type Parameters = (typeof LambdaFormSchema.Type)[1];

/** The names a lambda's parameters bind: one, for a lambda that takes any number. */
export const parameterNames = (parameters: readonly unknown[] | string) =>
  typeof parameters === "string"
    ? [parameters]
    : parameters.map((parameter) =>
        typeof parameter === "string" ? parameter : (parameter as [string])[0]
      );

/** The schema each parameter's argument must fit, where it has one. */
export const parameterSchemas = (parameters: readonly unknown[] | string) =>
  typeof parameters === "string"
    ? [undefined]
    : parameters.map((parameter) =>
        typeof parameter === "string"
          ? undefined
          : (parameter as [string, unknown])[1]
      );
export const CondFormSchema = Schema.TupleWithRest(form("cond", Pair), [Pair]);
// ["match", <value>, [<schema>, <fn>], ..., <fallback-fn>], where the
// fallback may be left out: a last part that is a pair is a case.
const isPair = shaped(Pair);

/** Whether a part of a match after its value is one of its cases. */
export const isMatchCase = (part: unknown) => isPair(part);

export const MatchFormSchema = Schema.TupleWithRest(
  form("match", Expression, Pair),
  [Expression]
).pipe(
  Schema.check(
    Schema.makeFilter((expression) => expression.slice(3, -1).every(isPair))
  )
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
  Schema.Tuple([Schema.Literal("assuming"), Change, Expression]),
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
// ["and", <goal>, ...] and ["or", <goal>, ...]: with none, true and false
export const AndFormSchema = formWithMore("and");
export const OrFormSchema = formWithMore("or");
export const UnifyFormSchema = form("=", Expression, Expression);
// ["in", <element>, <list>]
export const InFormSchema = form("in", Expression, Expression);
// ["invariant", <goal>, <options>]
export const InvariantFormSchema = form("invariant", Expression, Expression);

/** The shape an array must have to be each special form. */
const SHAPES: Record<SpecialFormName, (value: unknown) => boolean> = {
  begin: shaped(BeginFormSchema),
  define: shaped(DefineFormSchema),
  eval: shaped(EvalFormSchema),
  quote: shaped(QuoteFormSchema),
  lambda: shaped(LambdaFormSchema),
  cond: shaped(CondFormSchema),
  match: shaped(MatchFormSchema),
  relation: shaped(RelationFormSchema),
  schema: shaped(SchemaFormSchema),
  rule: shaped(RuleFormSchema),
  fact: shaped(FactFormSchema),
  retract: shaped(RetractFormSchema),
  query: shaped(QueryFormSchema),
  find: shaped(FindFormSchema),
  assuming: shaped(AssumingFormSchema),
  exists: shaped(ExistsFormSchema),
  some: shaped(SomeFormSchema),
  why: shaped(WhyFormSchema),
  not: shaped(NotFormSchema),
  and: shaped(AndFormSchema),
  or: shaped(OrFormSchema),
  "=": shaped(UnifyFormSchema),
  in: shaped(InFormSchema),
  snapshot: shaped(form("snapshot")),
  invariant: shaped(InvariantFormSchema),
  "set!": shaped(SetFormSchema),
  delay: shaped(DelayFormSchema),
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
    'lambda takes a list of parameters, each a name or a name and a schema, or one name for the list of all its arguments, and a body, as in ["lambda", ["x", ["y", "value/number?"]], ["number/add", "x", "y"]] or ["lambda", "args", ["array/length", "args"]].',
  cond: 'cond takes one or more cases, each a condition and a result, as in ["cond", [["number/greaterThan", "x", 0], "positive"], ["else", "other"]].',
  match:
    'match takes a value, one or more cases of a schema and a function, and maybe a fallback function, as in ["match", "x", ["value/number?", "value/identity"], ["lambda", ["v"], null]].',
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
  delay:
    'delay takes one expression, which value/force runs once, as in ["delay", ["number/add", 1, 2]].',
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
