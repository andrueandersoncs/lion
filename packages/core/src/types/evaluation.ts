import type { Effect, Schema } from "effect";
import type {
  ArithmeticError,
  InvalidFunctionCallError,
  LogicError,
  MalformedFormError,
  UnboundNameError,
  UndefinedYetError,
  WaitingError,
} from "@/errors/evaluation";
import type { LionEnvironmentService } from "@/services/evaluation";

export type EvaluationError =
  | Schema.SchemaError
  | ArithmeticError
  | InvalidFunctionCallError
  | LogicError
  | MalformedFormError
  | UnboundNameError
  | UndefinedYetError
  | WaitingError;

export type EvaluateResult = Effect.Effect<
  unknown,
  EvaluationError,
  LionEnvironmentService
>;
