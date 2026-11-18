/**
 * The model the compiled evaluator is checked against: Lion's interpreter
 * as it was before expressions were compiled. It walks an expression again
 * each time it runs, and every node is an Effect bound to the next. Only
 * how it reads scopes changed, since scopes are now read right away.
 *
 * The forms that read or change the logic database are the evaluator's
 * own, given the model to evaluate their parts with.
 */
import { Array as Arr, Effect, pipe, Record, Schema } from "effect";
import {
  ArgumentMismatchError,
  InvalidFunctionCallError,
  logicError,
} from "@/errors/evaluation";
import { answer, isWriting, known } from "@/evaluation/asking";
import { nameOrString } from "@/evaluation/base-forms/primitive";
import {
  type Environment,
  lookup,
  makeEnvironment,
  setGlobalBinding,
  UNBOUND,
} from "@/evaluation/environment";
import {
  suspendArguments,
  suspend as suspendIn,
} from "@/evaluation/special-forms/lambda";
import {
  evaluateExists,
  evaluateFact,
  evaluateFind,
  evaluateInvariant,
  evaluateQuery,
  evaluateRelation,
  evaluateRetract,
  evaluateRule,
  evaluateSchema,
  evaluateSnapshot,
  evaluateSome,
  evaluateWhy,
} from "@/evaluation/special-forms/logic";
import {
  LogicDatabase,
  relationBindings,
  schemaBindings,
} from "@/logic/database";
import { fits } from "@/logic/fit";
import { mentioned } from "@/logic/strata";
import {
  DeferredCall,
  type Goal,
  invoke,
  isData,
  isForm,
  isGoal,
  isLogicFunction,
  isLogicVariableName,
  isNamespacedName,
  isQuestion,
  isWaiting,
  isWaitingForm,
  type LionFunction,
  LogicForm,
  LogicValue,
  LogicVariable,
  lambdaInfo,
  nameFunctions,
  recordMaker,
  registerLambda,
  relationOf,
  sameValue,
  show,
  termVariables,
} from "@/logic/terms";
import {
  LionFunctionValueSchema,
  type SpecialFormName,
  specialFormOf,
} from "@/schemas/evaluation";
import {
  LionExpressionSchema,
  type LionExpressionType,
} from "@/schemas/lion-expression";
import { LionDatabaseService } from "@/services/database";
import { LionEnvironmentService } from "@/services/evaluation";
import type { EvaluateResult, EvaluationError } from "@/types/evaluation";

type Form = readonly LionExpressionType[];

const scope = Effect.service(LionEnvironmentService);

const suspend = (form: LionExpressionType) =>
  Effect.flatMap(scope, (environment) => suspendIn(form, environment));

const evaluateAll = (expressions: readonly LionExpressionType[]) =>
  Effect.all(expressions.map(evaluate));

const evaluateReference = (name: string) =>
  Effect.flatMap(scope, (environment): EvaluateResult => {
    const binding = lookup(environment, name);
    if (binding !== UNBOUND) {
      return Effect.succeed(binding);
    }
    if (isLogicVariableName(name)) {
      return Effect.succeed(new LogicVariable(name.slice(1)));
    }
    return isNamespacedName(name)
      ? nameOrString(environment, name)
      : Effect.succeed(name);
  });

const evaluateRecord = (expression: Record<string, LionExpressionType>) =>
  pipe(
    expression,
    Record.map(evaluate),
    Effect.all,
    Effect.flatMap((record): EvaluateResult => {
      const values = Object.values(record);
      if (!values.some((value) => value instanceof LogicValue)) {
        return Effect.succeed(record);
      }
      return Effect.flatMap(
        isWriting,
        (isBeingWritten): EvaluateResult =>
          isBeingWritten || values.some(isWaiting)
            ? Effect.map(
                suspendArguments(values),
                (parts) =>
                  new DeferredCall(
                    recordMaker(Object.keys(record)),
                    undefined,
                    parts
                  )
              )
            : Effect.all(Record.map(record, answer))
      );
    })
  );

const makeLambda = (
  parameters: readonly string[],
  body: LionExpressionType,
  environment: Environment
) =>
  registerLambda(
    Effect.fn(function* (...args: unknown[]) {
      if (args.length < parameters.length) {
        return yield* new ArgumentMismatchError();
      }
      const frame = Record.fromEntries(Arr.zip(parameters, args));
      return yield* evaluate(body).pipe(
        Effect.provideService(
          LionEnvironmentService,
          makeEnvironment(frame, environment)
        )
      );
    }),
    { parameters, body, environment }
  );

const isSpecial = (arg: unknown) =>
  typeof arg === "function" || arg instanceof LogicValue;

