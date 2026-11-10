import type { Effect, Schema } from "effect";
import type {
  ArgumentMismatchError,
  InvalidFunctionCallError,
  LogicError,
} from "@/errors/evaluation";
import type { LionEnvironmentService } from "@/services/evaluation";

export type EvaluationError =
  | Schema.SchemaError
  | ArgumentMismatchError
  | InvalidFunctionCallError
  | LogicError;

export type EvaluateResult = Effect.Effect<
  unknown,
  EvaluationError,
  LionEnvironmentService
>;
