import { Schema } from "effect";
import { LionExpressionSchema } from "@/schemas/lion-expression.ts";
import type { EvaluateResult } from "@/types/evaluation.ts";

export type LionFunctionValueType = (...args: unknown[]) => EvaluateResult;

export const LionFunctionValueSchema = Schema.declare(
  (input: unknown): input is LionFunctionValueType => {
    return typeof input === "function";
  }
);

export const FunctionCallFormSchema = Schema.TupleWithRest(
  Schema.Tuple([LionExpressionSchema]),
  [LionExpressionSchema]
);

export const EvalFormSchema = Schema.Tuple([
  Schema.Literal("eval"),
  LionExpressionSchema,
]);

export const QuoteFormSchema = Schema.Tuple([
  Schema.Literal("quote"),
  LionExpressionSchema,
]);

export const BeginFormSchema = Schema.TupleWithRest(
  Schema.Tuple([Schema.Literal("begin")]),
  [LionExpressionSchema]
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
  "rule",
  "fact",
  "retract",
  "query",
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

export const DefineFormSchema = Schema.Tuple([
  Schema.Literal("define"),
  ValidIdentifierSchema,
  LionExpressionSchema,
]);

export const LambdaFormSchema = Schema.Tuple([
  Schema.Literal("lambda"),
  Schema.Array(ValidIdentifierSchema),
  LionExpressionSchema,
]);

// ["cond", [<predicate>, <result>], ..., ["else", <result>]]. "else" is a
// string like any other: it holds unless the environment binds it.
export const CondCaseSchema = Schema.Tuple([
  LionExpressionSchema,
  LionExpressionSchema,
]);

export const CondFormSchema = Schema.TupleWithRest(
  Schema.Tuple([Schema.Literal("cond"), CondCaseSchema]),
  [CondCaseSchema]
);

// ["match", <value>, [<predicate>, <fn>], ..., <fallback-fn>]
export const MatchPatternSchema = Schema.Tuple([
  LionExpressionSchema,
  LionExpressionSchema,
]);

// ["relation", <name>, [<column>, ...]] or with {"key": [<column>, ...]}
export const RelationFormSchema = Schema.Union([
  Schema.Tuple([
    Schema.Literal("relation"),
    ValidIdentifierSchema,
    Schema.Array(Schema.String),
  ]),
  Schema.Tuple([
    Schema.Literal("relation"),
    ValidIdentifierSchema,
    Schema.Array(Schema.String),
    LionExpressionSchema,
  ]),
]);

// ["rule", <head>, <goal>, ...]
export const RuleFormSchema = Schema.TupleWithRest(
  Schema.Tuple([
    Schema.Literal("rule"),
    LionExpressionSchema,
    LionExpressionSchema,
  ]),
  [LionExpressionSchema]
);

// ["fact", <relation call>, ...]
export const FactFormSchema = Schema.TupleWithRest(
  Schema.Tuple([Schema.Literal("fact"), LionExpressionSchema]),
  [LionExpressionSchema]
);

// ["retract", <relation call>, ...]
export const RetractFormSchema = Schema.TupleWithRest(
  Schema.Tuple([Schema.Literal("retract"), LionExpressionSchema]),
  [LionExpressionSchema]
);

// ["query", <goal>] or ["query", <goal>, <options>]
export const QueryFormSchema = Schema.Union([
  Schema.Tuple([Schema.Literal("query"), LionExpressionSchema]),
  Schema.Tuple([
    Schema.Literal("query"),
    LionExpressionSchema,
    LionExpressionSchema,
  ]),
]);

// ["why", <relation call>]
export const WhyFormSchema = Schema.Tuple([
  Schema.Literal("why"),
  LionExpressionSchema,
]);

// ["not", <goal>]
export const NotFormSchema = Schema.Tuple([
  Schema.Literal("not"),
  LionExpressionSchema,
]);

// ["and", <goal>, ...]
export const AndFormSchema = Schema.TupleWithRest(
  Schema.Tuple([Schema.Literal("and"), LionExpressionSchema]),
  [LionExpressionSchema]
);

// ["or", <goal>, ...]
export const OrFormSchema = Schema.TupleWithRest(
  Schema.Tuple([Schema.Literal("or"), LionExpressionSchema]),
  [LionExpressionSchema]
);

// ["snapshot"]
export const SnapshotFormSchema = Schema.Tuple([Schema.Literal("snapshot")]);

// ["invariant", <goal>, <options>]
export const InvariantFormSchema = Schema.Tuple([
  Schema.Literal("invariant"),
  LionExpressionSchema,
  LionExpressionSchema,
]);

// ["in", <element>, <list>]
export const InFormSchema = Schema.Tuple([
  Schema.Literal("in"),
  LionExpressionSchema,
  LionExpressionSchema,
]);

// ["=", <term>, <term>]
export const UnifyFormSchema = Schema.Tuple([
  Schema.Literal("="),
  LionExpressionSchema,
  LionExpressionSchema,
]);

export const MatchFormSchema = Schema.TupleWithRest(
  Schema.Tuple([
    Schema.Literal("match"),
    LionExpressionSchema,
    MatchPatternSchema,
  ]),
  [MatchPatternSchema, LionExpressionSchema]
);

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
  rule: Schema.is(RuleFormSchema),
  fact: Schema.is(FactFormSchema),
  retract: Schema.is(RetractFormSchema),
  query: Schema.is(QueryFormSchema),
  why: Schema.is(WhyFormSchema),
  not: Schema.is(NotFormSchema),
  and: Schema.is(AndFormSchema),
  or: Schema.is(OrFormSchema),
  "=": Schema.is(UnifyFormSchema),
  in: Schema.is(InFormSchema),
  snapshot: Schema.is(SnapshotFormSchema),
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
