/**
 * The texts the model's quotes are checked against: one for each commit HEAD
 * reaches, written from git, one for each document at HEAD, and one for each
 * claim a notes file says itself. They are written again whenever they are
 * needed, so they are not kept in the repository; the same commit always
 * gives the same text.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readHistory, WORKING_TREE } from "./git.ts";
import {
  claimSource,
  claimsOf,
  DOCS,
  type Notes,
  notesText,
  programOf,
  readEntries,
  readSources,
  type Sources,
} from "./record.ts";

/** The research folder, relative to the repository. */
export const RESEARCH = "history/research";

/** Files a commit's diff leaves out: lock files and what a build writes. */
const GENERATED = [
  "bun.lock",
  "**/bun.lock",
  "docs/docs.html",
  "docs/lion-worker.js",
  "docs/changelog.html",
  "**/lion-engine.js",
  "**/routeTree.gen.ts",
  "**/*.png",
  "**/*.webp",
  "**/*.jpg",
];

/** The most lines of a commit's diff its text keeps. */
export const DIFF_LINES = 700;

const git = (repository: string, ...args: string[]) =>
  execFileSync("git", ["-c", "core.quotePath=false", ...args], {
    cwd: repository,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });

/** A commit's id as a source: the first seven characters of its hash. */
export const sourceId = (hash: string) => hash.slice(0, 7);

/** The text of one commit: its message, the files it changed, and its diff. */
export const commitText = (repository: string, hash: string) => {
  const head = git(
    repository,
    "show",
    "-s",
    "--format=commit %H%nDate: %cI%n%n%B",
    hash
  );
  const stat = git(repository, "show", "--format=", "--stat=120", hash);
  const diff = git(
    repository,
    "show",
    "--format=",
    "--patch",
    "--no-color",
    hash,
    "--",
    ".",
    ...GENERATED.map((pattern) => `:(exclude)${pattern}`)
  ).split("\n");
  const kept = diff.slice(0, DIFF_LINES);
  const cut =
    diff.length > DIFF_LINES
      ? [`[The diff goes on for ${diff.length - DIFF_LINES} more lines.]`]
      : [];
  return [head, stat, ...kept, ...cut].join("\n");
};

/**
 * Writes `sources/<id>.txt` for every commit, document, and notes file, the
 * notes that record commits and documents as sources,
 * `notes/02-commits.json`, and the record as the step
 * `steps/03-record.json`, which holds every claim people wrote. Gives the
 * number of commits.
 */
export const writeCommitSources = (
  repository: string,
  folder: string = RESEARCH,
  keep?: Sources["keep"]
) => {
  const history = readHistory(repository, "history");
  const commits = history.commits.filter(
    (commit) => commit.hash !== WORKING_TREE
  );
  const sources = join(repository, folder, "sources");
  mkdirSync(sources, { recursive: true });
  mkdirSync(join(repository, folder, "notes"), { recursive: true });
  // Notes the build once wrote and no longer does: the record now says what they said.
  for (const old of ["02-commits.json", "04-decisions.json"]) {
    rmSync(join(repository, folder, "notes", old), { force: true });
  }
  for (const commit of commits) {
    writeFileSync(
      join(sources, `${sourceId(commit.hash)}.txt`),
      commitText(repository, commit.hash)
    );
  }
  mkdirSync(join(sources, "notes"), { recursive: true });
  for (const entry of readEntries(repository, "history")) {
    if (entry.path.startsWith("history/notes/")) {
      const text = notesText(entry.data as Notes);
      for (const claim of claimsOf(entry.path, entry.data as Notes)) {
        if (claim.source === claimSource(claim.id)) {
          writeFileSync(join(sources, `${claim.source}.txt`), text);
        }
      }
    }
  }
  for (const doc of DOCS) {
    writeFileSync(
      join(sources, `${doc.id}.txt`),
      readFileSync(join(repository, doc.path), "utf8")
    );
  }
  // The record, as one step: releases, git, and every claim people wrote.
  mkdirSync(join(repository, folder, "steps"), { recursive: true });
  writeFileSync(
    join(repository, folder, "steps", "03-record.json"),
    `${JSON.stringify(programOf(readSources(repository, undefined, undefined, keep), "record"))}\n`
  );
  return commits.length;
};

/** The research skill's folder, whose scripts and core the research uses. */
export const SKILL = "skills/lion-research";

interface SkillScripts {
  readonly expanded: (
    program: unknown,
    helpers: Record<string, unknown>
  ) => unknown;
  readonly problemsOf: (
    notes: unknown,
    textOf: (source: string) => string | undefined
  ) => string[];
  readonly stepOf: (notes: unknown) => unknown;
}

/** The functions of the skill's scripts: how notes become steps, as the skill does it. */
export const skillScripts = async (
  repository: string
): Promise<SkillScripts> => {
  const script = (name: string) =>
    import(join(repository, SKILL, "scripts", name)) as Promise<
      Record<string, unknown>
    >;
  const [record, replay] = await Promise.all([
    script("record.mjs"),
    script("replay.mjs"),
  ]);
  return {
    expanded: replay.expanded as SkillScripts["expanded"],
    problemsOf: record.problemsOf as SkillScripts["problemsOf"],
    stepOf: record.stepOf as SkillScripts["stepOf"],
  };
};
