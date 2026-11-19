// Breaks the code in one place at a time, runs the property tests, and
// reports whether they noticed. A mutation the tests miss is behavior that
// no test pins down.
//
//   bun run mutate                   every listed mutation
//   bun run mutate find recursion    only those whose names hold a word
//   bun run mutate --in logic/model.ts,logic/database.ts
//                                    only those in files whose paths hold a word
//   bun run mutate --jobs 2          how many run at once; 4 unless given
//   bun run mutate --list            the names, and whether each still applies
//   bun run mutate --file packages/core/src/logic/model.ts \
//     --find "values.sort(compareValues)" --replace "values" \
//     --tests src/logic/tests/asking.test.ts
//                                    one mutation of your own
//
// The mutations are made in copies of the working tree under `out/`, as it
// stood when the run began, uncommitted changes included. So the code can
// be edited while this runs; what is edited meanwhile is not checked.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { copyWorkingTree, removeCheckout } from "./src/checkout.ts";
import {
  checkAll,
  DEFAULT_TESTS,
  type Mutation,
  mutated,
  type Verdict,
} from "./src/mutation.ts";
import { MUTATIONS } from "./src/mutations.ts";
import { readArguments } from "./src/report.ts";
import { REPOSITORY } from "./src/sources.ts";

const args = readArguments(process.argv.slice(2), [
  "file",
  "find",
  "in",
  "jobs",
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
        ({ file, name }) =>
          (args.rest.length === 0 ||
            args.rest.some((word) => name.includes(word))) &&
          (args.option("in")?.split(",") ?? [""]).some((word) =>
            file.includes(word)
          )
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

const report = (mutation: Mutation, verdict: Verdict) => {
  const hint = HINTS[verdict];
  console.log(
    `${verdict.toUpperCase().padEnd(6)}  ${mutation.name}${hint === "" ? "" : `\n        ${hint}`}`
  );
};

/** Checks the chosen mutations in copies of the working tree, some at once. */
const run = async () => {
  const jobs = Math.max(
    1,
    Math.min(Number(args.option("jobs") ?? "4"), chosen.length)
  );
  // The record's tests and the lion command's read the built language, so
  // their copy builds it.
  const build = chosen.some(
    (mutation) => mutation.package === "history" || mutation.package === "cli"
  )
    ? ["@lionlang/core"]
    : [];
  const copies: string[] = [];
  const clear = () => {
    for (const copy of copies.splice(0)) {
      removeCheckout(copy);
    }
  };
  // A stopped run must not leave its copies behind.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      clear();
      process.exit(1);
    });
  }
  try {
    for (let job = 0; job < jobs; job += 1) {
      copies.push(copyWorkingTree(`mutate-${process.pid}-${job}`, build));
    }
    const verdicts = await checkAll(chosen, copies, report);
    const caught = verdicts.filter((verdict) => verdict === "caught").length;
    console.log(`\n${caught} of ${chosen.length} mutations caught.`);
    for (const [at, verdict] of verdicts.entries()) {
      if (verdict !== "caught") {
        console.log(`  ${verdict}: ${chosen[at]?.name}`);
      }
    }
    if (caught < chosen.length) {
      process.exitCode = 1;
    }
  } finally {
    clear();
  }
};

if (args.flag("list")) {
  for (const mutation of chosen) {
    console.log(
      `${applies(mutation) ? "applies" : "STALE  "}  ${mutation.name}`
    );
  }
} else {
  await run();
}
