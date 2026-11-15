/**
 * Builds the research model of Lion's development from what is kept in the
 * repository: the notes readers wrote on each commit, the frame and links,
 * the probes, and the findings the project has accepted. Everything else is
 * written again from git and from Lion as it is now: the text of each commit
 * and document, the project record as a step, and what each probe gives.
 * Then every step is run, in order, into one database, which is saved as
 * `model.json` for the research skill's page.
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
import { Cause, Effect } from "effect";
import { readHistory } from "./git.ts";
import { writeObservations } from "./probes.ts";
import { REPOSITORY } from "./record.ts";
import {
  publishedOf,
  RESEARCH,
  SKILL,
  skillScripts,
  writeCommitSources,
} from "./research.ts";

const SOURCE = /\.src\.json$/;

/**
 * The research model is asked many different questions and does not change
 * between them, so it derives every relation once rather than rewriting its
 * rules for each question. Both give the same answers.
 */
const EVALUATION = { goalDirected: false };

/** The reader's page, beside the changelog's timeline on the website. */
export const PAGE = "docs/research.html";

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
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

type Scripts = Awaited<ReturnType<typeof skillScripts>>;

/** Removes every step the build writes, so a deleted notes file leaves none behind. */
const clearSteps = (steps: string) => {
  for (const name of readdirSync(steps)) {
    if (name.endsWith(".json") && !SOURCE.test(name)) {
      rmSync(join(steps, name));
    }
  }
};

/**
 * Writes a step for each notes file whose quotes its sources hold, and gives
 * the quotes they do not hold.
 */
const writeNoteSteps = (
  root: string,
  scripts: Scripts,
  textOf: (source: string) => string | undefined
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
  return problems;
};

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
 * Writes the reader's page from the plan, and gives every text and query of
 * the plan that fails, since the page would show an error in its place.
 */
const writePage = (
  repository: string,
  root: string,
  parts: {
    database: LogicDatabase;
    generated: string;
    saved: unknown;
    scripts: Scripts;
    textOf: (source: string) => string | undefined;
  }
) =>
  Effect.gen(function* () {
    const plan = join(root, "page.json");
    if (!existsSync(plan)) {
      return [];
    }
    const page = readJson(plan);
    writeFileSync(
      join(repository, PAGE),
      parts.scripts.buildExplorer({
        database: parts.saved,
        generated: parts.generated,
        page,
        passages: parts.scripts.passagesOf(parts.saved, parts.textOf),
      })
    );
    const problems: string[] = [];
    for (const [name, query] of Object.entries(parts.scripts.queriesOf(page))) {
      const exit = yield* Effect.exit(
        run(query as never, stdlib, { database: parts.database })
      );
      if (exit._tag === "Failure") {
        problems.push(
          `page.json: ${name}: ${messageOf(Cause.squash(exit.cause))}`
        );
      }
    }
    return problems;
  });

/** Writes the steps from the notes, and every generated step, and runs them. */
export const buildResearch = (
  repository: string = REPOSITORY,
  folder: string = RESEARCH
) =>
  Effect.gen(function* () {
    const root = join(repository, folder);
    const steps = join(root, "steps");
    mkdirSync(steps, { recursive: true });
    clearSteps(steps);
    writeCommitSources(repository, folder);
    const [head] = readHistory(repository, "history").commits;
    yield* writeObservations(
      repository,
      head === undefined ? 0 : publishedOf(head),
      folder
    );
    copyFileSync(
      join(repository, SKILL, "assets", "core.json"),
      join(steps, "00-core.json")
    );
    const scripts = yield* Effect.promise(() => skillScripts(repository));
    const textOf = (source: string) => {
      const file = join(root, "sources", `${source}.txt`);
      return existsSync(file) ? readFileSync(file, "utf8") : undefined;
    };
    const problems = writeNoteSteps(root, scripts, textOf);
    writeFindingsStep(root);
    expandSteps(repository, steps, scripts);
    const database = new LogicDatabase(EVALUATION);
    const ran = yield* runSteps(steps, database);
    const saved = yield* saveDatabase(database);
    writeFileSync(join(root, "model.json"), formatSnapshot(saved as unknown[]));
    problems.push(
      ...(yield* writePage(repository, root, {
        database,
        generated: head?.date ?? "",
        saved,
        scripts,
        textOf,
      }))
    );
    return { database, problems, steps: ran } satisfies Built;
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
 * Evaluates an expression against the research model: the one `model.json`
 * holds, or, when there is none yet, one built for the question.
 */
export const queryResearch = (
  repository: string,
  expression: unknown,
  folder: string = RESEARCH
) =>
  Effect.gen(function* () {
    const saved = join(repository, folder, "model.json");
    let database: LogicDatabase;
    if (existsSync(saved)) {
      database = new LogicDatabase(EVALUATION);
      yield* run(readJson(saved) as never, stdlib, { database });
    } else {
      database = (yield* buildResearch(repository, folder)).database;
    }
    return yield* run(expression as never, stdlib, { database });
  });
