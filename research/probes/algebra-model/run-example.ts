import { Effect } from "effect";
import { run } from "../../../packages/core/src/evaluation/evaluate";
import { stdlib } from "../../../packages/core/src/modules";
console.log(JSON.stringify(await Effect.runPromise(run(await Bun.file("example.json").json(), stdlib))));
