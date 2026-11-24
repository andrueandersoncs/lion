import { Effect, Schema } from "effect";
import { takes } from "@/errors/evaluation";
import { proveRules, verifyProof } from "@/logic/proof";
import { compareValues, valueKey } from "@/logic/terms";
import { over } from "@/modules/lib/shared";
import { LionDatabaseService } from "@/services/database";

const ExplanationRecord = Schema.Record(Schema.String, Schema.Unknown);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Walks only the structural explanation fields (`because`, `matches`, `but`)
 * of a `why` tree, never descending into fact or rule data payloads.
 */
const walkExplanation = (
  node: unknown,
  visit: (record: Record<string, unknown>) => void
) => {
  if (!isRecord(node)) {
    return;
  }
  visit(node);
  if (Array.isArray(node.because)) {
    for (const child of node.because) {
      walkExplanation(child, visit);
    }
  }
  if (Array.isArray(node.matches)) {
    for (const group of node.matches) {
      if (Array.isArray(group)) {
        for (const child of group) {
          walkExplanation(child, visit);
        }
      }
    }
  }
  if ("but" in node) {
    walkExplanation(node.but, visit);
  }
};

/** Sorted unique list of every `given: true` base fact in a `why` tree. */
const extractFacts = (explanation: Record<string, unknown>) => {
  const found = new Map<string, unknown>();
  walkExplanation(explanation, (node) => {
    if (node.given === true && Array.isArray(node.fact)) {
      found.set(valueKey(node.fact), node.fact);
    }
  });
  return [...found.values()].sort(compareValues);
};

/**
 * Sorted unique list of every leaf absent goal in a `why` tree: the negative
 * closed-world premises or missing facts that the explanation rests on.
 */
const extractAssumptions = (explanation: Record<string, unknown>) => {
  const found = new Map<string, unknown>();
  walkExplanation(explanation, (node) => {
    if (
      "absent" in node &&
      (!Array.isArray(node.because) || node.because.length === 0)
    ) {
      found.set(valueKey(node.absent), node.absent);
    }
  });
  return [...found.values()].sort(compareValues);
};

/**
 * Proofs: checking proof values with a small trusted kernel (`proof/valid?`),
 * proving universal properties of rule-defined relations by CIC-style rule
 * induction (`proof/rules`), and extracting ground facts and leaf absences
 * from `why` explanations (`proof/facts`, `proof/assumptions`).
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

  /**
   * Every recorded (`given: true`) base fact a `why` explanation rests on,
   * deduplicated and sorted in canonical value order.
   */
  facts: over([ExplanationRecord], extractFacts),

  /**
   * Every leaf absent goal (closed-world negative premise or missing fact) a
   * `why` explanation rests on, deduplicated and sorted in canonical order.
   */
  assumptions: over([ExplanationRecord], extractAssumptions),
};
