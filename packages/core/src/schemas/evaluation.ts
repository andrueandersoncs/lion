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

const DISALLOWED_IDENTIFIERS = [
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

// ["cond", [<predicate>, <result>], ..., ["else", <result>]]
export const CondCaseSchema = Schema.Tuple([
  LionExpressionSchema,
  LionExpressionSchema,
]);

export const CondElseCaseSchema = Schema.Tuple([
  Schema.Literal("else"),
  LionExpressionSchema,
]);

export const CondFormWithoutElseSchema = Schema.TupleWithRest(
  Schema.Tuple([Schema.Literal("cond"), CondCaseSchema]),
  [CondCaseSchema]
);

export const CondFormWithElseSchema = Schema.TupleWithRest(
  Schema.Tuple([Schema.Literal("cond"), CondCaseSchema]),
  [CondCaseSchema, CondElseCaseSchema]
);

export const CondFormSchema = Schema.Union([
  CondFormWithoutElseSchema,
  CondFormWithElseSchema,
]);

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
