import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Schema } from "effect";
import { attemptLine } from "../corpus-agents.ts";
import { examplesIn, programsOf } from "../variants.ts";
import { word } from "./generators.ts";

/** A program of strings and integers; -0 is 0, as JSON writes it. */
const program = Arbitrary.map(
  Arbitrary.schema(Schema.Array(Schema.Union([Schema.String, Schema.Int]))),
  (items) => items.map((item) => (typeof item === "number" ? item + 0 : item))
);

describe("the programs a lint is asked of", () => {
  it.prop(
    "are every live example of a page of the docs, in order, past one that is not JSON",
    {
      programs: Arbitrary.array(program, { maxLength: 4 }),
      prose: word,
    },
    ({ programs, prose }) => {
      const html = [
        `<p>${prose}</p>`,
        ...programs.map(
          (p, at) =>
            `<lion-example name="e${at}">\n${JSON.stringify(p)}\n</lion-example>`
        ),
        '<lion-example name="broken">[1,</lion-example>',
      ].join("\n");
      expect(examplesIn(html)).toStrictEqual(programs.map((p) => [...p]));
    }
  );

  it.prop(
    "take in every program an agent tried, and every one it handed in, from a folder of runs",
    {
      handed: Arbitrary.array(program, { maxLength: 3 }),
      tried: Arbitrary.array(program, { maxLength: 3 }),
    },
    ({ handed, tried }) => {
      const root = mkdtempSync(join(tmpdir(), "variants-"));
      try {
        mkdirSync(join(root, "history/research"), { recursive: true });
        writeFileSync(join(root, "history/research/probes.json"), "[]");
        const run = join(root, "runs", "r1");
        mkdirSync(join(run, "solutions"), { recursive: true });
        mkdirSync(join(run, "attempts"), { recursive: true });
        for (const [at, p] of handed.entries()) {
          writeFileSync(
            join(run, "solutions", `t${at}.json`),
            JSON.stringify(p)
          );
        }
        writeFileSync(
          join(run, "attempts", "t0.jsonl"),
          tried.map((p) => attemptLine({ ok: false, program: p })).join("")
        );
        const found = programsOf(root, join(root, "runs"));
        expect(found.map((f) => f.program)).toStrictEqual([
          ...handed.map((p) => [...p]),
          ...tried.map((p) => [...p]),
        ]);
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    }
  );
});
