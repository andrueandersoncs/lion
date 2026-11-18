import { Effect, Schema } from "effect";
import { logicError } from "@/errors/evaluation";
import {
  answer,
  database,
  isWriting,
  known,
  writing,
} from "@/evaluation/asking";
import {
  andThen,
  type Compiled,
  Pending,
  runAll,
  toEffect,
} from "@/evaluation/compiled";
import {
  boundNames,
  type Environment,
  makeEnvironment,
  setGlobalBinding,
} from "@/evaluation/environment";
import { compile, evaluate } from "@/evaluation/evaluate";
import { dataStrings, suspend } from "@/evaluation/special-forms/lambda";
import { compileQuery, compileRule, equalityGoals } from "@/logic/compile";
import {
  addInvariant,
  addRules,
  assertFacts,
  checkAssertion,
  declareRelation,
  declareSchemas,
  explainFact,
  queryDatabase,
  relationValue,
  retractFacts,
  type SchemaDeclaration,
} from "@/logic/database";
import { makeSchema } from "@/logic/fit";
import { plainValue } from "@/logic/model";
import {
  applyQueryOptions,
  parseInvariantOptions,
  parseQueryOptions,
  readOptions,
} from "@/logic/query-options";
import { saveDatabase } from "@/logic/snapshot";
import {
  Atom,
  callsOf,
  DeferredCall,
  type Goal,
  invoke,
  isForm,
  isGoal,
  isLogicVariableName,
  isQuestion,
  isWaitingForm,
  type LionFunction,
  LogicForm,
  LogicValue,
  LogicVariable,
  type RelationInfo,
  render,
  replaceVariables,
  sameValue,
  show,
  termVariables,
} from "@/logic/terms";
import {
  type AndFormSchema,
  type AssumingFormSchema,
  type ExistsFormSchema,
  type FactFormSchema,
  type FindFormSchema,
  type InFormSchema,
  type InvariantFormSchema,
  type NotFormSchema,
  type OrFormSchema,
  type QueryFormSchema,
  type RelationFormSchema,
  type RetractFormSchema,
  type RuleFormSchema,
  type SchemaFormSchema,
  type SomeFormSchema,
  type UnifyFormSchema,
  ValidIdentifierSchema,
  type WhyFormSchema,
} from "@/schemas/evaluation";
import type { LionExpressionType } from "@/schemas/lion-expression";
import { LionAskerService } from "@/services/asker";
import { LionEnvironmentService } from "@/services/evaluation";
import type { EvaluateResult } from "@/types/evaluation";

/**
 * Evaluates a part of a form that reads or changes the logic database:
 * `evaluate` unless another evaluator is given, as the tests give the
 * interpreter they check the compiler against.
 */
export type Part = (expression: LionExpressionType) => EvaluateResult;

const evaluateAll = (
  expressions: readonly LionExpressionType[],
  part: Part = evaluate
) => Effect.all(expressions.map(part));

/** A relation call with each question among its arguments asked. */
const asked = (call: Atom) =>
  call.args.some(isQuestion)
    ? Effect.map(
        Effect.forEach(call.args, answer),
        (args) => new Atom(call.relation, args)
      )
    : Effect.succeed(call);

/**
 * What `some` describes, or what `exists` says holds, written in plain
 * code, with the questions among its arguments asked.
 */
const described = (form: string, goal: unknown) =>
  Effect.gen(function* () {
    const calls = callsOf(goal);
    if (calls === undefined) {
      return yield* logicError(
        `${form} expects a relation call, or an "and" of them, but found ${show(goal)}.`
      );
    }
    const answered = yield* Effect.forEach(calls, asked);
    return answered.length === 1
      ? (answered[0] as Atom)
      : new LogicForm("and", answered);
  });

/**
 * The rows that `exists` says hold, in plain code: each relation call of
 * its goal, with the unknown that `some` names in place of each variable
 * it lists.
 */
