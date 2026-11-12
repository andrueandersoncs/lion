import { Effect, Option } from "effect";
import { logicError } from "@/errors/evaluation";
import { boundNames, setGlobalBinding } from "@/evaluation/environment";
import { evaluate } from "@/evaluation/evaluate";
import { compileQuery, compileRule, queryOutputs } from "@/logic/compile";
import {
  addInvariant,
  addRules,
  assertFacts,
  declareRelation,
  explainFact,
  queryDatabase,
  relationValue,
  retractFacts,
} from "@/logic/database";
import {
  applyQueryOptions,
  parseInvariantOptions,
  parseQueryOptions,
} from "@/logic/query-options";
import { saveDatabase } from "@/logic/snapshot";
import {
  Atom,
  Conjunction,
  Disjunction,
  type Goal,
  isGoal,
  isWaiting,
  Membership,
  Negation,
  render,
  sameValue,
  show,
  Unification,
} from "@/logic/terms";
import type {
  AndFormSchema,
  FactFormSchema,
  InFormSchema,
  InvariantFormSchema,
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

const database = Effect.serviceOption(LionDatabaseService).pipe(
  Effect.flatMap(
    Option.match({
      onNone: () =>
        logicError(
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
        return yield* logicError(
          `${form} expects relation calls, but found ${show(value)}.`
        );
      }
      result.push(value);
    }
    return result;
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Reads `{"key": [...]}`; relation options are read as written. */
const relationKey = (name: string, options: unknown) => {
  if (options === undefined) {
    return Effect.succeed(undefined);
  }
  if (!isRecord(options)) {
    return logicError(
      `Relation options must be a record such as {"key": ["id"]}, but "${name}" has ${show(options)}.`
    );
  }
  const unknown = Object.keys(options).find((option) => option !== "key");
  if (unknown !== undefined) {
    return logicError(
      `Unknown relation option "${unknown}" for "${name}". The only relation option is "key".`
    );
  }
  const key = typeof options.key === "string" ? [options.key] : options.key;
  return Array.isArray(key) && key.every((column) => typeof column === "string")
    ? Effect.succeed(key as readonly string[])
    : logicError(
        `The key of "${name}" must be a column name or a list of them, but found ${show(options.key)}.`
      );
};

/**
 * ["relation", "dep", ["from", "to"]] declares a relation and binds it.
 * ["relation", "order", ["id", "status"], {"key": ["id"]}] gives it a key.
 */
export const evaluateRelation = ([
  _,
  name,
  columns,
  options,
]: typeof RelationFormSchema.Type) =>
  Effect.gen(function* () {
    const relation = yield* declareRelation(
      yield* database,
      name,
      columns,
      yield* relationKey(name, options)
    );
    const value = relationValue(relation);
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
    const parsed = yield* parseQueryOptions(options, queryOutputs(goalValue));
    const rows = yield* queryDatabase(yield* database, queries);
    return yield* applyQueryOptions(rows, parsed, goalValue);
  });

/**
 * ["invariant", goal, {"assert": "none"}] keeps a query assertion in the
 * database: the goal must have no answers ("none"), or at least one ("some"),
 * now and after every later change. Options are read as written.
 */
export const evaluateInvariant = ([
  _,
  goal,
  options,
]: typeof InvariantFormSchema.Type) =>
  Effect.gen(function* () {
    const goalValue = yield* evaluate(goal);
    const queries = yield* compileQuery(goalValue);
    const assert = yield* parseInvariantOptions(options);
    yield* addInvariant(yield* database, { assert, goal: goalValue, queries });
    return ["invariant", render(goalValue), { assert }];
  });

export const evaluateWhy = ([_, fact]: typeof WhyFormSchema.Type) =>
  Effect.gen(function* () {
    const [atom] = yield* atoms("why", [yield* evaluate(fact)]);
    return yield* explainFact(yield* database, atom as Atom);
  });

const goalOrBoolean = (form: string, expression: LionExpressionType) =>
  Effect.flatMap(evaluate(expression), (value) =>
    isGoal(value)
      ? Effect.succeed(value)
      : logicError(
          `${form} expects goals or booleans, but found ${show(value)}.`
        )
  );

/** Negates a goal, or a boolean outside of logic. */
export const evaluateNot = ([_, goal]: typeof NotFormSchema.Type) =>
  Effect.map(goalOrBoolean("not", goal), (value) =>
    typeof value === "boolean" ? !value : new Negation(value)
  );

/**
 * `and` and `or` read their arguments in order. On booleans they stop at the
 * first one that decides the result, false for `and` and true for `or`, as
 * in Scheme. Once an argument is a goal, they combine goals.
 */
const connective =
  (form: "and" | "or", combine: (goals: readonly Goal[]) => Goal) =>
  (items: readonly LionExpressionType[]) =>
    Effect.gen(function* () {
      const decides = form === "or";
      const goals: Goal[] = [];
      for (const item of items) {
        const value = yield* goalOrBoolean(form, item);
        if (value === decides && goals.length === 0) {
          return decides;
        }
        if (value !== !decides) {
          goals.push(value);
        }
      }
      return goals.length === 0 ? !decides : combine(goals);
    });

const conjunction = connective("and", (goals) => new Conjunction(goals));
const disjunction = connective("or", (goals) => new Disjunction(goals));

export const evaluateAnd = ([_, ...items]: typeof AndFormSchema.Type) =>
  conjunction(items);

export const evaluateOr = ([_, ...items]: typeof OrFormSchema.Type) =>
  disjunction(items);

/** Unifies two terms; without logic variables it is plain equality. */
export const evaluateUnify = ([_, left, right]: typeof UnifyFormSchema.Type) =>
  Effect.gen(function* () {
    const leftValue = yield* evaluate(left);
    const rightValue = yield* evaluate(right);
    if (!(isWaiting(leftValue) || isWaiting(rightValue))) {
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
    if (isWaiting(elementValue) || isWaiting(listValue)) {
      return new Membership(elementValue, listValue);
    }
    if (!Array.isArray(listValue)) {
      return yield* logicError(
        `"in" expects a list, but found ${show(listValue)}.`
      );
    }
    return listValue.some((item) => sameValue(item, elementValue));
  });

/**
 * ["snapshot"] returns a Lion program that rebuilds the current database.
 * Strings bound in the environment are quoted so they load as strings.
 */
export const evaluateSnapshot = () =>
  Effect.gen(function* () {
    const names = yield* boundNames(yield* LionEnvironmentService);
    return yield* saveDatabase(yield* database, {
      isBound: (name) => names.has(name),
    });
  });
