/**
 * What a TypeScript host gets from `run`: with and without a shared
 * database, on values that are no program, and with host functions of its
 * own. A probe's command: it runs in memory and writes nothing.
 */
import { run } from "@lionlang/core/evaluation/evaluate";
import { LogicDatabase } from "@lionlang/core/logic/database";
import { stdlib } from "@lionlang/core/modules";
import { LionEnvironmentService } from "@lionlang/core/services/evaluation";
import { Cause, Effect, Exit, Ref } from "effect";

console.error = () => undefined;
const say = (what, value) => console.log(`${what}: ${JSON.stringify(value)}`);
const outcome = async (program, environment = stdlib, options = {}) => {
  const exit = await Effect.runPromiseExit(run(program, environment, options));
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  const error = Cause.squash(exit.cause);
  return `failed with ${error._tag ?? error.name}`;
};

say("run gives an Effect", Effect.isEffect(run(["number/add", 1, 2], stdlib)));
say(
  "running that Effect gives",
  await Effect.runPromise(run(["number/add", 1, 2], stdlib))
);

const setup = [
  "begin",
  ["relation", "parent", ["of", "is"]],
  ["fact", ["parent", "ada", "bea"]],
  ["query", ["parent", "?of", "?is"]],
];
const ask = ["query", ["parent", "?of", "?is"]];
say("a run that declares a relation and asks it", await outcome(setup));
say("the next run, given no database, asks it", await outcome(ask));
const database = new LogicDatabase();
await outcome(setup, stdlib, { database });
say(
  "the next run, given the same database, asks it",
  await outcome(ask, stdlib, { database })
);

say("run given a function as its program", await outcome(() => 1));
say("run given undefined as its program", await outcome(undefined));

let calls = 0;
let kept;
let reads;
const host = {
  ...stdlib,
  "host/plain": () => 41,
  "host/effect": () => Effect.succeed(41),
  "host/tick": () => {
    calls += 1;
    return calls;
  },
  "host/keep": (set, read) => {
    kept = set;
    reads = read;
    return true;
  },
  "host/environment": () =>
    Effect.gen(function* () {
      const environment = yield* LionEnvironmentService;
      return typeof (yield* Ref.get(environment.bindingsRef))[
        "host/environment"
      ];
    }),
};
say(
  "a host function that returns 41 plainly, called",
  await outcome(["host/plain"], host)
);
say(
  "one more than what each host function gives, plain and Effect",
  await outcome(
    [
      "array/make",
      ["number/add", ["host/plain"], 1],
      ["number/add", ["host/effect"], 1],
    ],
    host
  )
);
say(
  "a program that calls a counting host function once gives",
  await outcome(["host/tick"], host)
);
say("the host function has run times", calls);
say("the same program run again gives", await outcome(["host/tick"], host));
say(
  "in the Ref the environment service holds, a host function finds its own name bound to a",
  await outcome(["host/environment"], host)
);

await outcome(
  [
    "host/keep",
    ["func/callback", ["lambda", ["value"], ["define", "set-later", "value"]]],
    ["func/callback", ["lambda", [], "set-later"]],
  ],
  host
);
say("the name before the kept callback runs", await reads());
await kept(7);
say("the name after host code runs the kept callback with 7", await reads());

const settled = async (callback) =>
  (await Promise.allSettled([-1, -2].map(callback))).map((r) =>
    r.status === "fulfilled" ? r.value : `rejected: ${r.reason.message}`
  );
say(
  "Array.prototype.map over a library function",
  await settled(await outcome(["func/callback", "number/absolute"]))
);
say(
  "Array.prototype.map over a lambda",
  await settled(
    await outcome([
      "func/callback",
      ["lambda", ["n"], ["number/absolute", "n"]],
    ])
  )
);
