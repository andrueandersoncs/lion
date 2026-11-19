/**
 * Mutation checks: break the code in one place, run the tests, and see
 * whether they notice. A property that still passes on broken code proves
 * nothing about that code.
 *
 * A mutation is made in a copy of the working tree, never in the working
 * tree itself, so the code can be edited while its mutations run.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface Mutation {
  /** The file to break, from the repository root. */
  readonly file: string;
  /** Text that occurs exactly once in the file. */
  readonly find: string;
  /** What the break does, as a sentence about Lion's behavior. */
  readonly name: string;
  /** The package whose tests to run, such as `metrics`; `core` when left out. */
  readonly package?: string;
  /** The text to put in its place. */
  readonly replace: string;
  /** Test files to run instead of the default ones, from that package. */
  readonly tests?: readonly string[];
}

/**
 * How a mutation went.
 *
 * - `caught`: the tests failed, as they should.
 * - `missed`: the tests passed on broken code.
 * - `stale`: the text to replace is not in the file exactly once, so the
 *   mutation needs updating.
 */
export type Verdict = "caught" | "missed" | "stale";

/**
 * The text with the mutation applied, or undefined when `find` does not
 * occur in it exactly once.
 */
export const mutated = (
  text: string,
  { find, replace }: Pick<Mutation, "find" | "replace">
): string | undefined => {
  const first = text.indexOf(find);
  if (find === "" || first === -1 || text.indexOf(find, first + 1) !== -1) {
    return undefined;
  }
  return text.slice(0, first) + replace + text.slice(first + find.length);
};

/** The property tests of the logic layer, which most mutations should fail. */
export const DEFAULT_TESTS = [
  "src/logic/tests/asking.test.ts",
  "src/logic/tests/waiting.test.ts",
  "src/logic/tests/connectives.test.ts",
];

/** Says whether some test files of a package all pass, in a tree at `root`. */
export type Passes = (
  root: string,
  tests: readonly string[],
  where?: string
) => Promise<boolean>;

/**
 * How long the tests of one mutation may run. A break can make evaluation
 * loop without ever giving the test's own time limit a turn, and a test
 * that never ends has not passed.
 */
const LIMIT_MS = 10 * 60 * 1000;

/**
 * Runs test files of a package, core by default, in the tree at `root`.
 * Tests still running after `LIMIT_MS` are stopped, with every process
 * they started, and do not pass.
 */
export const testsPass: Passes = (root, tests, where = "core") =>
  new Promise((resolve) => {
    const run = spawn("bunx", ["vitest", "run", ...tests], {
      cwd: join(root, "packages", where),
      detached: true,
      stdio: "ignore",
    });
    const limit = setTimeout(() => {
      try {
        process.kill(-(run.pid ?? 0), "SIGKILL");
      } catch {
        // The tests ended as the limit came.
      }
    }, LIMIT_MS);
    run.on("error", () => {
      clearTimeout(limit);
      resolve(false);
    });
    run.on("exit", (status) => {
      clearTimeout(limit);
      resolve(status === 0);
    });
  });

/**
 * Applies a mutation to the tree at `root`, runs the tests there, and puts
 * the file back, so the tree can take the next mutation.
 */
export const check = async (
  mutation: Mutation,
  root: string,
  passes: Passes = testsPass
): Promise<Verdict> => {
  const path = join(root, mutation.file);
  const original = readFileSync(path, "utf8");
  const broken = mutated(original, mutation);
  if (broken === undefined) {
    return "stale";
  }
  writeFileSync(path, broken);
  try {
    return (await passes(
      root,
      mutation.tests ?? DEFAULT_TESTS,
      mutation.package
    ))
      ? "missed"
      : "caught";
  } finally {
    writeFileSync(path, original);
  }
};

/**
 * Checks mutations in several trees at once: each tree takes the next
 * mutation nobody has taken, until none is left. `done` hears of each
 * verdict as it comes. The verdicts are in the order of the mutations.
 */
export const checkAll = async (
  mutations: readonly Mutation[],
  roots: readonly string[],
  done: (mutation: Mutation, verdict: Verdict) => void = () => undefined,
  passes: Passes = testsPass
): Promise<Verdict[]> => {
  const verdicts: Verdict[] = [];
  let next = 0;
  const work = async (root: string) => {
    while (next < mutations.length) {
      const at = next;
      next += 1;
      const mutation = mutations[at] as Mutation;
      const verdict = await check(mutation, root, passes);
      verdicts[at] = verdict;
      done(mutation, verdict);
    }
  };
  await Promise.all(roots.map(work));
  return verdicts;
};
