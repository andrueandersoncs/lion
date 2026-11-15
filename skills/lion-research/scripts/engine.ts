// The Lion evaluator as a Web Worker, for the explorer page. It holds one
// logic database, loaded from a snapshot, and runs each program against it.
//
// The built bundle is assets/lion-engine.js. After a change to @lionlang/core,
// rebuild it from the root of the Lion repository:
//
//   bun build skills/lion-research/scripts/engine.ts --target browser \
//     --format iife --minify --outfile skills/lion-research/assets/lion-engine.js
import { run } from "@lionlang/core/evaluation/evaluate";
import { LogicDatabase } from "@lionlang/core/logic/database";
import { stdlib } from "@lionlang/core/modules";
import { Cause, Effect, Exit, Scheduler } from "effect";

type Request =
  | { readonly id: number; readonly type: "load"; readonly snapshot: unknown }
  | { readonly id: number; readonly type: "run"; readonly program: unknown };

// A page asks many different questions of one model that does not change.
// Full evaluation derives every relation once and answers each question from
// it; goal-directed evaluation rewrites the rules for each new question,
// which on a research model was hundreds of times slower. Both give the
// same answers.
const EVALUATION = { goalDirected: false };

let database = new LogicDatabase(EVALUATION);

// A result can hold a function, such as a relation, which neither JSON nor a
// worker message can carry.
const toJson = (value: unknown) =>
  JSON.stringify(value === undefined ? null : value, (_key, item) =>
    typeof item === "function" ? "<function>" : item
  );

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// The evaluator never yields to the scheduler: in a browser each yield waits
// on a clamped timer. The page ends a program that runs too long by ending
// this worker.
const evaluate = <A>(effect: Effect.Effect<A, unknown>) =>
  Effect.runPromiseExit(
    effect.pipe(Effect.provideService(Scheduler.PreventSchedulerYield, true))
  );

/** Runs a snapshot into a new database, and answers from it from then on. */
const loadInto = (snapshot: unknown) => {
  const loaded = new LogicDatabase(EVALUATION);
  return Effect.map(
    run(snapshot as never, stdlib, { database: loaded }),
    () => {
      database = loaded;
      return null;
    }
  );
};

const handle = async (request: Request) => {
  const started = performance.now();
  const exit =
    request.type === "load"
      ? await evaluate(loadInto(request.snapshot))
      : await evaluate(run(request.program as never, stdlib, { database }));
  const ms = performance.now() - started;
  return Exit.isSuccess(exit)
    ? { id: request.id, ok: true, json: toJson(exit.value), ms }
    : {
        id: request.id,
        ok: false,
        error: describe(Cause.squash(exit.cause)),
        ms,
      };
};

self.addEventListener("message", (event: MessageEvent<Request>) => {
  handle(event.data).then(
    (response) => self.postMessage(response),
    (error: unknown) =>
      self.postMessage({ id: event.data.id, ok: false, error: describe(error) })
  );
});
