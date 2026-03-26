import {
  Array as Arr,
  Context,
  Data,
  Effect,
  Equal,
  HashSet,
  Match,
  Option,
  pipe,
  Record,
  Ref,
  Schema,
} from "effect";
import {
  ContinuationNeededError,
  OplogMismatchError,
} from "@/errors/evaluation";
import { evaluate } from "@/evaluation/evaluate.ts";
import { stdlib } from "@/modules";
import {
  type FunctionCallFormSchema,
  LionFunctionValueSchema,
} from "@/schemas/evaluation";
import {
  OperationCompletedSchema,
  OperationStartedSchema,
} from "@/schemas/oplog";
import { LionOplogService } from "@/services/oplog";

const pureFunctions = HashSet.make(...Record.keys(stdlib));

export const evaluateFunctionCall = (
  functionCallExpression: typeof FunctionCallFormSchema.Type
) =>
  pipe(
    Arr.headNonEmpty(functionCallExpression),
    (name) => evaluate(name),
    Effect.flatMap((evaluatedName) =>
      pipe(
        Match.value(evaluatedName),
        Match.when(Schema.is(LionFunctionValueSchema), (_) =>
          pipe(
            Match.value(functionCallExpression),
            Match.when(
              ([name]) => !HashSet.has(pureFunctions, name),
              (impureFnExpr) =>
                pipe(
                  Effect.context<LionOplogService>(),
                  Effect.map(Context.get(LionOplogService)),
                  Effect.flatMap(Ref.get),
                  Effect.map(Arr.head),
                  Effect.flatMap(
                    Option.match({
                      onSome: (op) =>
                        pipe(
                          Match.value(op),
                          Match.when(
                            Schema.is(OperationCompletedSchema),
                            (opCompleted) =>
                              Equal.equals(
                                Data.array(opCompleted.expression),
                                Data.array(impureFnExpr)
                              )
                                ? pipe(
                                    Effect.context<LionOplogService>(),
                                    Effect.map(Context.get(LionOplogService)),
                                    Effect.flatMap(
                                      Ref.update((oplog) => Arr.drop(oplog, 2))
                                    ),
                                    Effect.map(() => opCompleted.result)
                                  )
                                : new OplogMismatchError({
                                    evaluatedExpression: impureFnExpr,
                                    storedExpression: opCompleted.expression,
                                  })
                          ),
                          Match.when(
                            Schema.is(OperationStartedSchema),
                            (opStarted) =>
                              Equal.equals(
                                Data.array(opStarted.expression),
                                Data.array(impureFnExpr)
                              )
                                ? Effect.fail(new ContinuationNeededError())
                                : Effect.fail(
                                    new OplogMismatchError({
                                      evaluatedExpression: impureFnExpr,
                                      storedExpression: opStarted.expression,
                                    })
                                  )
                          ),
                          Match.exhaustive
                        ),
                      onNone: () =>
                        pipe(
                          Effect.context<LionOplogService>(),
                          Effect.map(Context.get(LionOplogService)),
                          Effect.flatMap(
                            Ref.update(
                              Arr.prepend(
                                new OperationStartedSchema({
                                  expression: impureFnExpr,
                                })
                              )
                            )
                          ),
                          Effect.flatMap(() => new ContinuationNeededError())
                        ),
                    })
                  )
                )
            ),
            Match.orElse(() => doFnCall(functionCallExpression))
          )
        ),
        Match.orElse(() => doFnCall(functionCallExpression))
      )
    )
  );

const doFnCall = (functionCallExpression: typeof FunctionCallFormSchema.Type) =>
  pipe(
    Effect.all(Arr.map(functionCallExpression, evaluate)),
    Effect.map(Arr.unprepend),
    Effect.flatMap(([head, tail]) =>
      pipe(
        Match.value(head),
        Match.when(Schema.is(LionFunctionValueSchema), (fn) => fn(...tail)),
        Match.orElse(() => Effect.succeed([head, ...tail]))
      )
    )
  );
