/**
 * The record of Lion's development as Lion facts: what people write, in
 * `history/notes/` and `history/releases/`, and what git gives. A notes file
 * holds claims, each a source's words and what they say; a claim that names
 * no source is said by its own file. A notes file with a title records a
 * decision: its prose is the file's text, and its claims quote it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { run } from "@lionlang/core/evaluation/evaluate";
import { LogicDatabase } from "@lionlang/core/logic/database";
import { stdlib } from "@lionlang/core/modules";
import { Effect } from "effect";
import { type History, publishedOf, readHistory, WORKING_TREE } from "./git.ts";

/** The repository this package sits in. */
export const REPOSITORY = join(import.meta.dirname, "../../..");

/** The record's folder, relative to the repository. */
export const FOLDER = "history";

/** Each folder of files people write, and the relation that holds them. */
export const KINDS = {
  notes: "notes",
  releases: "release",
} as const;

/** Who stands behind what the repository says. */
export const PUBLISHER = "Lion repository";

/** The guidelines `AGENTS.md` points to, each a file of `guidelines/`. */
const GUIDELINES = [
  "designing-features",
  "documentation",
  "recording-changes",
  "measuring",
  "testing",
  "code-style",
  "patterns",
] as const;

/**
 * The documents whose present text is the repository's current word, saved
 * as sources dated by HEAD.
 */
export const DOCS = [
  { id: "doc-readme", path: "README.md" },
  { id: "doc-agents", path: "AGENTS.md" },
  { id: "doc-claude", path: "CLAUDE.md" },
  ...GUIDELINES.map((name) => ({
    id: `doc-${name}`,
    path: `guidelines/${name}.md`,
  })),
];

/** Where the repository's files are read on the web. */
export const REPOSITORY_URL = "https://github.com/andrueandersoncs/lion";

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

type Reference = string | { readonly commit: string; readonly quote: string };

/** One claim as a notes file holds it. */
export interface NoteClaim {
  readonly commits?: readonly Reference[];
  readonly decisions?: readonly string[];
  readonly id?: string;
  readonly quote: string;
  readonly says: unknown;
  readonly source?: string;
}

