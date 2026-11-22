// A known mistake found again in other programs: the lints `lion check`
// runs, written as Lion rules over a program read as data, asked of every
// Lion program the repository holds (the corpus's reference programs, the
// docs' live examples, and the probes of the project record and the
// research model) and of every program agents wrote for the corpus.
//
//   bun run variants          the count, and each program a lint warns of
//   bun run variants --json   the same, as JSON
//
// It prints how many places the lints warn of, which the improvement loop
// reads as a score.
import { join } from "node:path";
import { Effect } from "effect";
import { load } from "./src/lion.ts";
import { CORE, REPOSITORY } from "./src/sources.ts";
import { programsOf } from "./src/variants.ts";

const main = Effect.gen(function* () {
  // The lints are in the core the metrics run, as `lion check` runs them.
  yield* load(join(REPOSITORY, CORE));
  const { lint } = (yield* Effect.promise(
    () => import(join(REPOSITORY, CORE, "analysis/lint.ts"))
  )) as {
    lint: (
      program: unknown
    ) => Effect.Effect<readonly { at: string; warning: string }[]>;
  };
  const programs = programsOf(
    REPOSITORY,
    join(REPOSITORY, "out", "capability", "agents")
  );
  const found = yield* Effect.forEach(programs, ({ program, where }) =>
    Effect.map(lint(program), (linted) =>
      linted.map((each) => ({ ...each, where }))
    )
  );
  const warned = found.flat();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ programs: programs.length, warned }, null, 2));
    return;
  }
  console.log(
    [
      `Lints asked of ${programs.length} programs`,
      `known mistakes found, programs: ${warned.length}`,
      ...warned.map((each) => `  ${each.where} at ${each.at}: ${each.warning}`),
    ].join("\n")
  );
});

Effect.runPromise(main);