const rowsOf = (exists: LogicForm) =>
  Effect.gen(function* () {
    const [names, goal] = exists.parts as [readonly string[], unknown];
    const description = yield* described("exists", goal);
    const unknown = (variable: LogicVariable) =>
      names.includes(variable.name)
        ? new LogicForm("some", [variable, description])
        : undefined;
    return yield* Effect.forEach(callsOf(description) ?? [], (call) =>
      Effect.map(
        Effect.forEach(call.args, (arg) =>
          plainValue(replaceVariables(arg, unknown))
        ),
        (args) => new Atom(call.relation, args)
      )
    );
  });

/**
 * The facts a form names. A fact holds values, so a question among its
 * arguments is asked, and `exists` names the rows it says hold.
 */
const atoms = (
  form: string,
  facts: readonly LionExpressionType[],
  part: Part = evaluate
) =>
  Effect.gen(function* () {
    const result: Atom[] = [];
    for (const value of yield* evaluateAll(facts, part)) {
      if (isForm(value, "exists")) {
        result.push(...(yield* rowsOf(value)));
      } else if (value instanceof Atom) {
        result.push(yield* asked(value));
      } else {
        return yield* logicError(
          `${form} expects relation calls, but found ${show(value)}.`
        );
      }
    }
    return result;
  });

/**
 * Reads `{"key": [...], "schema": name, "merge": {column: aggregate}}`.
 * Relation options are read as written: the key names columns, the schema
 * names a declared schema, and the merge says which lattice aggregate joins
 * the values a key gets in each column it names.
 */
const relationOptions = (name: string, options: unknown) =>
  Effect.gen(function* () {
    const {
      key: given,
      merge,
      schema,
    } = options === undefined ? {} : yield* readOptions("relation", options);
    const key = typeof given === "string" ? [given] : given;
    const isKey =
      Array.isArray(key) && key.every((column) => typeof column === "string");
    if (!(key === undefined || isKey)) {
      return yield* logicError(
        `The key of "${name}" must be a column name or a list of them, but found ${show(given)}.`
      );
    }
    if (!(schema === undefined || typeof schema === "string")) {
      return yield* logicError(
        `The schema of "${name}" must be the name of a declared schema, but found ${show(schema)}.`
      );
    }
    const merges =
      typeof merge === "object" && merge !== null && !Array.isArray(merge)
        ? Object.entries(merge as Record<string, unknown>)
        : undefined;
    if (
      !(
        merge === undefined ||
        merges?.every(([, kind]) => typeof kind === "string")
      )
    ) {
      return yield* logicError(
        `The merge of "${name}" must be a record from a column to the aggregate that joins its values, as in {"price": "aggregate/min"}, but found ${show(merge)}.`
      );
    }
    return {
      key: key as readonly string[] | undefined,
      merge: merges as readonly (readonly [string, string])[] | undefined,
      schema,
    };
  });

const VARIABLE_NAME = /^[A-Za-z][\w-]*$/;

/**
 * A variable for each column: its name when that can be a variable's name,
 * and otherwise, for every column, its position.
 */
const columnVariables = (columns: readonly string[]) =>
  columns.every((column) => VARIABLE_NAME.test(column))
    ? columns.map((column) => `?${column}`)
    : columns.map((_, at) => `?column-${at + 1}`);

/**
 * Says that every row of a relation must fit a schema, as the invariant a
 * program would write: no row, taken as a record of its columns, fails the
 * schema. So a relation's schema is kept, reported, and saved like any
 * other invariant.
 */
const rowsMustFit = (
  relation: RelationInfo,
  value: LionFunction,
  schemaName: string,
  schema: LionFunction
) => {
  const variables = columnVariables(relation.columns);
  const row = Object.fromEntries(
    relation.columns.map((column, at) => [column, variables[at]])
  );
  const form = [
    "invariant",
    ["and", [relation.name, ...variables], ["not", [schemaName, row]]],
    { assert: "none" },
  ];
  // The two names mean the relation and the schema, whatever else the
  // program has bound them to.
  return evaluateInvariant(form as never).pipe(
    Effect.provideService(
      LionEnvironmentService,
      makeEnvironment({ [relation.name]: value, [schemaName]: schema })
    )
  );
};

