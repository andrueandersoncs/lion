import { Effect } from "effect";
import { logicError } from "@/errors/evaluation";
import { answer, database, isWriting, writing } from "@/evaluation/asking";
import { boundNames, setGlobalBinding } from "@/evaluation/environment";
import { evaluate } from "@/evaluation/evaluate";
import { compileQuery, compileRule } from "@/logic/compile";
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
  readOptions,
} from "@/logic/query-options";
import { saveDatabase } from "@/logic/snapshot";
import {
  Atom,
  type Goal,
  isGoal,
  isQuestion,
  isWaiting,
  LogicForm,
  LogicValue,
  render,
  sameValue,
  show,
} from "@/logic/terms";
import type {
  AndFormSchema,
  FactFormSchema,
  FindFormSchema,
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
import { LionEnvironmentService } from "@/services/evaluation";

const evaluateAll = (expressions: readonly LionExpressionType[]) =>
  Effect.all(expressions.map(evaluate));

/**
 * The facts a form names. A fact holds values, so a question among its
 * arguments is asked.
 */
const atoms = (form: string, facts: readonly LionExpressionType[]) =>
  Effect.gen(function* () {
    const result: Atom[] = [];
    for (const value of yield* evaluateAll(facts)) {
      if (!(value instanceof Atom)) {
        return yield* logicError(
          `${form} expects relation calls, but found ${show(value)}.`
        );
      }
      result.push(
        value.args.some(isQuestion)
          ? new Atom(value.relation, yield* Effect.forEach(value.args, answer))
          : value
      );
    }
    return result;
  });

/** Reads `{"key": [...]}`; relation options are read as written. */
const relationKey = (name: string, options: unknown) =>
  options === undefined
    ? Effect.succeed(undefined)
    : Effect.flatMap(readOptions("relation", options), (record) => {
        const key = typeof record.key === "string" ? [record.key] : record.key;
        return Array.isArray(key) &&
          key.every((column) => typeof column === "string")
          ? Effect.succeed(key as readonly string[])
          : logicError(
              `The key of "${name}" must be a column name or a list of them, but found ${show(record.key)}.`
            );
      });

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
    const [headValue, ...bodyValues] = yield* writing(
      evaluateAll([head, ...body])
    );
    const rules = yield* compileRule(headValue, bodyValues);
    yield* addRules(yield* database, rules);
    return ["rule", render(headValue), ...bodyValues.map(render)];
  });

export const evaluateFact = ([_, ...facts]: typeof FactFormSchema.Type) =>
  Effect.gen(function* () {
    const values = yield* atoms("fact", facts);
    return yield* assertFacts(yield* database, values);
  });

export const evaluateRetract = ([_, ...facts]: typeof RetractFormSchema.Type) =>
  Effect.gen(function* () {
    const values = yield* atoms("retract", facts);
    return yield* retractFacts(yield* database, values);
  });

/** ["query", goal, options?]; options are read as written, not evaluated. */
export const evaluateQuery = ([
  _,
  goal,
  options,
]: typeof QueryFormSchema.Type) =>
  Effect.gen(function* () {
    const goalValue = yield* writing(evaluate(goal));
    const query = yield* compileQuery(goalValue);
    const parsed = yield* parseQueryOptions(options, query.outputs);
    const rows = yield* queryDatabase(yield* database, query);
    return yield* applyQueryOptions(rows, parsed, goalValue);
  });

/**
 * ["find", template, goal] is the template's value for every match of the
 * goal, as a sorted list. Outside of rules it is asked right away. In a
 * rule, query, or other find it is part of what is written: it is asked for
 * each answer of the rule, with the variables the rule has bound.
 */
export const evaluateFind = ([_, template, goal]: typeof FindFormSchema.Type) =>
  Effect.gen(function* () {
    const [templateValue, goalValue] = yield* writing(
      evaluateAll([template, goal])
    );
    const find = new LogicForm("find", [templateValue, goalValue]);
    return (yield* isWriting) ? find : yield* answer(find);
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
    const goalValue = yield* writing(evaluate(goal));
    const query = yield* compileQuery(goalValue);
    const assert = yield* parseInvariantOptions(options);
    yield* addInvariant(yield* database, { assert, goal: goalValue, query });
    return ["invariant", render(goalValue), { assert }];
  });

export const evaluateWhy = ([_, fact]: typeof WhyFormSchema.Type) =>
  Effect.gen(function* () {
    const [atom] = yield* atoms("why", [fact]);
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
    typeof value === "boolean" ? !value : new LogicForm("not", [value])
  );

/**
 * `and` and `or` read their arguments in order. On booleans they stop at the
 * first one that decides the result, false for `and` and true for `or`, as
 * in Scheme. Once an argument is a goal, they combine goals.
 */
const connective =
  (form: "and" | "or") =>
  ([_, ...items]: typeof AndFormSchema.Type | typeof OrFormSchema.Type) =>
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
      return goals.length === 0 ? !decides : new LogicForm(form, goals);
    });

export const evaluateAnd = connective("and");

export const evaluateOr = connective("or");

/**
 * The values of the operands of "=" or "in", or undefined when the form is
 * a goal: an operand waits for a logic variable, or a rule is being written
 * and an operand is a question. Otherwise a question among them is asked.
 */
const known = (operands: readonly unknown[]) =>
  Effect.gen(function* () {
    if (!operands.some((operand) => operand instanceof LogicValue)) {
      return operands;
    }
    return operands.some(isWaiting) || (yield* isWriting)
      ? undefined
      : yield* Effect.forEach(operands, answer);
  });

/** Unifies two terms; without logic variables it is plain equality. */
export const evaluateUnify = ([_, left, right]: typeof UnifyFormSchema.Type) =>
  Effect.gen(function* () {
    const operands = yield* evaluateAll([left, right]);
    const values = yield* known(operands);
    return values === undefined
      ? new LogicForm("=", operands)
      : sameValue(values[0], values[1]);
  });

/**
 * ["in", element, list] binds the element to each item of the list, or tests
 * that it is one. Without logic variables it is plain membership.
 */
export const evaluateIn = ([_, element, list]: typeof InFormSchema.Type) =>
  Effect.gen(function* () {
    const operands = yield* evaluateAll([element, list]);
    const values = yield* known(operands);
    if (values === undefined) {
      return new LogicForm("in", operands);
    }
    const [elementValue, listValue] = values;
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
