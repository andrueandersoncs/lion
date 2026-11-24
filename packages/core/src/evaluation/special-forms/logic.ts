import { Effect, Schema } from "effect";
import { logicError, MalformedFormError, notList } from "@/errors/evaluation";
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
  declares,
  type Environment,
  madeNow,
  makeEnvironment,
  type Scope,
  scopeWith,
  setGlobalBinding,
} from "@/evaluation/environment";
import { compile, compileAll, evaluate } from "@/evaluation/evaluate";
import { dataStrings, suspend } from "@/evaluation/special-forms/lambda";
import { compileQuery } from "@/logic/compile";
import {
  addInvariant,
  addRule,
  assertFacts,
  checkAssertion,
  declareRelation,
  declareSchemas,
  queryDatabase,
  relationValue,
  retract,
  type SchemaDeclaration,
} from "@/logic/database";
import { makeSchema } from "@/logic/fit";
import { plainValue } from "@/logic/model";
import {
  applyQueryOptions,
  parseInvariantOptions,
  parseQueryOptions,
  parseRelationOptions,
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
import { tellWatchers } from "@/logic/watch";
import {
  type AndFormSchema,
  type AssumingFormSchema,
  type ExistsFormSchema,
  type FactFormSchema,
  type FindFormSchema,
  fitsForm,
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
  USAGE,
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

/**
 * Evaluates the parts of a logic form compiled in `scope`, the scope the
 * form is written in, so a string means in them what it means in plain
 * code there. A part is compiled each time the form runs, as most run once,
 * such as the facts of a `fact` form.
 */
export const partIn =
  (scope: Scope | undefined): Part =>
  (expression) =>
    Effect.flatMap(Effect.service(LionEnvironmentService), (environment) =>
      toEffect(compile(expression, scope ?? environment)(environment, 0))
    );

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
const notDescribed = (form: string, goal: unknown) =>
  logicError(
    `${form} expects a relation call, or an "and" of them, but found ${show(goal)}.`
  );

/** The variable `some` or `exists` owns is one its goal mentions. */
const notMentioned = (form: string, name: string, goal: unknown) =>
  logicError(
    `${form} owns "${name}", but its goal does not mention it: ${show(goal)}.`
  );

/** What a form that takes relation calls is told of a value that is not one. */
const notCalls = (form: unknown, value: unknown) =>
  logicError(`${form} expects relation calls, but found ${show(value)}.`);

const described = (form: string, goal: unknown) =>
  Effect.gen(function* () {
    const calls = callsOf(goal);
    if (calls === undefined) {
      return yield* notDescribed(form, goal);
    }
    const answered = yield* Effect.forEach(calls, asked);
    return answered.length === 1
      ? (answered[0] as Atom)
      : new LogicForm("and", answered);
  });

/**
 * The rows that `exists` says hold: each relation call of what it
 * describes, with a `some` term in place of each variable it lists, which
 * stands for the unknown value the variable has.
 */
const heldRows = (exists: LogicForm, description: unknown) => {
  const [names] = exists.parts as [readonly string[], unknown];
  const unknown = (variable: LogicVariable) =>
    names.includes(variable.name)
      ? new LogicForm("some", [variable, description])
      : undefined;
  return (callsOf(description) ?? []).map(
    (call) =>
      new Atom(
        call.relation,
        call.args.map((arg) => replaceVariables(arg, unknown))
      )
  );
};

/**
 * The rows that `exists` says hold, in plain code: each with the unknown
 * that `some` names in place of each variable it lists.
 */
const rowsOf = (exists: LogicForm) =>
  Effect.gen(function* () {
    const description = yield* described("exists", exists.parts[1]);
    return yield* Effect.forEach(heldRows(exists, description), (row) =>
      Effect.map(
        Effect.forEach(row.args, plainValue),
        (args) => new Atom(row.relation, args)
      )
    );
  });

/**
 * True for a `rule` or `invariant` form, where `retract` and `assuming`
 * hold one rather than make it: one that no scope around it declares.
 */
const isHeld = (scope: Scope) => (item: unknown) =>
  Array.isArray(item) &&
  (item[0] === "rule" || item[0] === "invariant") &&
  !declares(scope, item[0]);

/**
 * The facts a form names. A fact holds values, so a question among its
 * arguments is asked, and `exists` names the rows it says hold. A rule or
 * invariant form among them is refused before any is evaluated, since
 * evaluating it would add it.
 */
const atoms = (
  form: string,
  facts: readonly LionExpressionType[],
  part: Part = evaluate,
  scope?: Scope
) =>
  Effect.gen(function* () {
    const isTaken = isHeld(scope ?? (yield* LionEnvironmentService));
    const held = facts.find(isTaken);
    if (held !== undefined) {
      return yield* notCalls(form, held);
    }
    const result: Atom[] = [];
    for (const value of yield* evaluateAll(facts, part)) {
      if (isForm(value, "exists")) {
        result.push(...(yield* rowsOf(value)));
      } else if (value instanceof Atom) {
        result.push(yield* asked(value));
      } else {
        return yield* notCalls(form, value);
      }
    }
    return result;
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
    const { key, merge, schema } = yield* parseRelationOptions(name, options);
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
    since: madeNow(),
  });

const isIdentifier = Schema.is(ValidIdentifierSchema);

/**
 * ["schema", "Order", shape] declares a schema and binds it: a predicate on
 * one value, which fits when it fits the shape. The shape is evaluated once,
 * with the values its names have now, and can name the schema itself. More
 * names and shapes in the same form declare schemas that can name each
 * other: ["schema", "Order", shape, "Line", shape].
 */
export const evaluateSchema = (
  [_, ...parts]: typeof SchemaFormSchema.Type,
  _part?: Part,
  written?: Scope
) =>
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
    const inner = makeEnvironment(
      Object.fromEntries(schemas.map((schema, at) => [names[at], schema])),
      environment
    );
    // A shape reads the names the form's scope declares, and the schemas.
    const scope = scopeWith(names as string[], written ?? environment);
    const declarations: SchemaDeclaration[] = [];
    for (const [at, schema] of schemas.entries()) {
      const name = names[at] as string;
      const form = shapes[at] as LionExpressionType;
      const definition = yield* suspend(form, inner, undefined, scope);
      const strings = dataStrings(form, inner, scope);
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
    const db = yield* database;
    yield* addRule(db, headValue, bodyValues);
    yield* tellWatchers(db);
    return ["rule", render(headValue), ...bodyValues.map(render)];
  });

export const evaluateFact = (
  [_, ...facts]: typeof FactFormSchema.Type,
  part: Part = evaluate,
  scope?: Scope
) =>
  Effect.gen(function* () {
    const values = yield* atoms("fact", facts, part, scope);
    const db = yield* database;
    const made = yield* assertFacts(db, values);
    yield* tellWatchers(db);
    return made;
  });

/**
 * A `rule` or `invariant` form that `retract` takes back or `assuming`
 * makes, held as a logic form of its parts' values: they are evaluated as
 * the form would evaluate them, and nothing is added.
 */
const heldForm = (form: readonly LionExpressionType[], part: Part) =>
  Effect.gen(function* () {
    const name = form[0] as "rule" | "invariant";
    if (!fitsForm(name, form)) {
      return yield* new MalformedFormError({
        expression: form,
        form: name,
        usage: USAGE[name],
      });
    }
    if (name === "invariant") {
      const [__, goal, options] = form;
      const { assert, goalValue } = yield* invariantOf(
        goal as LionExpressionType,
        options,
        part
      );
      return new LogicForm("invariant", [goalValue, assert]);
    }
    const parts = yield* writing(
      evaluateAll(form.slice(1) as LionExpressionType[], part)
    );
    return new LogicForm("rule", parts);
  });

/**
 * ["retract", goal, ...] takes facts back. A `rule` or `invariant` form
 * among them, written as it was added, takes that rule or invariant back.
 */
export const evaluateRetract = (
  [_, ...parts]: typeof RetractFormSchema.Type,
  part: Part = evaluate,
  scope?: Scope
) =>
  Effect.gen(function* () {
    const isTaken = isHeld(scope ?? (yield* LionEnvironmentService));
    const values = yield* atoms(
      "retract",
      parts.filter((item) => !isTaken(item)),
      part
    );
    const forms = yield* Effect.forEach(
      parts.filter(isTaken) as LionExpressionType[][],
      (form) => heldForm(form, part)
    );
    const db = yield* database;
    const made = yield* retract(db, [...values, ...forms]);
    yield* tellWatchers(db);
    return made;
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
 * A change of an `assuming`, held as a logic form of its parts' values: a
 * `fact` form's relation calls, a `retract` form's relation calls and the
 * `rule` and `invariant` forms it takes back, or a `rule` form's head and
 * body. Nothing is changed yet.
 */
const changeOf = (change: unknown, part: Part, scope: Scope | undefined) =>
  Effect.gen(function* () {
    const [form, ...items] = Array.isArray(change) ? change : [];
    const notACall = (value: unknown) => notCalls(form, value);
    if (form === "rule") {
      return yield* heldForm(change as LionExpressionType[], part);
    }
    if (!(form === "fact" || form === "retract")) {
      return yield* logicError(
        `assuming takes fact, retract, and rule forms before its expression, but found ${show(change)}.`
      );
    }
    const kind: "fact" | "retract" = form;
    if (!fitsForm(kind, change)) {
      return yield* new MalformedFormError({
        expression: change as LionExpressionType,
        form: kind,
        usage: USAGE[kind],
      });
    }
    // A rule or invariant form is held, never made: a `fact` cannot hold one.
    const isTaken = isHeld(scope ?? (yield* LionEnvironmentService));
    const values = yield* Effect.forEach(
      items as LionExpressionType[],
      (item): EvaluateResult => {
        if (isTaken(item)) {
          return form === "retract"
            ? heldForm(item as LionExpressionType[], part)
            : notACall(item);
        }
        return Effect.flatMap(writing(part(item)), (value) => {
          if (value instanceof Atom) {
            return Effect.succeed([value]);
          }
          // Rows with unknowns are made for each answer, as the fact form
          // would make them with the answer's values.
          const goal = isForm(value, "exists") ? value.parts[1] : undefined;
          return goal !== undefined && callsOf(goal) !== undefined
            ? Effect.succeed(heldRows(value as LogicForm, goal))
            : notACall(value);
        });
      }
    );
    return new LogicForm(form, values.flat());
  });

/**
 * ["assuming", change, ..., expression] is what the expression gives in
 * the database as it would be after the changes, made in order, each as its
 * form would make it: `["fact", goal, ...]` adds facts, `["retract", goal,
 * ...]` takes back facts and the rules and invariants it names, and
 * `["rule", head, goal, ...]` adds a rule, with keys, merges, and recursion
 * included. The database itself does not change. It is a question, as a
 * find is: outside of rules it is asked right away, and in a rule, query,
 * or find it is asked for each answer, with the variables the rule has
 * bound.
 */
export const evaluateAssuming = (
  [_, ...parts]: typeof AssumingFormSchema.Type,
  part: Part = evaluate,
  scope?: Scope
) =>
  Effect.gen(function* () {
    // The form's shape holds a change, then an expression, so both are there.
    const expression = parts.at(-1) as LionExpressionType;
    const changes = parts.slice(0, -1);
    const made = yield* Effect.forEach(changes, (change) =>
      changeOf(change, part, scope)
    );
    const value = yield* writing(part(expression as LionExpressionType));
    const question = new LogicForm("assuming", [...made, value]);
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
      return yield* notMentioned("exists", `?${missing}`, value);
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
      return yield* notMentioned("some", name, value);
    }
    if (yield* isWriting) {
      if (callsOf(value) === undefined) {
        return yield* notDescribed("some", value);
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
/**
 * The parts of an invariant form, checked as the form checks them: its goal,
 * then its options.
 */
const invariantOf = (goal: LionExpressionType, options: unknown, part: Part) =>
  Effect.gen(function* () {
    const goalValue = yield* writing(part(goal));
    const query = yield* compileQuery(goalValue);
    const assert = yield* parseInvariantOptions(options);
    return { assert, goalValue, query };
  });

export const evaluateInvariant = (
  [_, goal, options]: typeof InvariantFormSchema.Type,
  part: Part = evaluate
) =>
  Effect.gen(function* () {
    const { assert, goalValue, query } = yield* invariantOf(
      goal,
      options,
      part
    );
    const db = yield* database;
    yield* addInvariant(db, { assert, goal: goalValue, query });
    yield* tellWatchers(db);
    return ["invariant", render(goalValue), { assert }];
  });

export const evaluateWhy = (
  [_, fact]: typeof WhyFormSchema.Type,
  part: Part = evaluate,
  scope?: Scope
) =>
  Effect.gen(function* () {
    if (yield* isWriting) {
      const isTaken = isHeld(scope ?? (yield* LionEnvironmentService));
      if (isTaken(fact)) {
        return yield* notCalls("why", fact);
      }
      const value = yield* writing(part(fact));
      if (!(value instanceof Atom)) {
        return yield* notCalls("why", value);
      }
      return new LogicForm("why", [value]);
    }
    const [atom] = yield* atoms("why", [fact], part, scope);
    return yield* answer(new LogicForm("why", [atom as Atom]));
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
export const compileNot = (
  [_, goal]: typeof NotFormSchema.Type,
  scope: Scope | undefined
): Compiled => {
  const value = compile(goal, scope);
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
  (
    [_, ...items]: typeof AndFormSchema.Type | typeof OrFormSchema.Type,
    scope: Scope | undefined
  ): Compiled => {
    const decides = form === "or";
    const nodes = compileAll(items, scope);
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
export const compileUnify = (
  [_, left, right]: typeof UnifyFormSchema.Type,
  scope: Scope | undefined
): Compiled => {
  const operands = compileAll([left, right], scope);
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
export const compileIn = (
  [_, element, list]: typeof InFormSchema.Type,
  scope: Scope | undefined
): Compiled => {
  const operands = compileAll([element, list], scope);
  const member = ([elementValue, listValue]: readonly unknown[]) =>
    Array.isArray(listValue)
      ? listValue.some((item) => sameValue(item, elementValue))
      : new Pending(logicError(notList(list, listValue)));
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
