import type { Effect } from "effect";
import type { ParseError } from "effect/ParseResult";
import type { ArgumentMismatchError } from "@/errors/evaluation";
import type { LionEnvironmentService } from "@/services/evaluation";

export type EvaluateResult = Effect.Effect<
  unknown,
  ParseError | ArgumentMismatchError,
  LionEnvironmentService
>;
