// The interop grid over pairs of its rows: each kind of expression written
// where another has its variable, in each place the grid has, held to the
// grid's rule that it gives what plain code gives. A cell that is an
// exception where neither of its rows has one is a surprise: two features
// that work alone and fail together.
//
//   bun run pairs                 every pair, and the surprises, grouped
//   bun run pairs --json          the summary and every surprise, as JSON
//
// It prints how many cells surprise, which the improvement loop reads as a
// score, and each surprise with what plain code gave and what came instead.
import { join } from "node:path";
import { Effect } from "effect";
import { runGrid } from "./src/grid.ts";
import { load } from "./src/lion.ts";
import {
  isSurprise,
  type PairCell,
  pairOf,
  pairsOf,
  singlesOf,
  summarizePairs,
} from "./src/pairs.ts";
import { CORE, REPOSITORY } from "./src/sources.ts";

const main = Effect.gen(function* () {
  const lion = yield* load(join(REPOSITORY, CORE));
  const singles = singlesOf(yield* runGrid(lion));
  const cells: PairCell[] = [];
  for (const [outer, inner] of pairsOf()) {
    cells.push(...(yield* pairOf(lion, outer, inner)));
  }
  const summary = summarizePairs(cells, singles);
  const surprises = cells.filter((cell) => isSurprise(cell, singles));
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ summary, surprises }, null, 2));
    return;
  }
  console.log(
    [
      `Pairs of the grid's rows: ${summary.pairs}, in ${summary.cells} cells`,
      `  same as plain code  ${summary.same}`,
      `  plain code fails    ${summary.absent}`,
      `  exceptions          ${summary.exceptions}`,
      `surprising pairs, grid: ${summary.surprises}`,
    ].join("\n")
  );
  const byPair = new Map<string, PairCell[]>();
  for (const cell of surprises) {
    const pair = `${cell.outer} of ${cell.inner}`;
    byPair.set(pair, [...(byPair.get(pair) ?? []), cell]);
  }
  for (const [pair, found] of byPair) {
    console.log(`\n${pair}`);
    for (const cell of found) {
      console.log(`  ${cell.position}: ${cell.verdict}, ${cell.detail ?? ""}`);
    }
  }
});

Effect.runPromise(main);
