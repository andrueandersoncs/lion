/**
 * Checks a version of the repository out beside the working tree: an
 * earlier commit, so a tool can run that version's evaluator, or a copy of
 * the working tree as it stands, so a tool can change files without
 * touching the ones being edited. A checkout is a git worktree under
 * `out/`, which git ignores, and inside the repository, so an earlier
 * source finds the installed dependencies.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { Effect } from "effect";
import { REPOSITORY } from "./sources.ts";

const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: REPOSITORY, stdio: "pipe" });

/** Removes a checkout, also one a stopped run left half made. */
export const removeCheckout = (directory: string) => {
  try {
    git("worktree", "remove", "--force", directory);
  } catch {
    // Not a worktree any more, such as one left behind by a stopped run.
    rmSync(directory, { force: true, recursive: true });
  }
  git("worktree", "prune");
};

/**
 * Runs `use` with the directory of a checkout of `commit`, and removes the
 * checkout afterwards, also when `use` fails or the run is interrupted.
 */
export const withCheckout = <A, E, R>(
  commit: string,
  use: (directory: string) => Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> => {
  const directory = join(REPOSITORY, "out/metrics", commit.slice(0, 12));
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      if (existsSync(directory)) {
        removeCheckout(directory);
      }
      git("worktree", "add", "--detach", directory, commit);
      return directory;
    }),
    use,
    () => Effect.sync(() => removeCheckout(directory))
  );
};

/** The paths git lists, which it ends with a zero byte each. */
const listed = (...args: string[]) =>
  git(...args, "-z")
    .toString()
    .split("\0")
    .filter((path) => path !== "");

/**
 * Makes a copy of the working tree as it stands, with what is not committed
 * yet: the files that differ from the last commit, and the new ones git
 * does not ignore. The copy gets its own installed dependencies, and with
 * `build`, its own build of the packages named, so nothing in it reaches
 * back into the working tree. Returns the copy's directory.
 */
export const copyWorkingTree = (
  name: string,
  build: readonly string[] = []
) => {
  const directory = join(REPOSITORY, "out/metrics", name);
  if (existsSync(directory)) {
    removeCheckout(directory);
  }
  git("worktree", "add", "--detach", directory, "HEAD");
  const changed = [
    ...listed("diff", "--name-only", "HEAD"),
    ...listed("ls-files", "--others", "--exclude-standard"),
  ];
  for (const path of changed) {
    const from = join(REPOSITORY, path);
    const to = join(directory, path);
    if (existsSync(from)) {
      mkdirSync(dirname(to), { recursive: true });
      cpSync(from, to);
    } else {
      rmSync(to, { force: true });
    }
  }
  const run = (command: string, ...args: string[]) =>
    execFileSync(command, args, { cwd: directory, stdio: "pipe" });
  run("bun", "install");
  for (const each of build) {
    run("bunx", "turbo", "build", `--filter=${each}`);
  }
  return directory;
};
