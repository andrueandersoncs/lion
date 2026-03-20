import type { Effect } from "effect";
import type { ParseError } from "effect/ParseResult";
import type {
  ContinuationNeededError,
  OplogMismatchError,
} from "@/errors/evaluation";
import type { LionEnvironmentService } from "@/services/evaluation";
import type { LionOplogService } from "@/services/oplog";

export type EvaluateResult = Effect.Effect<
  unknown,
  ParseError | ContinuationNeededError | OplogMismatchError,
  LionEnvironmentService | LionOplogService
>;
