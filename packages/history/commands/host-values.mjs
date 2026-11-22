/**
 * What Lion does with values a host function gives that JSON cannot hold:
 * undefined, a bigint, NaN, a Map, a Date, and an instance of a class. A
 * probe's command: it runs in memory and writes nothing.
 */
import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";
import { Cause, Effect, Exit } from "effect";

console.error = () => undefined;

class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
}

const VALUES = {
  undefined: () => undefined,
  bigint: () => 10n,
  NaN: () => Number.NaN,
  Map: () => new Map([["a", 1]]),
  Date: () => new Date(0),
  Point: () => new Point(1, 2),
};

/** Runs a program with the host function `host/give`, which gives `value`. */
const outcome = async (program, value, more = {}) => {
  const host = { ...stdlib, "host/give": () => value, ...more };
  const exit = await Effect.runPromiseExit(run(program, host));
  if (Exit.isSuccess(exit)) {
    return { value: exit.value };
  }
  const error = Cause.squash(exit.cause);
  return { error: error._tag ?? error.name, message: String(error.message) };
};

const CARRIED = [
  ["host/give"],
  ["begin", ["define", "v", ["host/give"]], "v"],
  [["lambda", ["v"], "v"], ["host/give"]],
  ["array/head", ["array/make", ["host/give"], 1]],
  ["object/get", { k: ["host/give"] }, "k"],
  [["func/partial", ["lambda", ["v", "w"], "v"], ["host/give"]], 2],
];

const PLACES = {
  "a fact": ["begin", ["relation", "r", ["x"]], ["fact", ["r", ["host/give"]]]],
  "a derived row": [
    "begin",
    ["relation", "n", ["x"]],
    ["relation", "g", ["x"]],
    ["fact", ["n", 1]],
    ["rule", ["g", "?x"], ["n", "?y"], ["=", "?x", ["host/give"]]],
    ["query", ["g", "?x"]],
  ],
  "an answer of find": ["find", "?x", ["=", "?x", ["host/give"]]],
  "a condition": ["cond", [["host/give"], 1], ["else", 2]],
  "a library function's argument": ["string/length", ["host/give"]],
};

const given = await outcome(["host/give"], undefined);
console.log(
  `a host function that gives undefined, called: ${"value" in given && given.value === undefined ? "undefined" : "other"}`
);

let carried = true;
for (const make of Object.values(VALUES)) {
  const value = make();
  for (const program of CARRIED) {
    const result = await outcome(program, value);
    carried &&= "value" in result && Object.is(result.value, value);
  }
}
console.log(
  `each value, through a name, a lambda, a list, a record, and func/partial: ${carried ? "the same value" : "another value"}`
);

const same = new Map([["a", 1]]);
const twin = new Map([["a", 1]]);
const itself = await outcome(["=", ["host/give"], ["host/give"]], same);
const twins = await outcome(["=", ["host/give"], ["host/twin"]], same, {
  "host/twin": () => twin,
});
console.log(`a Map = itself: ${itself.value}`);
console.log(`a Map = another Map with the same entries: ${twins.value}`);

for (const [name, make] of Object.entries(VALUES)) {
  for (const [place, program] of Object.entries(PLACES)) {
    const result = await outcome(program, make());
    console.log(
      `${name} in ${place}: ${"error" in result ? `fails with ${result.error}: ${result.message}` : "accepted"}`
    );
  }
}
