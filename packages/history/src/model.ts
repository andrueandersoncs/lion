/**
 * Builds the model of Lion's development, the one model every page of the
 * record is written from. It is kept in the repository as the record's entry
 * files, the notes readers wrote on each commit, the frame and links, the
 * probes, and the findings the project has accepted. Everything else is
 * written again from git and from Lion as it is now: the text of each commit
 * and document, the project record as a step, and what each probe gives.
 * Then every step is run, in order, into one database, which is saved as
 * `model.json` for `bun run history ask`.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { run } from "@lionlang/core/evaluation/evaluate";
import { LogicDatabase } from "@lionlang/core/logic/database";
import { saveDatabase } from "@lionlang/core/logic/snapshot";
import { stdlib } from "@lionlang/core/modules";
import { Effect } from "effect";
import { publishedOf, readHistory } from "./git.ts";
import { writeObservations } from "./probes.ts";
import {
  claimsOf,
  DOCS,
  type Entry,
  type Notes,
  REPOSITORY,
  readEntries,
} from "./record.ts";
import {
  RESEARCH,
  SKILL,
  skillScripts,
  writeCommitSources,
} from "./research.ts";

const SOURCE = /\.src\.json$/;

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, "utf8")) as unknown;

/** One form per line and one fact per line, as `lion --database` saves. */
export const formatSnapshot = (program: readonly unknown[]) => {
  const [head, ...forms] = program;
  const lines = forms.map((form) =>
    Array.isArray(form) && form[0] === "fact"
      ? `["fact",\n    ${form
          .slice(1)
          .map((fact) => JSON.stringify(fact))
          .join(",\n    ")}]`
      : JSON.stringify(form)
  );
  return `[${JSON.stringify(head)}${lines.map((line) => `,\n  ${line}`).join("")}]\n`;
};

/** A finding of the research: an assumption, and the evidence against it. */
export interface Finding {
  readonly assumption: string;
  /** What it is, while it waits for a decision, in `known.json`. */
  readonly note?: string;
  /** Why the project accepts it, in `accepted.json`. */
  readonly reason?: string;
  readonly witness: unknown;
}

