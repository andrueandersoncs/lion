// The improvement loop's scoreboard and its record, `improvement/`, a
// lion-reasoning task folder whose scores, requirements, and directions are
// in `improvement/notes/01-frame.json`.
//
//   bun run loop scores               run every measuring tool, and print one
//                                     line per question the record asks
//   bun run loop observe <label>      run the scores through see.mjs, record
//                                     each line as an observation, and say
//                                     what the record now says
//   bun run loop observe <label> --tries <direction>
//                                     the same, as an experiment of a direction
//   bun run loop status               what the record says now
//   bun run loop flaky                the checks the commit hook ran that
//                                     passed and failed on the same files
//
// Options of scores and observe:
//   --base <ref>        what instrument lines removed counts from (HEAD)
//   --skip a,b          tools to leave out: measure, capability, record,
//                       scale, tests, bench, replay, check, instruments,
//                       pairs, telemetry, agents
//   --mutations a|b     run these listed mutations, by name, split by |
//   --repeat n          run them n times, and count the runs that caught each
//   --full              run every listed mutation, for mutations missed
//   --fail-fast         stop at the first requirement that is not met
//   --agents            also have agents write a program for each corpus
//                       task, and grade them, which costs money: at most
//                       --budget US dollars, 25 unless given
//
// The tools run cheapest first. Each prints how long it took, which the
// record keeps too, so it can say how many predictions the loop resolves per
// hour of checking.
//
// The record is judged by the published Lion CLI that LION_CLI names, never
// by the Lion the loop is changing, so the judge stays fixed.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  agentsCauseQuestion,
  agentsQuestion,
  capabilityQuestion,
  fasterIn,
  line,
  mutationQuestion,
  mutationRunsQuestion,
  observationsOf,
  PILLARS,
  QUESTIONS,
  readAgents,
  readBench,
  readCapability,
  readCheck,
  readMeasure,
  readMutate,
  readPairs,
  readRecord,
  readRemoved,
  readReplay,
  readTurbo,
} from "./src/loop.ts";
import { readArguments } from "./src/report.ts";
import { REPOSITORY } from "./src/sources.ts";
import { flakyOf, readLogged } from "./src/telemetry.ts";

const RECORD = join(REPOSITORY, "improvement");
const SKILL = join(REPOSITORY, "skills/lion-reasoning/scripts");
const RAW = join(REPOSITORY, "out/loop");
/** The published Lion that judges the record. */
const JUDGE = "bunx @lionlang/cli@0.14.0";

/** The files whose lines an experiment may not remove: what scores it. */
export const INSTRUMENTS = [
  "packages/metrics/src/grid-cases.ts",
  "packages/metrics/src/mutations.ts",
  "packages/metrics/src/workloads.ts",
  "packages/metrics/src/benchmarks.ts",
  "packages/metrics/src/code.ts",
  "packages/metrics/src/vocabulary.ts",
  "packages/metrics/src/affected.json",
  "packages/metrics/src/loop.ts",
  "packages/metrics/corpus",
  "packages/metrics/src/capability.ts",
  "history/research/probes.json",
  "improvement/steps/00-core.json",
  "skills/lion-reasoning/scripts",
  "improvement/notes/01-frame.json",
];

const args = readArguments(process.argv.slice(2), [
  "base",
  "budget",
  "mutations",
  "repeat",
  "skip",
  "tries",
]);
const skipped = new Set(args.option("skip")?.split(",") ?? []);