const isHeld = (arg: unknown) => arg instanceof LogicValue || isData(arg);

const isLive = (arg: unknown) =>
  termVariables(arg).length > 0 || mentioned(arg).length > 0;

const asks = (arg: unknown): boolean =>
  isForm(arg, "find") ||
  (arg instanceof DeferredCall &&
    (isWaitingForm(arg) ||
      arg.parts.some((part) => isQuestion(part) || asks(part))));

const apply = (
  fn: unknown,
  args: readonly unknown[],
  callee?: unknown
): EvaluateResult => {
  const later = ([closed, ...rest]: readonly unknown[]) =>
    new DeferredCall(closed, callee, rest);
  const wait = () => Effect.map(suspendArguments([fn, ...args]), later);
  if (typeof fn !== "function") {
    return isWaiting(fn)
      ? wait()
      : logicError(`${show(fn)} is not a function, so it cannot be called.`);
  }
  const run = (values: readonly unknown[]) =>
    invoke(fn as LionFunction, values) as EvaluateResult;
  if (isLogicFunction(fn)) {
    if (args.some(asks) && lambdaInfo(fn) !== undefined) {
      return wait();
    }
    return args.every(isHeld) || relationOf(fn) === undefined
      ? run(args)
      : Effect.flatMap(suspendArguments(args), run);
  }
  const unlessWriting = (error: EvaluationError) =>
    Effect.flatMap(isWriting, (isBeingWritten) =>
      isBeingWritten ? wait() : Effect.fail(error)
    );
  if (!args.some(isSpecial)) {
    return run(args).pipe(Effect.catch(unlessWriting));
  }
  if (args.some(isWaiting)) {
    return wait();
  }
  return Effect.gen(function* () {
    if (!(yield* isWriting)) {
      const values = yield* Effect.forEach(args, answer);
      return yield* run(values).pipe(Effect.catchTag("WaitingError", wait));
    }
    const closed = yield* suspendArguments([fn, ...args]);
    return closed.slice(1).some(isLive)
      ? later(closed)
      : yield* run(args).pipe(Effect.catch(wait));
  });
};

const evaluateFunctionCall = (expression: Form) =>
  Effect.gen(function* () {
    const [head, ...tail] = yield* evaluateAll(expression);
    if (!(typeof head === "function" || isWaiting(head))) {
      return yield* new InvalidFunctionCallError({ expression });
    }
    return yield* apply(head, tail, expression[0]);
  });

const evaluateCond = (expression: Form) =>
  Effect.gen(function* () {
    const [_, ...cases] = expression as readonly [
      unknown,
      ...(readonly [LionExpressionType, LionExpressionType])[],
    ];
    for (const [condition, result] of cases) {
      let holds = yield* evaluate(condition);
      if (holds instanceof LogicValue) {
        if (isWaiting(holds) || (yield* isWriting)) {
          return yield* suspend(expression);
        }
        holds = yield* answer(holds);
      }
      if (holds) {
        return yield* evaluate(result);
      }
    }
    return null;
  });

const evaluateFunction = (expression: LionExpressionType) =>
  evaluate(expression).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(LionFunctionValueSchema))
  );

const evaluateMatch = (expression: Form): EvaluateResult =>
  Effect.gen(function* () {
    const [_, subject, ...rest] = expression;
    let value = yield* evaluate(subject as LionExpressionType);
    if (value instanceof LogicValue) {
      if (isWaiting(value) || (yield* isWriting)) {
        return yield* suspend(expression);
      }
      value = yield* answer(value);
    }
    const patterns = rest.slice(0, -1) as (readonly [
      LionExpressionType,
      LionExpressionType,
    ])[];
    for (const [schemaExpression, functionExpression] of patterns) {
      const schema = yield* evaluate(schemaExpression);
      const fn = yield* evaluateFunction(functionExpression);
      if (yield* fits(schema, value)) {
        return yield* apply(fn, [value]);
      }
    }
    const fallback = yield* evaluateFunction(rest.at(-1) as LionExpressionType);
    return yield* apply(fallback, [value]);
  }).pipe(
    Effect.catchTag("WaitingError", () => suspend(expression))
  ) as EvaluateResult;

const evaluateEval = ([_, expression]: Form) =>
  Effect.gen(function* () {
    const environment = yield* LionEnvironmentService;
    const run = (code: unknown) =>
      Schema.decodeUnknownEffect(LionExpressionSchema)(code).pipe(
        Effect.flatMap(evaluate),
        Effect.provideService(LionEnvironmentService, environment)
      );
    const code = yield* evaluate(expression as LionExpressionType);
    if (!(code instanceof LogicValue)) {
      return yield* run(code);
    }
    if (isWaiting(code) || (yield* isWriting)) {
      nameFunctions({ eval: run });
      return new DeferredCall(run, "eval", [code]);
    }
    return yield* run(yield* answer(code));
  });

