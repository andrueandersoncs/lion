import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Exit, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { MemoryJournalStore, openJournal } from "@/logic/journal";
import { saveDatabase } from "@/logic/snapshot";
import { sameValue } from "@/logic/terms";
import { safeStdlib } from "@/modules";

const smallInt = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -50, maximum: 50 }))
);
const posInt = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 }))
);

describe("incremental WAL journal, compaction, OCC, time-travel, and branching", () => {
  it.effect.prop(
    "replays commits (including exact rationals) identically after reopen and compaction",
    {
      compactAt: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 4 }))
      ),
      values: Arbitrary.array(smallInt, { maxLength: 6, minLength: 2 }),
    },
    ({ compactAt, values }) =>
      Effect.gen(function* () {
        const store = new MemoryJournalStore();
        const journal = yield* openJournal(store, safeStdlib);

        yield* journal.commit([
          "begin",
          ["relation", "item", ["idx", "val"], { key: ["idx"] }],
          ["relation", "ratio", ["idx", "q"], { key: ["idx"] }],
        ]);

        const snapshotsByRev: unknown[] = [];
        snapshotsByRev.push(yield* saveDatabase(journal.database));

        for (const [index, val] of values.entries()) {
          yield* journal.commit([
            "begin",
            ["fact", ["item", index, val]],
            ["fact", ["ratio", index, ["number/divide", val, 3]]],
          ]);
          snapshotsByRev.push(yield* saveDatabase(journal.database));
          if (index === compactAt) {
            yield* journal.compact();
          }
        }

        // Reopen from store (uses compacted checkpoint + tail WAL entries).
        const reopened = yield* openJournal(store, safeStdlib);
        expect(reopened.revision).toBe(journal.revision);

        const q = ["query", ["ratio", "?i", "?q"], { order: "i" }];
        const liveRows = yield* journal.read(q);
        const reopenedRows = yield* reopened.read(q);
        expect(sameValue(liveRows, reopenedRows)).toBe(true);

        // Time-travel checkout matches every historical revision.
        for (let rev = 1; rev <= journal.revision; rev += 1) {
          const histDb = yield* reopened.checkout(rev);
          const histSnap = yield* saveDatabase(histDb);
          expect(sameValue(histSnap, snapshotsByRev[rev - 1])).toBe(true);
        }
      })
  );

  it.effect.prop(
    "rolls back multi-form transactions atomically when a later form fails",
    { a: smallInt, b: smallInt },
    ({ a, b }) =>
      Effect.gen(function* () {
        const store = new MemoryJournalStore();
        const journal = yield* openJournal(store, safeStdlib);
        yield* journal.commit([
          "begin",
          ["relation", "num", ["v"]],
          [
            "invariant",
            ["and", ["num", "?v"], ["number/lessThan", "?v", 0]],
            { assert: "none" },
          ],
        ]);
        const revBefore = journal.revision;

        // First fact is valid (>= 0), second fact breaks invariant (< 0).
        const exit = yield* Effect.exit(
          journal.commit([
            "begin",
            ["fact", ["num", Math.abs(a) + 1]],
            ["fact", ["num", -Math.abs(b) - 1]],
          ])
        );
        expect(Exit.isFailure(exit)).toBe(true);
        expect(journal.revision).toBe(revBefore);
        expect(yield* journal.read(["query", ["num", "?v"]])).toEqual([]);
      })
  );

  it.effect.prop(
    "enforces optimistic concurrency via expectedRevision",
    { a: smallInt, b: smallInt, staleDelta: posInt },
    ({ a, b, staleDelta }) =>
      Effect.gen(function* () {
        const store = new MemoryJournalStore();
        const journal = yield* openJournal(store, safeStdlib);
        yield* journal.commit(["relation", "x", ["v"]]);
        const currentRev = journal.revision;

        // Matching revision succeeds.
        const ok = yield* journal.commit(["fact", ["x", a]], {
          expectedRevision: currentRev,
        });
        expect(ok.changed).toBe(true);
        expect(ok.revision).toBe(currentRev + 1);

        // Stale revision fails with ConflictError and mutates nothing.
        const staleExit = yield* Effect.exit(
          journal.commit(["fact", ["x", b]], {
            expectedRevision: currentRev - staleDelta + 1,
          })
        );
        expect(Exit.isFailure(staleExit)).toBe(true);
        if (Exit.isFailure(staleExit)) {
          const reason = staleExit.cause.reasons[0];
          expect(reason?._tag).toBe("Fail");
          if (reason?._tag === "Fail") {
            expect((reason.error as { readonly _tag?: string })._tag).toBe(
              "ConflictError"
            );
          }
        }
        expect(yield* journal.read(["find", "?v", ["x", "?v"]])).toEqual([a]);
      })
  );

  it.effect.prop(
    "isolates forked branches and merges unconflicted commits back cleanly",
    { a: smallInt, b: smallInt },
    ({ a, b }) =>
      Effect.gen(function* () {
        const store = new MemoryJournalStore();
        const main = yield* openJournal(store, safeStdlib);
        yield* main.commit([
          "begin",
          ["relation", "node", ["id"]],
          ["fact", ["node", a]],
        ]);

        const branch = yield* main.fork("experiment");
        yield* branch.journal.commit(["fact", ["node", b]]);

        // Main does not see branch changes before merge.
        expect(yield* main.read(["find", "?x", ["node", "?x"]])).toEqual([a]);

        // Merging branch into unadvanced main succeeds.
        yield* main.merge(branch);
        const expected = [...new Set([a, b])].sort((x, y) => x - y);
        expect(yield* main.read(["find", "?x", ["node", "?x"]])).toEqual(
          expected
        );

        // Fork another branch, advance main, verify strict merge rejects with ConflictError.
        const staleBranch = yield* main.fork("stale");
        yield* staleBranch.journal.commit(["fact", ["node", a + 100]]);
        yield* main.commit(["fact", ["node", b + 200]]);

        const conflict = yield* Effect.exit(main.merge(staleBranch));
        expect(Exit.isFailure(conflict)).toBe(true);

        // Verify direct run on main.database agrees with journal.read.
        expect(
          yield* run(["find", "?x", ["node", "?x"]], safeStdlib, {
            database: main.database,
          })
        ).toEqual(yield* main.read(["find", "?x", ["node", "?x"]]));
      })
  );
});
