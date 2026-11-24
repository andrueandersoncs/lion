#!/usr/bin/env node
// Grades a finished research folder for reconciles-coupled-ledger stage by stage.
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkQuotes, claimsOf } from "../../scripts/check-quotes.mjs";

const SPACES = /\s+/;
const here = dirname(fileURLToPath(import.meta.url));
export const STAGES = ["reading", "framing", "conclusions", "page", "report"];

export const answers = () =>
  JSON.parse(readFileSync(join(here, "answers.json"), "utf8")).checks;

const queriesOf = (checks) =>
  Object.fromEntries(
    checks.flatMap((check) =>
      check.query === undefined ? [] : [[check.check, check.query]]
    )
  );

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const expected = (expect, value) => {
  if (expect === "some") {
    return Array.isArray(value) && value.length > 0;
  }
  if (expect === "none") {
    return Array.isArray(value) && value.length === 0;
  }
  return sameValue(value, expect);
};

const matchRegex = (pattern, text) => {
  const caseInsensitive = pattern.startsWith("(?i)");
  const body = caseInsensitive ? pattern.slice(4) : pattern;
  return new RegExp(body, caseInsensitive ? "i" : "").test(text);
};

const pageVerdict = (wanted, page) => {
  if (page === undefined) {
    return [false, "page-check.json did not run"];
  }
  if (wanted === "runs") {
    return [true, ""];
  }
  const wording = JSON.stringify(page ?? {});
  return [
    matchRegex(wanted, wording),
    `the page's wording has no match for /${wanted}/`,
  ];
};

const KINDS = [
  [
    "quotes",
    (_, { quotes }) =>
      quotes === undefined
        ? [false, "no model.json"]
        : [
            quotes.missing === 0,
            `${quotes.missing} quotes not found in their source`,
          ],
  ],
  [
    "query",
    (check, { queried }) => {
      if (queried === undefined) {
        return [false, "no model.json or query failed"];
      }
      const value = queried[check.check];
      return [expected(check.expect, value), `gave ${JSON.stringify(value)}`];
    },
  ],
  [
    "file",
    (check, { files }) => [files.includes(check.file), `no ${check.file}`],
  ],
  ["page", (check, { page }) => pageVerdict(check.page, page)],
  [
    "report",
    (check, { report }) =>
      report === undefined
        ? [false, "no report.md"]
        : [matchRegex(check.report, report), `no match for /${check.report}/`],
  ],
];

export const verdicts = (checks, found) =>
  checks.map((check) => {
    const kind = KINDS.find(([key]) => check[key] !== undefined);
    const [pass, detail] = kind
      ? kind[1](check, found)
      : [false, "unknown check kind"];
    return { ...check, detail, pass };
  });

const lion = (program, model) => {
  const scratch = mkdtempSync(join(tmpdir(), "lion-grade-"));
  const database = join(scratch, "model.json");
  copyFileSync(model, database);
  const file = join(scratch, "program.json");
  writeFileSync(file, JSON.stringify(program));
  const named = process.env.LION_CLI?.trim().split(SPACES) ?? [];
  const [command, ...rest] =
    named.length > 0 && named[0] !== ""
      ? named
      : ["bunx", "@lionlang/cli@latest"];
  const run = spawnSync(
    command ?? "bunx",
    [...rest, file, "--database", database],
    { encoding: "utf8" }
  );
  try {
    return run.status === 0 ? JSON.parse(run.stdout) : undefined;
  } catch {
    return;
  }
};

const read = (path) =>
  existsSync(path) ? readFileSync(path, "utf8") : undefined;

const findReport = (folder) => {
  for (const candidate of [
    join(folder, "report.md"),
    join(folder, "research", "vespera", "report.md"),
  ]) {
    const text = read(candidate);
    if (text !== undefined) {
      return text;
    }
  }
  const agent = read(join(folder, "agent.json"));
  if (agent !== undefined) {
    try {
      const parsed = JSON.parse(agent);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const last = [...list].reverse().find((m) => m?.type === "result");
      if (typeof last?.result === "string") {
        return last.result;
      }
    } catch {
      // ignore
    }
  }
  return undefined;
};

const main = (folder) => {
  const model = join(folder, "model.json");
  const hasModel = existsSync(model);
  const checks = answers();
  const quoted = hasModel
    ? checkQuotes(claimsOf(JSON.parse(readFileSync(model, "utf8"))), (source) =>
        read(join(folder, "sources", `${source}.txt`))
      )
    : undefined;
  const pageCheck = join(folder, "page-check.json");
  const results = verdicts(checks, {
    files: ["explorer.html", "report.md", "page-check.json"].filter((name) =>
      existsSync(join(folder, name))
    ),
    page:
      hasModel && existsSync(pageCheck)
        ? lion(JSON.parse(readFileSync(pageCheck, "utf8")), model)
        : undefined,
    queried: hasModel ? lion(queriesOf(checks), model) : undefined,
    quotes:
      quoted === undefined ? undefined : { missing: quoted.missing.length },
    report: findReport(folder),
  });
  for (const stage of STAGES) {
    const mine = results.filter((result) => result.stage === stage);
    const passed = mine.filter((result) => result.pass).length;
    console.log(`${stage.padEnd(12)} ${passed} of ${mine.length}`);
    for (const result of mine.filter((each) => !each.pass)) {
      console.log(`  failed  ${result.check}: ${result.detail}`);
    }
  }
  process.exit(results.every((result) => result.pass) ? 0 : 1);
};

const started = () => {
  try {
    return (
      realpathSync(process.argv[1] ?? "") ===
      realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
};

if (started()) {
  main(resolve(process.argv[2] ?? "."));
}
