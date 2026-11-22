/**
 * The model the compiled evaluator is checked against: Lion's interpreter
 * as it was before expressions were compiled. It walks an expression again
 * each time it runs, and every node is an Effect bound to the next. Only
 * how it reads scopes changed, since scopes are now read right away, and
 * what a string means: each scope declares, from its start, the names its
 * body defines, so a string is a name exactly when a scope declares it.
 *
 * The forms that read or change the logic database are the evaluator's
 * own, given the model to evaluate their parts with.
 */
import { Array as Arr, Effect, pipe, Record, Schema } from "effect";
import {
  InvalidFunctionCallError,
  LogicError,
  logicError,
  MalformedFormError,
  UndefinedYetError,
  unboundSet,
  wrongCount,
} from "@/errors/evaluation";
import { answer, isWriting, known } from "@/evaluation/asking";
import { nameOrString } from "@/evaluation/base-forms/primitive";
import { Pending, toEffect } from "@/evaluation/compiled";
import {
  assign,
  declares,
  type Environment,
  lookup,
  makeEnvironment,
  predeclare,
  setLocalBinding,
  UNASSIGNED,
  UNBOUND,
} from "@/evaluation/environment";
import { declaredIn, definedIn } from "@/evaluation/hoisting";
import { isBegin } from "@/evaluation/special-forms/begin";
import { notTruth } from "@/evaluation/special-forms/cond";
import { Delayed } from "@/evaluation/special-forms/delay";
import {
  argumentList,
  suspendArguments,
  suspend as suspendIn,
} from "@/evaluation/special-forms/lambda";
import {
  evaluateAssuming,
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
import { refusedSet } from "@/evaluation/special-forms/set";
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
import { module as schemaModule } from "@/modules/schema";
import {
  fitsForm,
  isMatchCase,
  isSpecialFormName,
  LionFunctionValueSchema,
  parameterNames,
  parameterSchemas,
  type SpecialFormName,
  USAGE,
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
    if (binding === UNASSIGNED) {
      return Effect.fail(new UndefinedYetError({ unassigned: name }));
    }
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

/** The names `define` gave Lion functions, which their failures use. */
const NAMES = new WeakMap<object, string>();

const makeLambda = (
  parameters: readonly string[],
  body: LionExpressionType,
  environment: Environment,
  contract?: {
    readonly checks: readonly unknown[];
    readonly written: readonly unknown[];
  },
  rest = false
) => {
  const fn: (...args: unknown[]) => EvaluateResult = registerLambda(
    Effect.fn(function* (...given: unknown[]) {
      if (rest) {
        // One name is bound to the list of every argument.
        const frame = makeEnvironment(
          { [parameters[0] as string]: yield* toEffect(argumentList(given)) },
          environment,
          true
        );
        predeclare(frame.bindings, definedIn(body, frame));
        return yield* evaluate(body).pipe(
          Effect.provideService(LionEnvironmentService, frame)
        );
      }
      if (given.length !== parameters.length) {
        return yield* wrongCount(
          JSON.stringify(
            NAMES.get(fn) ?? ["lambda", contract?.written ?? parameters, body]
          ),
          [parameters.length, parameters.length],
          given.length
        );
      }
      // Each argument a contract covers is checked as schema/assert checks it.
      const args: unknown[] = [];
      for (const [at, arg] of given.entries()) {
        const schema = contract?.checks[at];
        args.push(
          schema === undefined
            ? arg
            : yield* apply(schemaModule.assert, [arg, schema])
        );
      }
      const frame = makeEnvironment(
        Record.fromEntries(Arr.zip(parameters, args)),
        environment,
        true
      );
      predeclare(frame.bindings, definedIn(body, frame));
      return yield* evaluate(body).pipe(
        Effect.provideService(LionEnvironmentService, frame)
      );
    }),
    {
      parameters,
      body,
      environment,
      ...(rest ? { written: parameters[0] as string } : {}),
      ...(contract === undefined ? {} : { written: contract.written }),
    }
  );
  return fn;
};

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
    const environment = yield* LionEnvironmentService;
    for (const [condition, result] of cases) {
      if (condition === "else" && !declares(environment, "else")) {
        return yield* evaluate(result);
      }
      let holds = yield* evaluate(condition);
      if (holds instanceof LogicValue) {
        if (isWaiting(holds) || (yield* isWriting)) {
          return yield* suspend(expression);
        }
        holds = Boolean(yield* answer(holds));
      }
      if (typeof holds !== "boolean") {
        return yield* logicError(notTruth(condition, holds));
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
    const hasFallback = !isMatchCase(rest.at(-1));
    const patterns = (hasFallback ? rest.slice(0, -1) : rest) as (readonly [
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
    if (!hasFallback) {
      return yield* new LogicError({
        message: `No case of the match fits ${show(value)}, and it has no fallback: ${show(expression)}.`,
      });
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

/**
 * Evaluates a `begin`'s expressions in order, and gives the last one's
 * value. One before the last makes the whole form wait as a condition makes
 * `cond` wait, unless the form is a program's own, `spliced`, whose forms
 * run one at a time.
 */
const evaluateBegin = (expression: Form, spliced: boolean): EvaluateResult =>
  Effect.gen(function* () {
    const [_, ...args] = expression as readonly LionExpressionType[];
    let value: unknown = [];
    for (const [at, arg] of args.entries()) {
      value = yield* spliced ? evaluateProgram(arg) : evaluate(arg);
      const waits =
        !spliced &&
        at < args.length - 1 &&
        value instanceof LogicValue &&
        (isWaiting(value) || (yield* isWriting));
      if (waits) {
        return yield* suspend(expression as LionExpressionType);
      }
    }
    return value;
  });

/** Evaluates a program: a `begin` there runs its forms one at a time. */
const evaluateProgram = (program: LionExpressionType): EvaluateResult =>
  Effect.flatMap(scope, (environment) =>
    isBegin(program, environment)
      ? evaluateBegin(program as Form, true)
      : evaluate(program)
  );

const SPECIAL_FORMS: Record<SpecialFormName, (form: never) => EvaluateResult> =
  {
    begin: (expression: Form) => evaluateBegin(expression, false),
    define: ([_, id, expression]: Form) =>
      Effect.gen(function* () {
        const environment = yield* LionEnvironmentService;
        const value = yield* evaluate(expression as LionExpressionType);
        setLocalBinding(environment, id as string, value);
        if (
          typeof value === "function" &&
          lambdaInfo(value) &&
          !NAMES.has(value)
        ) {
          NAMES.set(value, id as string);
        }
        return value;
      }),
    "set!": ([_, id, expression]: Form) =>
      Effect.gen(function* () {
        const environment = yield* LionEnvironmentService;
        if (!declares(environment, id as string)) {
          return yield* unboundSet(id as string);
        }
        const value = yield* evaluate(expression as LionExpressionType);
        const refused = refusedSet(environment, id as string);
        if (refused !== undefined) {
          return yield* refused;
        }
        assign(environment, id as string, value);
        return value;
      }),
    eval: (form: Form) => evaluateEval(form),
    quote: ([_, quoted]: Form) => Effect.succeed(quoted),
    delay: ([_, expression]: Form) =>
      Effect.map(
        LionEnvironmentService,
        (environment) =>
          new Delayed(
            () =>
              new Pending(
                evaluate(expression as LionExpressionType).pipe(
                  Effect.provideService(LionEnvironmentService, environment)
                )
              )
          )
      ),
    lambda: ([_, parameters, body]: Form) =>
      Effect.gen(function* () {
        const environment = yield* scope;
        if (typeof parameters === "string") {
          return makeLambda(
            [parameters],
            body as LionExpressionType,
            environment,
            undefined,
            true
          );
        }
        const written = parameters as readonly unknown[];
        const schemas = parameterSchemas(written);
        const names = parameterNames(written);
        if (schemas.every((schema) => schema === undefined)) {
          return makeLambda(names, body as LionExpressionType, environment);
        }
        const checks: unknown[] = [];
        for (const schema of schemas) {
          checks.push(
            schema === undefined
              ? undefined
              : yield* evaluate(schema as LionExpressionType)
          );
        }
        return makeLambda(names, body as LionExpressionType, environment, {
          checks,
          written,
        });
      }),
    cond: (form: Form) => evaluateCond(form),
    match: (form: Form) => evaluateMatch(form),
    relation: (form) => evaluateRelation(form),
    schema: (form) => evaluateSchema(form),
    rule: (form) => evaluateRule(form, evaluate),
    fact: (form) => evaluateFact(form, evaluate),
    retract: (form) => evaluateRetract(form, evaluate),
    query: (form) => evaluateQuery(form, evaluate),
    find: (form) => evaluateFind(form, evaluate),
    assuming: (form) => evaluateAssuming(form, evaluate),
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
    const [head] = expression;
    if (!isSpecialFormName(head)) {
      return evaluateFunctionCall(expression);
    }
    return Effect.flatMap(scope, (environment): EvaluateResult => {
      if (declares(environment, head)) {
        return evaluateFunctionCall(expression);
      }
      return fitsForm(head, expression)
        ? SPECIAL_FORMS[head](expression as never)
        : Effect.fail(
            new MalformedFormError({
              expression,
              form: head,
              usage: USAGE[head],
            })
          );
    });
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
      Effect.flatMap((program) => {
        const top = makeEnvironment(
          {
            ...relationBindings(database),
            ...schemaBindings(database),
            ...environment,
          },
          undefined,
          true
        );
        predeclare(top.bindings, [
          ...definedIn(program, top),
          ...declaredIn(program, top),
        ]);
        return evaluateProgram(program).pipe(
          Effect.provideService(LionEnvironmentService, top)
        );
      }),
      Effect.provideService(LionDatabaseService, database)
    );
  });
