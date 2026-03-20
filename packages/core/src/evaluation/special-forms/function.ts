import {
  Array as Arr,
  Effect,
  HashSet,
  Match,
  Option,
  pipe,
  Ref,
  Schema,
  Tuple,
} from "effect";
import {
  ContinuationNeededError,
  OplogMismatchError,
} from "@/errors/evaluation";
import { evaluate } from "@/evaluation/evaluate.ts";
import {
  type FunctionCallFormSchema,
  LionFunctionValueSchema,
} from "@/schemas/evaluation";
import {
  OperationCompletedSchema,
  OperationStartedSchema,
} from "@/schemas/oplog";
import { LionOplogService } from "@/services/oplog";

const pureFunctions = HashSet.make();

export const evaluateFunctionCall = (
  functionCallExpression: typeof FunctionCallFormSchema.Type
) =>
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
                    opCompleted.operation ===
                    Tuple.at(impureFunctionCallExpression, 0)
                      ? Effect.gen(function* () {
                          const oplogService = yield* LionOplogService;
                          yield* Ref.update(oplogService, (oplog) =>
                            Arr.drop(oplog, 1)
                          );
                          return opCompleted.result;
                        })
                      : new OplogMismatchError({
                          oplog,
                          evaluatedOperation: impureFunctionCallExpression,
                          storedOperation: opCompleted.operation,
                        })
                ),
                Match.when(Schema.is(OperationStartedSchema), (opStarted) =>
                  opStarted.operation ===
                  Tuple.at(impureFunctionCallExpression, 0)
                    ? new ContinuationNeededError({
                        oplog,
                      })
                    : new OplogMismatchError({
                        oplog,
                        evaluatedOperation: impureFunctionCallExpression,
                        storedOperation: opStarted.operation,
                      })
                ),
                Match.exhaustive
              ),
            onNone: () =>
              new ContinuationNeededError({
                oplog: Arr.prepend(
                  oplog,
                  new OperationStartedSchema({
                    operation: Tuple.at(impureFunctionCallExpression, 0),
                    arguments: Arr.tailNonEmpty(impureFunctionCallExpression), // fixme: evaluate the arguments
                  })
                ),
              }),
          });
        })
    ),
    Match.orElse((pureFunctionCallExpression) =>
      pipe(
        Effect.all(Arr.map(pureFunctionCallExpression, evaluate)),
        Effect.map(Arr.unprepend),
        Effect.flatMap(([head, tail]) =>
          pipe(
            Match.value(head),
            Match.when(Schema.is(LionFunctionValueSchema), (fn) => fn(...tail)),
            Match.orElse(() => Effect.succeed([head, ...tail]))
          )
        )
      )
    )
  );
