/**
 * What the record gives people: the pages `history/outputs.json` computes,
 * written at the root of the repository, and the checks in
 * `history/checks.json`, which say what in the record needs fixing.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import { ask, FOLDER, REPOSITORY, type Sources } from "./record.ts";

/** A page's name, such as `CHANGELOG.md`, and its text. */
export type Pages = Readonly<Record<string, string>>;

/** What the checks found: each question with the rows that answer it. */
export interface Findings {
  /** Questions the record must answer with nothing. */
  readonly fail: Readonly<Record<string, readonly unknown[]>>;
  /** What the record holds, counted. */
  readonly holds: Readonly<Record<string, unknown>>;
  /** Questions worth seeing, which do not fail the check. */
  readonly note: Readonly<Record<string, readonly unknown[]>>;
}

export interface Report {
  readonly findings: Findings;
  readonly ok: boolean;
  /** Pages whose file differs from what the record writes. */
  readonly outOfDate: readonly string[];
  readonly text: string;
}

const readExpression = (repository: string, name: string): unknown =>
  JSON.parse(readFileSync(join(repository, FOLDER, name), "utf8")) as unknown;

/** The pages the record writes, as text. */
export const pagesOf = (sources: Sources, repository: string = REPOSITORY) =>
  ask(sources, readExpression(repository, "outputs.json")) as Effect.Effect<
    Pages,
    unknown
  >;

/** Writes the pages at the root of the repository, and names them. */
export const writePages = (sources: Sources, repository: string = REPOSITORY) =>
  Effect.map(pagesOf(sources, repository), (pages) =>
    Object.entries(pages).map(([name, text]) => {
      writeFileSync(join(repository, name), text);
      return name;
    })
  );

const rowText = (row: unknown) => `    ${JSON.stringify(row)}`;

const section = (
  mark: string,
  findings: Readonly<Record<string, readonly unknown[]>>
) =>
  Object.entries(findings)
    .filter(([, rows]) => rows.length > 0)
    .flatMap(([question, rows]) => [
      `${mark} ${question} (${rows.length})`,
      ...rows.map(rowText),
    ]);

/** Runs the checks, and compares each page with its file. */
export const checkRecord = (
  sources: Sources,
  repository: string = REPOSITORY
): Effect.Effect<Report, unknown> =>
  Effect.map(
    ask(sources, {
      checks: readExpression(repository, "checks.json"),
      pages: readExpression(repository, "outputs.json"),
    }) as Effect.Effect<{ checks: Findings; pages: Pages }, unknown>,
    ({ checks, pages }) => {
      const outOfDate = Object.entries(pages)
        .filter(([name, text]) => {
          const file = join(repository, name);
          return !existsSync(file) || readFileSync(file, "utf8") !== text;
        })
        .map(([name]) => name);
      const failed = section("✗", checks.fail);
      const ok = failed.length === 0 && outOfDate.length === 0;
      const lines = [
        ...failed,
        ...outOfDate.map(
          (name) =>
            `✗ ${name} is not what the record writes. Run: bun run history write`
        ),
        ...section("•", checks.note),
        ok
          ? `✓ The record holds: ${Object.entries(checks.holds)
              .map(([what, count]) => `${String(count)} ${what}`)
              .join(", ")}. Every page is up to date.`
          : "The record does not hold.",
      ];
      return { findings: checks, ok, outOfDate, text: lines.join("\n") };
    }
  );
