import type { Effect, Schema } from "effect";
import type {
  ArgumentMismatchError,
  ArithmeticError,
  InvalidFunctionCallError,
  LogicError,
  UnboundNameError,
  WaitingError,
} from "@/errors/evaluation";
import type { LionEnvironmentService } from "@/services/evaluation";

export type EvaluationError =
  | Schema.SchemaError
  | ArgumentMismatchError
  | ArithmeticError
  | InvalidFunctionCallError
  | LogicError
  | UnboundNameError
  | WaitingError;

export type EvaluateResult = Effect.Effect<
  unknown,
  EvaluationError,
  LionEnvironmentService
>;
