import { run } from "@lionlang/core/evaluation/evaluate";
import { LogicVariable } from "@lionlang/core/logic/terms";
import { stdlib } from "@lionlang/core/modules";
import { Arbitrary, Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  analysisEnvironment,
  makeEvaluationEnvironment,
  usesTypeSafeBindings,
} from "../environment";
import { analyzeSource } from "../parse";

const pick = <A>(items: readonly A[]) =>
  Arbitrary.map(
    Arbitrary.schema(
      Schema.Int.check(
        Schema.isBetween({ minimum: 0, maximum: items.length - 1 })
      )
    ),
    (at) => items[at] as A
  );

/**
 * A string a program in the editor may hold: a name the editor's runs bind,
 * the console's and TypeSafe's among them, one with a letter added, a word,
 * or a logic variable.
 */
const STRINGS = Arbitrary.flatMap(
  Arbitrary.all([
    pick([
      ...Object.keys(analysisEnvironment(["typesafe/noul"])),
      "x",
      "?x",
      "n/a",
    ]),
    Arbitrary.schema(Schema.Boolean),
  ]),
  ([name, misspell]) => Arbitrary.Constant(misspell ? `${name}q` : name)
);

describe("the graph's reading of a string", () => {
  it("is what a run in the editor makes of it: a binding of the run, a logic variable, data, or an error", async () => {
    const result = await Effect.runPromise(
      Arbitrary.checkEffect(
        Arbitrary.all([STRINGS, Arbitrary.schema(Schema.Boolean)]),
        ([text, inLambda]) =>
          Effect.gen(function* () {
            const program = inLambda ? [["lambda", ["x"], text], 7] : text;
            const projection = analyzeSource(JSON.stringify(program), 1);
            const node = projection.nodes.find(
              ({ pointer }) => pointer === (inLambda ? "/0/2" : "")
            );
            const environment = makeEvaluationEnvironment(
              usesTypeSafeBindings(program),
              "unused",
              []
            );
            const ran = yield* Effect.result(run(program, environment));
            const value = ran._tag === "Success" ? ran.success : undefined;
            switch (node?.meaning?.kind) {
              case "name": {
                const { binding } = node.meaning;
                const bound =
                  binding.kind === "parameter" ? 7 : environment[text];
                // A function is made again for each run of the editor.
                return typeof bound === "function"
                  ? typeof value === "function"
                  : value === bound;
              }
              case "logic-variable":
                return (
                  value instanceof LogicVariable && value.name === text.slice(1)
                );
              case "data":
                return value === text;
              case "unbound":
                return (
                  ran._tag === "Failure" &&
                  ran.failure._tag === "UnboundNameError" &&
                  ran.failure.message === node.diagnostic
                );
              default:
                return false;
            }
          }),
        { runs: 300 }
      )
    );
    expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
  });

  it("names the standard library everywhere, with no run needed", () => {
    expect(Object.keys(analysisEnvironment(1))).toEqual(
      expect.arrayContaining(Object.keys(stdlib))
    );
  });
});
