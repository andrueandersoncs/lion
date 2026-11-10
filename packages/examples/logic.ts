import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";
import { Effect } from "effect";
import program from "./logic.json";

// Declares relations, facts, and recursive rules, then asks which positions
// depend on a changed node and why.
const result = await Effect.runPromise(run(program, stdlib));

console.log(JSON.stringify(result, null, 2));
