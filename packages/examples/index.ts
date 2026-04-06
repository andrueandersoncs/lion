import { run } from "@lion/core/evaluation/evaluate";
import { stdlib } from "@lion/core/modules";
import { Effect } from "effect";

// FizzBuzz in Lion Language
// Note: This implementation requires these functions that are missing from @lion/core:
// - math/% (modulo operator) for divisibility checks
// - list/range (to generate numbers 1-100)
// - list/map or recursion utilities for iteration

// Hardcoded FizzBuzz for numbers 1-15 as a demonstration
const fizzBuzzProgram = [
  "begin",
  [
    "define",
    "fizzbuzz",
    [
      "lambda",
      ["n"],
      [
        "logic/if",
        [
          "logic/and",
          ["math/=", ["math/%", "n", 3], 0],
          ["math/=", ["math/%", "n", 5], 0],
        ],
        "FizzBuzz",
        [
          "logic/if",
          ["math/=", ["math/%", "n", 3], 0],
          "Fizz",
          ["logic/if", ["math/=", ["math/%", "n", 5], 0], "Buzz", "n"],
        ],
      ],
    ],
  ],
  ["console/log", ["fizzbuzz", 1]],
  ["console/log", ["fizzbuzz", 2]],
  ["console/log", ["fizzbuzz", 3]],
  ["console/log", ["fizzbuzz", 4]],
  ["console/log", ["fizzbuzz", 5]],
  ["console/log", ["fizzbuzz", 15]],
];

console.log("=== FizzBuzz in Lion Language ===");
console.log("\nNote: This example requires the following missing functions:");
console.log("  - math/% (modulo operator)");
console.log("  - list/range (to generate 1-100)");
console.log("  - list/map or recursion for iteration");
console.log("\nWith these functions, FizzBuzz could be written as:");
console.log(`
["begin",
  ["define", "fizzbuzz", ["lambda", ["n"],
    ["logic/if",
      ["logic/and", ["math/=", ["math/%", "n", 3], 0], 
                    ["math/=", ["math/%", "n", 5], 0]],
      "FizzBuzz",
      ["logic/if", ["math/=", ["math/%", "n", 3], 0],
        "Fizz",
        ["logic/if", ["math/=", ["math/%", "n", 5], 0],
          "Buzz",
          "n"]]]]],
  ["list/map", ["list/range", 1, 100], "fizzbuzz"]
]
`);

// Attempt to run (will fail due to missing functions)
Effect.runPromise(run(fizzBuzzProgram, stdlib))
  .then((result) => {
    console.log("\n=== Output ===");
    console.log(result);
  })
  .catch((error) => {
    console.log("\n=== Expected Error ===");
    console.log("Error:", error.message || error);
    console.log(
      "\nThe error occurs because 'math/%' and 'list/range' are not defined in @lion/core"
    );
  });
