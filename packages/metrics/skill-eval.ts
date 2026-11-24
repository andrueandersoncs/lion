// Runs a skill's frozen eval case: an agent works the case with a copy of
// the skill, in a folder of its own, and the case's grader grades what it
// made. One run is one experiment of an autoresearch loop over the skill.
//
//   bun run skill-eval lion-research verifies-company-figures
//   bun run skill-eval lion-research verifies-company-figures --runs 2
//   bun run skill-eval lion-research verifies-company-figures --from <folder>
//   bun run skill-eval lion-reasoning rechecks-what-changed --bare
//   bun run skill-eval lion-research verifies-company-figures --grade <run>
//
// `--from` names a folder that holds a changed copy of the skill, or another
// skill to compare it with; without it, the skill as it is in the
// repository. `--bare` runs the case with no skill at all, the baseline a
// skill is measured against. Paths are read from the repository's root.
// `--model` and `--budget` (in US dollars a session may spend) pass on to
// `claude -p`; `--grade` grades a run that already finished.
//
// A case is a `prompt.md`, or a `sessions/` folder of prompts named by
// number, `1.md`, `2.md`, run one after another in the same folder: each
// later prompt gets the message the session before it ended with where it
// says `{{earlier}}`. A case's `setup.mjs` may export `start` (once, before
// the runs, returning what to `stop`), `prepare(work)` (before a run's first
// session), `between(work, finished)` (after each session but the last), and
// `finish(work, logs)` (after the last).
//
// Each agent works in a folder outside the repository, so neither the
// repository's CLAUDE.md nor anyone's memory of it reaches the agent, inside
// a folder that cannot be listed, so no agent finds another's. Its
// transcripts go straight to out/skill-eval/<run>/, which git ignores and
// no agent sees; when its sessions end, its folder is copied there too and
// graded. The copy of the skill leaves out its evals, so a run cannot read
// the answers; only the case's corpus goes with it. Runs run at the same
// time.
//
// Each run prints lines the reasoning skill can quote, such as
// "checks passed: 21 of 22" and "cost usd: 7.42". Grading runs the Lion
// command `LION_CLI` names, or the repository's own build.
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { readArguments } from "./src/report.ts";
import {
  addSpent,
  caseLimits,
  type Graded,
  gradeOf,
  linesOf,
  messageOf,
  promptFor,
  type Spent,
  sessionOrder,
  sessionPrompt,
  skillNameOf,
  spentOf,
  unknownOptions,
} from "./src/skill-eval.ts";
import { REPOSITORY } from "./src/sources.ts";

const OPTIONS = ["budget", "from", "grade", "model", "runs"];
const unknown = unknownOptions(process.argv.slice(2), [...OPTIONS, "bare"]);
if (unknown.length > 0) {
  console.error(`There is no option ${unknown.join(", ")}.`);
  process.exit(1);
}
const args = readArguments(process.argv.slice(2), OPTIONS);
const [skill, name] = args.rest;
const bare = args.flag("bare");
if (skill === undefined || name === undefined) {
  console.error(
    "Usage: bun run skill-eval <skill> <case> [--runs n] [--from folder | --bare] [--model m] [--budget usd] [--grade run]"
  );
  process.exit(1);
}

/** A path from the command line, read from the repository's root. */
const fromRoot = (path: string) => resolve(REPOSITORY, path);
const skillFolder = fromRoot(args.option("from") ?? join("skills", skill));
const caseFolder = join(REPOSITORY, "skills", skill, "evals", name);
const sessionsFolder = join(caseFolder, "sessions");
const prompts = existsSync(sessionsFolder)
  ? sessionOrder(readdirSync(sessionsFolder)).map((file) =>
      join(sessionsFolder, file)
    )
  : [join(caseFolder, "prompt.md")];
for (const needed of [
  ...(bare ? [] : [join(skillFolder, "SKILL.md")]),
  ...prompts,
]) {
  if (!existsSync(needed)) {
    console.error(`There is no ${needed}.`);
    process.exit(1);
  }
}
const skillName = bare
  ? undefined
  : (skillNameOf(readFileSync(join(skillFolder, "SKILL.md"), "utf8")) ?? skill);
const lionCli =
  process.env.LION_CLI ??
  `bun ${join(REPOSITORY, "packages/cli/dist/bin.mjs")}`;

/** What a case's setup.mjs may export. */
interface Setup {
  readonly between?: (work: string, finished: number) => void;
  readonly finish?: (work: string, logs: string) => void;
  readonly prepare?: (work: string) => void;
  readonly start?: () => Promise<{ stop: () => void }>;
}
const setupFile = join(caseFolder, "setup.mjs");
const setup: Setup = existsSync(setupFile)
  ? ((await import(setupFile)) as Setup)
  : {};

/**
 * Where agents work: outside the repository, in a folder that its owner may
 * enter but not list, so an agent knows only its own folder's name.
 */
const WORK = join(tmpdir(), "lion-skill-eval");
mkdirSync(WORK, { recursive: true });
chmodSync(WORK, 0o300);

/**
 * What a run is graded on: the research folder it made, when it made one,
 * and otherwise the run's folder itself.
 */
