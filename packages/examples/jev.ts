import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";
import { makeTypeSafeBindings } from "@lionlang/typesafe-ai";
import { Effect } from "effect";
import program from "./jev.json";

await Effect.runPromise(
  run(program, {
    ...stdlib,
    ...makeTypeSafeBindings(),
  })
);
