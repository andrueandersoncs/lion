import { Context } from "effect";
import type { SchemaInfo } from "@/logic/terms";

/**
 * A named schema being checked against a value, while its shape is. A
 * predicate in the shape may ask about the schema again: about the same
 * value, it gets what is `assumed`, and about a larger or other value it is
 * `refused`. Once the shape is checked, an answer that disagrees with what
 * was assumed is checked again with the other assumption.
 */
export interface Checking {
  /** What a check of the same value answers meanwhile: fits, or does not. */
  assumed: boolean;
  /** A value no smaller than this one that the schema was asked about. */
  refused: { readonly value: unknown } | undefined;
  /** Whether a check of the same value has answered with `assumed`. */
  used: boolean;
  readonly value: unknown;
}

/**
 * The named schemas being checked, each with the innermost value it is
 * checked against, so that a predicate that asks about one of them again
 * meets it.
 */
export class LionCheckingService extends Context.Service<
  LionCheckingService,
  ReadonlyMap<SchemaInfo, Checking>
>()("LionCheckingService") {}
