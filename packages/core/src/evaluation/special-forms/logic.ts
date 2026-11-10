import { Effect, Option } from "effect";
import { LogicError } from "@/errors/evaluation";
import { setGlobalBinding } from "@/evaluation/environment";
import { evaluate } from "@/evaluation/evaluate";
import { compileQuery, compileRule } from "@/logic/compile";
import {
  addRules,
  assertFacts,
  declareRelation,
  explainFact,
  queryDatabase,
  retractFacts,
} from "@/logic/database";
import { applyQueryOptions, parseQueryOptions } from "@/logic/query-options";
import {
  Atom,
  Conjunction,
  Disjunction,
  type Goal,
  isGoal,
  isLogicTerm,
  Membership,
  makeRelationValue,
  Negation,
  render,
  sameValue,
  Unification,
} from "@/logic/terms";
import type {
  AndFormSchema,
  FactFormSchema,
  InFormSchema,
  NotFormSchema,
  OrFormSchema,
  QueryFormSchema,
  RelationFormSchema,
  RetractFormSchema,
  RuleFormSchema,
  UnifyFormSchema,
  WhyFormSchema,
} from "@/schemas/evaluation";
import type { LionExpressionType } from "@/schemas/lion-expression";
import { LionDatabaseService } from "@/services/database";
import { LionEnvironmentService } from "@/services/evaluation";

const fail = (message: string) => Effect.fail(new LogicError({ message }));

const show = (value: unknown) => JSON.stringify(render(value));

const database = Effect.serviceOption(LionDatabaseService).pipe(
  Effect.flatMap(
    Option.match({
      onNone: () =>
        fail(
          "No logic database is available. Evaluate with run(), or provide LionDatabaseService."
        ),
      onSome: Effect.succeed,
    })
  )
);

const evaluateAll = (expressions: readonly LionExpressionType[]) =>
  Effect.all(expressions.map(evaluate));

const atoms = (form: string, values: readonly unknown[]) =>
  Effect.gen(function* () {
    const result: Atom[] = [];
    for (const value of values) {
      if (!(value instanceof Atom)) {
        return yield* fail(
          `${form} expects relation calls, but found ${show(value)}.`
        );
      }
      result.push(value);
    }
    return result;
  });

/** ["relation", "dep", ["from", "to"]] declares a relation and binds it. */
export const evaluateRelation = ([
  _,
  name,
  columns,
]: typeof RelationFormSchema.Type) =>
  Effect.gen(function* () {
    const relation = yield* declareRelation(yield* database, name, columns);
    const value = makeRelationValue(relation, (...args: unknown[]) =>
      args.length === relation.columns.length
        ? Effect.succeed(new Atom(relation, args))
        : fail(
            `"${name}" takes ${relation.columns.length} arguments (${relation.columns.join(", ")}) but got ${args.length}.`
          )
    );
    yield* setGlobalBinding(yield* LionEnvironmentService, name, value);
    return value;
  });

export const evaluateRule = ([_, head, ...body]: typeof RuleFormSchema.Type) =>
  Effect.gen(function* () {
    const headValue = yield* evaluate(head);
    const bodyValues = yield* evaluateAll(body);
    const rules = yield* compileRule(headValue, bodyValues);
    yield* addRules(yield* database, rules);
    return ["rule", render(headValue), ...bodyValues.map(render)];
  });

export const evaluateFact = ([_, ...facts]: typeof FactFormSchema.Type) =>
  Effect.gen(function* () {
    const values = yield* atoms("fact", yield* evaluateAll(facts));
    return yield* assertFacts(yield* database, values);
  });

export const evaluateRetract = ([_, ...facts]: typeof RetractFormSchema.Type) =>
  Effect.gen(function* () {
    const values = yield* atoms("retract", yield* evaluateAll(facts));
    return yield* retractFacts(yield* database, values);
  });

/** ["query", goal, options?]; options are read as written, not evaluated. */
export const evaluateQuery = ([
  _,
  goal,
  options,
]: typeof QueryFormSchema.Type) =>
  Effect.gen(function* () {
    const goalValue = yield* evaluate(goal);
    const queries = yield* compileQuery(goalValue);
    const parsed = yield* parseQueryOptions(options, queries[0]?.outputs ?? []);
    const rows = yield* queryDatabase(yield* database, queries);
    return yield* applyQueryOptions(rows, parsed, goalValue);
  });

export const evaluateWhy = ([_, fact]: typeof WhyFormSchema.Type) =>
  Effect.gen(function* () {
    const [atom] = yield* atoms("why", [yield* evaluate(fact)]);
    return yield* explainFact(yield* database, atom as Atom);
  });

const goalsOrBooleans = (form: string, values: readonly unknown[]) =>
  Effect.gen(function* () {
    for (const value of values) {
      if (!(isGoal(value) || typeof value === "boolean")) {
        return yield* fail(
          `${form} expects goals or booleans, but found ${show(value)}.`
        );
      }
    }
    return values as readonly (Goal | boolean)[];
  });

const allBooleans = (
  values: readonly (Goal | boolean)[]
): values is readonly boolean[] =>
  values.every((value) => typeof value === "boolean");

/** Negates a relation call, or a boolean outside of logic. */
export const evaluateNot = ([_, goal]: typeof NotFormSchema.Type) =>
  Effect.gen(function* () {
    const value = yield* evaluate(goal);
    if (typeof value === "boolean") {
      return !value;
    }
    if (!(value instanceof Atom)) {
      return yield* fail(
        `not expects a relation call or a boolean, but found ${show(value)}.`
      );
    }
    return new Negation(value);
  });

export const evaluateAnd = ([_, ...goals]: typeof AndFormSchema.Type) =>
  Effect.gen(function* () {
    const values = yield* goalsOrBooleans("and", yield* evaluateAll(goals));
    return allBooleans(values)
      ? values.every(Boolean)
      : new Conjunction(values as Goal[]);
  });

export const evaluateOr = ([_, ...goals]: typeof OrFormSchema.Type) =>
  Effect.gen(function* () {
    const values = yield* goalsOrBooleans("or", yield* evaluateAll(goals));
    return allBooleans(values)
      ? values.some(Boolean)
      : new Disjunction(values as Goal[]);
  });

/** Unifies two terms; without logic variables it is plain equality. */
export const evaluateUnify = ([_, left, right]: typeof UnifyFormSchema.Type) =>
  Effect.gen(function* () {
    const leftValue = yield* evaluate(left);
    const rightValue = yield* evaluate(right);
    if (!(isLogicTerm(leftValue) || isLogicTerm(rightValue))) {
      return sameValue(leftValue, rightValue);
    }
    return new Unification(leftValue, rightValue);
  });

/**
 * ["in", element, list] binds the element to each item of the list, or tests
 * that it is one. Without logic variables it is plain membership.
 */
export const evaluateIn = ([_, element, list]: typeof InFormSchema.Type) =>
  Effect.gen(function* () {
    const elementValue = yield* evaluate(element);
    const listValue = yield* evaluate(list);
    if (isLogicTerm(elementValue) || isLogicTerm(listValue)) {
      return new Membership(elementValue, listValue);
    }
    if (!Array.isArray(listValue)) {
      return yield* fail(`"in" expects a list, but found ${show(listValue)}.`);
    }
    return listValue.some((item) => sameValue(item, elementValue));
  });
