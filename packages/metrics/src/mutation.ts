/**
 * Mutation checks: break the code in one place, run the tests, and see
 * whether they notice. A property that still passes on broken code proves
 * nothing about that code.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPOSITORY } from "./sources.ts";

export interface Mutation {
  /** The file to break, from the repository root. */
  readonly file: string;
  /** Text that occurs exactly once in the file. */
  readonly find: string;
  /** What the break does, as a sentence about Lion's behavior. */
  readonly name: string;
  /** The text to put in its place. */
  readonly replace: string;
  /** Test files to run instead of the default ones, from `packages/core`. */
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

const CORE = join(REPOSITORY, "packages/core");

/** Runs test files of @lionlang/core and says whether they all passed. */
export const testsPass = (tests: readonly string[]): boolean =>
  spawnSync("bunx", ["vitest", "run", ...tests], {
    cwd: CORE,
    stdio: "ignore",
  }).status === 0;

/** Undoes the mutation that is applied right now, if one is. */
let undo: (() => void) | undefined;

/** Puts back the file a stopped run left broken. */
export const restore = (): void => {
  undo?.();
  undo = undefined;
};

/**
 * Applies a mutation, runs the tests, and puts the file back. The file is
 * put back only if it still holds the mutation: one that changed while the
 * tests ran belongs to someone else, and is left as it is.
 */
export const check = (
  mutation: Mutation,
  passes: (tests: readonly string[]) => boolean = testsPass
): Verdict => {
  const path = join(REPOSITORY, mutation.file);
  const original = readFileSync(path, "utf8");
  const broken = mutated(original, mutation);
  if (broken === undefined) {
    return "stale";
  }
  undo = () => {
    if (readFileSync(path, "utf8") === broken) {
      writeFileSync(path, original);
    } else {
      console.error(
        `${mutation.file} changed while its tests ran, so it was left as it is. Check it for: ${mutation.replace}`
      );
    }
  };
  writeFileSync(path, broken);
  try {
    return passes(mutation.tests ?? DEFAULT_TESTS) ? "missed" : "caught";
  } finally {
    restore();
  }
};
