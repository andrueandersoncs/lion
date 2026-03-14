import { Data, flow, Match, pipe, Record, Function } from "effect";
import type { ReadonlyRecord } from "effect/Record";

export type ExpressionFunctor<A> = Data.TaggedEnum<{
  // JSON primitives
  Null: {};
  Boolean: { value: boolean };
  String: { value: string };
  Number: { value: number };

  // variable / symbol
  Symbol: { symbol: string };

  // keys are just strings, values are expressions
  Record: { fields: ReadonlyRecord<string, A> };

  // function calls: (f a b c)
  Call: { function: A; arguments: ReadonlyArray<A> };

  // special forms
  If: { condition: A; then: A; else: A };
  Let: { bindings: ReadonlyArray<readonly [string, A]>; body: ReadonlyArray<A> };
  Lambda: { parameters: ReadonlyArray<string>; body: ReadonlyArray<A> };
  Begin: { expressions: ReadonlyArray<A> };
  Quote: { datum: Datum };
}>;

export type Datum =
  | null
  | boolean
  | string
  | number
  | { symbol: string }
  | readonly Datum[]
  | { readonly [key in string]: Datum };

export const ConsExprF = <A>() => Data.taggedEnum<ExpressionFunctor<A>>();

export const mapExpressionFunctor = <A, B>(f: (a: A) => B) =>
  pipe(
    Match.type<ExpressionFunctor<A>>(),
    Match.tag("Null", (e) => e as ExpressionFunctor<B>),
    Match.tag("Boolean", (e) => e as ExpressionFunctor<B>),
    Match.tag("String", (e) => e as ExpressionFunctor<B>),
    Match.tag("Number", (e) => e as ExpressionFunctor<B>),
    Match.tag("Symbol", (e) => e as ExpressionFunctor<B>),
    Match.tag("Quote", (e) => e as ExpressionFunctor<B>),

    Match.tag("Record", (e) => ConsExprF<B>().Record({ fields: Record.map(e.fields, f) })),
    Match.tag("Call", (e) => ConsExprF<B>().Call({ function: f(e.function), arguments: e.arguments.map(f) })),
    Match.tag("If", (e) => ConsExprF<B>().If({ condition: f(e.condition), then: f(e.then), else: f(e.else) })),

    Match.tag("Let", (e) =>
      ConsExprF<B>().Let({ bindings: e.bindings.map(([name, value]) => [name, f(value)]), body: e.body.map(f) })
    ),

    Match.tag("Lambda", (e) => ConsExprF<B>().Lambda({ parameters: e.parameters, body: e.body.map(f) })),
    Match.tag("Begin", (e) => ConsExprF<B>().Begin({ expressions: e.expressions.map(f) })),
    Match.exhaustive
  );

export type Expression = ExpressionFunctor<{ unbox: Expression }>;

export const ConsExpr = ConsExprF<Expression>();

const lens =
  <A>(key: keyof A) =>
  (obj: A) =>
    obj[key];

const unbox = lens("unbox");

const cata = <A>(algebra: (fa: ExpressionFunctor<A>) => A): ((expr: Expression) => A) =>
  flow(mapExpressionFunctor(flow(unbox, cata(algebra))), algebra);

const evaluate = pipe(
  Match.type<Expression>(),
  Match.tag("Null", Function.constant),
  Match.tag("Boolean", Function.constant),
  Match.tag("String", Function.constant),
  Match.tag("Number", Function.constant),
  Match.tag("Symbol", Function.constant),
  Match.tag("Quote", Function.constant),
  Match.tag("Record", Function.constant),
  Match.tag("Call", Function.constant),
  Match.tag("If", Function.constant),
  Match.tag("Let", Function.constant),
  Match.tag("Lambda", Function.constant),
  Match.tag("Begin", Function.constant),
  Match.exhaustive
);

evaluate(ConsExpr.Begin({ expressions: [ConsExpr.Null(), ConsExpr.Boolean(true)] }));
