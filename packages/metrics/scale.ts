// Times the workloads at growing sizes, on the working tree or beside an
// earlier commit, so how the time and the memory grow is measured and not
// guessed.
//
//   bun run scale                        the working tree, up to 100,000
//   bun run scale --against main         beside a commit, with the ratio
//   bun run scale --sizes 1000,1000000   other sizes
//   bun run scale --limit 120            seconds one run may take
//   bun run scale load change            only workloads whose names hold a word
//
// Each workload runs in a process of its own at each size, so a run's memory
// is its own and a run that takes too long can be stopped.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { Effect } from "effect";
import { withCheckout } from "./src/checkout.ts";
import { evaluate, load, newDatabase } from "./src/lion.ts";
import { readArguments, table } from "./src/report.ts";
import { CORE, commitOf, REPOSITORY } from "./src/sources.ts";
import { growth, WORKLOADS, type Workload } from "./src/workloads.ts";

const args = readArguments(process.argv.slice(2), [
  "against",
  "limit",
  "size",
  "sizes",
  "source",
  "workload",
]);
const ref = args.option("against");
const commit = ref === undefined ? undefined : commitOf(ref);
const sizes = (args.option("sizes") ?? "1000,10000,100000")
  .split(",")
  .map(Number);
const limit = Number(args.option("limit") ?? "60");

const chosen = WORKLOADS.filter(
  ({ name }) =>
    args.rest.length === 0 || args.rest.some((word) => name.includes(word))
);

/** What one run measured. */
interface Measured {
  /** Megabytes the database holds once the run is over. */
  readonly kept: number;
  /** Milliseconds the timed programs took. */
  readonly ms: number;
  /** Megabytes the process grew by, at its largest, while they ran. */
  readonly peak: number;
}

type Run = Measured | "fails" | "slow";

const MEGABYTE = 1_000_000;

/** The heap in use once what nothing holds is collected. */
const heap = () => {
  (globalThis as { Bun?: { gc: (force: boolean) => void } }).Bun?.gc(true);
  return process.memoryUsage().heapUsed;
};

/** The most memory this process has held, in bytes. */
const most = () => process.resourceUsage().maxRSS * 1024;

/** Runs one workload at one size on the evaluator in `source`, here. */
const measureHere = (source: string, workload: Workload, n: number) =>
  Effect.gen(function* () {
    const lion = yield* load(source);
    const database = newDatabase(lion, workload.goalDirected ?? true);
    const setup = workload.setup(n);
    const timed = workload.timed(n);
    const empty = heap();
    const ready = yield* evaluate(lion, setup, { database });
    if (!ready.ok) {
      return ready.error;
    }
    heap();
    const before = most();
    const started = performance.now();
    for (const program of timed) {
      const outcome = yield* evaluate(lion, program, { database });
      if (!(outcome.ok || workload.refuses)) {
        return outcome.error;
      }
    }
    const ms = performance.now() - started;
    const peak = (most() - before) / MEGABYTE;
    return { kept: (heap() - empty) / MEGABYTE, ms, peak };
  });

/** Runs one workload at one size on the evaluator in `source`, apart. */
const measure = (source: string, workload: Workload, n: number): Run => {
  const { signal, status, stderr, stdout } = spawnSync(
    process.execPath,
    [
      import.meta.filename,
      "--source",
      source,
      "--workload",
      workload.name,
      "--size",
      String(n),
    ],
    { encoding: "utf8", timeout: limit * 1000 }
  );
  if (signal !== null) {
    return "slow";
  }
  if (status !== 0) {
    throw new Error(`Measuring "${workload.name}" failed: ${stderr}`);
  }
  const result = JSON.parse(stdout.trim().split("\n").at(-1) ?? "null") as
    | Measured
    | string;
  if (typeof result === "string") {
    console.error(`"${workload.name}" at ${n} fails: ${result}`);
    return "fails";
  }
  return result;
};

/** A workload's runs at each size, which stop at the first that is slow. */
const runsOf = (source: string, workload: Workload): Run[] => {
  const runs: Run[] = [];
  for (const n of sizes) {
    const run = measure(source, workload, n);
    runs.push(run);
    if (typeof run === "string") {
      break;
    }
  }
  return runs;
};

