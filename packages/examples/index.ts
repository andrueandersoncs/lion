import { run } from "@lion/core/evaluation/evaluate";
import { stdlib } from "@lion/core/modules";
import { Effect } from "effect";

const env = {
  ...stdlib,
  price: 100,
  taxRate: 0.08,
  clamp: (min: number, max: number, value: number) =>
    Math.min(max, Math.max(min, value)),
  user: {
    name: "Ada",
    stats: {
      score: 92,
    },
  },
};

const examples: Array<{
  name: string;
  program: unknown;
}> = [
  {
    name: "Arithmetic",
    program: ["number/add", "price", ["number/multiply", "price", "taxRate"]],
  },
  {
    name: "Sequential Evaluation",
    program: [
      "begin",
      ["define", "x", 1],
      ["define", "x", ["number/add", "x", 4]],
      "x",
    ],
  },
  {
    name: "Conditionals",
    program: [
      "cond",
      [
        ["number/greaterThan", ["object/get-path", "user", "stats.score"], 90],
        "great",
      ],
      [
        ["number/greaterThan", ["object/get-path", "user", "stats.score"], 70],
        "pass",
      ],
      ["else", "retry"],
    ],
  },
  {
    name: "Array Mapping",
    program: [
      "array/map",
      ["array/make", 1, 2, 3],
      ["lambda", ["x"], ["number/multiply", "x", 10]],
    ],
  },
  {
    name: "Structural Match",
    program: [
      "match",
      [
        "quote",
        {
          type: "user",
          profile: {
            name: "Ada",
          },
        },
      ],
      [
        {
          type: ["func/partial", "string/equals?", ["quote", "user"]],
          profile: {
            name: "value/string?",
          },
        },
        [
          "lambda",
          ["value"],
          [
            "string/concat",
            ["object/get-path", "value", "profile.name"],
            " matched",
          ],
        ],
      ],
      ["lambda", ["value"], "value"],
    ],
  },
  {
    name: "Host Interop",
    program: ["clamp", 0, 100, 150],
  },
  {
    name: "Object Path Lookup",
    program: ["object/get-path", "user", "stats.score"],
  },
];

const main = Effect.gen(function* () {
  console.log("=== Lion Examples ===");

  for (const { name, program } of examples) {
    const result = yield* run(program, env);
    console.log(`\n${name}`);
    console.log(JSON.stringify(program, null, 2));
    console.log("=>", result);
  }
});

await Effect.runPromise(main);
