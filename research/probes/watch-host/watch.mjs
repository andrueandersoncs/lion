// Watches a query from host code, as the Clef run's idea "Host code that
// watches a query" asks, and prints what the host is told: the answers when
// the watching starts, what came and went after each change, and how many
// times it was told. A change that adds or takes away no answer, and a change
// after the watching stopped, tell nothing.
//
//   node research/probes/watch-host/watch.mjs
//
// Run it from the repository root after `bunx turbo build --filter=@lionlang/cli`,
// which builds the core it imports.
import { run, watch } from "@lionlang/core/evaluation/evaluate";
import { LogicDatabase } from "@lionlang/core/logic/database";
import { stdlib } from "@lionlang/core/modules";
import { Effect } from "effect";

const database = new LogicDatabase();
const lion = (program) => Effect.runPromise(run(program, stdlib, { database }));
const told = [];

await lion([
  "begin",
  ["relation", "order", ["id"]],
  ["relation", "orders", ["n"]],
  ["rule", ["orders", ["aggregate/count", "?id"]], ["order", "?id"]],
  ["fact", ["order", 1]],
]);
const { answers, stop } = await Effect.runPromise(
  watch(["find", "?n", ["orders", "?n"]], stdlib, database, (change) =>
    told.push({ added: change.added, removed: change.removed })
  )
);
console.log(`answers when the watching starts: ${JSON.stringify(answers)}`);
await lion(["fact", ["order", 2]]);
console.log(`told after a second order: ${JSON.stringify(told.at(-1))}`);
await lion(["fact", ["order", 2]]);
console.log(`times told after the same order again: ${told.length}`);
stop();
await lion(["fact", ["order", 3]]);
console.log(
  `times told after the watching stopped and a third order came: ${told.length}`
);