const gradedFolder = (run: string) => {
  const root = join(run, "research");
  const research = existsSync(root)
    ? readdirSync(root)
        .map((entry) => join(root, entry))
        .find((folder) => existsSync(join(folder, "model.json")))
    : undefined;
  return research ?? run;
};

const grade = (run: string): ReturnType<typeof gradeOf> => {
  const graded = spawnSync(
    "node",
    [join(caseFolder, "grade.mjs"), gradedFolder(run)],
    { encoding: "utf8", env: { ...process.env, LION_CLI: lionCli } }
  );
  const grades = gradeOf(graded.stdout ?? "");
  return grades.total === 0 && grades.failures.length === 0
    ? { failures: ["the grader graded nothing"], passed: 0, total: 0 }
    : grades;
};

/** Sets up a run's folder: the skill without its evals, and the case's corpus. */
const prepare = (work: string) => {
  mkdirSync(work, { recursive: true });
  if (!bare) {
    cpSync(skillFolder, join(work, "skill"), {
      filter: (source) => !source.startsWith(join(skillFolder, "evals")),
      recursive: true,
    });
  }
  const corpus = join(caseFolder, "corpus");
  if (existsSync(corpus)) {
    cpSync(corpus, join(work, "skill", "evals", name, "corpus"), {
      recursive: true,
    });
  }
  setup.prepare?.(work);
};

const limits = caseLimits(readFileSync(join(caseFolder, "case.yaml"), "utf8"));

/** One session: an agent works the prompt in the run's folder. */
const session = (work: string, prompt: string): Promise<string> => {
  const flags = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--max-turns",
    String(limits.maxTurns),
    "--setting-sources",
    "project",
    "--disable-slash-commands",
    "--no-session-persistence",
    "--allowedTools",
    "Read",
    "Glob",
    "Grep",
    "Write",
    "Edit",
    "Bash",
    "--disallowedTools",
    "WebSearch",
    "WebFetch",
    ...(args.option("model") === undefined
      ? []
      : ["--model", args.option("model") as string]),
    ...(args.option("budget") === undefined
      ? []
      : ["--max-budget-usd", args.option("budget") as string]),
  ];
  return new Promise((done) => {
    const child = spawn("claude", flags, {
      cwd: work,
      env: { ...process.env, LION_CLI: lionCli },
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", () => undefined);
    const timer = setTimeout(
      () => child.kill("SIGTERM"),
      limits.timeoutSeconds * 1000
    );
    child.on("close", () => {
      clearTimeout(timer);
      done(output);
    });
  });
};

const TRANSCRIPT = /^agent(-\d+)?\.json$/;

/** The transcripts of a run's sessions: agent.json for one session, agent-1.json and on for more. */
const transcripts = (run: string) =>
  readdirSync(run)
    .filter((file) => TRANSCRIPT.test(file))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .map((file) => readFileSync(join(run, file), "utf8"));

const spentIn = (run: string): Spent => {
  const spent = transcripts(run).map(spentOf);
  return spent.length === 0 ? spentOf("") : spent.reduce(addSpent);
};

const runOnce = async (run: string): Promise<Graded> => {
  mkdirSync(run, { recursive: true });
  const work = join(WORK, randomUUID());
  prepare(work);
  let earlier = "";
  for (const [index, file] of prompts.entries()) {
    const prompt = promptFor(
      skillName,
      sessionPrompt(readFileSync(file, "utf8"), earlier)
    );
    const which = prompts.length === 1 ? "" : `-${index + 1}`;
    writeFileSync(join(run, `prompt${which}.md`), prompt);
    const output = await session(work, prompt);
    writeFileSync(join(run, `agent${which}.json`), output);
    earlier =
      messageOf(output) ?? "(The earlier session ended without a message.)";
    if (index < prompts.length - 1) {
      setup.between?.(work, index + 1);
    }
  }
  setup.finish?.(work, run);
  cpSync(work, run, { recursive: true });
  rmSync(work, { force: true, recursive: true });
  return { ...spentIn(run), ...grade(run), folder: run };
};

const report = (graded: Graded) =>
  console.log(
    linesOf({ ...graded, folder: relative(REPOSITORY, graded.folder) }).join(
      "\n"
    )
  );

/** A run of another skill, or of none, is named for what it ran. */
function armOf(ran: string | undefined): string {
  if (ran === undefined) {
    return "-bare";
  }
  return ran === skill ? "" : `-${ran}`;
}

const finished = args.option("grade");
if (finished === undefined) {
  const service = await setup.start?.();
  const runs = Math.max(1, Number(args.option("runs") ?? 1));
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const results = await Promise.all(
    Array.from({ length: runs }, (_, at) =>
      runOnce(
        join(
          REPOSITORY,
          "out",
          "skill-eval",
          `${skill}-${name}${armOf(skillName)}-${stamp}-${at + 1}`
        )
      )
    )
  );
  service?.stop();
  for (const graded of results) {
    report(graded);
  }
} else {
  const run = fromRoot(finished);
  report({ ...spentIn(run), ...grade(run), folder: run });
}
