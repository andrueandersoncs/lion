import type { Effect, Schema } from "effect";
import type {
  ArgumentMismatchError,
  InvalidFunctionCallError,
} from "@/errors/evaluation";
import type { LionEnvironmentService } from "@/services/evaluation";

export type EvaluateResult = Effect.Effect<
  unknown,
  Schema.SchemaError | ArgumentMismatchError | InvalidFunctionCallError,
  LionEnvironmentService
>;
