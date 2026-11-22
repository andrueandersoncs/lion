// Says which checks a change can reach, from a map of what each test file
// reached when it last ran, and runs them.
//
//   bun run affected --map           run every package's tests once, traced,
//                                    and write out/reach/map.json
//   bun run affected                 the test files and mutations the working
//                                    tree's changes since HEAD can reach
//   bun run affected --against main  the same for the changes since a commit
//   bun run affected --run           run the picked test files and checks
//   bun run affected --check         each listed mutation as a change: is every
//                                    test it names picked for it?
//   bun run affected --replay 30     the last 30 commits: what picking would
//                                    have run, beside everything
//
// The map is of the commit it was made at. A file no test reached, such as a
// new one, picks every test of its package, and a file at the root that is
// not Markdown, such as bun.lock, picks every test. When the map holds the
// named functions each test ran, a script whose changed lines are all in
// named functions, or in imports, types, comments, and constants of its own,
// picks only the tests that ran one of those functions.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import {
  type Change,
  type Checked,
  checkedOf,
  type Picked,
  packageFolder,
  pick,
  type Reached,
  type ReachMap,
} from "./src/affected.ts";
import { copyWorkingTree, removeCheckout } from "./src/checkout.ts";
import { hunksOf, touchedBy } from "./src/functions.ts";
import { load } from "./src/lion.ts";
import { checkAll, DEFAULT_TESTS, type Mutation } from "./src/mutation.ts";
import { MUTATIONS } from "./src/mutations.ts";
import { mapReach, readMap } from "./src/reach.ts";
import { readArguments } from "./src/report.ts";
import { CORE, REPOSITORY } from "./src/sources.ts";
import { logCheck } from "./src/telemetry.ts";

const args = readArguments(process.argv.slice(2), ["against", "replay"]);

/**
 * Whether changes are read by function: when the map holds the named
 * functions each test ran, which a map made before them does not.
 */
let byFunctions = false;

const git = (...words: string[]) =>
  spawnSync("git", words, { cwd: REPOSITORY, encoding: "utf8" })
    .stdout.split("\n")
    .filter((line) => line !== "");

/** The files changed since a commit, in the working tree, new files included. */
const changedSince = (ref: string) => [
  ...new Set([
    ...git("diff", "--name-only", ref),
    ...git("ls-files", "--others", "--exclude-standard"),
  ]),
];