const time = (run: Run | undefined) => {
  if (run === undefined) {
    return "";
  }
  if (typeof run === "string") {
    return run === "slow" ? `over ${limit} s` : run;
  }
  return run.ms < 1000
    ? `${run.ms.toFixed(0)} ms`
    : `${(run.ms / 1000).toFixed(1)} s`;
};

/** Times under this many milliseconds say little about how a time grows. */
const SHORTEST = 20;

/** How the time grew between the two largest sizes that ran. */
const grew = (runs: readonly Run[]) => {
  const ran = runs.flatMap((run, index) =>
    typeof run === "string" ? [] : [[sizes[index] ?? 0, run.ms] as const]
  );
  const [smaller, larger] = ran.slice(-2);
  const power =
    smaller === undefined || larger === undefined
      ? undefined
      : growth(smaller, larger, SHORTEST);
  if (runs.includes("slow")) {
    return "stops";
  }
  return power === undefined ? "" : `n^${power.toFixed(1)}`;
};

const megabytes = (amount: number | undefined) =>
  amount === undefined ? "" : `${Math.max(0, amount).toFixed(0)} MB`;

/** The last run that finished. */
const last = (runs: readonly Run[]) =>
  runs.findLast((run): run is Measured => typeof run !== "string");

const row = (label: string, runs: readonly Run[]) => [
  label,
  ...sizes.map((_, index) => time(runs[index])),
  grew(runs),
  megabytes(last(runs)?.peak),
  megabytes(last(runs)?.kept),
];

/** How many times as fast the working tree is at the largest size both ran. */
const speed = (before: readonly Run[], now: readonly Run[]) => {
  for (let index = sizes.length - 1; index >= 0; index -= 1) {
    const [was, is] = [before[index], now[index]];
    if (
      was !== undefined &&
      is !== undefined &&
      typeof was !== "string" &&
      typeof is !== "string"
    ) {
      return `${(was.ms / is.ms).toFixed(2)}×`;
    }
  }
  return "";
};

const main = Effect.gen(function* () {
  if (ref !== undefined && commit === undefined) {
    console.error(`git knows no commit called "${ref}".`);
    process.exitCode = 1;
    return;
  }
  const before =
    ref === undefined || commit === undefined
      ? undefined
      : yield* withCheckout(commit, (directory) =>
          Effect.sync(() =>
            chosen.map((workload) => runsOf(join(directory, CORE), workload))
          )
        );
  const now = chosen.map((workload) =>
    runsOf(join(REPOSITORY, CORE), workload)
  );
  const head = [
    "workload",
    ...sizes.map((n) => `n = ${n.toLocaleString("en-US")}`),
    "grows",
    "peak",
    "kept",
  ];
  console.log(
    table([
      before === undefined ? head : [...head, "speed"],
      ...chosen.flatMap(({ name }, index) => {
        const runs = now[index] ?? [];
        const earlier = before?.[index];
        return earlier === undefined
          ? [row(name, runs)]
          : [
              [...row(name, runs), speed(earlier, runs)],
              row(`  at ${ref}`, earlier),
            ];
      }),
    ])
  );
  console.log(
    [
      "",
      "grows: the power of n the time follows between the two largest sizes",
      "that ran. n^1.0 grows as the facts do, and n^2.0 as their square.",
      "peak: the most memory the timed programs added, at the largest size.",
      "kept: the memory the database holds afterwards, at the largest size.",
      ...(before === undefined
        ? []
        : ["speed: how many times as fast the working tree is."]),
    ].join("\n")
  );
});

const source = args.option("source");

if (source === undefined) {
  await Effect.runPromise(main);
} else {
  const workload = WORKLOADS.find(
    ({ name }) => name === args.option("workload")
  );
  if (workload === undefined) {
    throw new Error(`No workload is called "${args.option("workload")}".`);
  }
  const measured = await Effect.runPromise(
    measureHere(source, workload, Number(args.option("size")))
  );
  console.log(JSON.stringify(measured));
}
