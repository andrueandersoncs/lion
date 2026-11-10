/**
 * Algorithms are host functions that compute a relation from other relations,
 * for the work Datalog rules do badly, such as PageRank or Dijkstra. Calling
 * one with its inputs and one term per output column builds a goal, just like
 * calling a relation:
 *
 *   ["graph/shortestPath", "road", "a", "?to", "?cost", "?path"]
 *
 * The engine runs the algorithm once its input relations are complete, so its
 * rows can feed rules, `not`, aggregates, and queries.
 */
import { Effect } from "effect";
import { LogicError } from "@/errors/evaluation";
import {
  Atom,
  isGroundValue,
  isLogicTerm,
  isRelationValue,
  type RelationInfo,
  relationInfo,
  render,
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

const fail = (message: string) => Effect.fail(new LogicError({ message }));

const show = (value: unknown) => JSON.stringify(render(value)) ?? String(value);

const signature = (algorithm: Algorithm) =>
  [...algorithm.inputs.map((input) => input.name), ...algorithm.columns].join(
    ", "
  );

/** Reads one input argument into its name or value for the computed relation. */
const readInput = (
  algorithm: Algorithm,
  input: AlgorithmInput,
  arg: unknown
) => {
  if (input.kind === "relation") {
    return isRelationValue(arg)
      ? Effect.succeed(relationInfo(arg).name)
      : fail(
          `${algorithm.name} expects a relation for "${input.name}", but found ${show(arg)}.`
        );
  }
  return isLogicTerm(arg) || !isGroundValue(arg)
    ? fail(
        `${algorithm.name} expects a value for "${input.name}", but found ${show(arg)}. Algorithm inputs must be known when the goal is built.`
      )
    : Effect.succeed(arg);
};

/**
 * Turns an algorithm into a Lion function. Put it in the environment under
 * `algorithm.name` to use it in rules and queries.
 */
export const defineAlgorithm =
  (algorithm: Algorithm) =>
  (...args: unknown[]) =>
    Effect.gen(function* () {
      const arity = algorithm.inputs.length + algorithm.columns.length;
      if (args.length !== arity) {
        return yield* fail(
          `${algorithm.name} takes ${arity} arguments (${signature(algorithm)}) but got ${args.length}.`
        );
      }
      const inputs: unknown[] = [];
      for (const [index, input] of algorithm.inputs.entries()) {
        inputs.push(yield* readInput(algorithm, input, args[index]));
      }
      const isRelation = (index: number) =>
        algorithm.inputs[index]?.kind === "relation";
      const label = inputs
        .map((input, index) =>
          isRelation(index) ? String(input) : JSON.stringify(input)
        )
        .join(", ");
      const relation: RelationInfo = {
        name: `${algorithm.name}(${label})`,
        columns: algorithm.columns,
        computed: {
          callee: algorithm.name,
          inputs,
          dependencies: inputs.filter((_, index) =>
            isRelation(index)
          ) as string[],
          compute: (tuples) =>
            algorithm.run(
              inputs.map((input, index) =>
                isRelation(index) ? tuples(input as string) : input
              )
            ),
        },
      };
      return new Atom(relation, args.slice(algorithm.inputs.length));
    });