/** A file's text at a commit, or none where it is not there. */
const shown = (ref: string, path: string): string | undefined => {
  const ran = spawnSync("git", ["show", `${ref}:${path}`], {
    cwd: REPOSITORY,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return ran.status === 0 ? ran.stdout : undefined;
};

/** A file's text in the working tree, or none where it is gone. */
const onDisk = (path: string): string | undefined => {
  const full = join(REPOSITORY, path);
  return existsSync(full) ? readFileSync(full, "utf8") : undefined;
};

/**
 * A change read by function: the named functions its hunks touch in each
 * file, and the files it changes whole. `after` is the commit it ends at,
 * or the working tree when there is none.
 */
const byFunction = (
  id: string,
  files: readonly string[],
  before: string,
  after?: string
): Change => {
  const functions: [string, string][] = [];
  const whole: string[] = [];
  for (const file of files) {
    const diff = spawnSync(
      "git",
      [
        "diff",
        "-U0",
        before,
        ...(after === undefined ? [] : [after]),
        "--",
        file,
      ],
      { cwd: REPOSITORY, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    ).stdout;
    const touched = touchedBy(
      file,
      shown(before, file),
      after === undefined ? onDisk(file) : shown(after, file),
      hunksOf(diff)
    );
    if (touched === "whole") {
      whole.push(file);
    } else {
      functions.push(...touched.map((name): [string, string] => [file, name]));
    }
  }
  return { files, functions, id, whole };
};

/** The named functions a listed mutation's text is in, at HEAD. */
const mutationFunctions = (mutation: Mutation): readonly string[] | "whole" => {
  const text = shown("HEAD", mutation.file);
  const at = text?.indexOf(mutation.find) ?? -1;
  if (text === undefined || at === -1) {
    return "whole";
  }
  const start = text.slice(0, at).split("\n").length;
  const count = mutation.find.split("\n").length;
  return touchedBy(mutation.file, text, text, [
    { after: [start, count], before: [start, count] },
  ]);
};

const seconds = (tests: readonly Reached[]) =>
  tests.reduce((sum, test) => sum + test.seconds, 0);

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

interface Context {
  readonly ask: (
    changes: readonly Change[],
    asMutations?: boolean
  ) => Promise<Picked>;
  readonly byTest: ReadonlyMap<string, Reached>;
  readonly checked: readonly Checked[];
  readonly map: ReachMap;
}

/** Lists the tests a listed mutation names that picking skips for its own change. */
const check = async ({ ask, checked }: Context) => {
  const picked = await ask([], true);
  const skipped = new Map<string, string[]>();
  for (const [mutation, test] of picked.unsound) {
    skipped.set(mutation, [...(skipped.get(mutation) ?? []), test]);
  }
  console.log(
    `${checked.length - skipped.size} of ${checked.length} mutations: every test they name is picked for their change.`
  );
  // A mutation whose tests picking skips in part is caught by the rest, or
  // picking is not sound for it: run it with the tests picking keeps.
  const rerun: Mutation[] = [];
  let unsound = 0;
  for (const mutation of MUTATIONS) {
    const away = skipped.get(mutation.name);
    if (away === undefined) {
      continue;
    }
    const folder = packageFolder(mutation.package);
    const kept = (mutation.tests ?? DEFAULT_TESTS).filter(
      (test) => !away.includes(`${folder}/${test}`)
    );
    console.log(`SKIPS    ${mutation.name}\n         ${away.join(", ")}`);
    if (kept.length === 0) {
      unsound += 1;
      console.log("UNSOUND  picking keeps none of the tests it names");
    } else {
      rerun.push({ ...mutation, tests: kept });
    }
  }
  if (rerun.length > 0) {
    const copies = [0, 1]
      .slice(0, rerun.length)
      .map((job) => copyWorkingTree(`affected-${process.pid}-${job}`, []));
    try {
      const verdicts = await checkAll(rerun, copies, (mutation, verdict) => {
        console.log(
          `${verdict === "caught" ? "CAUGHT" : "UNSOUND"}  ${mutation.name}, by the tests picking keeps`
        );
      });
      unsound += verdicts.filter((verdict) => verdict !== "caught").length;
    } finally {
      for (const copy of copies) {
        removeCheckout(copy);
      }
    }
  }
  console.log(
    unsound === 0
      ? "\nPicking is sound for every listed mutation: the tests it picks catch each one."
      : `\nPicking is not sound for ${unsound} mutations.`
  );
  process.exitCode = unsound === 0 ? 0 : 1;
};

/** Says what picking would have run for each of the last commits, beside everything. */
const replay = async (
  { ask, byTest, checked, map }: Context,
  count: string
) => {
  const commits = git("log", "--first-parent", "--format=%H", "-n", count);
  const changes = commits.map((commit) => {
    const files = git("diff", "--name-only", `${commit}^`, commit);
    return byFunctions
      ? byFunction(commit, files, `${commit}^`, commit)
      : { files, id: commit };
  });
  const picked = await ask(changes);
  const all = seconds(map.tests);
  const rows = changes.map((change) => {
    const tests = (picked.tests[change.id] ?? []).flatMap(
      (t) => byTest.get(t) ?? []
    );
    return {
      change,
      inFiles: checked.filter((m) => change.files.includes(m.file)).length,
      mutations: (picked.mutations[change.id] ?? []).length,
      share: all === 0 ? 0 : seconds(tests) / all,
      tests: tests.length,
      time: seconds(tests),
    };
  });
  console.log(
    "commit   files  tests picked  seconds picked  mutations picked  in its files"
  );
  for (const row of rows) {
    console.log(
      `${row.change.id.slice(0, 7)}  ${String(row.change.files.length).padStart(5)}  ${`${row.tests} of ${map.tests.length}`.padStart(12)}  ${`${Math.round(row.time)} of ${Math.round(all)}`.padStart(14)}  ${`${row.mutations} of ${checked.length}`.padStart(16)}  ${String(row.inFiles).padStart(12)}`
    );
  }
  console.log(
    `\nMedian over ${rows.length} commits: ${Math.round(median(rows.map((r) => r.share)) * 100)}% of the tests' time, ${median(rows.map((r) => r.mutations))} of ${checked.length} mutations.`
  );
  console.log(
    `The map is of ${map.commit.slice(0, 7)}, so an older commit is judged by what its files reach now.`
  );
};

/**
 * Runs the picked test files of each package, and the checks picked, and
 * logs each to the telemetry: the check, the tree of the staged files it
 * ran on, how long it took, and whether it passed.
 */
const runPicked = (tests: readonly Reached[]) => {
  const tree = git("write-tree")[0] ?? "unknown";
  let failed = 0;
  for (const folder of new Set(tests.map((t) => t.package))) {
    const mine = tests.filter((t) => t.package === folder);
    const files = mine
      .filter((t) => !t.test.includes(": "))
      .map((t) => t.test.slice(folder.length + 1));
    const commands = mine
      .filter((t) => t.test.includes(": "))
      .map((t) => t.test.slice(folder.length + 2));
    const runs = [
      ...(files.length === 0 ? [] : [["bunx", "vitest", "run", ...files]]),
      ...commands.map((command) => ["sh", "-c", command]),
    ];
    for (const [program, ...words] of runs) {
      const started = performance.now();
      const ran = spawnSync(program as string, words, {
        cwd: join(REPOSITORY, folder),
        stdio: "inherit",
      });
      failed += ran.status === 0 ? 0 : 1;
      logCheck({
        check: `${folder}: ${[program, ...words].join(" ")}`,
        passed: ran.status === 0,
        seconds: Math.round((performance.now() - started) / 100) / 10,
        tree,
      });
    }
  }
  process.exitCode = failed === 0 ? 0 : 1;
};

/** Says what the changes since a commit reach, and runs it when asked. */
const now = async ({ ask, byTest, checked, map }: Context) => {
  const ref = args.option("against") ?? "HEAD";
  const files = changedSince(ref);
  const change = byFunctions
    ? byFunction("now", files, ref)
    : { files, id: "now" };
  if (change.files.length === 0) {
    console.log(`Nothing changed since ${ref}.`);
    return;
  }
  const picked = await ask([change]);
  const tests = (picked.tests.now ?? []).flatMap((t) => byTest.get(t) ?? []);
  console.log(
    `${change.files.length} files changed since ${ref}. They reach ${tests.length} of ${map.tests.length} test files and checks, ${Math.round(seconds(tests))} of ${Math.round(seconds(map.tests))} s, and ${(picked.mutations.now ?? []).length} of ${checked.length} mutations.`
  );
  const packages = new Set(map.tests.map((t) => t.package));
  /** What a changed file no test reached picks. */
  const reachOf = (file: string) => {
    if ([...packages].some((p) => file.startsWith(`${p}/`))) {
      return "its package's tests run";
    }
    return file.includes("/") || file.endsWith(".md")
      ? "only the tests that run git reach it"
      : "every test runs";
  };
  for (const file of picked.unmapped.now ?? []) {
    console.log(`  no test reached ${file}, so ${reachOf(file)}`);
  }
  for (const test of tests) {
    console.log(`  ${test.test}`);
  }
  if (args.flag("run")) {
    runPicked(tests);
  }
};

const main = async () => {
  if (args.flag("map")) {
    const map = mapReach();
    if ("refused" in map) {
      console.error(`\n${map.refused}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `\nMapped ${map.tests.length} test files and checks at ${map.commit.slice(0, 7)}: ${Math.round(seconds(map.tests))} s in all.`
    );
    return;
  }
  const map = readMap();
  if (map === undefined) {
    console.error(
      "There is no reach map. Make one with: bun run affected --map"
    );
    process.exitCode = 1;
    return;
  }
  const lion = await Effect.runPromise(load(join(REPOSITORY, CORE)));
  byFunctions = map.tests.some((t) => t.functions !== undefined);
  const checked = MUTATIONS.map((mutation) =>
    byFunctions
      ? { ...checkedOf(mutation), functions: mutationFunctions(mutation) }
      : checkedOf(mutation)
  );
  const context: Context = {
    ask: (changes, asMutations = false) =>
      Effect.runPromise(
        pick(lion, map, changes, checked, asMutations ? checked : [])
      ),
    byTest: new Map(map.tests.map((t) => [t.test, t])),
    checked,
    map,
  };
  const count = args.option("replay");
  if (args.flag("check")) {
    await check(context);
  } else if (count === undefined) {
    await now(context);
  } else {
    await replay(context, count);
  }
};

await main();
