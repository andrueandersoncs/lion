/**
 * The sources of the research over Lion's own history: one text for each
 * commit HEAD reaches, written from git, and the notes that make each commit
 * a source of the research model in `history/research`. The texts are
 * written again from git whenever they are needed, so they are not kept in
 * the repository; the same commit always gives the same text.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Commit, readHistory, WORKING_TREE } from "./git.ts";
import { programOf, readSources } from "./record.ts";

/** The research folder, relative to the repository. */
export const RESEARCH = "history/research";

/** Who stands behind what the commits and the docs say. */
export const PUBLISHER = "Lion repository";

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

/**
 * The documents whose present text is the repository's current word, saved
 * as sources dated by HEAD.
 */
export const DOCS = [
  { id: "doc-readme", path: "README.md" },
  { id: "doc-agents", path: "AGENTS.md" },
  { id: "doc-claude", path: "CLAUDE.md" },
] as const;

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

/** The commit's time as the integer the research sources date by: YYYYMMDDHHMMSS, in UTC. */
export const publishedOf = (commit: Commit) => {
  const at = new Date(commit.time * 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  return Number(
    `${at.getUTCFullYear()}${two(at.getUTCMonth() + 1)}${two(at.getUTCDate())}${two(at.getUTCHours())}${two(at.getUTCMinutes())}${two(at.getUTCSeconds())}`
  );
};

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

/** A decision of the project record, as its file holds it. */
interface DecisionFile {
  readonly alternatives?: readonly { option: string; rejected: string }[];
  /** What the decision states, in the terms of the research's frame. */
  readonly claims?: readonly { quote: string; says: unknown }[];
  readonly consequences: string;
  readonly context: string;
  readonly decision: string;
  readonly id: string;
  readonly title: string;
}

/** The text of a decision, as a reader of its file would read it. */
export const decisionText = (decision: DecisionFile) =>
  [
    `Decision ${decision.id}: ${decision.title}`,
    `Context: ${decision.context}`,
    `Decision: ${decision.decision}`,
    `Consequences: ${decision.consequences}`,
    ...(decision.alternatives ?? []).map(
      (alternative) =>
        `Alternative: ${alternative.option} Rejected: ${alternative.rejected}`
    ),
  ].join("\n\n");

/**
 * Writes the decisions of the project record as sources, and what each one
 * states as claims, in `notes/04-decisions.json`. A decision is published
 * when the commit that adds its file is, and one not committed yet just
 * after HEAD, so it is the project's latest word.
 */
const writeDecisionSources = (
  repository: string,
  folder: string,
  repositoryUrl: string,
  head: Commit | undefined,
  added: ReadonlyMap<string, string>,
  commits: readonly Commit[]
) => {
  const byHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const after = head === undefined ? 0 : publishedOf(head) + 1;
  const files = readdirSync(join(repository, "history", "decisions"))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const decisions = files.map((name) => {
    const path = `history/decisions/${name}`;
    const data = JSON.parse(
      readFileSync(join(repository, path), "utf8")
    ) as DecisionFile;
    const commit = byHash.get(added.get(path) ?? WORKING_TREE);
    return { commit, data, path };
  });
  for (const { data } of decisions) {
    writeFileSync(
      join(repository, folder, "sources", `decision-${data.id}.txt`),
      decisionText(data)
    );
  }
  const notes = {
    sources: decisions.map(({ commit, data, path }) => ({
      id: `decision-${data.id}`,
      kind: "primary",
      published: commit === undefined ? after : publishedOf(commit),
      publisher: PUBLISHER,
      title: data.title,
      url: `${repositoryUrl}/blob/main/${path}`,
    })),
    claims: decisions.flatMap(({ data }) =>
      (data.claims ?? []).map((claim, index) => ({
        id: `${data.id}-${index + 1}`,
        source: `decision-${data.id}`,
        quote: claim.quote,
        says: claim.says,
      }))
    ),
  };
  writeFileSync(
    join(repository, folder, "notes", "04-decisions.json"),
    `${JSON.stringify(notes, null, 2)}\n`
  );
};

/**
 * Writes `sources/<id>.txt` for every commit, document, and decision, the
 * notes that record them as sources, `notes/02-commits.json` and
 * `notes/04-decisions.json`, and the project record as the step
 * `steps/03-record.json`. Gives the number of commits.
 */
export const writeCommitSources = (
  repository: string,
  folder: string = RESEARCH,
  repositoryUrl = "https://github.com/andrueandersoncs/lion"
) => {
  const history = readHistory(repository, "history");
  const commits = history.commits.filter(
    (commit) => commit.hash !== WORKING_TREE
  );
  const sources = join(repository, folder, "sources");
  mkdirSync(sources, { recursive: true });
  mkdirSync(join(repository, folder, "notes"), { recursive: true });
  for (const commit of commits) {
    writeFileSync(
      join(sources, `${sourceId(commit.hash)}.txt`),
      commitText(repository, commit.hash)
    );
  }
  const [head] = commits;
  for (const doc of DOCS) {
    writeFileSync(
      join(sources, `${doc.id}.txt`),
      readFileSync(join(repository, doc.path), "utf8")
    );
  }
  const docs = DOCS.map((doc) => ({
    id: doc.id as string,
    kind: "primary",
    published: head === undefined ? 0 : publishedOf(head),
    publisher: PUBLISHER,
    title: `${doc.path}, as it is at HEAD`,
    url: `${repositoryUrl}/blob/main/${doc.path}`,
  }));
  const notes = {
    sources: [...commits]
      .reverse()
      .map((commit) => ({
        id: sourceId(commit.hash),
        kind: "primary",
        published: publishedOf(commit),
        publisher: PUBLISHER,
        title: commit.message.split("\n")[0] ?? "",
        url: `${repositoryUrl}/commit/${commit.hash}`,
      }))
      .concat(docs),
  };
  writeFileSync(
    join(repository, folder, "notes", "02-commits.json"),
    `${JSON.stringify(notes, null, 2)}\n`
  );
  writeDecisionSources(
    repository,
    folder,
    repositoryUrl,
    head,
    history.added,
    commits
  );
  // The project record, as one step, so the research can join its claims to
  // the record's commits, changes, releases, and decisions.
  mkdirSync(join(repository, folder, "steps"), { recursive: true });
  writeFileSync(
    join(repository, folder, "steps", "03-record.json"),
    `${JSON.stringify(programOf(readSources(repository), "record"))}\n`
  );
  return commits.length;
};

/** The research skill's folder, whose scripts and core the research uses. */
export const SKILL = "skills/lion-research";

interface SkillScripts {
  readonly buildExplorer: (parts: {
    database: unknown;
    generated: string;
    page: unknown;
    passages: unknown;
  }) => string;
  readonly expanded: (
    program: unknown,
    helpers: Record<string, unknown>
  ) => unknown;
  readonly passagesOf: (
    database: unknown,
    textOf: (source: string) => string | undefined
  ) => unknown;
  readonly problemsOf: (
    notes: unknown,
    textOf: (source: string) => string | undefined
  ) => string[];
  readonly queriesOf: (page: unknown) => Record<string, unknown>;
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
  const [record, replay, explorer] = await Promise.all([
    script("record.mjs"),
    script("replay.mjs"),
    script("build-explorer.mjs"),
  ]);
  return {
    buildExplorer: explorer.buildExplorer as SkillScripts["buildExplorer"],
    expanded: replay.expanded as SkillScripts["expanded"],
    passagesOf: explorer.passagesOf as SkillScripts["passagesOf"],
    problemsOf: record.problemsOf as SkillScripts["problemsOf"],
    queriesOf: explorer.queriesOf as SkillScripts["queriesOf"],
    stepOf: record.stepOf as SkillScripts["stepOf"],
  };
};
