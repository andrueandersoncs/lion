import { Effect } from "effect";
import { takes } from "@/errors/evaluation";
import { proveRules, verifyProof } from "@/logic/proof";
import { LionDatabaseService } from "@/services/database";

/**
 * Proofs: checking proof values with a small trusted kernel (`proof/valid?`),
 * and proving universal properties of rule-defined relations by CIC-style rule
 * induction (`proof/rules`).
 */
export const module = {
  symbol: Symbol("proof"),

  /**
   * Whether a proof value (linear refutation, integer split tree, case split,
   * induction proof, lemma composition, or `why` derivation) checks out under
   * the trusted kernel without invoking the solver.
   */
  "valid?": takes(
    1,
    (proof: unknown) => Effect.succeed(verifyProof(proof)),
    "a proof"
  ),

  /**
   * Proves by rule induction that every row derived by a relation (or map of
   * mutually recursive relations) fits a target schema across all databases
   * whose base relations fit their declared schemas.
   */
  rules: takes(
    [1, 2],
    (target: unknown, schema?: unknown) =>
      Effect.gen(function* () {
        const database = yield* LionDatabaseService;
        return yield* proveRules(database, target, schema);
      }),
    "a relation and a schema, or a record of relations to schemas"
  ),
};
