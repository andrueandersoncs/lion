import {
  Array as Arr,
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
              (impureFunctionCallExpression) =>
                Effect.gen(function* () {
                  const oplogService = yield* LionOplogService;
                  const oplog = yield* Ref.get(oplogService);
                  const nextOperation = Arr.head(oplog);
                  return yield* Option.match(nextOperation, {
                    onSome: (op) =>
                      pipe(
                        Match.value(op),
                        Match.when(
                          Schema.is(OperationCompletedSchema),
                          (opCompleted) =>
                            Equal.equals(
                              Data.array(opCompleted.expression),
                              Data.array(impureFunctionCallExpression)
                            )
                              ? Effect.gen(function* () {
                                  const oplogService = yield* LionOplogService;
                                  yield* Ref.update(oplogService, (oplog) =>
                                    Arr.drop(oplog, 2)
                                  );
                                  return opCompleted.result;
                                })
                              : new OplogMismatchError({
                                  evaluatedExpression:
                                    impureFunctionCallExpression,
                                  storedExpression: opCompleted.expression,
                                })
                        ),
                        Match.when(
                          Schema.is(OperationStartedSchema),
                          (opStarted) =>
                            Equal.equals(
                              Data.array(opStarted.expression),
                              Data.array(impureFunctionCallExpression)
                            )
                              ? new ContinuationNeededError()
                              : new OplogMismatchError({
                                  evaluatedExpression:
                                    impureFunctionCallExpression,
                                  storedExpression: opStarted.expression,
                                })
                        ),
                        Match.exhaustive
                      ),
                    onNone: () =>
                      Effect.gen(function* () {
                        const oplogService = yield* LionOplogService;
                        yield* Ref.update(oplogService, (oplog) =>
                          Arr.prepend(
                            oplog,
                            new OperationStartedSchema({
                              expression: impureFunctionCallExpression,
                            })
                          )
                        );
                        return yield* new ContinuationNeededError();
                      }),
                  });
                })
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
