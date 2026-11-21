// The lion command for a page: a Web Worker that holds one logic database,
// loaded from a saved database as `--database` loads one, and runs each
// program against it. The build writes it for a browser as dist/worker.js,
// and `lion worker` prints it, so a page that embeds it runs the same Lion as
// the lion command that checks the page.
import { run } from "@lionlang/core/evaluation/evaluate";
import { LogicDatabase } from "@lionlang/core/logic/database";
import { loadDatabase } from "@lionlang/core/logic/snapshot";
import { stdlib } from "@lionlang/core/modules";
import { Cause, Effect, Exit, Scheduler } from "effect";

/** What a page asks: to load a saved database, or to run a program on it. */
export type Request =
  | { readonly id: number; readonly type: "load"; readonly snapshot: unknown }
  | { readonly id: number; readonly type: "run"; readonly program: unknown };

/** The answer to one request: its value as JSON, or why it failed. */
export type Response =
  | {
      readonly id: number;
      readonly ok: true;
      readonly json: string;
      readonly ms: number;
    }
  | {
      readonly id: number;
      readonly ok: false;
      readonly error: string;
      readonly ms?: number;
    };

/** The worker's global scope, as much of it as this file uses. */
declare const self: {
  addEventListener(
    type: "message",
    listener: (event: { readonly data: Request }) => void
  ): void;
  postMessage(message: Response): void;
};

let database = new LogicDatabase();

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

const handle = async (request: Request): Promise<Response> => {
  const started = performance.now();
  const exit =
    request.type === "load"
      ? await evaluate(
          Effect.map(loadDatabase(request.snapshot, stdlib), (loaded) => {
            database = loaded;
            return null;
          })
        )
      : await evaluate(run(request.program as never, stdlib, { database }));
  const ms = performance.now() - started;
  if (Exit.isSuccess(exit)) {
    try {
      return { id: request.id, ok: true, json: toJson(exit.value), ms };
    } catch (error) {
      // A fraction no decimal writes, such as 1/3, has no JSON text.
      return { id: request.id, ok: false, error: describe(error), ms };
    }
  }
  return {
    id: request.id,
    ok: false,
    error: describe(Cause.squash(exit.cause)),
    ms,
  };
};

self.addEventListener("message", (event) => {
  handle(event.data).then(
    (response) => self.postMessage(response),
    (error: unknown) =>
      self.postMessage({ id: event.data.id, ok: false, error: describe(error) })
  );
});
