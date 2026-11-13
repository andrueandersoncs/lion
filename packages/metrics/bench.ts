// Times the benchmark programs, on the working tree or beside an earlier
// commit, so a change in speed is measured and not guessed.
//
//   bun run bench                    the working tree
//   bun run bench --against main     beside a commit, with the ratio
//   bun run bench asking graph       only benchmarks whose names hold a word
//
// Each version is timed in a process of its own. Two evaluators loaded into
// one process slow the second one down, by up to a fifth on code that did
// not change.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { Effect } from "effect";
import { BENCHMARKS, type Benchmark, timeOf } from "./src/benchmarks.ts";
import { withCheckout } from "./src/checkout.ts";
import { load } from "./src/lion.ts";
import { readArguments, table } from "./src/report.ts";
import { CORE, commitOf, REPOSITORY } from "./src/sources.ts";

const args = readArguments(process.argv.slice(2), ["against", "source"]);
const ref = args.option("against");
const commit = ref === undefined ? undefined : commitOf(ref);

const chosen = BENCHMARKS.filter(
  ({ name }) =>
    args.rest.length === 0 || args.rest.some((word) => name.includes(word))
);

/** Times the benchmarks on the evaluator in `source`, in this process. */
const timesHere = (source: string, benchmarks: readonly Benchmark[]) =>
  Effect.flatMap(load(source), (lion) =>
    Effect.forEach(benchmarks, (benchmark) => timeOf(lion, benchmark))
  );

type Times = readonly (number | undefined)[];

/**
 * Times the chosen benchmarks on the evaluator in `source`, in a process of
 * its own: this file run again with `--source`, which prints the times.
 */
const times = (source: string) =>
  Effect.sync((): Times => {
    const { status, stderr, stdout } = spawnSync(
      process.execPath,
      [import.meta.filename, "--source", source, ...args.rest],
      { encoding: "utf8" }
    );
    if (status !== 0) {
      throw new Error(`Timing ${source} failed: ${stderr}`);
    }
    const lines = stdout.trim().split("\n");
    return (JSON.parse(lines.at(-1) ?? "[]") as (number | null)[]).map(
      (time) => time ?? undefined
    );
  });

const milliseconds = (time: number | undefined) =>
  time === undefined ? "fails" : `${time.toFixed(1)} ms`;

/** How many times as fast the working tree is: above 1 is faster. */
const ratio = (before: number | undefined, now: number | undefined) =>
  before === undefined || now === undefined
    ? ""
    : `${(before / now).toFixed(2)}×`;

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
          times(join(directory, CORE))
        );
  const now = yield* times(join(REPOSITORY, CORE));
  const compared = ref !== undefined && before !== undefined;
  console.log(
    table([
      [
        "benchmark",
        ...(compared ? [ref] : []),
        "now",
        ...(compared ? ["speed"] : []),
      ],
      ...chosen.map(({ name }, index) => [
        name,
        ...(before === undefined ? [] : [milliseconds(before[index])]),
        milliseconds(now[index]),
        ...(before === undefined ? [] : [ratio(before[index], now[index])]),
      ]),
    ])
  );
  if (compared) {
    console.log("\nspeed: how many times as fast the working tree is.");
  }
});

const source = args.option("source");

if (source === undefined) {
  await Effect.runPromise(main);
} else {
  const measured = await Effect.runPromise(timesHere(source, chosen));
  console.log(JSON.stringify(measured.map((time) => time ?? null)));
}
