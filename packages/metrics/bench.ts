// Times the benchmark programs, on the working tree or beside an earlier
// commit, so a change in speed is measured and not guessed.
//
//   bun run bench                    the working tree
//   bun run bench --against main     beside a commit, with the ratio
//   bun run bench asking graph       only benchmarks whose names hold a word
import { join } from "node:path";
import { Effect } from "effect";
import { BENCHMARKS, type Benchmark, timeOf } from "./src/benchmarks.ts";
import { withCheckout } from "./src/checkout.ts";
import { load } from "./src/lion.ts";
import { readArguments, table } from "./src/report.ts";
import { CORE, commitOf, REPOSITORY } from "./src/sources.ts";

const args = readArguments(process.argv.slice(2), ["against"]);
const ref = args.option("against");
const commit = ref === undefined ? undefined : commitOf(ref);

const chosen = BENCHMARKS.filter(
  ({ name }) =>
    args.rest.length === 0 || args.rest.some((word) => name.includes(word))
);

const times = (source: string, benchmarks: readonly Benchmark[]) =>
  Effect.flatMap(load(source), (lion) =>
    Effect.forEach(benchmarks, (benchmark) => timeOf(lion, benchmark))
  );

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
          times(join(directory, CORE), chosen)
        );
  const now = yield* times(join(REPOSITORY, CORE), chosen);
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

await Effect.runPromise(main);