/**
 * ["relation", "dep", ["from", "to"]] declares a relation and binds it.
 * ["relation", "order", ["id", "status"], {"key": ["id"]}] gives it a key,
 * {"schema": "Order"} says that its rows must fit a declared schema, and
 * {"merge": {"price": "aggregate/min"}} that the prices a key gets join.
 */
export const evaluateRelation = ([
  _,
  name,
  columns,
  options,
]: typeof RelationFormSchema.Type) =>
  Effect.gen(function* () {
    const store = yield* database;
    const { key, merge, schema } = yield* relationOptions(name, options);
    const rowSchema =
      schema === undefined ? undefined : store.schemas.get(schema);
    if (schema !== undefined && rowSchema === undefined) {
      return yield* logicError(
        `Relation "${name}" names the schema "${schema}" for its rows, but no schema is declared under that name. Declare it first, as in ["schema", "${schema}", {...}].`
      );
    }
    const relation = yield* declareRelation(store, name, columns, key, merge);
    const value = relationValue(relation);
    setGlobalBinding(yield* LionEnvironmentService, name, value);
    if (schema !== undefined && rowSchema !== undefined) {
      yield* rowsMustFit(relation, value, schema, rowSchema);
    }
    return value;
  });

/**
 * What a form that was closed over its names evaluates to, with the values
 * those names had.
 */
const resolve = (value: unknown): EvaluateResult =>
  value instanceof DeferredCall && isWaitingForm(value)
    ? Effect.flatMap(
        Effect.forEach(value.args, resolve),
        (args) => invoke(value.fn as LionFunction, args) as EvaluateResult
      )
    : Effect.succeed(value);

/**
 * A shape is what a snapshot writes, so it has to evaluate to the same
 * schema whenever it is loaded. A shape that asks the database while it is
 * declared would not.
 */
const declaring = (name: string) =>
  Effect.provideService(LionAskerService, {
    answer: (question) =>
      logicError(
        `The shape of schema "${name}" asks ${show(question)} while it is declared, so it would depend on the facts of the moment. Ask inside a lambda, or use the relation itself as a schema.`
      ),
  });

const isIdentifier = Schema.is(ValidIdentifierSchema);

/**
 * ["schema", "Order", shape] declares a schema and binds it: a predicate on
 * one value, which fits when it fits the shape. The shape is evaluated once,
 * with the values its names have now, and can name the schema itself. More
 * names and shapes in the same form declare schemas that can name each
 * other: ["schema", "Order", shape, "Line", shape].
 */
export const evaluateSchema = ([_, ...parts]: typeof SchemaFormSchema.Type) =>
  Effect.gen(function* () {
    const store = yield* database;
    const environment = yield* LionEnvironmentService;
    const names = parts.filter((__, at) => at % 2 === 0);
    const shapes = parts.filter((__, at) => at % 2 === 1);
    const misnamed = names.find((name) => !isIdentifier(name));
    if (misnamed !== undefined || shapes.length !== names.length) {
      return yield* logicError(
        misnamed === undefined
          ? `The schema form takes a name and a shape for each schema, but ${show(names.at(-1))} has no shape.`
          : `A schema's name must be a string that is not the name of a special form, but found ${show(misnamed)}.`
      );
    }
    // A schema the database holds keeps standing for its name.
    const schemas = (names as string[]).map(
      (name) => store.schemas.get(name) ?? makeSchema(name)
    );
    const scope = makeEnvironment(
      Object.fromEntries(schemas.map((schema, at) => [names[at], schema])),
      environment
    );
    const declarations: SchemaDeclaration[] = [];
    for (const [at, schema] of schemas.entries()) {
      const name = names[at] as string;
      const form = shapes[at] as LionExpressionType;
      const definition = yield* suspend(form, scope);
      const strings = dataStrings(form, scope);
      const shape = yield* resolve(definition).pipe(declaring(name));
      if (shape instanceof LogicValue) {
        return yield* logicError(
          `The shape of schema "${name}" must be known when it is declared, but ${show(shape)} waits for a logic variable.`
        );
      }
      declarations.push({ definition, schema, shape, strings });
    }
    const declared = yield* declareSchemas(store, declarations);
    for (const [at, schema] of declared.entries()) {
      setGlobalBinding(environment, names[at] as string, schema);
    }
    return declared[0];
  });

