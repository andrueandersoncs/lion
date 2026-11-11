import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { LogicDatabase } from "@/logic/database";
import { saveDatabase } from "@/logic/snapshot";
import {
  attempt,
  edgeFact,
  element,
  name,
  RULES,
  scenario,
  start,
} from "./programs";

type Form = readonly unknown[];

const RELATIONS: readonly (readonly string[])[] = [
  ["edge", "from", "to"],
  ["path", "from", "to"],
  ["node", "name"],
  ["order", "id", "status"],
  ["cancelled", "id"],
  ["degree", "node", "count"],
];

/** Every relation's rows, sorted, so answers can be compared. */
const everyAnswer = (database: LogicDatabase) =>
  Effect.forEach(RELATIONS, ([name, ...columns]) =>
    attempt(
      [
        "query",
        [name, ...columns.map((column) => `?${column}`)],
        { order: columns },
      ],
      database
    )
  );

const isForm = (kind: string) => (form: unknown) =>
  Array.isArray(form) && form[0] === kind;

/** The distinct items, in the order each first appears. */
const distinct = (forms: readonly Form[]) =>
  forms.filter(
    (form, at) =>
      forms.findIndex(
        (other) => JSON.stringify(other) === JSON.stringify(form)
      ) === at
  );

describe("adding what the database already holds", () => {
  it.effect.prop(
    "changes nothing, so re-running a saved database on itself is a no-op",
    { scenario },
    ({ scenario: generated }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        yield* start(database, generated);
        for (const step of generated.steps) {
          yield* attempt(step, database);
        }
        const saved = yield* saveDatabase(database);
        const answers = yield* everyAnswer(database);
        for (const form of saved.filter(
          (item) => isForm("rule")(item) || isForm("invariant")(item)
        )) {
          expect((yield* attempt(form, database)).ok).toBe(true);
        }
        expect(yield* saveDatabase(database)).toEqual(saved);
        // The whole snapshot, as `lion --database` loads it, run once more.
        expect((yield* attempt(saved, database)).ok).toBe(true);
        expect(yield* saveDatabase(database)).toEqual(saved);
        expect(yield* everyAnswer(database)).toEqual(answers);
      })
  );

  it.effect.prop(
    "keeps one copy of each rule, so aggregates count each match once",
    {
      edges: Arbitrary.array(edgeFact, { maxLength: 6 }),
      picks: Arbitrary.array(element(RULES), { minLength: 1, maxLength: 8 }),
    },
    ({ edges, picks }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        yield* start(database, {
          setup: edges.length > 0 ? [["fact", ...edges]] : [],
          steps: [],
        });
        for (const pick of picks) {
          expect((yield* attempt(pick, database)).ok).toBe(true);
        }
        const saved = yield* saveDatabase(database);
        expect(saved.filter(isForm("rule"))).toEqual(distinct(picks));

        // degree(n) counts n's distinct edges, however often its rule was added.
        const targets = new Map<unknown, Set<unknown>>();
        for (const [, from, to] of edges) {
          targets.set(from, (targets.get(from) ?? new Set()).add(to));
        }
        const counted = picks.some((pick) =>
          JSON.stringify(pick).includes("aggregate/count")
        );
        const expected = counted
          ? [...targets.entries()]
              .map(([node, to]) => ({ node, count: to.size }))
              .sort((a, b) => String(a.node).localeCompare(String(b.node)))
          : [];
        expect(
          yield* attempt(
            ["query", ["degree", "?node", "?count"], { order: "node" }],
            database
          )
        ).toEqual({ ok: true, value: expected });
      })
  );

  const small = Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 }))
  );

  it.effect.prop(
    "tells rules apart by their values and variables, not by how they are written",
    { name, captured: small, written: small, repeats: small },
    ({ name: variable, captured, written, repeats }) =>
      Effect.gen(function* () {
        const database = new LogicDatabase();
        const rules = [
          // A variable, and a string that looks like it.
          ["rule", ["tag", `?${variable}`], ["item", `?${variable}`]],
          [
            "rule",
            ["tag", ["quote", `?${variable}`]],
            ["item", `?${variable}`],
          ],
          // Rules hold values as evaluated: "k" is the same as its value.
          ["rule", ["limit", "k"], ["item", "?_"]],
          ["rule", ["limit", written], ["item", "?_"]],
        ];
        yield* attempt(
          [
            "begin",
            ["relation", "item", ["x"]],
            ["relation", "tag", ["x"]],
            ["relation", "limit", ["n"]],
            ["fact", ["item", "a"]],
          ],
          database
        );
        // Each run has its own environment, so "k" is defined in every one.
        for (let round = 0; round <= repeats; round += 1) {
          for (const rule of rules) {
            const added = yield* attempt(
              ["begin", ["define", "k", captured], rule],
              database
            );
            expect(added.ok).toBe(true);
          }
        }
        expect(database.rules).toHaveLength(captured === written ? 3 : 4);
        expect(
          yield* attempt(["query", ["tag", "?x"], { order: "x" }], database)
        ).toEqual({ ok: true, value: [{ x: `?${variable}` }, { x: "a" }] });
      })
  );
});
