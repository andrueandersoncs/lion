import { Effect, Schema } from "effect";
import { logicError, takes } from "@/errors/evaluation";
import { answer, isWriting } from "@/evaluation/asking";
import {
  extractExplanationAssumptions,
  extractExplanationFacts,
  proveRules,
  verifyProof,
} from "@/logic/proof";
import { isGoal, LogicForm, logicFunction, show } from "@/logic/terms";
import { over } from "@/modules/lib/shared";
import { LionDatabaseService } from "@/services/database";

const ExplanationRecord = Schema.Record(Schema.String, Schema.Unknown);

/**
 * Proofs: checking proof values with a small trusted kernel (`proof/valid?`),
 * proving or refuting any closed goal (`proof/prove`), computing exact
 * symbolic/relational interval bounds (`proof/bounds`), proving universal
 * properties of rule-defined relations by CIC-style rule induction
 * (`proof/rules`), and extracting ground facts and leaf absences from `why`
 * explanations (`proof/facts`, `proof/assumptions`).
 */
export const module = {
  symbol: Symbol("proof"),

  /**
   * Whether a proof value (linear refutation, integer split tree, case split,
   * induction proof, lemma composition, `proof/prove` result, `proof/bounds`
   * result, or `why` derivation) checks out under the trusted kernel without
   * invoking the solver. With a second `claim` argument, also verifies that
   * the proof establishes that specific bound specification, relation target,
   * or ground fact/absence.
   */
  "valid?": takes(
    [1, 2],
    (proof: unknown, claim?: unknown) =>
      Effect.succeed(verifyProof(proof, claim)),
    "a proof and optional claim"
  ),

  /**
   * All-derivations epistemic sensitivity analysis for a closed goal: identifies
   * critical single-point-of-failure base facts, redundant facts backed by
   * alternative derivations, resilience, and minimal retraction cut-sets.
   */
  sensitivity: logicFunction(
    takes(
      1,
      (goal: unknown) =>
        Effect.gen(function* () {
          if (!isGoal(goal)) {
            return yield* logicError(
              `proof/sensitivity expects a goal or boolean, but found ${show(goal)}.`
            );
          }
          const form = new LogicForm("proof/sensitivity", [goal]);
          return (yield* isWriting) ? form : yield* answer(form);
        }),
      "a goal"
    )
  ),

  /**
   * Proves or refutes a closed goal (formal universal `["not", ["exists", ...]]`
   * or empirical/derived database goal), returning a kernel-verifiable proof,
   * ground facts, closed-world assumptions, or a concrete counterexample.
   */
  prove: logicFunction(
    takes(
      1,
      (goal: unknown) =>
        Effect.gen(function* () {
          if (!isGoal(goal)) {
            return yield* logicError(
              `proof/prove expects a goal or boolean, but found ${show(goal)}.`
            );
          }
          const form = new LogicForm("proof/prove", [goal]);
          return (yield* isWriting) ? form : yield* answer(form);
        }),
      "a goal"
    )
  ),

  /**
   * Computes exact tight lower and upper bounds of a numeric expression over
   * every match/solution of a goal (using exact Fourier-Motzkin, Pugh's Omega,
   * and Charnes-Cooper linear-fractional projection), with endpoint witnesses
   * and kernel-checkable bound or unsatisfiability certificates.
   */
  bounds: logicFunction(
    takes(
      2,
      (target: unknown, goal: unknown) =>
        Effect.gen(function* () {
          if (!isGoal(goal)) {
            return yield* logicError(
              `proof/bounds expects a goal, but found ${show(goal)}.`
            );
          }
          const form = new LogicForm("proof/bounds", [target, goal]);
          return (yield* isWriting) ? form : yield* answer(form);
        }),
      "a numeric expression and a goal"
    )
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
  facts: over([ExplanationRecord], extractExplanationFacts),

  /**
   * Every leaf absent goal (closed-world negative premise or missing fact) a
   * `why` explanation rests on, deduplicated and sorted in canonical order.
   */
  assumptions: over([ExplanationRecord], extractExplanationAssumptions),
};