export const evaluateRule = (
  [_, head, ...body]: typeof RuleFormSchema.Type,
  part: Part = evaluate
) =>
  Effect.gen(function* () {
    const [headValue, ...bodyValues] = yield* writing(
      evaluateAll([head, ...body], part)
    );
    const rules = yield* compileRule(headValue, bodyValues);
    // A head that says two values are the same holds as an invariant too.
    const invariants = yield* Effect.forEach(
      equalityGoals(headValue, bodyValues),
      (goal) =>
        Effect.map(compileQuery(goal), (query) => ({
          assert: "none" as const,
          goal,
          query,
        }))
    );
    yield* addRules(yield* database, rules, invariants);
    return ["rule", render(headValue), ...bodyValues.map(render)];
  });

export const evaluateFact = (
  [_, ...facts]: typeof FactFormSchema.Type,
  part: Part = evaluate
) =>
  Effect.gen(function* () {
    const values = yield* atoms("fact", facts, part);
    return yield* assertFacts(yield* database, values);
  });

export const evaluateRetract = (
  [_, ...facts]: typeof RetractFormSchema.Type,
  part: Part = evaluate
) =>
  Effect.gen(function* () {
    const values = yield* atoms("retract", facts, part);
    return yield* retractFacts(yield* database, values);
  });

/** ["query", goal, options?]; options are read as written, not evaluated. */
export const evaluateQuery = (
  [_, goal, options]: typeof QueryFormSchema.Type,
  part: Part = evaluate
) =>
  Effect.gen(function* () {
    const goalValue = yield* writing(part(goal));
    const query = yield* compileQuery(goalValue);
    const parsed = yield* parseQueryOptions(options, query.outputs);
    const store = yield* database;
    const rows = yield* queryDatabase(store, query);
    yield* checkAssertion(store, "query", parsed.assert, rows, goalValue);
    return applyQueryOptions(rows, parsed);
  });

/**
 * ["find", template, goal] is the template's value for every match of the
 * goal, as a sorted list. Outside of rules it is asked right away. In a
 * rule, query, or other find it is part of what is written: it is asked for
 * each answer of the rule, with the variables the rule has bound.
 */
export const evaluateFind = (
  [_, template, goal]: typeof FindFormSchema.Type,
  part: Part = evaluate
) =>
  Effect.gen(function* () {
    const [templateValue, goalValue] = yield* writing(
      evaluateAll([template, goal], part)
    );
    const find = new LogicForm("find", [templateValue, goalValue]);
    return (yield* isWriting) ? find : yield* answer(find);
  });

/**
 * ["assuming", ["fact", goal, ...], ["retract", goal, ...], ..., expression]
 * is what the expression gives in the database as it would be after the
 * changes, made in order, each as its form would make it: keys, merges, and
 * invariants included. The database itself does not change. It is a
 * question, as a find is: outside of rules it is asked right away, and in a
 * rule, query, or find it is asked for each answer, with the variables the
 * rule has bound.
 */
export const evaluateAssuming = (
  [_, ...parts]: typeof AssumingFormSchema.Type,
  part: Part = evaluate
) =>
  Effect.gen(function* () {
    const expression = parts.at(-1);
    const changes = parts.slice(0, -1);
    if (expression === undefined || changes.length === 0) {
      return yield* logicError(
        `assuming takes fact and retract forms, then the expression to evaluate as if they were made, as in ["assuming", ["fact", ["edge", "c", "d"]], ["path", "a", "d"]].`
      );
    }
    const held: LogicForm[] = [];
    for (const change of changes) {
      const [form, ...goals] = change as readonly unknown[];
      if (!(form === "fact" || form === "retract")) {
        return yield* logicError(
          `assuming takes fact and retract forms before its expression, but found ${show(change)}.`
        );
      }
      const values = yield* writing(
        evaluateAll(goals as LionExpressionType[], part)
      );
      const wrong = values.find((value) => !(value instanceof Atom));
      if (wrong !== undefined) {
        return yield* logicError(
          `assuming takes relation calls in its ${form} forms, but found ${show(wrong)}.`
        );
      }
      held.push(new LogicForm(form, values));
    }
    const value = yield* writing(part(expression as LionExpressionType));
    const question = new LogicForm("assuming", [...held, value]);
    return (yield* isWriting) ? question : yield* answer(question);
  });

