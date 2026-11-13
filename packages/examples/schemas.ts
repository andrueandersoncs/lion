import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";
import { Effect } from "effect";
import program from "./schemas.json";

// Sorts an inbox of JSON orders with schemas: keeps the ones that fit, says
// where the others go wrong, and takes the good ones apart into rows.
const result = await Effect.runPromise(run(program, stdlib));

console.log(JSON.stringify(result, null, 2));
