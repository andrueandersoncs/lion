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
//
// Options of scores and observe:
//   --base <ref>        what instrument lines removed counts from (HEAD)
//   --skip a,b          tools to leave out: measure, capability, record,
//                       scale, tests, bench, replay, check, instruments
//   --mutations a|b     run these listed mutations, by name, split by |
//   --repeat n          run them n times, and count the runs that caught each
//   --full              run every listed mutation, for mutations missed
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
  capabilityQuestion,
  line,
  mutationQuestion,
  mutationRunsQuestion,
  observationsOf,
  PILLARS,
  QUESTIONS,
  readBench,
  readCapability,
  readCheck,
  readMeasure,
  readMutate,
  readRecord,
  readRemoved,
  readReplay,
  readScale,
  readTurbo,
} from "./src/loop.ts";
import { readArguments } from "./src/report.ts";
import { REPOSITORY } from "./src/sources.ts";

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
  console.log(
    `ran ${tool}: ${words.join(" ")}, exit ${ran.status}, ${Math.round((Date.now() - started) / 1000)} s`
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
  const suites = readCapability(text.slice(text.indexOf("{")));
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

const recordTool = () => {
  const { status, text } = run("record", ["bun", "run", "history", "check"]);
  const record = readRecord(text);
  print(QUESTIONS.record, status === 0 && record.holds ? "holds" : "fails");
  print(QUESTIONS.untested, record.untested);
};

const testsTool = () => {
  const { status, text } = run("tests", ["bun", "run", "test"]);
  print(QUESTIONS.failingTasks, readTurbo(text) ?? (status === 0 ? 0 : 1));
};

const instrumentsTool = () => {
  const base = args.option("base") ?? "HEAD";
  const words = ["git", "diff", "--numstat", base, "--", ...INSTRUMENTS];
  print(QUESTIONS.instruments, readRemoved(run("instruments", words).text));
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

/** Runs every measuring tool and prints one line per question. */
const scores = () => {
  const wanted = (tool: string) => !skipped.has(tool);
  const mapped = existsSync(join(REPOSITORY, "out/reach/map.json"));
  const measured = wanted("measure") ? measureTool() : undefined;
  if (wanted("capability") && scripts().capability !== undefined) {
    capabilityTool(measured);
  }
  const steps: [string, boolean, () => void][] = [
    ["record", true, recordTool],
    [
      "scale",
      true,
      () =>
        print(
          QUESTIONS.workloads,
          readScale(run("scale", ["bun", "run", "scale"]).text)
        ),
    ],
    ["tests", true, testsTool],
    [
      "bench",
      true,
      () =>
        print(
          QUESTIONS.benchTotal,
          readBench(run("bench", ["bun", "run", "bench"]).text)
        ),
    ],
    [
      "replay",
      mapped,
      () =>
        print(
          QUESTIONS.picked,
          readReplay(
            run("replay", ["bun", "run", "affected", "--replay", "30"]).text
          )
        ),
    ],
    [
      "check",
      mapped,
      () =>
        print(
          QUESTIONS.unsound,
          readCheck(run("check", ["bun", "run", "affected", "--check"]).text)
        ),
    ],
    ["instruments", true, instrumentsTool],
  ];
  for (const [tool, possible, step] of steps) {
    if (possible && wanted(tool)) {
      step();
    }
  }
  const names = args.option("mutations")?.split("|") ?? [];
  if (names.length > 0) {
    mutationsTool(names);
  }
  if (args.flag("full")) {
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

/** What the record says now: every standing question with an answer, but hearsay. */
const status = () => {
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
  const forwarded = process.argv
    .slice(2)
    .filter(
      (word, at, all) =>
        word !== "observe" &&
        word !== label &&
        all[at - 1] !== "--tries" &&
        word !== "--tries"
    );
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
} else {
  console.error("Usage: bun run loop scores | observe <label> | status");
  process.exitCode = 1;
}
