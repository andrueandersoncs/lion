#!/usr/bin/env node
// Grades a finished run of the rechecks-what-changed case: its audit.json
// against the lines of RESULTS.md that are wrong at the end.
//
//   node grade.mjs <run folder>
//
// It prints a line per stage, "changed 4 of 5", and under it a line for each
// check that failed:
//   report     audit.json is a JSON array
//   changed    every line that went wrong after the first session is reported
//   fixed      no line that came right after the first session is reported
//   unchanged  every other wrong line is reported
//   precise    no entry names a right line, or no line at all
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lineOf, reference, WORLD } from "./world.mjs";

const said = (line) => {
  const [name, value] = line.split("=");
  return `\`${name}\` scores ${value}`;
};

/** The stages of a report's grade, from the entries it lists, or undefined when it has none. */
export const gradeReport = (world, entries) => {
  const ref = reference(world);
  const named = (entries ?? []).map((entry) => ({
    entry,
    line: lineOf(ref, entry),
  }));
  const reported = new Set(
    named.flatMap((each) => (each.line === undefined ? [] : [each.line]))
  );
  const stage = (name, checks) => ({
    failures: checks.filter((check) => !check.ok).map((check) => check.failure),
    name,
    passed: checks.filter((check) => check.ok).length,
    total: checks.length,
  });
  const why = (line) => ref.changeOf[line.split("=")[0]];
  const right = named.filter(
    (each) =>
      each.line !== undefined &&
      !ref.wrong.includes(each.line) &&
      !ref.fixed.includes(each.line)
  );
  const unnamed = named.filter((each) => each.line === undefined);
  return [
    stage("report", [
      {
        failure: "audit.json is missing or is not a JSON array",
        ok: entries !== undefined,
      },
    ]),
    stage(
      "changed",
      ref.changed.map((line) => ({
        failure: `does not report ${said(line)}, made wrong after the first session (${why(line)})`,
        ok: reported.has(line),
      }))
    ),
    stage(
      "fixed",
      ref.fixed.map((line) => ({
        failure: `reports ${said(line)}, which came right after the first session (${why(line)})`,
        ok: !reported.has(line),
      }))
    ),
    stage(
      "unchanged",
      ref.wrong
        .filter((line) => !ref.changed.includes(line))
        .map((line) => ({
          failure: `does not report ${said(line)}`,
          ok: reported.has(line),
        }))
    ),
    stage("precise", [
      {
        failure: [
          ...right.map((each) => `reports ${said(each.line)}, which is right`),
          ...unnamed.map(
            (each) =>
              `names no line of RESULTS.md: ${JSON.stringify(each.entry)}`
          ),
        ].join("; "),
        ok: right.length === 0 && unnamed.length === 0,
      },
    ]),
  ];
};

/** The stages as the grader prints them. */
export const printed = (stages) =>
  stages
    .flatMap(({ failures, name, passed, total }) => [
      `${name.padEnd(10)} ${passed} of ${total}`,
      ...failures.map((failure) => `  failed  ${failure}`),
    ])
    .join("\n");

const entriesIn = (folder) => {
  const file = join(folder, "audit.json");
  if (!existsSync(file)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  console.log(
    printed(gradeReport(WORLD, entriesIn(resolve(process.argv[2] ?? "."))))
  );
}
