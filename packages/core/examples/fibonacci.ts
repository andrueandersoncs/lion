import { Effect } from "effect";
import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";

const fibonacciProgram = [
  "define",
  "fibonacci",
  [
    "lambda",
    ["n"],
    [
      "cond",
      [["number/lessThan?", "n", 2], "n"],
      ["else", ["number/add", ["fibonacci", ["number/subtract", "n", 1]], ["fibonacci", ["number/subtract", "n", 2]]]]
    ]
  ]
];

Effect.runPromise(
  Effect.gen(function* () {
    yield* run(fibonacciProgram, stdlib);
    for (let i = 0; i < 10; i++) {
      const result = yield* run(["fibonacci", i], stdlib);
      console.log(`fib(${i}) = ${result}`);
    }
  })
);
