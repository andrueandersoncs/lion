// Breaks the code in one place at a time, runs the property tests, and
// reports whether they noticed. A mutation the tests miss is behavior that
// no test pins down.
//
//   bun run mutate                   every listed mutation
//   bun run mutate find recursion    only those whose names hold a word
//   bun run mutate --list            the names, and whether each still applies
//   bun run mutate --file packages/core/src/logic/model.ts \
//     --find "values.sort(compareValues)" --replace "values" \
//     --tests src/logic/tests/asking.test.ts
//                                    one mutation of your own
//
// Each mutation rewrites a source file while its tests run and then puts it
// back, so do not edit the code while this runs.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  check,
  DEFAULT_TESTS,
  type Mutation,
  mutated,
  restore,
  type Verdict,
} from "./src/mutation.ts";
import { MUTATIONS } from "./src/mutations.ts";
import { readArguments } from "./src/report.ts";
import { REPOSITORY } from "./src/sources.ts";

const args = readArguments(process.argv.slice(2), [
  "file",
  "find",
  "replace",
  "tests",
]);

/** The mutation given on the command line, when one is. */
const ownMutation = (): Mutation | undefined => {
  const file = args.option("file");
  const find = args.option("find");
  const replace = args.option("replace");
  if (file === undefined || find === undefined || replace === undefined) {
    return undefined;
  }
  const tests = args.option("tests")?.split(",") ?? DEFAULT_TESTS;
  return { file, find, name: `${find} becomes ${replace}`, replace, tests };
};

const own = ownMutation();

const chosen =
  own === undefined
    ? MUTATIONS.filter(
        ({ name }) =>
          args.rest.length === 0 ||
          args.rest.some((word) => name.includes(word))
      )
    : [own];

const applies = (mutation: Mutation) =>
  mutated(readFileSync(join(REPOSITORY, mutation.file), "utf8"), mutation) !==
  undefined;

const HINTS: Readonly<Record<Verdict, string>> = {
  caught: "",
  missed: "no test fails on this break: add a property that does",
  stale: "its text is not in the file exactly once: point it at the new code",
};

// A stopped run must not leave the code broken.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    restore();
    process.exit(1);
  });
}

if (args.flag("list")) {
  for (const mutation of chosen) {
    console.log(
      `${applies(mutation) ? "applies" : "STALE  "}  ${mutation.name}`
    );
  }
} else {
  const verdicts = new Map<Verdict, number>();
  for (const mutation of chosen) {
    const verdict = check(mutation);
    verdicts.set(verdict, (verdicts.get(verdict) ?? 0) + 1);
    const hint = HINTS[verdict];
    console.log(
      `${verdict.toUpperCase().padEnd(6)}  ${mutation.name}${hint === "" ? "" : `\n        ${hint}`}`
    );
  }
  const caught = verdicts.get("caught") ?? 0;
  console.log(`\n${caught} of ${chosen.length} mutations caught.`);
  if (caught < chosen.length) {
    process.exitCode = 1;
  }
}
