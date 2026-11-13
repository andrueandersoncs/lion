/**
 * Algorithms are host functions that compute a relation from other relations,
 * for the work Datalog rules do badly, such as PageRank or Dijkstra. Calling
 * one with its inputs and one term per output column builds a goal, just like
 * calling a relation:
 *
 *   ["graph/shortestPath", "road", "a", "?to", "?cost", "?path"]
 *
 * The engine runs the algorithm once its input relations are complete, so its
 * rows can feed rules, `not`, aggregates, and queries. A value input, such as
 * the start node above, is a column that must be bound before the goal runs:
 * the algorithm runs once for each value a rule or query gives it.
 */
import { Effect } from "effect";
import { logicError, takes } from "@/errors/evaluation";
import {
  Atom,
  isGroundValue,
  isWaiting,
  logicFunction,
  type RelationInfo,
  relationOf,
  show,
} from "@/logic/terms";

export interface AlgorithmInput {
  /** A relation, or a value such as a start node. */
  readonly kind: "relation" | "value";
  /** The input's name in error messages and docs. */
  readonly name: string;
}

export interface Algorithm {
  /** Output column names; a call passes one term for each, after the inputs. */
  readonly columns: readonly string[];
  readonly inputs: readonly AlgorithmInput[];
  /** The name the function is bound to, such as `"graph/pageRank"`. */
  readonly name: string;
  /**
   * Computes the output rows. A relation input arrives as its tuples and a
   * value input as itself. Return a string to report a problem instead.
   */
  readonly run: (
    inputs: readonly unknown[]
  ) => readonly (readonly unknown[])[] | string;
}

const signature = (algorithm: Algorithm) =>
  [...algorithm.inputs.map((input) => input.name), ...algorithm.columns].join(
    ", "
  );

/** The inputs in declared order, each taken from the list for its kind. */
const arrange = (
  { inputs }: Algorithm,
  relations: readonly unknown[],
  values: readonly unknown[]
) => {
  const next = { relation: 0, value: 0 };
  return inputs.map(({ kind }) => {
    next[kind] += 1;
    return (kind === "relation" ? relations : values)[next[kind] - 1];
  });
};

/**
 * Turns an algorithm into a Lion function. Put it in the environment under
 * `algorithm.name` to use it in rules and queries.
 */
export const defineAlgorithm = (algorithm: Algorithm) =>
  logicFunction(
    takes(
      algorithm.inputs.length + algorithm.columns.length,
      (...args: unknown[]) =>
        Effect.gen(function* () {
          const relations: string[] = [];
          const values: unknown[] = [];
          for (const [index, { kind, name }] of algorithm.inputs.entries()) {
            const arg = args[index];
            const relation = relationOf(arg)?.name;
            if (kind === "relation" && relation !== undefined) {
              relations.push(relation);
            } else if (
              kind === "value" &&
              (isWaiting(arg) || isGroundValue(arg))
            ) {
              values.push(arg);
            } else {
              return yield* logicError(
                `${algorithm.name} expects a ${kind} for "${name}", but found ${show(arg)}.`
              );
            }
          }
          const relation: RelationInfo = {
            name: `${algorithm.name}(${relations.join(", ")})`,
            columns: [
              ...algorithm.inputs.flatMap(({ kind, name }) =>
                kind === "value" ? [name] : []
              ),
              ...algorithm.columns,
            ],
            computed: {
              callee: algorithm.name,
              dependencies: relations,
              inputs: values.length,
              form: (written) => [
                algorithm.name,
                ...arrange(algorithm, relations, written),
                ...written.slice(values.length),
              ],
              compute: (tuples, given) =>
                algorithm.run(arrange(algorithm, relations.map(tuples), given)),
            },
          };
          return new Atom(relation, [
            ...values,
            ...args.slice(algorithm.inputs.length),
          ]);
        }),
      signature(algorithm)
    )
  );