/** The model the steps build, and what stood in the way of building it. */
export interface Built {
  readonly database: LogicDatabase;
  /** Quotes the notes give that their sources do not hold. */
  readonly problems: readonly string[];
  readonly steps: readonly string[];
  /**
   * Claims that quote a document in words it no longer holds. The document
   * changed after they were read, so the model leaves them out, and nothing
   * fails: the documents are checked by running the programs they show.
   */
  readonly unsaid: readonly string[];
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export type Scripts = Awaited<ReturnType<typeof skillScripts>>;

/** Removes every step the build writes, so a deleted notes file leaves none behind. */
const clearSteps = (steps: string) => {
  for (const name of readdirSync(steps)) {
    if (name.endsWith(".json") && !SOURCE.test(name)) {
      rmSync(join(steps, name));
    }
  }
};

/**
 * Writes a step for each notes file the build writes, the sources of the
 * commits and documents and what probes give, and gives every quote, in
 * those and in the notes people write, that its source does not hold. The
 * notes people write are facts of the record's step already.
 */
const writeNoteSteps = (
  repository: string,
  root: string,
  scripts: Scripts,
  textOf: (source: string) => string | undefined,
  unsaid: ReadonlySet<string>
) => {
  const problems: string[] = [];
  for (const name of readdirSync(join(root, "notes")).sort()) {
    if (!name.endsWith(".json")) {
      continue;
    }
    const notes = readJson(join(root, "notes", name));
    const found = scripts.problemsOf(notes, textOf);
    problems.push(...found.map((problem) => `${name}: ${problem}`));
    if (found.length === 0) {
      writeFileSync(
        join(root, "steps", name),
        `${JSON.stringify(scripts.stepOf(notes))}\n`
      );
    }
  }
  for (const entry of readEntries(repository, "history")) {
    if (entry.path.startsWith("history/notes/")) {
      const claims = claimsOf(entry.path, entry.data as Notes).filter(
        (claim) => !unsaid.has(claim.id)
      );
      problems.push(
        ...scripts
          .problemsOf({ claims }, textOf)
          .map((problem) => `${entry.path}: ${problem}`)
      );
    }
  }
  return problems;
};

/**
 * The claims of the notes that quote a document, such as the README, in
 * words the document no longer holds. `docs` gives each document's text as
 * it is now, by its source id; a claim of any other source is never unsaid.
 */
export const unsaidClaims = (
  entries: readonly Entry[],
  docs: ReadonlyMap<string, string>,
  problemsOf: Scripts["problemsOf"]
) => {
  const unsaid = new Set<string>();
  for (const entry of entries) {
    if (entry.path.startsWith("history/notes/")) {
      for (const claim of claimsOf(entry.path, entry.data as Notes)) {
        if (
          docs.has(claim.source) &&
          problemsOf({ claims: [claim] }, (id) => docs.get(id)).length > 0
        ) {
          unsaid.add(claim.id);
        }
      }
    }
  }
  return unsaid;
};

/** Each document's text as it is now, by its source id. */
const docTexts = (repository: string) =>
  new Map(
    DOCS.map((doc) => [
      doc.id,
      readFileSync(join(repository, doc.path), "utf8"),
    ])
  );

/** The findings `accepted.json` and `known.json` list, as one step of facts. */
const writeFindingsStep = (root: string) => {
  const listed = (name: string) =>
    existsSync(join(root, name))
      ? (readJson(join(root, name)) as Finding[])
      : [];
  const fact = (relation: string, finding: Finding, words: string) => [
    "fact",
    [
      relation,
      ["quote", finding.assumption],
      ["quote", finding.witness],
      ["quote", words],
    ],
  ];
  writeFileSync(
    join(root, "steps", "30-findings.json"),
    `${JSON.stringify([
      "begin",
      ...listed("accepted.json").map((finding) =>
        fact("accepted", finding, finding.reason ?? "")
      ),
      ...listed("known.json").map((finding) =>
        fact("known", finding, finding.note ?? "")
      ),
      "findings",
    ])}\n`
  );
};

/** Writes each `.src.json` step out with the skill's time functions in place. */
const expandSteps = (repository: string, steps: string, scripts: Scripts) => {
  const helper = (name: string) =>
    readJson(join(repository, SKILL, "assets", `${name}.json`));
  const helpers = {
    "utc-minutes": helper("utc-minutes"),
    "utc-text": helper("utc-text"),
  };
  for (const name of readdirSync(steps)) {
    if (SOURCE.test(name)) {
      writeFileSync(
        join(steps, name.replace(SOURCE, ".json")),
        `${JSON.stringify(scripts.expanded(readJson(join(steps, name)), helpers))}\n`
      );
    }
  }
};

/** Runs every step, in order, into one database. */
const runSteps = (steps: string, database: LogicDatabase) =>
  Effect.gen(function* () {
    const ran: string[] = [];
    for (const name of readdirSync(steps)
      .filter((file) => file.endsWith(".json") && !SOURCE.test(file))
      .sort()) {
      yield* run(readJson(join(steps, name)) as never, stdlib, {
        database,
      }).pipe(
        Effect.mapError(
          (error) => new Error(`steps/${name}: ${messageOf(error)}`)
        )
      );
      ran.push(name);
    }
    return ran;
  });

/**
 * Builds the model: writes the steps from the notes, and every generated
 * step, runs them, and saves what they hold as `model.json`.
 */
export const buildModel = (
  repository: string = REPOSITORY,
  folder: string = RESEARCH
) =>
  Effect.gen(function* () {
    const root = join(repository, folder);
    const steps = join(root, "steps");
    mkdirSync(steps, { recursive: true });
    clearSteps(steps);
    const scripts = yield* Effect.promise(() => skillScripts(repository));
    const unsaid = unsaidClaims(
      readEntries(repository, "history"),
      docTexts(repository),
      scripts.problemsOf
    );
    writeCommitSources(repository, folder, (claim) => !unsaid.has(claim.id));
    const [head] = readHistory(repository, "history").commits;
    const observed = yield* writeObservations(
      repository,
      head === undefined ? 0 : publishedOf(head),
      folder
    );
    copyFileSync(
      join(repository, SKILL, "assets", "core.json"),
      join(steps, "00-core.json")
    );
    const textOf = (source: string) => {
      const file = join(root, "sources", `${source}.txt`);
      return existsSync(file) ? readFileSync(file, "utf8") : undefined;
    };
    const problems = [
      ...observed.problems,
      ...writeNoteSteps(repository, root, scripts, textOf, unsaid),
    ];
    writeFindingsStep(root);
    expandSteps(repository, steps, scripts);
    const database = new LogicDatabase();
    const ran = yield* runSteps(steps, database);
    const saved = yield* saveDatabase(database);
    writeFileSync(join(root, "model.json"), formatSnapshot(saved as unknown[]));
    return {
      database,
      problems,
      steps: ran,
      unsaid: [...unsaid].sort(),
    } satisfies Built;
  });

/**
 * What the research finds. `fresh` are open findings nobody has listed in
 * `known.json` yet, and `stale` are listed findings, known or accepted, that
 * the model no longer finds: both mean the lists need updating.
 */
export const FINDINGS = {
  accepted: ["query", ["accepted", "?assumption", "?witness", "?reason"]],
  known: ["query", ["known", "?assumption", "?witness", "?note"]],
  fresh: ["query", ["fresh_finding", "?assumption", "?witness"]],
  stale: ["query", ["stale_finding", "?assumption", "?witness"]],
  unread: ["find", "?commit", ["silent", "?commit"]],
};

export interface Findings {
  readonly accepted: readonly Required<Omit<Finding, "note">>[];
  readonly fresh: readonly Finding[];
  readonly known: readonly Required<Omit<Finding, "reason">>[];
  readonly stale: readonly Finding[];
  readonly unread: readonly string[];
}

export const findingsOf = (database: LogicDatabase) =>
  run(FINDINGS as never, stdlib, { database }) as Effect.Effect<
    Findings,
    unknown
  >;

/**
 * The model `model.json` holds, as `bun run history write` or `check` last
 * saved it, or, when there is none yet, one built now.
 */
export const savedModel = (
  repository: string = REPOSITORY,
  folder: string = RESEARCH
) =>
  Effect.gen(function* () {
    const saved = join(repository, folder, "model.json");
    if (!existsSync(saved)) {
      return (yield* buildModel(repository, folder)).database;
    }
    const database = new LogicDatabase();
    yield* run(readJson(saved) as never, stdlib, { database });
    return database;
  });
