// The solver checked against plain code: goals on one number, bounded and
// typed by a schema, that the solver decides, run again by plain code at
// sample points inside the bounds, decimals, a fraction, integers past
// 2^53, and a tiny number among them. A case disagrees when the solver
// proves no value meets the goal and plain code finds one that does, or
// gives a value plain code says does not.
//
//   bun run oracle          every case, and each that disagrees
//   bun run oracle --json   the counts and every disagreement, as JSON
//
// It prints how many cases disagree, which the improvement loop reads as a
// score.
import { join } from "node:path";
import { Effect } from "effect";
import { load } from "./src/lion.ts";
import { cases, caseText, judge } from "./src/oracle.ts";
import { CORE, REPOSITORY } from "./src/sources.ts";

const main = Effect.gen(function* () {
  const lion = yield* load(join(REPOSITORY, CORE));
  const all = cases();
  const judged = yield* Effect.forEach(all, (c) =>
    Effect.map(judge(lion, c), (verdict) => ({ c, verdict }))
  );
  const count = (kind: string) =>
    judged.filter(({ verdict }) => verdict.kind === kind).length;
  const disagreements = judged.flatMap(({ c, verdict }) =>
    verdict.kind === "disagrees" ? [`${caseText(c)}: ${verdict.why}`] : []
  );
  if (process.argv.includes("--json")) {
    console.log(
      JSON.stringify(
        {
          agrees: count("agrees"),
          cases: all.length,
          disagreements,
          undecided: count("undecided"),
        },
        null,
        2
      )
    );
    return;
  }
  console.log(
    [
      `Solver against plain code: ${all.length} cases`,
      `  agree       ${count("agrees")}`,
      `  undecided   ${count("undecided")}`,
      `solver disagreements, oracle: ${disagreements.length}`,
      ...disagreements.map((line) => `  ${line}`),
    ].join("\n")
  );
});

Effect.runPromise(main);
