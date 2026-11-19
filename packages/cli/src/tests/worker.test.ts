/**
 * `lion worker` gives a page the Lion of the command that checks it. These
 * properties run the worker as a page does, through its messages, and the
 * lion command as an agent does, as a process with `--database`, and check
 * that they answer every program alike against the same saved database.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import type { Request, Response } from "../worker.ts";

const BIN = join(import.meta.dirname, "..", "bin.ts");

// The worker's global scope, as a page's Worker gives it: the worker listens
// for messages and posts each answer back.
const listeners: ((event: { readonly data: Request }) => void)[] = [];
const waiting = new Map<number, (response: Response) => void>();
Object.assign(globalThis, {
  self: {
    addEventListener: (
      _type: "message",
      listener: (event: { readonly data: Request }) => void
    ) => listeners.push(listener),
    postMessage: (response: Response) => waiting.get(response.id)?.(response),
  },
});
const started = import("../worker.ts");

let nextId = 1;
/** Posts a message to the worker, as a page does, and gives its answer. */
const post = (
  message:
    | { readonly type: "load"; readonly snapshot: unknown }
    | { readonly type: "run"; readonly program: unknown }
) =>
  Effect.promise(async () => {
    await started;
    const id = nextId;
    nextId += 1;
    return await new Promise<Response>((resolve) => {
      waiting.set(id, resolve);
      for (const listener of listeners) {
        listener({ data: { ...message, id } as Request });
      }
    });
  });

/** What a program gave: its value as JSON, or that it failed. */
type Outcome = { readonly ok: true; readonly value: unknown } | false;

/** What the page shows for a program, after the worker loads the database. */
const inWorker = (database: unknown, program: unknown) =>
  Effect.gen(function* () {
    const loaded = yield* post({ type: "load", snapshot: database });
    expect(loaded.ok).toBe(true);
    const ran = yield* post({ type: "run", program });
    return ran.ok
      ? ({ ok: true, value: JSON.parse(ran.json) } as const)
      : (false as const);
  });

/** What the lion command prints for a program, run on a saved database. */
const inCommand = (database: unknown, program: unknown): Outcome => {
  const folder = mkdtempSync(join(tmpdir(), "lion-worker-"));
  writeFileSync(join(folder, "model.json"), JSON.stringify(database));
  writeFileSync(join(folder, "program.json"), JSON.stringify(program));
  const run = spawnSync(
    "bun",
    [BIN, "program.json", "--database", "model.json"],
    { cwd: folder, encoding: "utf8" }
  );
  return run.status === 0 ? { ok: true, value: JSON.parse(run.stdout) } : false;
};

const between = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));
const element = <A>(items: readonly A[]): Arbitrary.Arbitrary<A> =>
  Arbitrary.map(between(0, items.length - 1), (at) => items[at] as A);
const oneOf = <A>(...choices: readonly Arbitrary.Arbitrary<A>[]) =>
  Arbitrary.flatMap(
    between(0, choices.length - 1),
    (at) => choices[at] as Arbitrary.Arbitrary<A>
  );

const node = between(0, 3);

/**
 * A saved database, as `--database` keeps one: two relations, a few edges,
 * and, sometimes, the rules that make `reach` the edges' closure.
 */
const database = Arbitrary.map(
  Arbitrary.all({
    edges: Arbitrary.array(Arbitrary.all([node, node]), { maxLength: 6 }),
    rules: Arbitrary.schema(Schema.Boolean),
  }),
  ({ edges, rules }) => [
    "begin",
    ["relation", "edge", ["from", "to"]],
    ["relation", "reach", ["from", "to"]],
    ...(edges.length > 0
      ? [["fact", ...edges.map(([from, to]) => ["edge", from, to])]]
      : []),
    ...(rules
      ? [
          ["rule", ["reach", "?x", "?y"], ["edge", "?x", "?y"]],
          [
            "rule",
            ["reach", "?x", "?z"],
            ["edge", "?x", "?y"],
            ["reach", "?y", "?z"],
          ],
        ]
      : []),
  ]
);

/** A value a program can name or compare. */
const value = oneOf<unknown>(
  node,
  element<unknown>([true, false, null, "yes", "", ["quote", [1, 2]]])
);

/**
 * A program a page could ask: a question of the database, a change to it,
 * plain code, and the cases where Lion has changed under pages before, a
 * definition named as a form and a condition that is not true or false.
 */
const program = oneOf<unknown>(
  Arbitrary.map(node, (from) => ["find", "?to", ["edge", from, "?to"]]),
  element<unknown>([
    ["find", ["?x", "?y"], ["edge", "?x", "?y"]],
    ["find", ["?x", "?y"], ["reach", "?x", "?y"]],
    ["query", ["edge", "?x", "?y"]],
    ["query", ["reach", "?x", "?x"]],
    "nothing-defines-this",
  ]),
  Arbitrary.map(Arbitrary.all([node, node]), ([from, to]) => [
    "why",
    ["reach", from, to],
  ]),
  Arbitrary.map(Arbitrary.all([node, node]), ([from, to]) => [
    "begin",
    ["fact", ["edge", from, to]],
    ["find", "?y", ["reach", from, "?y"]],
  ]),
  Arbitrary.map(Arbitrary.all([value, value]), ([a, b]) => [
    "number/add",
    a,
    b,
  ]),
  Arbitrary.map(
    Arbitrary.all({
      name: element(["rule", "fact", "query", "relation", "cond", "x"]),
      bound: value,
    }),
    ({ name, bound }) => ["begin", ["define", name, bound], name]
  ),
  Arbitrary.map(value, (condition) => [
    "cond",
    [condition, "first"],
    [true, "otherwise"],
  ])
);

describe("lion worker", () => {
  it.effect.prop(
    "answers every program as the lion command does, against the same saved database",
    { database, program },
    ({ database, program }) =>
      Effect.gen(function* () {
        expect(yield* inWorker(database, program)).toEqual(
          inCommand(database, program)
        );
      }),
    { arbitrary: { runs: 60 } }
  );
});