/**
 * ["exists", ["?m"], goal] holds when the goal holds for some value of
 * each variable it lists, which are its own. In a rule's head it says the
 * head holds for values nobody has given, which the rule invents. In a
 * fact it states the rows of the goal with those values unknown.
 */
export const evaluateExists = (
  [_, names, goal]: typeof ExistsFormSchema.Type,
  part: Part = evaluate
) =>
  Effect.gen(function* () {
    const wrong = names.find(
      (name) => !isLogicVariableName(name) || name.startsWith("?_")
    );
    if (wrong !== undefined || new Set(names).size !== names.length) {
      return yield* logicError(
        `exists lists named logic variables, each once, such as ["?m"], but found ${JSON.stringify(names)}.`
      );
    }
    const value = yield* goalOrBoolean("exists", goal, part);
    if (typeof value === "boolean") {
      return value;
    }
    const own = names.map((name) => name.slice(1));
    const missing = own.find((name) => !value.variables.includes(name));
    if (missing !== undefined) {
      return yield* logicError(
        `exists lists "?${missing}", but its goal does not mention it: ${show(value)}.`
      );
    }
    return new LogicForm("exists", [own, value]);
  });

/**
 * ["some", "?m", goal] is the unknown value that ?m stands for in what the
 * goal describes: the value a rule invents for ?m when its head says
 * ["exists", ["?m"], goal]. Every other variable of the goal that a rule or
 * query around it does not bind is its own too.
 */
export const evaluateSome = (
  [_, name, goal]: typeof SomeFormSchema.Type,
  part: Part = evaluate
) =>
  Effect.gen(function* () {
    if (!isLogicVariableName(name) || name.startsWith("?_")) {
      return yield* logicError(
        `some stands for a named logic variable, such as "?m", but found ${JSON.stringify(name)}.`
      );
    }
    const value = yield* part(goal);
    const variable = name.slice(1);
    if (!termVariables(value).includes(variable)) {
      return yield* logicError(
        `some stands for "${name}", but its goal does not mention it: ${show(value)}.`
      );
    }
    if (yield* isWriting) {
      if (callsOf(value) === undefined) {
        return yield* logicError(
          `some expects a relation call, or an "and" of them, but found ${show(value)}.`
        );
      }
      return new LogicForm("some", [new LogicVariable(variable), value]);
    }
    return yield* plainValue(
      new LogicForm("some", [
        new LogicVariable(variable),
        yield* described("some", value),
      ])
    );
  });

/**
 * ["invariant", goal, {"assert": "none"}] keeps a query assertion in the
 * database: the goal must have no answers ("none"), or at least one ("some"),
 * now and after every later change. Options are read as written.
 */
export const evaluateInvariant = (
  [_, goal, options]: typeof InvariantFormSchema.Type,
  part: Part = evaluate
) =>
  Effect.gen(function* () {
    const goalValue = yield* writing(part(goal));
    const query = yield* compileQuery(goalValue);
    const assert = yield* parseInvariantOptions(options);
    yield* addInvariant(yield* database, { assert, goal: goalValue, query });
    return ["invariant", render(goalValue), { assert }];
  });

export const evaluateWhy = (
  [_, fact]: typeof WhyFormSchema.Type,
  part: Part = evaluate
) =>
  Effect.gen(function* () {
    const [atom] = yield* atoms("why", [fact], part);
    return yield* explainFact(yield* database, atom as Atom);
  });

/** What `not`, `and`, and `or` give a value that is no goal or boolean. */
const notGoal = (form: string, value: unknown) =>
  new Pending(
    logicError(`${form} expects goals or booleans, but found ${show(value)}.`)
  );

