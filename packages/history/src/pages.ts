/**
 * What the model of Lion's development gives people: the pages
 * `history/outputs.json` computes, written at the root of the repository,
 * and the checks that say what needs fixing: the record's own, in
 * `history/checks.json`, and the research's findings that no list holds.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "@lionlang/core/evaluation/evaluate";
import type { LogicDatabase } from "@lionlang/core/logic/database";
import { stdlib } from "@lionlang/core/modules";
import { Effect } from "effect";
import { type Built, type Finding, findingsOf } from "./model.ts";
import { FOLDER, REPOSITORY } from "./record.ts";
import { RESEARCH } from "./research.ts";

/** A page's name, such as `CHANGELOG.md`, and its text. */
export type Pages = Readonly<Record<string, string>>;

/** What the record's checks found: each question with the rows that answer it. */
export interface Checks {
  /** Questions the record must answer with nothing. */
  readonly fail: Readonly<Record<string, readonly unknown[]>>;
  /** What the record holds, counted. */
  readonly holds: Readonly<Record<string, unknown>>;
  /** Questions worth seeing, which do not fail the check. */
  readonly note: Readonly<Record<string, readonly unknown[]>>;
}

export interface Report {
  readonly ok: boolean;
  /** Pages whose file differs from what the model writes. */
  readonly outOfDate: readonly string[];
  readonly text: string;
}

const readExpression = (repository: string, name: string): unknown =>
  JSON.parse(readFileSync(join(repository, FOLDER, name), "utf8")) as unknown;

/** The pages the model writes, as text. */
export const pagesOf = (
  database: LogicDatabase,
  repository: string = REPOSITORY
) =>
  run(readExpression(repository, "outputs.json") as never, stdlib, {
    database,
  }) as Effect.Effect<Pages, unknown>;

/** Writes the pages at the root of the repository, and names them. */
export const writePages = (pages: Pages, repository: string = REPOSITORY) =>
  Object.entries(pages).map(([name, text]) => {
    writeFileSync(join(repository, name), text);
    return name;
  });

const rowText = (row: unknown) => `    ${JSON.stringify(row)}`;

const section = (
  mark: string,
  rows: Readonly<Record<string, readonly unknown[]>>
) =>
  Object.entries(rows)
    .filter(([, found]) => found.length > 0)
    .flatMap(([question, found]) => [
      `${mark} ${question} (${found.length})`,
      ...found.map(rowText),
    ]);

const witnessed = (findings: readonly Finding[]) =>
  findings.map((finding) => [finding.assumption, finding.witness]);

/**
 * Everything that needs fixing in the model and the pages it writes: notes
 * whose quotes their sources do not hold, the record's failed checks,
 * findings no list holds and listed findings the model no longer finds, and
 * pages that differ from what the model writes. With `written` given, the
 * pages `bun run history write` just wrote, pages are not compared.
 */
export const checkModel = (
  built: Built,
  repository: string = REPOSITORY,
  written?: Pages
): Effect.Effect<Report, unknown> =>
  Effect.gen(function* () {
    const checks = (yield* run(
      readExpression(repository, "checks.json") as never,
      stdlib,
      { database: built.database }
    )) as Checks;
    const found = yield* findingsOf(built.database);
    const pages = written ?? (yield* pagesOf(built.database, repository));
    const outOfDate =
      written === undefined
        ? Object.entries(pages)
            .filter(([name, text]) => {
              const file = join(repository, name);
              return !existsSync(file) || readFileSync(file, "utf8") !== text;
            })
            .map(([name]) => name)
        : [];
    const failed = [
      ...built.problems.map((problem) => `✗ ${problem}`),
      ...section("✗", checks.fail),
      ...section("✗", {
        [`New findings: list each in ${RESEARCH}/known.json with a note, or settle it`]:
          witnessed(found.fresh),
        "Listed findings the model no longer finds: remove them from known.json or accepted.json":
          witnessed(found.stale),
      }),
      ...outOfDate.map(
        (name) =>
          `✗ ${name} is not what the model writes. Run: bun run history write`
      ),
    ];
    const ok = failed.length === 0;
    const lines = [
      ...failed,
      ...section("•", checks.note),
      `• ${found.known.length} known findings wait for a decision, ${found.accepted.length} are accepted, ${found.unread.length} commits are not read yet`,
      ok
        ? `✓ The model holds: ${Object.entries(checks.holds)
            .map(([what, count]) => `${String(count)} ${what}`)
            .join(", ")}, from ${built.steps.length} steps.${
            written === undefined ? " Every page is up to date." : ""
          }`
        : "The model does not hold.",
    ];
    return { ok, outOfDate, text: lines.join("\n") };
  });
