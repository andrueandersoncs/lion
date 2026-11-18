/**
 * How much memory a loop of tail calls holds at its last call, against its
 * first: a lambda that calls itself as the result of a `cond` case, 300,000
 * times. A probe's command: it runs in memory and writes nothing.
 */
import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";
import { Effect } from "effect";

const STEPS = 300_000;
const loop = [
  "lambda",
  ["n", "start"],
  [
    "cond",
    [
      ["number/equals?", "n", 0],
      ["number/subtract", ["host/heap"], "start"],
    ],
    ["else", ["loop", ["number/subtract", "n", 1], "start"]],
  ],
];
const held = await Effect.runPromise(
  run(["begin", ["define", "loop", loop], ["loop", STEPS, ["host/heap"]]], {
    ...stdlib,
    "host/heap": () => process.memoryUsage().heapUsed,
  })
);
// A loop that kept something for each call would hold 150 MB or more.
console.log(
  `a loop of ${STEPS} tail calls holds less than 64 MB at its last call: ${held < 64_000_000}`
);
