#!/usr/bin/env node
// Grades a finished research folder against the known-correct answers for
// this case's corpus, stage by stage, so a failure says where the run went
// wrong: reading the sources, framing the model, the conclusions the model
// derives, the page, or the report.
//
//   node grade.mjs <research folder>
//
// It runs the Lion command that `LION_CLI` names, such as
// "bun ~/lion/packages/cli/dist/bin.mjs", or else the published one. It
// exits with 1 when any check fails. Runs under node or bun.
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

/** What separates the words of a command. */
const SPACES = /\s+/;

const here = dirname(fileURLToPath(import.meta.url));
export const STAGES = ["reading", "framing", "conclusions", "page", "report"];
const PLAN_CHECK = /^Questions the plan names/;

export const answers = () =>
  JSON.parse(readFileSync(join(here, "answers.json"), "utf8")).checks;

/** The Lion queries among the checks, as one record a single run answers. */
export const queriesOf = (checks) =>
  Object.fromEntries(
    checks.flatMap((check) =>
      check.query === undefined ? [] : [[check.check, check.query]]
    )
  );

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Whether a query's result is what the check expects of it. */
const expected = (expect, value) => {
  if (expect === "some") {
    return Array.isArray(value) && value.length > 0;
  }
  if (expect === "none") {
    return Array.isArray(value) && value.length === 0;
  }
  return sameValue(value, expect);
};

/** All the wording a run of page-check.json gave, as one text. */
const wordingOf = (results) => JSON.stringify(results ?? {});

/** Whether the page passes a check of its own: it runs, it is plain, or it says something. */
const pageVerdict = (wanted, page) => {
  if (page === undefined) {
    return [false, "page-check.json did not run"];
  }
  if (wanted === "runs") {
    return [true, ""];
  }
  if (wanted === "plain") {
    const named = Object.entries(page).filter(([name]) =>
      PLAN_CHECK.test(name)
    );
    return [
      named.every(([, found]) => Array.isArray(found) && found.length === 0),
      JSON.stringify(named),
    ];
  }
  return [
    wordingOf(page).includes(wanted),
    `the page's wording has no ${wanted}`,
  ];
};

/** How each kind of check is judged: whether it passed, and what was found. */
const KINDS = [
  [
    "quotes",
    (_, { quotes }) => [
      quotes.missing === 0,
      `${quotes.missing} quotes not found in their source`,
    ],
  ],
  [
    "query",
    (check, { queried }) => {
      const value = queried?.[check.check];
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
        : [
            new RegExp(check.report).test(report),
            `no match for /${check.report}/`,
          ],
  ],
];

/**
 * The verdict on each check, from what was found in the run:
 * `queried`, the result of each check's query; `quotes`, the quote check;
 * `page`, the result of page-check.json, or undefined when it failed;
 * `report`, the report's text; and `files`, the names present.
 */
export const verdicts = (checks, found) =>
  checks.map((check) => {
    const kind = KINDS.find(([key]) => check[key] !== undefined);
    const [pass, detail] = kind
      ? kind[1](check, found)
      : [false, "a check of a kind this grader does not know"];
    return { ...check, detail, pass };
  });

/** Runs the Lion command on a program and a copy of the model. */
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

const main = (folder) => {
  const model = join(folder, "model.json");
  if (!existsSync(model)) {
    console.error(
      `There is no model.json in ${folder}. Pass the research folder of a finished run.`
    );
    process.exit(1);
  }
  const checks = answers();
  const claims = claimsOf(JSON.parse(readFileSync(model, "utf8")));
  const quoted = checkQuotes(claims, (source) =>
    read(join(folder, "sources", `${source}.txt`))
  );
  const pageCheck = join(folder, "page-check.json");
  const results = verdicts(checks, {
    files: ["explorer.html", "report.md", "page-check.json"].filter((name) =>
      existsSync(join(folder, name))
    ),
    page: existsSync(pageCheck)
      ? lion(JSON.parse(readFileSync(pageCheck, "utf8")), model)
      : undefined,
    queried: lion(queriesOf(checks), model),
    quotes: { missing: quoted.missing.length },
    report: read(join(folder, "report.md")),
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

// True when this file is the program that was started, by whatever path.
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
