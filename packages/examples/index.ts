import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";
import { Effect } from "effect";

interface Example {
  readonly expression: unknown;
  readonly name: string;
}

const examples: readonly Example[] = [
  {
    name: "Arithmetic",
    expression: ["number/add", 1, 2],
  },
  {
    name: "Sequential evaluation",
    expression: [
      "begin",
      ["define", "value", 10],
      ["number/multiply", "value", 2],
    ],
  },
  {
    name: "Branching",
    expression: [
      "cond",
      [["number/greaterThan", 5, 3], "greater"],
      ["else", "smaller"],
    ],
  },
  {
    name: "Collection transform",
    expression: [
      "array/map",
      ["array/make", 1, 2, 3],
      ["lambda", ["item"], ["number/multiply", "item", 2]],
    ],
  },
  {
    name: "Structural pattern matching",
    expression: [
      "match",
      { profile: { name: "Ada" }, type: "user" },
      [
        {
          profile: { name: "value/string?" },
          type: ["func/partial", "string/equals?", "user"],
        },
        ["lambda", ["user"], ["object/get-path", "user", "profile.name"]],
      ],
      ["lambda", ["value"], "value"],
    ],
  },
  {
    name: "Nested object lookup",
    expression: [
      "object/get-path",
      { users: ["array/make", { name: "Grace" }, { name: "Lin" }] },
      "users.1.name",
    ],
  },
];

const results: { name: string; result: unknown }[] = [];
for (const { expression, name } of examples) {
  const result = await Effect.runPromise(run(expression, stdlib));
  results.push({ name, result });
}

const hostInterop = await Effect.runPromise(
  run(["clamp", 0, 100, "reading"], {
    ...stdlib,
    clamp: (minimum: number, maximum: number, value: number) =>
      Math.min(maximum, Math.max(minimum, value)),
    reading: 142,
  })
);

const output = { examples: results, hostInterop };

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
