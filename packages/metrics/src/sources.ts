/**
 * The source files to measure: the ones in the working tree, or the ones a
 * git commit holds, so a change can be measured against where it started.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface Source {
  /** The file's path below the measured directory. */
  readonly path: string;
  readonly text: string;
}

/** The repository the tools measure: the one this package sits in. */
export const REPOSITORY = join(import.meta.dirname, "../../..");

/** The directory measured by default: the language itself. */
export const CORE = "packages/core/src";

const SOURCE_FILE = /\.tsx?$/;
const TEST_FILE = /\.test\.tsx?$/;
const SKIPPED_DIRECTORIES = /(^|\/)(tests|node_modules|dist)\//;

/** True for a file that is part of the implementation, not its tests. */
export const isMeasured = (path: string): boolean =>
  SOURCE_FILE.test(path) &&
  !TEST_FILE.test(path) &&
  !SKIPPED_DIRECTORIES.test(path);

const walk = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

/** The measured files of a directory as they are on disk. */
export const inWorkingTree = (directory: string): Source[] => {
  const root = join(REPOSITORY, directory);
  return walk(root)
    .map((file) => ({ file, path: relative(root, file) }))
    .filter(({ path }) => isMeasured(path))
    .map(({ file, path }) => ({ path, text: readFileSync(file, "utf8") }))
    .sort((a, b) => a.path.localeCompare(b.path));
};

const git = (...args: string[]): string =>
  execFileSync("git", args, {
    cwd: REPOSITORY,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

/** The commit a ref names, or undefined when git knows no such ref. */
export const commitOf = (ref: string): string | undefined => {
  try {
    return git("rev-parse", "--verify", "--quiet", `${ref}^{commit}`).trim();
  } catch {
    return undefined;
  }
};

/** The measured files of a directory as a commit holds them. */
export const atCommit = (commit: string, directory: string): Source[] =>
  git("ls-tree", "-r", "--name-only", commit, "--", directory)
    .split("\n")
    .filter((file) => file !== "")
    .map((file) => ({ file, path: relative(directory, file) }))
    .filter(({ path }) => isMeasured(path))
    .map(({ file, path }) => ({ path, text: git("show", `${commit}:${file}`) }))
    .sort((a, b) => a.path.localeCompare(b.path));