const goalOrBoolean = (
  form: string,
  expression: LionExpressionType,
  part: Part
) =>
  Effect.flatMap(part(expression), (value) =>
    isGoal(value)
      ? Effect.succeed(value)
      : logicError(
          `${form} expects goals or booleans, but found ${show(value)}.`
        )
  );

/** Negates a goal, or a boolean outside of logic. */
export const compileNot = ([_, goal]: typeof NotFormSchema.Type): Compiled => {
  const value = compile(goal);
  const negate = (made: unknown) => {
    if (!isGoal(made)) {
      return notGoal("not", made);
    }
    return typeof made === "boolean" ? !made : new LogicForm("not", [made]);
  };
  return (environment, depth) =>
    andThen(value(environment, depth), depth, negate);
};

/**
 * `and` and `or` read their arguments in order. On booleans they stop at the
 * first one that decides the result, false for `and` and true for `or`, as
 * in Scheme. Once an argument is a goal, they combine goals.
 */
const connective =
  (form: "and" | "or") =>
  ([_, ...items]:
    | typeof AndFormSchema.Type
    | typeof OrFormSchema.Type): Compiled => {
    const decides = form === "or";
    const nodes = items.map(compile);
    const from = (
      at: number,
      goals: readonly Goal[],
      environment: Environment,
      depth: number
    ): unknown => {
      if (at === nodes.length) {
        return goals.length === 0 ? !decides : new LogicForm(form, goals);
      }
      return andThen(
        (nodes[at] as Compiled)(environment, depth),
        depth,
        (value, now) => {
          if (!isGoal(value)) {
            return notGoal(form, value);
          }
          if (value === decides && goals.length === 0) {
            return decides;
          }
          const kept = value === !decides ? goals : [...goals, value];
          return from(at + 1, kept, environment, now);
        }
      );
    };
    return (environment, depth) => from(0, [], environment, depth);
  };

export const compileAnd = connective("and");

export const compileOr = connective("or");

/**
 * The values of the operands of a form that binds or tests, or a goal of the
 * form when it is one: see `known`.
 */
const binding = (
  form: "=" | "in",
  operands: readonly unknown[],
  test: (values: readonly unknown[]) => unknown
): unknown => {
  if (!operands.some((operand) => operand instanceof LogicValue)) {
    return test(operands);
  }
  return new Pending(
    Effect.flatMap(known(operands), (values) =>
      values === undefined
        ? Effect.succeed(new LogicForm(form, operands))
        : toEffect(test(values))
    )
  );
};

/** Unifies two terms; without logic variables it is plain equality. */
export const compileUnify = ([
  _,
  left,
  right,
]: typeof UnifyFormSchema.Type): Compiled => {
  const operands = [compile(left), compile(right)];
  const same = (values: readonly unknown[]) => sameValue(values[0], values[1]);
  return (environment, depth) =>
    andThen(runAll(operands, environment, depth), depth, (made) =>
      binding("=", made as readonly unknown[], same)
    );
};

/**
 * ["in", element, list] binds the element to each item of the list, or tests
 * that it is one. Without logic variables it is plain membership.
 */
export const compileIn = ([
  _,
  element,
  list,
]: typeof InFormSchema.Type): Compiled => {
  const operands = [compile(element), compile(list)];
  const member = ([elementValue, listValue]: readonly unknown[]) =>
    Array.isArray(listValue)
      ? listValue.some((item) => sameValue(item, elementValue))
      : new Pending(
          logicError(`"in" expects a list, but found ${show(listValue)}.`)
        );
  return (environment, depth) =>
    andThen(runAll(operands, environment, depth), depth, (made) =>
      binding("in", made as readonly unknown[], member)
    );
};

/**
 * ["snapshot"] returns a Lion program that rebuilds the current database.
 * Strings bound in the environment are quoted so they load as strings.
 */
export const evaluateSnapshot = () =>
  Effect.gen(function* () {
    const names = boundNames(yield* LionEnvironmentService);
    return yield* saveDatabase(yield* database, {
      isBound: (name) => names.has(name),
    });
  });
