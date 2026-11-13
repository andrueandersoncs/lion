import { Effect } from "effect";
import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";

const fizzBuzzProgram = [
  "define",
  "fizzbuzz",
  [
    "lambda",
    ["n"],
    [
      "cond",
      [["number/equals?", ["number/mod", "n", 15], 0], "FizzBuzz"],
      [["number/equals?", ["number/mod", "n", 3], 0], "Fizz"],
      [["number/equals?", ["number/mod", "n", 5], 0], "Buzz"],
      ["else", "n"]
    ]
  ]
];

Effect.runPromise(
  Effect.gen(function* () {
    yield* run(fizzBuzzProgram, stdlib);
    for (let i = 1; i <= 20; i++) {
      const result = yield* run(["fizzbuzz", i], stdlib);
      console.log(`${i}: ${result}`);
    }
  })
);
