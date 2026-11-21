// Grades Lion's capability corpus: tasks for each of Lion's pillars, general
// computation, logic programming, and formal proofs, each judged by a Lion
// lambda, and prints how many of each pillar's tasks are passed.
//
//   bun run capability                      the public tasks, by their reference programs
//   bun run capability --solutions <dir>    by the programs in <dir>, <id>.json each, instead
//   bun run capability --json               the scores and every verdict, as JSON
//
// LION_HELD_OUT names a folder outside the repository with the corpus's
// layout, tasks/ and solutions/; its tasks are graded too, by its own
// solutions or by the ones --solutions names. A task with no program counts
// as not passed, and so does each gap: a task Lion cannot express yet.
import { join } from "node:path";
import { Effect } from "effect";
import {
  type Corpus,
  type Graded,
  gradeCorpus,
  heldOutFolder,
  loadCorpus,
  loadSolutions,
  PUBLIC_CORPUS,
  type Score,
  tally,
} from "./src/capability.ts";
import { load } from "./src/lion.ts";
import { CORE, REPOSITORY } from "./src/sources.ts";

const option = (name: string) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
};
const asJson = process.argv.includes("--json");
const solutionsFolder = option("--solutions");

/** What graded a suite's tasks, in words. */
const sourceOf = (name: string) => {
  if (solutionsFolder !== undefined) {
    return `the programs in ${solutionsFolder}`;
  }
  return name === "public" ? "their reference programs" : "its solutions";
};

interface Suite {
  readonly corpus: Corpus;
  readonly graded: readonly Graded[];
  readonly name: string;
  readonly scores: readonly Score[];
  readonly source: string;
}

const line = (label: string, passed: number, total: number) =>
  `  ${label.padEnd(13)} ${String(passed).padStart(3)} of ${String(total).padStart(3)} passed`;

const printed = (suite: Suite) => {
  const lines = [`Capability: ${suite.name} tasks, graded by ${suite.source}`];
  for (const score of suite.scores) {
    lines.push(line(score.pillar, score.passed, score.total));
  }
  const passed = suite.scores.reduce((sum, score) => sum + score.passed, 0);
  const total = suite.scores.reduce((sum, score) => sum + score.total, 0);
  lines.push(line("all", passed, total));
  if (suite.corpus.gaps.size > 0) {
    lines.push(
      "",
      `Gaps: ${suite.corpus.gaps.size} tasks Lion cannot express yet`
    );
    for (const [id, why] of suite.corpus.gaps) {
      lines.push(`  ${id}: ${why}`);
    }
  }
  const failed = suite.graded.filter((each) => each.verdict?.passed === false);
  const unsolved = suite.graded.filter(
    (each) => each.verdict === undefined && !suite.corpus.gaps.has(each.task.id)
  );
  if (failed.length > 0) {
    lines.push("", `Failed: ${failed.length}`);
    for (const each of failed) {
      const reason = each.verdict?.passed === false ? each.verdict.reason : "";
      lines.push(`  ${each.task.id}: ${reason}`);
    }
  }
  if (unsolved.length > 0) {
    lines.push("", `No program: ${unsolved.length}`);
    for (const each of unsolved) {
      lines.push(`  ${each.task.id}`);
    }
  }
  return lines.join("\n");
};

const main = Effect.gen(function* () {
  const lion = yield* load(join(REPOSITORY, CORE));
  const held = heldOutFolder(process.env);
  if ("error" in held) {
    console.error(held.error);
    process.exitCode = 1;
    return;
  }
  const folders: { folder: string; name: string }[] = [
    { folder: PUBLIC_CORPUS, name: "public" },
  ];
  if (held.folder !== undefined) {
    folders.push({ folder: held.folder, name: "held-out" });
  }
  const suites: Suite[] = [];
  const seen = new Set<string>();
  for (const { folder, name } of folders) {
    const corpus = yield* loadCorpus(lion, folder);
    const clashes = corpus.tasks.filter((task) => seen.has(task.id));
    for (const task of corpus.tasks) {
      seen.add(task.id);
    }
    const problems = [
      ...corpus.problems,
      ...clashes.map(
        (task) => `tasks/${task.id}.json has the id of a public task`
      ),
    ];
    if (problems.length > 0) {
      console.error(`The ${name} corpus in ${folder} has problems:`);
      for (const problem of problems) {
        console.error(`  ${problem}`);
      }
      process.exitCode = 1;
      return;
    }
    const solutions =
      solutionsFolder === undefined
        ? corpus.solutions
        : loadSolutions(solutionsFolder);
    const graded = yield* gradeCorpus(lion, corpus, solutions);
    suites.push({
      corpus,
      graded,
      name,
      scores: tally(graded),
      source: sourceOf(name),
    });
  }
  if (asJson) {
    console.log(
      JSON.stringify(
        Object.fromEntries(
          suites.map((suite) => [
            suite.name,
            {
              gaps: Object.fromEntries(suite.corpus.gaps),
              scores: suite.scores,
              verdicts: Object.fromEntries(
                suite.graded.map((each) => [each.task.id, each.verdict ?? null])
              ),
            },
          ])
        ),
        null,
        2
      )
    );
    return;
  }
  console.log(suites.map(printed).join("\n\n"));
});

Effect.runPromise(main);