/** Runs a command at the root, keeps what it printed under out/loop/, and gives it. */
const run = (tool: string, words: readonly string[]) => {
  mkdirSync(RAW, { recursive: true });
  const started = Date.now();
  const ran = spawnSync(words[0] as string, words.slice(1), {
    cwd: REPOSITORY,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const text = `${ran.stdout ?? ""}${ran.stderr ?? ""}`;
  writeFileSync(join(RAW, `${tool}.txt`), text);
  const took = (Date.now() - started) / 1000;
  console.log(
    `ran ${tool}: ${words.join(" ")}, exit ${ran.status}, ${Math.round(took)} s`
  );
  return { status: ran.status, text };
};

const scripts = (): Record<string, string> =>
  (
    JSON.parse(readFileSync(join(REPOSITORY, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    }
  ).scripts;

const print = (
  label: { label: string },
  value: number | string | undefined
) => {
  if (value !== undefined) {
    console.log(line({ label: label.label, question: {} }, value));
  }
};

type Measure = ReturnType<typeof readMeasure>;

const measureTool = (): Measure => {
  const measured = readMeasure(run("measure", ["bun", "run", "measure"]).text);
  print(QUESTIONS.grid, measured.gridExceptions);
  print(QUESTIONS.undocumented, measured.undocumented);
  return measured;
};

const capabilityTool = (measured: Measure | undefined) => {
  const { text } = run("capability", ["bun", "run", "capability", "--json"]);
  const suites = readCapability(text);
  for (const [suite, passed] of Object.entries(suites)) {
    for (const pillar of [...PILLARS, "all"]) {
      print(capabilityQuestion(suite, pillar), passed[pillar]);
    }
  }
  const all = suites.public?.all ?? 0;
  if (measured === undefined || all === 0) {
    return;
  }
  const per = (n: number | undefined) =>
    n === undefined ? undefined : Math.round((n / all) * 10) / 10;
  print(QUESTIONS.codePerTask, per(measured.codeLines));
  print(QUESTIONS.messagesPerTask, per(measured.messages));
};

/**
 * Agents write a program for each task; what they wrote is graded as a
 * suite of its own. It costs money, so it runs only when asked for.
 */
const agentsTool = (budget: string | undefined) => {
  const { text } = run("agents", [
    "bun",
    "run",
    "capability",
    "--agents",
    "--json",
    ...(budget === undefined ? [] : ["--budget", budget]),
  ]);
  for (const [suite, passed] of Object.entries(readCapability(text))) {
    if (suite.includes(" agents")) {
      for (const pillar of [...PILLARS, "all"]) {
        print(capabilityQuestion(suite, pillar), passed[pillar]);
      }
    }
  }
  for (const [suite, agents] of Object.entries(readAgents(text))) {
    print(agentsQuestion(suite, "cost usd"), agents.costUsd.toFixed(2));
    print(agentsQuestion(suite, "first tries that ran"), agents.firstRan);
    for (const { cause, tries } of agents.causes) {
      print(agentsCauseQuestion(suite, cause), tries);
    }
  }
};

const recordTool = () => {
  const { status, text } = run("record", ["bun", "run", "history", "check"]);
  const record = readRecord(text);
  const holds = status === 0 && record.holds;
  print(QUESTIONS.record, holds ? "holds" : "fails");
  print(QUESTIONS.untested, record.untested);
  return holds;
};

const testsTool = () => {
  const { status, text } = run("tests", ["bun", "run", "test"]);
  const failing = readTurbo(text) ?? (status === 0 ? 0 : 1);
  print(QUESTIONS.failingTasks, failing);
  return failing === 0;
};

const instrumentsTool = () => {
  const base = args.option("base") ?? "HEAD";
  const words = ["git", "diff", "--numstat", base, "--", ...INSTRUMENTS];
  const removed = readRemoved(run("instruments", words).text);
  print(QUESTIONS.instruments, removed);
  return removed === 0;
};

/** Runs some listed mutations once, or `--repeat` times, counting the runs that caught each. */
const mutationsTool = (names: readonly string[]) => {
  const repeat = Number(args.option("repeat") ?? "1");
  const caught = new Map<string, number>();
  let last = new Map<string, string>();
  for (let at = 0; at < repeat; at += 1) {
    last = readMutate(
      run(`mutations-${at}`, ["bun", "run", "mutate", ...names]).text
    );
    for (const [name, verdict] of last) {
      caught.set(
        name,
        (caught.get(name) ?? 0) + (verdict === "caught" ? 1 : 0)
      );
    }
  }
  for (const name of names) {
    if (repeat === 1) {
      print(mutationQuestion(name), last.get(name));
    } else if (last.get(name) !== "stale") {
      print(mutationRunsQuestion(name, repeat), caught.get(name) ?? 0);
    }
  }
};

const fullTool = () => {
  const verdicts = readMutate(run("full", ["bun", "run", "mutate"]).text);
  const missed = [...verdicts.values()].filter((v) => v === "missed");
  print(QUESTIONS.missed, missed.length);
};

/**
 * The workloads that grow faster than the facts do. One run's times move
 * with the machine's load, so a workload past the limit is timed again, and
 * counts only when it is past the limit both times: a real regression shows
 * in both, and noise seldom does.
 */
const scaleTool = () => {
  const first = fasterIn(run("scale", ["bun", "run", "scale"]).text);
  const faster =
    first.length === 0
      ? first
      : fasterIn(run("scale-again", ["bun", "run", "scale"]).text).filter(
          (name) => first.includes(name)
        );
  print(QUESTIONS.workloads, faster.length);
  return faster.length === 0;
};

/**
 * Runs every measuring tool, cheapest first, and prints one line per
 * question. Each tool that answers a requirement says whether it is met;
 * with --fail-fast the run stops at the first that is not, since a version
 * that breaks a constraint has no score for the rest to change.
 */
const scores = () => {
  const wanted = (tool: string) => !skipped.has(tool);
  const mapped = existsSync(join(REPOSITORY, "out/reach/map.json"));
  let measured: Measure | undefined;
  const always = (step: () => void) => () => {
    step();
    return true;
  };
  const steps: [string, boolean, () => boolean][] = [
    [
      "measure",
      true,
      () => {
        measured = measureTool();
        return measured.undocumented === 0;
      },
    ],
    ["instruments", true, instrumentsTool],
    [
      "telemetry",
      true,
      always(() => print(QUESTIONS.flaky, flakyOf(readLogged()).length)),
    ],
    [
      "pairs",
      scripts().pairs !== undefined,
      always(() =>
        print(
          QUESTIONS.surprising,
          readPairs(run("pairs", ["bun", "run", "pairs"]).text)
        )
      ),
    ],
    [
      "replay",
      mapped,
      always(() =>
        print(
          QUESTIONS.picked,
          readReplay(
            run("replay", ["bun", "run", "affected", "--replay", "30"]).text
          )
        )
      ),
    ],
    [
      "bench",
      true,
      always(() =>
        print(
          QUESTIONS.benchTotal,
          readBench(run("bench", ["bun", "run", "bench"]).text)
        )
      ),
    ],
    [
      "capability",
      scripts().capability !== undefined,
      always(() => capabilityTool(measured)),
    ],
    ["scale", true, scaleTool],
    ["record", true, recordTool],
    [
      "check",
      mapped,
      always(() =>
        print(
          QUESTIONS.unsound,
          readCheck(run("check", ["bun", "run", "affected", "--check"]).text)
        )
      ),
    ],
    ["tests", true, testsTool],
    [
      "agents",
      args.flag("agents"),
      always(() => agentsTool(args.option("budget"))),
    ],
  ];
  let stopped = false;
  for (const [tool, possible, step] of steps) {
    if (possible && wanted(tool) && !step() && args.flag("fail-fast")) {
      console.log(`stopped after ${tool}: a requirement is not met`);
      stopped = true;
      break;
    }
  }
  const names = args.option("mutations")?.split("|") ?? [];
  if (!stopped && names.length > 0) {
    mutationsTool(names);
  }
  if (!stopped && args.flag("full")) {
    fullTool();
  }
};

const env = { ...process.env, LION_CLI: process.env.LION_CLI ?? JUDGE };

/** Runs a script of the reasoning skill in the record's folder. */
const skill = (script: string, ...words: string[]) =>
  spawnSync("node", [join(SKILL, script), ...words], {
    cwd: RECORD,
    encoding: "utf8",
    env,
    maxBuffer: 256 * 1024 * 1024,
  });

/**
 * What the record says now: every standing question with an answer, but
 * hearsay. The model is built again from the steps first, since git does not
 * keep it and a step, the core among them, may have changed since it was.
 */
const status = () => {
  const replayed = skill("replay.mjs");
  if (replayed.status !== 0) {
    console.error(replayed.stderr);
    process.exitCode = 1;
    return;
  }
  const asked = skill("ask.mjs");
  if (asked.status !== 0) {
    console.error(asked.stderr);
    process.exitCode = 1;
    return;
  }
  const answers = JSON.parse(asked.stdout) as Record<string, unknown[]>;
  for (const [question, rows] of Object.entries(answers)) {
    if (rows.length > 0 && !question.startsWith("What rests only on")) {
      console.log(`${question}\n${JSON.stringify(rows, null, 1)}\n`);
    }
  }
};

const LABEL = /^[a-z0-9][a-z0-9-]*$/;

/** Runs the scores through see.mjs, records them, and says what the record says. */
const observe = (label: string | undefined) => {
  if (label === undefined || !LABEL.test(label)) {
    console.error(
      "Usage: bun run loop observe <label in lowercase and hyphens>"
    );
    process.exitCode = 1;
    return;
  }
  const forwarded = [
    ...process.argv
      .slice(2)
      .filter(
        (word, at, all) =>
          word !== "observe" &&
          word !== label &&
          all[at - 1] !== "--tries" &&
          word !== "--tries"
      ),
  ];
  const seen = skill(
    "see.mjs",
    label,
    "--",
    [
      "bun",
      "run",
      "loop",
      "scores",
      ...forwarded.map((w) => JSON.stringify(w)),
    ].join(" ")
  );
  process.stdout.write(seen.stdout);
  const text = readFileSync(join(RECORD, "seen", `${label}.txt`), "utf8");
  const observations = observationsOf(text, label, args.option("tries"));
  const number = readdirSync(join(RECORD, "notes")).length + 1;
  const notes = join(
    "notes",
    `${String(number).padStart(2, "0")}-${label}.json`
  );
  writeFileSync(
    join(RECORD, notes),
    `${JSON.stringify({ observations }, null, 2)}\n`
  );
  const recorded = skill("record.mjs", notes);
  process.stdout.write(recorded.stdout);
  process.stderr.write(recorded.stderr);
  if (recorded.status !== 0) {
    process.exitCode = 1;
    return;
  }
  status();
};

const [command, label] = args.rest;
if (command === "scores") {
  scores();
} else if (command === "observe") {
  observe(label);
} else if (command === "status") {
  status();
} else if (command === "flaky") {
  const flaky = flakyOf(readLogged());
  console.log(
    flaky.length === 0
      ? "No check the commit hook ran both passed and failed on the same files."
      : `These passed and failed on the same files:\n${flaky.map((check) => `  ${check}`).join("\n")}`
  );
} else {
  console.error(
    "Usage: bun run loop scores | observe <label> | status | flaky"
  );
  process.exitCode = 1;
}
