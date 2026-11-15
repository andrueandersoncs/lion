/**
 * The project record as one Lion program: the rules in `history/core.json`,
 * the facts git gives, the entry files people write, and a last expression to
 * evaluate against them, such as the pages in `history/outputs.json`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { run } from "@lionlang/core/evaluation/evaluate";
import { LogicDatabase } from "@lionlang/core/logic/database";
import { stdlib } from "@lionlang/core/modules";
import { Effect } from "effect";
import { type History, readHistory, WORKING_TREE } from "./git.ts";

/** The repository this package sits in. */
export const REPOSITORY = join(import.meta.dirname, "../../..");

/** The record's folder, relative to the repository. */
export const FOLDER = "history";

/** Each folder of entries, and the relation that holds its files. */
export const KINDS = {
  changes: "changes",
  decisions: "decision",
  releases: "release",
} as const;

export interface Entry {
  readonly data: unknown;
  /** Relative to the repository, with `/` between folders. */
  readonly path: string;
}

/** What the record is built from. */
export interface Sources {
  readonly entries: readonly Entry[];
  readonly history: History;
  /** The rules: the forms of `core.json` after its `begin`. */
  readonly rules: readonly unknown[];
}

const walk = (directory: string): string[] => {
  try {
    return readdirSync(directory).flatMap((name) => {
      const path = join(directory, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  } catch {
    return [];
  }
};

const readJson = (file: string): unknown => {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch (cause) {
    throw new Error(`${file} is not valid JSON: ${String(cause)}`);
  }
};

/** Every entry file of the record, in path order. */
export const readEntries = (
  repository: string,
  folder: string = FOLDER
): Entry[] =>
  Object.keys(KINDS)
    .flatMap((kind) => walk(join(repository, folder, kind)))
    .filter((file) => file.endsWith(".json"))
    .map((file) => ({
      data: readJson(file),
      path: relative(repository, file).split(sep).join("/"),
    }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));

/** The forms of a program written as `["begin", ...forms]`. */
export const formsOf = (program: unknown): unknown[] =>
  Array.isArray(program) && program[0] === "begin"
    ? program.slice(1)
    : [program];

/** Reads everything the record is built from. */
export const readSources = (
  repository: string = REPOSITORY,
  folder: string = FOLDER,
  now: Date = new Date()
): Sources => ({
  entries: readEntries(repository, folder),
  history: readHistory(repository, folder, now),
  rules: formsOf(readJson(join(repository, folder, "core.json"))),
});

const quoted = (value: unknown) => ["quote", value];

const facts = (relation: string, rows: readonly (readonly unknown[])[]) =>
  rows.length === 0
    ? []
    : [["fact", ...rows.map((row) => [relation, ...row.map(quoted)])]];

const kindOf = (path: string, folder: string) =>
  Object.entries(KINDS).find(([kind]) =>
    path.startsWith(`${folder}/${kind}/`)
  )?.[1];

/** The program that builds the record and then evaluates `expression`. */
export const programOf = (
  sources: Sources,
  expression: unknown,
  folder: string = FOLDER
): unknown => {
  const { added, commits, tags } = sources.history;
  const files = (relation: string) =>
    sources.entries
      .filter((entry) => kindOf(entry.path, folder) === relation)
      .map((entry) => [entry.path, entry.data]);
  return [
    "begin",
    ...sources.rules,
    ...facts(
      "commit",
      commits.map((commit) => [
        commit.hash,
        commit.time,
        commit.date,
        commit.message,
      ])
    ),
    ...facts(
      "parent",
      commits.flatMap((commit) =>
        commit.parents.map((parent) => [commit.hash, parent])
      )
    ),
    ...facts(
      "tag",
      tags.map((tag) => [tag.name, tag.commit])
    ),
    ...facts(
      "added",
      sources.entries.map((entry) => [
        entry.path,
        added.get(entry.path) ?? WORKING_TREE,
      ])
    ),
    ...Object.values(KINDS).flatMap((relation) =>
      facts(relation, files(relation))
    ),
    expression,
  ];
};

/** Evaluates `expression` against the record. */
export const ask = (sources: Sources, expression: unknown, folder?: string) =>
  Effect.suspend(() =>
    run(programOf(sources, expression, folder), stdlib, {
      database: new LogicDatabase(),
    })
  );
