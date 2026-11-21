// Grades Lion's capability corpus: tasks for each of Lion's pillars, general
// computation, logic programming, and formal proofs, each judged by a Lion
// lambda, and prints how many of each pillar's tasks are passed.
//
//   bun run capability                      the public tasks, by their reference programs
//   bun run capability --solutions <dir>    by the programs in <dir>, <id>.json each, instead
//   bun run capability --json               the scores and every verdict, as JSON
//   bun run capability --agents             by programs agents write, one per task
//     [--model sonnet] [--budget 25] [--task-budget 0.5] [--jobs 4] [--tasks a,b]
//   bun run capability --graded <run folder>   an agents' run that finished,
//                                              graded again at no cost
//
// With --agents, a headless `claude -p` session works each task in a folder
// of its own outside the repository, but a gap's, with the task's statement, Lion's
// documentation, `./lion`, and `./try`, and the run grades what they wrote.
// It stops starting tasks before what it spent could pass --budget (US
// dollars), prints what it cost, how many first tries ran, and what caused
// the tries that failed, and keeps every transcript in out/capability/agents/,
// or, for held-out tasks, in the held-out folder's runs/.
//
// LION_HELD_OUT names a folder outside the repository with the corpus's
// layout, tasks/ and solutions/; its tasks are graded too, by its own
// solutions or by the ones --solutions names. A task with no program counts
// as not passed, and so does each gap: a task Lion cannot express yet.
import { join, resolve } from "node:path";
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
  type Task,
  tally,
} from "./src/capability.ts";
import {
  type AgentsSummary,
  agentsLines,
  causesOf,
  firstTryRan,
} from "./src/corpus-agents.ts";
import { type AgentsOptions, readRun, runAgents } from "./src/corpus-run.ts";
import { type Lion, load } from "./src/lion.ts";
import { CORE, REPOSITORY } from "./src/sources.ts";

const option = (name: string) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
};
const asJson = process.argv.includes("--json");
const solutionsFolder = option("--solutions");
// A folder named on the command line is read from the repository's root,
// where `bun run capability` is run.
const graded = (() => {
  const folder = option("--graded");
  return folder === undefined ? undefined : resolve(REPOSITORY, folder);
})();
const agents: AgentsOptions | undefined =
  process.argv.includes("--agents") || graded !== undefined
    ? {
        budget: Number(option("--budget") ?? 25),
        jobs: Number(option("--jobs") ?? 4),
        maxTurns: 40,
        model: option("--model") ?? "sonnet",
        taskBudget: Number(option("--task-budget") ?? 0.5),
        timeoutSeconds: 900,
      }
    : undefined;
const only = option("--tasks")?.split(",");

/** What graded a suite's tasks, in words. */
const sourceOf = (name: string) => {
  if (solutionsFolder !== undefined) {
    return `the programs in ${solutionsFolder}`;
  }
  return name === "public" ? "their reference programs" : "its solutions";
};

interface Suite {
  readonly agents?: AgentsSummary & { readonly folder: string };
  readonly corpus: Corpus;
  readonly graded: readonly Graded[];
  readonly name: string;
  readonly scores: readonly Score[];
  readonly source: string;
}

/**
 * Agents work a suite's tasks, and the run says where their programs are
 * and what the agents spent and tried. Held-out tasks keep their runs in
 * their own folder, so nothing of them reaches the repository.
 */
const worked = (lion: Lion, tasks: readonly Task[], out: string) =>
  Effect.gen(function* () {
    const options = agents as AgentsOptions;
    const run =
      graded === undefined
        ? yield* Effect.promise(() => runAgents(tasks, out, options))
        : readRun(graded);
    const causes = yield* causesOf(lion, run.worked).pipe(Effect.orDie);
    const summary: AgentsSummary & { readonly folder: string } = {
      causes,
      costUsd: run.worked.reduce(
        (sum, each) => sum + (each.spent.costUsd ?? 0),
        0
      ),
      firstRan: run.worked.filter((each) => firstTryRan(each.attempts)).length,
      folder: run.folder,
      models: [
        ...new Set(run.worked.flatMap((each) => each.spent.models)),
      ].sort(),
      notRun: run.notRun.length,
      worked: run.worked.length,
    };
    return { solutions: run.solutions, summary };
  });

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
  if (suite.agents !== undefined) {
    lines.push(
      "",
      ...agentsLines(suite.agents),
      `transcripts: ${suite.agents.folder}`
    );
  }
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

/** The corpus, or only the tasks `--tasks` names. */
const chosenOf = (corpus: Corpus): Corpus =>
  only === undefined
    ? corpus
    : {
        ...corpus,
        tasks: corpus.tasks.filter((task) => only.includes(task.id)),
      };

/**
 * A suite graded by the programs agents wrote. A gap is a task Lion cannot
 * express yet, so no agent works it. A run of some of the tasks answers
 * another question than a run of all of them, so its suite says how many
 * it chose.
 */
const agentsSuite = (
  lion: Lion,
  name: string,
  folder: string,
  chosen: Corpus,
  options: AgentsOptions
) =>
  Effect.gen(function* () {
    const out =
      name === "public"
        ? join(REPOSITORY, "out", "capability", "agents")
        : join(folder, "runs");
    const run = yield* worked(
      lion,
      chosen.tasks.filter((task) => !chosen.gaps.has(task.id)),
      out
    );
    const graded = yield* gradeCorpus(
      lion,
      chosen,
      loadSolutions(run.solutions)
    );
    const subset =
      only === undefined ? "" : ` (${chosen.tasks.length} chosen tasks)`;
    return {
      agents: run.summary,
      corpus: chosen,
      graded,
      name: `${name} by ${options.model} agents${subset}`,
      scores: tally(graded),
      source: `the programs ${options.model} agents wrote`,
    } satisfies Suite;
  });

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
    const chosen = chosenOf(corpus);
    if (agents !== undefined) {
      suites.push(yield* agentsSuite(lion, name, folder, chosen, agents));
      continue;
    }
    const solutions =
      solutionsFolder === undefined
        ? chosen.solutions
        : loadSolutions(solutionsFolder);
    const graded = yield* gradeCorpus(lion, chosen, solutions);
    suites.push({
      corpus: chosen,
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
              ...(suite.agents === undefined ? {} : { agents: suite.agents }),
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
