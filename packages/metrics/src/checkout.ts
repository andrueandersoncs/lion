/**
 * Checks an earlier commit out beside the working tree, so a tool can run
 * that version's evaluator. The checkout is a git worktree under `out/`,
 * which git ignores, and inside the repository, so the earlier source finds
 * the installed dependencies.
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import { REPOSITORY } from "./sources.ts";

const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: REPOSITORY, stdio: "pipe" });

const remove = (directory: string) => {
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
        remove(directory);
      }
      git("worktree", "add", "--detach", directory, commit);
      return directory;
    }),
    use,
    () => Effect.sync(() => remove(directory))
  );
};
