import { Effect } from "effect";
import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";

const palindromeProgram = [
  "define",
  "is-palindrome",
  [
    "lambda",
    ["str"],
    [
      "string/equals?",
      "str",
      ["string/concat", ["array/reverse", ["string/split", "str", ""]], ""]
    ]
  ]
];

Effect.runPromise(
  Effect.gen(function* () {
    yield* run(palindromeProgram, stdlib);
    const words = ["racecar", "hello", "madam", "world"];
    for (const word of words) {
      const result = yield* run(["is-palindrome", word], stdlib);
      console.log(`${word} is ${result ? "" : "not "}a palindrome`);
    }
  })
);