const goalOrBoolean = (form: string, expression: LionExpressionType) =>
  Effect.flatMap(evaluate(expression), (value) =>
    isGoal(value)
      ? Effect.succeed(value)
      : logicError(
          `${form} expects goals or booleans, but found ${show(value)}.`
        )
  );

const connective =
  (form: "and" | "or") =>
  ([_, ...items]: Form) =>
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

const binding =
  (form: "=" | "in", test: (values: readonly unknown[]) => EvaluateResult) =>
  ([_, ...operands]: Form) =>
    Effect.gen(function* () {
      const made = yield* evaluateAll(operands);
      const values = yield* known(made);
      return values === undefined
        ? new LogicForm(form, made)
        : yield* test(values);
    });

const SPECIAL_FORMS: Record<SpecialFormName, (form: never) => EvaluateResult> =
  {
    begin: ([_, ...args]: Form) =>
      Effect.map(evaluateAll(args), (values) =>
        values.length === 0 ? [] : values.at(-1)
      ),
    define: ([_, id, expression]: Form) =>
      Effect.gen(function* () {
        const environment = yield* LionEnvironmentService;
        const value = yield* evaluate(expression as LionExpressionType);
        setGlobalBinding(environment, id as string, value);
        return value;
      }),
    eval: (form: Form) => evaluateEval(form),
    quote: ([_, quoted]: Form) => Effect.succeed(quoted),
    lambda: ([_, parameters, body]: Form) =>
      Effect.map(scope, (environment) =>
        makeLambda(
          parameters as readonly string[],
          body as LionExpressionType,
          environment
        )
      ),
    cond: (form: Form) => evaluateCond(form),
    match: (form: Form) => evaluateMatch(form),
    relation: (form) => evaluateRelation(form),
    schema: (form) => evaluateSchema(form),
    rule: (form) => evaluateRule(form, evaluate),
    fact: (form) => evaluateFact(form, evaluate),
    retract: (form) => evaluateRetract(form, evaluate),
    query: (form) => evaluateQuery(form, evaluate),
    find: (form) => evaluateFind(form, evaluate),
    exists: (form) => evaluateExists(form, evaluate),
    some: (form) => evaluateSome(form, evaluate),
    why: (form) => evaluateWhy(form, evaluate),
    not: ([_, goal]: Form) =>
      Effect.map(goalOrBoolean("not", goal as LionExpressionType), (value) =>
        typeof value === "boolean" ? !value : new LogicForm("not", [value])
      ),
    and: (form: Form) => connective("and")(form),
    or: (form: Form) => connective("or")(form),
    "=": (form: Form) =>
      binding("=", ([left, right]) => Effect.succeed(sameValue(left, right)))(
        form
      ),
    in: (form: Form) =>
      binding("in", ([element, list]) =>
        Array.isArray(list)
          ? Effect.succeed(list.some((item) => sameValue(item, element)))
          : logicError(`"in" expects a list, but found ${show(list)}.`)
      )(form),
    snapshot: () => evaluateSnapshot(),
    invariant: (form) => evaluateInvariant(form, evaluate),
  };

/** Evaluates an expression by walking it, one Effect for each node. */
export const evaluate = (expression: LionExpressionType): EvaluateResult => {
  if (Array.isArray(expression)) {
    if (expression.length === 0) {
      return Effect.succeed(expression);
    }
    const form = specialFormOf(expression);
    return form === undefined
      ? evaluateFunctionCall(expression)
      : SPECIAL_FORMS[form](expression as never);
  }
  if (typeof expression === "object" && expression !== null) {
    return evaluateRecord(expression as Record<string, LionExpressionType>);
  }
  return typeof expression === "string"
    ? evaluateReference(expression)
    : Effect.succeed(expression);
};

/** Runs a program as `run` does, with the model in place of the compiler. */
export const run = (
  expression: unknown,
  environment: Record<string, unknown>,
  database = new LogicDatabase()
) =>
  Effect.suspend(() => {
    nameFunctions(environment);
    return pipe(
      Schema.decodeUnknownEffect(LionExpressionSchema)(expression),
      Effect.flatMap(evaluate),
      Effect.provideService(
        LionEnvironmentService,
        makeEnvironment({
          ...relationBindings(database),
          ...schemaBindings(database),
          ...environment,
        })
      ),
      Effect.provideService(LionDatabaseService, database)
    );
  });
