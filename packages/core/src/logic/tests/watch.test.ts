/**
 * Watching a query from host code. After each change a program makes, a
 * watcher is told the answers that came and went, exactly when some did:
 * the model asks the same query of a fresh database that holds the facts as
 * they are after each change, and diffs what it gives. A change an
 * invariant refuses, and what `assuming` asks, tell nothing.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";
import { run, watch } from "@/evaluation/evaluate";
import { LogicDatabase } from "@/logic/database";
import type { Watched } from "@/logic/watch";
import { stdlib } from "@/modules";
import { element } from "./programs";

const NODES = ["a", "b", "c"] as const;

const SETUP = [
  "begin",
  ["relation", "edge", ["from", "to"]],
  ["relation", "path", ["from", "to"]],
  ["rule", ["path", "?x", "?y"], ["edge", "?x", "?y"]],
  ["rule", ["path", "?x", "?z"], ["path", "?x", "?y"], ["edge", "?y", "?z"]],
  ["invariant", ["edge", "?n", "?n"], { assert: "none" }],
];

const QUERY = ["find", ["array/make", "?x", "?y"], ["path", "?x", "?y"]];

/** A change: add or take back an edge, or ask with assuming. */
const change = Arbitrary.all([
  element(["fact", "retract", "assuming"] as const),
  element(NODES),
  element(NODES),
]);

const key = (answer: unknown) => JSON.stringify(answer);

const sorted = (answers: readonly unknown[]) => answers.map(key).sort();

describe("a watched query", () => {
  it.effect.prop(
    "is told after each change exactly the answers that came and went",
    { changes: Arbitrary.array(change, { maxLength: 8 }) },
    ({ changes }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        yield* run(SETUP, stdlib, { database });
        const told: Watched[] = [];
        yield* watch(QUERY, stdlib, database, (watched) => told.push(watched));
        // The model: the facts kept, and what the query gives a fresh database.
        const edges = new Set<string>();
        let before = new Set<string>();
        const expected: { added: string[]; removed: string[] }[] = [];
        for (const [form, from, to] of changes) {
          const edge = ["edge", from, to];
          const program =
            form === "assuming"
              ? ["assuming", ["fact", edge], QUERY]
              : [form, edge];
          yield* Effect.exit(run(program, stdlib, { database }));
          if (form === "assuming") {
            continue;
          }
          // An edge from a node to itself breaks the invariant: refused.
          if (form === "fact" && from !== to) {
            edges.add(key(edge));
          } else if (form === "retract") {
            edges.delete(key(edge));
          }
          const fresh = new LogicDatabase();
          const facts = [...edges].map((each) => JSON.parse(each));
          const answers = (yield* run(
            [
              ...SETUP,
              ...(facts.length > 0 ? [["fact", ...facts]] : []),
              QUERY,
            ],
            stdlib,
            { database: fresh }
          )) as unknown[];
          const now = new Set(answers.map(key));
          const added = [...now].filter((each) => !before.has(each)).sort();
          const removed = [...before].filter((each) => !now.has(each)).sort();
          if (added.length > 0 || removed.length > 0) {
            expected.push({ added, removed });
          }
          before = now;
        }
        expect(
          told.map(({ added, removed }) => ({
            added: sorted(added),
            removed: sorted(removed),
          }))
        ).toEqual(expected);
      }),
    { timeout: 120_000 }
  );
});
