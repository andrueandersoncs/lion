import { Effect } from "effect";
import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";

const factorialProgram = [
  "define",
  "factorial",
  [
    "lambda",
    ["n"],
    [
      "cond",
      [["number/lessThan?", "n", 2], 1],
      ["else", ["number/multiply", "n", ["factorial", ["number/subtract", "n", 1]]]]
    ]
  ]
];

Effect.runPromise(
  Effect.gen(function* () {
    yield* run(factorialProgram, stdlib);
    const result = yield* run(["factorial", 5], stdlib);
    console.log(`5! = ${result}`);
  })
);
