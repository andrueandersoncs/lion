/**
 * CLI workflows: evaluating inline expressions (`--eval` / `-e`) and standard
 * input (`-`), and checking programs against a saved `--database` without
 * modifying the database file.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Schema } from "effect";

const BIN = join(import.meta.dirname, "..", "bin.ts");

const between = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

describe("lion CLI --eval, stdin, and check --database", () => {
  it.prop(
    "--eval, -e, and stdin (-) produce the same JSON output as evaluating a file",
    { a: between(-100, 100), b: between(-100, 100) },
    ({ a, b }) => {
      const folder = mkdtempSync(join(tmpdir(), "lion-cli-eval-"));
      const program = JSON.stringify({
        sum: ["number/add", a, b],
        chars: ["string/chars", "a𝄞b"],
      });
      const file = join(folder, "prog.json");
      writeFileSync(file, program);

      const fromFile = spawnSync("bun", [BIN, file], { encoding: "utf8" });
      const fromEval = spawnSync("bun", [BIN, "--eval", program], {
        encoding: "utf8",
      });
      const fromShort = spawnSync("bun", [BIN, "-e", program], {
        encoding: "utf8",
      });
      const fromStdin = spawnSync("bun", [BIN, "-"], {
        encoding: "utf8",
        input: program,
      });

      expect(fromFile.status).toBe(0);
      expect(fromEval.status).toBe(0);
      expect(fromShort.status).toBe(0);
      expect(fromStdin.status).toBe(0);
      expect(fromEval.stdout).toBe(fromFile.stdout);
      expect(fromShort.stdout).toBe(fromFile.stdout);
      expect(fromStdin.stdout).toBe(fromFile.stdout);
    },
    { arbitrary: { runs: 10 } }
  );

  it.prop(
    "lion check --database validates against the saved database's relations and schemas without altering the file",
    {
      arity: between(1, 3),
      got: between(0, 4),
    },
    ({ arity, got }) => {
      const folder = mkdtempSync(join(tmpdir(), "lion-cli-check-"));
      const dbPath = join(folder, "store.json");
      const cols = Array.from({ length: arity }, (_, at) => `c${at}`);
      const dbContent = `${JSON.stringify([
        "begin",
        ["relation", "edge", cols],
        [
          "schema",
          "Positive",
          [
            "schema/allOf",
            "value/integer?",
            ["lambda", ["n"], ["number/greaterThan", "n", 0]],
          ],
        ],
      ])}\n`;
      writeFileSync(dbPath, dbContent);

      const args = Array.from({ length: got }, (_, at) => at);
      const program = JSON.stringify(["query", ["edge", ...args]]);
      const checked = spawnSync(
        "bun",
        [BIN, "check", "--database", dbPath, "-e", program],
        { encoding: "utf8" }
      );

      // The database file is never modified by check.
      expect(readFileSync(dbPath, "utf8")).toBe(dbContent);

      const parsed = JSON.parse(checked.stdout) as {
        readonly at: string;
        readonly error?: string;
      }[];
      if (got === arity) {
        expect(checked.status).toBe(0);
        expect(parsed).toEqual([]);
      } else {
        expect(checked.status).not.toBe(0);
        expect(parsed).toEqual([
          {
            at: "/1",
            error: `"edge" takes ${arity} argument${arity === 1 ? "" : "s"} (${cols.join(", ")}) but got ${got}.`,
          },
        ]);
      }
    },
    { arbitrary: { runs: 10 } }
  );

  it.prop(
    "--bind and --bind-file inject exact JSON data into both lion and lion check, with --bind overriding --bind-file",
    {
      cents: between(1, 99),
      extra: between(-50, 50),
      tag: Arbitrary.schema(Schema.Literals(["a=b", "ok", "x=1"])),
    },
    ({ cents, extra, tag }) => {
      const folder = mkdtempSync(join(tmpdir(), "lion-cli-bind-"));
      const dataPath = join(folder, "input.json");
      writeFileSync(
        dataPath,
        JSON.stringify({ items: [extra, 10], label: tag })
      );

      // Exact decimal arithmetic through --bind plus record loaded via --bind-file.
      const program = JSON.stringify({
        exact: [
          "number/equals?",
          ["number/add", "price", 0.2],
          (cents + 20) / 100,
        ],
        label: ["object/get", "cfg", "label"],
        over: "override",
        total: [
          "number/add",
          ["array/at", ["object/get", "cfg", "items"], 0],
          "bonus",
        ],
      });

      const ran = spawnSync(
        "bun",
        [
          BIN,
          "--bind-file",
          `cfg=${dataPath}`,
          "--bind-file",
          `override=${dataPath}`,
          "-b",
          `price=${(cents / 100).toFixed(2)}`,
          "--bind",
          `bonus=${extra}`,
          "--bind",
          `override=${JSON.stringify(tag)}`,
          "-e",
          program,
        ],
        { encoding: "utf8" }
      );
      expect(ran.status).toBe(0);
      expect(JSON.parse(ran.stdout)).toEqual({
        exact: true,
        label: tag,
        over: tag,
        total: extra * 2,
      });

      // lion check also accepts --bind and --bind-file and flags typos against them.
      const checked = spawnSync(
        "bun",
        [
          BIN,
          "check",
          "--bind-file",
          `cfg=${dataPath}`,
          "--bind",
          `bonus=${extra}`,
          "-e",
          JSON.stringify([
            "number/add",
            "bonus",
            ["array/length", ["object/get", "cfg", "items"]],
          ]),
        ],
        { encoding: "utf8" }
      );
      expect(checked.status).toBe(0);
      expect(JSON.parse(checked.stdout)).toEqual([]);

      // Invalid --bind syntax fails cleanly.
      const bad = spawnSync("bun", [BIN, "--bind", "__proto__=1", "-e", "1"], {
        encoding: "utf8",
      });
      expect(bad.status).not.toBe(0);
    },
    { arbitrary: { runs: 8 } }
  );

  it.prop(
    "multi-file execution matches sequential runs atomically, read-only queries skip rewriting --database, --read-only discards mutations, and lion inspect summarizes ontology metadata",
    {
      count: between(1, 4),
      offset: between(1, 20),
    },
    ({ count, offset }) => {
      const folder = mkdtempSync(join(tmpdir(), "lion-cli-kb-"));
      const step1 = join(folder, "01-schema.json");
      const step2 = join(folder, "02-facts.json");
      const step3 = join(folder, "03-query.json");
      const badStep = join(folder, "04-bad.json");
      const multiDb = join(folder, "multi.json");
      const seqDb = join(folder, "seq.json");

      writeFileSync(
        step1,
        JSON.stringify([
          "begin",
          [
            "schema",
            "Positive",
            [
              "schema/allOf",
              "value/integer?",
              ["lambda", ["n"], ["number/greaterThan", "n", 0]],
            ],
          ],
          ["relation", "node", ["id", "score"], { key: "id" }],
          ["relation", "high", ["id"]],
          [
            "rule",
            ["high", "?id"],
            ["node", "?id", "?s"],
            ["number/greaterThan", "?s", offset],
          ],
          [
            "invariant",
            ["and", ["node", "?_", "?s"], ["not", ["Positive", "?s"]]],
            { assert: "none" },
          ],
          "framed",
        ])
      );
      const facts = Array.from({ length: count }, (_, i) => [
        "node",
        `n${i}`,
        offset + i,
      ]);
      writeFileSync(step2, JSON.stringify(["fact", ...facts]));
      writeFileSync(
        step3,
        JSON.stringify(["query", ["high", "?id"], { order: "id" }])
      );
      writeFileSync(badStep, JSON.stringify(["fact", ["node", "bad", -1]]));

      // Multi-file build in one invocation matches sequential invocations.
      const multi = spawnSync(
        "bun",
        [BIN, step1, step2, step3, "--database", multiDb],
        { encoding: "utf8" }
      );
      expect(multi.status).toBe(0);

      for (const s of [step1, step2]) {
        const r = spawnSync("bun", [BIN, s, "--database", seqDb], {
          encoding: "utf8",
        });
        expect(r.status).toBe(0);
      }
      const seqLast = spawnSync("bun", [BIN, step3, "--database", seqDb], {
        encoding: "utf8",
      });
      expect(seqLast.status).toBe(0);
      expect(multi.stdout).toBe(seqLast.stdout);
      expect(readFileSync(multiDb, "utf8")).toBe(readFileSync(seqDb, "utf8"));

      // Read-only query does not rewrite the database file (mtime unchanged).
      const beforeStat = statSync(multiDb);
      const beforeBytes = readFileSync(multiDb, "utf8");
      const roQuery = spawnSync("bun", [BIN, step3, "--database", multiDb], {
        encoding: "utf8",
      });
      expect(roQuery.status).toBe(0);
      expect(statSync(multiDb).mtimeMs).toBe(beforeStat.mtimeMs);
      expect(readFileSync(multiDb, "utf8")).toBe(beforeBytes);

      // --read-only executes mutations in memory without touching disk.
      const whatIf = spawnSync(
        "bun",
        [
          BIN,
          "--read-only",
          "--database",
          multiDb,
          "-e",
          JSON.stringify([
            "begin",
            ["fact", ["node", "temp", offset + 100]],
            ["find", "?id", ["high", "?id"]],
          ]),
        ],
        { encoding: "utf8" }
      );
      expect(whatIf.status).toBe(0);
      expect(JSON.parse(whatIf.stdout)).toContain("temp");
      expect(readFileSync(multiDb, "utf8")).toBe(beforeBytes);

      // Atomic failure: if a later step breaks an invariant, database stays unchanged.
      const failed = spawnSync(
        "bun",
        [BIN, step2, badStep, "--database", multiDb],
        { encoding: "utf8" }
      );
      expect(failed.status).not.toBe(0);
      expect(readFileSync(multiDb, "utf8")).toBe(beforeBytes);

      // lion inspect reports relations, schemas, invariants, and --derived row counts.
      const inspected = spawnSync(
        "bun",
        [BIN, "inspect", multiDb, "--derived"],
        { encoding: "utf8" }
      );
      expect(inspected.status).toBe(0);
      const summary = JSON.parse(inspected.stdout) as {
        readonly relations: readonly {
          readonly name: string;
          readonly columns: readonly string[];
          readonly key?: readonly string[];
          readonly facts: number;
          readonly rules: number;
          readonly rows?: number;
        }[];
        readonly schemas: readonly { readonly name: string }[];
        readonly invariants: readonly unknown[];
        readonly counts: {
          readonly relations: number;
          readonly schemas: number;
          readonly facts: number;
          readonly rules: number;
          readonly invariants: number;
        };
      };
      expect(summary.counts).toEqual({
        relations: 2,
        schemas: 1,
        facts: count,
        rules: 1,
        invariants: 1,
      });
      expect(summary.relations).toEqual([
        {
          name: "high",
          columns: ["id"],
          facts: 0,
          rules: 1,
          rows: count - 1,
        },
        {
          name: "node",
          columns: ["id", "score"],
          key: ["id"],
          facts: count,
          rules: 0,
          rows: count,
        },
      ]);
      expect(summary.schemas.map((s) => s.name)).toEqual(["Positive"]);
      expect(readFileSync(multiDb, "utf8")).toBe(beforeBytes);
    },
    { arbitrary: { runs: 6 } }
  );
});