/** A notes file: claims, and a decision's prose when it records one. */
export interface Notes {
  readonly alternatives?: readonly { option: string; rejected: string }[];
  readonly claims: readonly NoteClaim[];
  readonly commits?: readonly Reference[];
  readonly consequences?: string;
  readonly context?: string;
  readonly decision?: string;
  readonly title?: string;
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

/** Every file people write, in path order. */
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

/** A notes file's name: its path without the folder and `.json`. */
export const stemOf = (path: string) =>
  path.slice(path.lastIndexOf("/") + 1, -".json".length);

/** The source a claim is when it names none: itself, in its notes file. */
export const claimSource = (id: string) => `notes/${id}`;

/**
 * A notes file's own text: a decision's prose, which its claims quote, or,
 * when it has none, the words of its claims.
 */
export const notesText = (notes: Notes) => {
  const prose = [
    notes.title,
    notes.context === undefined ? undefined : `Context: ${notes.context}`,
    notes.decision === undefined ? undefined : `Decision: ${notes.decision}`,
    notes.consequences === undefined
      ? undefined
      : `Consequences: ${notes.consequences}`,
    ...(notes.alternatives ?? []).map(
      (a) => `Alternative: ${a.option} Rejected: ${a.rejected}`
    ),
  ].filter((part) => part !== undefined);
  return (
    prose.length > 0 ? prose : notes.claims.map((claim) => claim.quote)
  ).join("\n\n");
};

/** Each claim of a notes file with its id and source filled in. */
export const claimsOf = (path: string, notes: Notes) =>
  notes.claims.map((claim, at) => {
    const id = claim.id ?? `${stemOf(path)}-${at + 1}`;
    return {
      ...claim,
      commits: claim.commits ?? notes.commits,
      id,
      source: claim.source ?? claimSource(id),
    };
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
  const byHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const [head] = commits
    .filter((commit) => commit.hash !== WORKING_TREE)
    .sort((a, b) => b.time - a.time);
  const files = (relation: string) =>
    sources.entries.filter((entry) => kindOf(entry.path, folder) === relation);
  const notes = files("notes").map((entry) => ({
    claims: claimsOf(entry.path, entry.data as Notes),
    data: entry.data as Notes,
    path: entry.path,
  }));
  const references = (refs: readonly Reference[] | undefined) =>
    (refs ?? []).map((ref) =>
      typeof ref === "string"
        ? { prefix: ref }
        : { prefix: ref.commit, quote: ref.quote }
    );
  /**
   * When a claim that names no source was said: when the last of the commits
   * that made it was made, or just after HEAD when that is the working tree.
   */
  const published = (path: string, refs: readonly Reference[] | undefined) => {
    const named = references(refs).flatMap(({ prefix }) =>
      commits.filter(
        (c) => c.hash !== WORKING_TREE && c.hash.startsWith(prefix)
      )
    );
    const made =
      named.length > 0 ? named : [byHash.get(added.get(path) ?? WORKING_TREE)];
    return Math.max(
      ...made.map((commit) =>
        commit === undefined || commit.hash === WORKING_TREE
          ? (head === undefined ? 0 : publishedOf(head)) + 1
          : publishedOf(commit)
      )
    );
  };
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
    // The documents at HEAD are sources: the repository's current word.
    ...facts(
      "source",
      DOCS.map((doc) => [
        doc.id,
        `${REPOSITORY_URL}/blob/main/${doc.path}`,
        `${doc.path}, as it is at HEAD`,
        PUBLISHER,
        "primary",
        head === undefined ? 0 : publishedOf(head),
      ])
    ),
    // Every commit is a source: the claims readers took from it quote it.
    ...facts(
      "source",
      commits
        .filter((commit) => commit.hash !== WORKING_TREE)
        .map((commit) => [
          commit.hash.slice(0, 7),
          `${REPOSITORY_URL}/commit/${commit.hash}`,
          commit.message.split("\n")[0] ?? "",
          PUBLISHER,
          "primary",
          publishedOf(commit),
        ])
    ),
    ...facts(
      "added",
      sources.entries.map((entry) => [
        entry.path,
        added.get(entry.path) ?? WORKING_TREE,
      ])
    ),
    ...facts(
      "release",
      files("release").map((entry) => [entry.path, entry.data])
    ),
    ...facts(
      "notes",
      notes.map(({ data, path }) => [path, data])
    ),
    ...facts(
      "source",
      notes.flatMap(({ claims, data, path }) =>
        claims
          .filter((claim) => claim.source === claimSource(claim.id))
          .map((claim) => [
            claim.source,
            `${REPOSITORY_URL}/blob/main/${path}`,
            data.title ?? path,
            PUBLISHER,
            "primary",
            published(path, claim.commits),
          ])
      )
    ),
    ...facts(
      "claim",
      notes.flatMap(({ claims }) =>
        claims.map((claim) => [claim.id, claim.source, claim.quote, claim.says])
      )
    ),
    ...facts(
      "written_in",
      notes.flatMap(({ claims, path }) =>
        claims.map((claim) => [claim.id, path])
      )
    ),
    ...facts(
      "names",
      notes.flatMap(({ claims }) =>
        claims.flatMap((claim) =>
          references(claim.commits).map((ref) => [claim.id, ref.prefix])
        )
      )
    ),
    ...facts(
      "quotes",
      notes.flatMap(({ claims }) =>
        claims.flatMap((claim) =>
          references(claim.commits).flatMap((ref) =>
            ref.quote === undefined ? [] : [[claim.id, ref.prefix, ref.quote]]
          )
        )
      )
    ),
    ...facts(
      "follows",
      notes.flatMap(({ claims }) =>
        claims.flatMap((claim) =>
          (claim.decisions ?? []).map((decision) => [claim.id, decision])
        )
      )
    ),
    expression,
  ];
};

/**
 * The relations the record's claims and rules stand on: the research
 * skill's core, which declares sources and claims, and the frame, which says
 * what a claim answers.
 */
export const preludeOf = (repository: string = REPOSITORY) => [
  ...formsOf(
    readJson(join(repository, "skills/lion-research/assets/core.json"))
  ),
  ...formsOf(
    readJson(join(repository, FOLDER, "research/steps/01-frame.src.json"))
  ),
];

/** Evaluates `expression` against the record, on the relations it stands on. */
export const ask = (sources: Sources, expression: unknown, folder?: string) =>
  Effect.suspend(() =>
    run(
      [
        "begin",
        ...preludeOf(),
        ...formsOf(programOf(sources, expression, folder)),
      ],
      stdlib,
      { database: new LogicDatabase() }
    )
  );
