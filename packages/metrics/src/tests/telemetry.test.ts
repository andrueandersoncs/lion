import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Schema } from "effect";
import {
  flakyOf,
  type Logged,
  logCheck,
  loggedOf,
  readLogged,
} from "../telemetry.ts";
import { between, element } from "./generators.ts";

const run: Arbitrary.Arbitrary<Logged> = Arbitrary.map(
  Arbitrary.all({
    check: element(["a: vitest run x", "a: vitest run y", "b: sh -c check"]),
    passed: Arbitrary.schema(Schema.Boolean),
    tenths: between(0, 900),
    tree: element(["t1", "t2"]),
  }),
  ({ check, passed, tenths, tree }) => ({
    check,
    passed,
    seconds: tenths / 10,
    tree,
  })
);

describe("the telemetry of the checks the hook runs", () => {
  it.prop(
    "reads back every run it logged, in order, past lines that are no run",
    { runs: Arbitrary.array(run, { maxLength: 6 }) },
    ({ runs }) => {
      const folder = mkdtempSync(join(tmpdir(), "telemetry-"));
      const file = join(folder, "telemetry.jsonl");
      try {
        for (const each of runs) {
          logCheck(each, file);
        }
        expect(readLogged(file)).toStrictEqual(runs.map((r) => ({ ...r })));
        expect(
          loggedOf(`{\n[]\n${JSON.stringify({ check: 1 })}`)
        ).toStrictEqual([]);
      } finally {
        rmSync(folder, { force: true, recursive: true });
      }
    }
  );

  it.prop(
    "calls a check flaky when it both passed and failed on one tree, and no other",
    { runs: Arbitrary.array(run, { maxLength: 8 }) },
    ({ runs }) => {
      const expected = [
        ...new Set(
          runs
            .filter((r) =>
              runs.some(
                (s) =>
                  s.check === r.check &&
                  s.tree === r.tree &&
                  s.passed !== r.passed
              )
            )
            .map((r) => r.check)
        ),
      ].sort();
      expect(flakyOf(runs)).toStrictEqual(expected);
    }
  );
});
