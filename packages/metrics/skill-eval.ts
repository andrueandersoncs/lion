// Runs a skill's frozen eval case: an agent works the case with a copy of
// the skill, in a folder of its own, and the case's grader grades what it
// made. One run is one experiment of an autoresearch loop over the skill.
//
//   bun run skill-eval lion-research verifies-company-figures
//   bun run skill-eval lion-research verifies-company-figures --runs 2
//   bun run skill-eval lion-research verifies-company-figures --from <folder>
//   bun run skill-eval lion-research verifies-company-figures --grade <run>
//
// `--from` names a folder that holds a changed copy of the skill; without
// it, the skill as it is in the repository. Paths are read from the
// repository's root. `--model` and `--budget` (in
// US dollars a run may spend) pass on to `claude -p`; `--grade` grades a run
// that already finished. Runs go in out/skill-eval/, which git ignores, and
// run at the same time. The copy of the skill leaves out its evals, so a
// run cannot read the answers; only the case's corpus goes with it.
//
// Each run prints lines the reasoning skill can quote, such as
// "checks passed: 21 of 22" and "cost usd: 7.42". Grading runs the Lion
// command `LION_CLI` names, or the repository's own build.
import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { readArguments } from "./src/report.ts";
import {
  caseLimits,
  type Graded,
  gradeOf,
  linesOf,
  promptFor,
  spentOf,
} from "./src/skill-eval.ts";
import { REPOSITORY } from "./src/sources.ts";

const args = readArguments(process.argv.slice(2), [
  "budget",
  "from",
  "grade",
  "model",
  "runs",
]);
const [skill, name] = args.rest;
if (skill === undefined || name === undefined) {
  console.error(
    "Usage: bun run skill-eval <skill> <case> [--runs n] [--from folder] [--model m] [--budget usd] [--grade run]"
  );
  process.exit(1);
}

/** A path from the command line, read from the repository's root. */
const fromRoot = (path: string) => resolve(REPOSITORY, path);
const skillFolder = fromRoot(args.option("from") ?? join("skills", skill));
const caseFolder = join(REPOSITORY, "skills", skill, "evals", name);
for (const needed of [
  join(skillFolder, "SKILL.md"),
  join(caseFolder, "prompt.md"),
]) {
  if (!existsSync(needed)) {
    console.error(`There is no ${needed}.`);
    process.exit(1);
  }
}
const lionCli =
  process.env.LION_CLI ??
  `bun ${join(REPOSITORY, "packages/cli/dist/bin.mjs")}`;

/** The research folder a run made: the first folder under research/ with a model. */
const researchFolder = (run: string) => {
  const root = join(run, "research");
  if (!existsSync(root)) {
    return undefined;
  }
  return readdirSync(root)
    .map((entry) => join(root, entry))
    .find((folder) => existsSync(join(folder, "model.json")));
};

const grade = (run: string): ReturnType<typeof gradeOf> => {
  const folder = researchFolder(run);
  if (folder === undefined) {
    return {
      failures: ["the run made no research folder with a model"],
      passed: 0,
      total: 0,
    };
  }
  const graded = spawnSync("node", [join(caseFolder, "grade.mjs"), folder], {
    encoding: "utf8",
    env: { ...process.env, LION_CLI: lionCli },
  });
  return gradeOf(graded.stdout ?? "");
};

/** Sets up a run's folder: the skill without its evals, and the case's corpus. */
const prepare = (run: string) => {
  mkdirSync(run, { recursive: true });
  cpSync(skillFolder, join(run, "skill"), {
    filter: (source) => !source.startsWith(join(skillFolder, "evals")),
    recursive: true,
  });
  const corpus = join(caseFolder, "corpus");
  if (existsSync(corpus)) {
    cpSync(corpus, join(run, "skill", "evals", name, "corpus"), {
      recursive: true,
    });
  }
};

const runOnce = (run: string): Promise<Graded> => {
  prepare(run);
  const limits = caseLimits(
    readFileSync(join(caseFolder, "case.yaml"), "utf8")
  );
  const prompt = promptFor(
    skill,
    readFileSync(join(caseFolder, "prompt.md"), "utf8")
  );
  writeFileSync(join(run, "prompt.md"), prompt);
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
    const child = spawn("claude", flags, { cwd: run });
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
      writeFileSync(join(run, "agent.json"), output);
      const spent = spentOf(output);
      done({ ...spent, ...grade(run), folder: run });
    });
  });
};

const report = (graded: Graded) =>
  console.log(
    linesOf({ ...graded, folder: relative(REPOSITORY, graded.folder) }).join(
      "\n"
    )
  );

const finished = args.option("grade");
if (finished === undefined) {
  const runs = Math.max(1, Number(args.option("runs") ?? 1));
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const results = await Promise.all(
    Array.from({ length: runs }, (_, at) =>
      runOnce(
        join(
          REPOSITORY,
          "out",
          "skill-eval",
          `${skill}-${name}-${stamp}-${at + 1}`
        )
      )
    )
  );
  for (const graded of results) {
    report(graded);
  }
} else {
  const run = fromRoot(finished);
  const spent = existsSync(join(run, "agent.json"))
    ? spentOf(readFileSync(join(run, "agent.json"), "utf8"))
    : spentOf("");
  report({ ...spent, ...grade(run), folder: run });
}
