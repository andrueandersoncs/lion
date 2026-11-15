/**
 * What git knows that the record needs: the commits HEAD reaches, with their
 * parents, times, and messages; the tags; and the commit that added each file
 * of the record. Files git does not have yet were added in the working tree,
 * which counts as one more commit whose parent is HEAD.
 */
import { execFileSync } from "node:child_process";

/** The commit that stands for the working tree: what is not committed yet. */
export const WORKING_TREE = "working tree";

export interface Commit {
  /** The day, as git writes the committer date: `2026-11-13`. */
  readonly date: string;
  readonly hash: string;
  readonly message: string;
  readonly parents: readonly string[];
  /** Seconds since 1970, the committer date. */
  readonly time: number;
}

export interface Tag {
  /** The commit the tag points to, through an annotated tag object. */
  readonly commit: string;
  readonly name: string;
}

export interface History {
  /** The commit that added each file under the record's folder. */
  readonly added: ReadonlyMap<string, string>;
  /** Every commit HEAD reaches, newest first, and then the working tree. */
  readonly commits: readonly Commit[];
  readonly tags: readonly Tag[];
}

const UNIT = "\u001f";
const LEADING_NEWLINE = /^\n/;
const TRAILING_NEWLINES = /\n+$/;
const RECORD = "\u001e";

const git = (repository: string, ...args: string[]): string => {
  try {
    return execFileSync("git", ["-c", "core.quotePath=false", ...args], {
      cwd: repository,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    // No HEAD yet, or not a repository: git knows nothing.
    return "";
  }
};

const parseCommits = (text: string): Commit[] =>
  text
    .split(RECORD)
    .map((entry) => entry.replace(LEADING_NEWLINE, ""))
    .filter((entry) => entry !== "")
    .map((entry) => {
      const [hash = "", parents = "", time = "0", date = "", message = ""] =
        entry.split(UNIT);
      return {
        date,
        hash,
        message: message.replace(TRAILING_NEWLINES, ""),
        parents: parents === "" ? [] : parents.split(" "),
        time: Number(time),
      };
    });

const parseTags = (text: string): Tag[] =>
  text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [name = "", object = "", peeled = ""] = line.split(UNIT);
      return { commit: peeled === "" ? object : peeled, name };
    });

/** Follows `--name-status` lines through additions, renames, and deletions. */
const follow = (
  added: Map<string, string>,
  commit: string,
  lines: readonly string[]
) => {
  for (const line of lines) {
    const [status = "", first = "", second = ""] = line.split("\t");
    if (status.startsWith("A")) {
      added.set(first, commit);
    } else if (status.startsWith("R")) {
      added.set(second, added.get(first) ?? commit);
      added.delete(first);
    } else if (status.startsWith("D")) {
      added.delete(first);
    }
  }
};

const addedCommits = (repository: string, folder: string) => {
  const added = new Map<string, string>();
  const log = git(
    repository,
    "log",
    "--reverse",
    "-M100%",
    "--name-status",
    `--format=${RECORD}%H`,
    "HEAD",
    "--",
    `${folder}/`
  );
  for (const block of log.split(RECORD).filter((part) => part !== "")) {
    const [commit = "", ...lines] = block.split("\n");
    follow(added, commit, lines);
  }
  // A file renamed in the index keeps the commit that added it.
  const staged = git(
    repository,
    "diff",
    "--cached",
    "-M100%",
    "--name-status",
    "HEAD",
    "--",
    `${folder}/`
  );
  for (const line of staged.split("\n")) {
    const [status = "", first = "", second = ""] = line.split("\t");
    if (status.startsWith("R") && added.has(first)) {
      added.set(second, added.get(first) ?? WORKING_TREE);
    }
  }
  return added;
};

const day = (now: Date) =>
  [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");

/**
 * Reads the history of `repository`. `folder` is the record's folder, whose
 * files are traced to the commit that added them. `now` dates the working
 * tree.
 */
export const readHistory = (
  repository: string,
  folder: string,
  now: Date = new Date()
): History => {
  const commits = parseCommits(
    git(
      repository,
      "log",
      `--format=${RECORD}%H${UNIT}%P${UNIT}%ct${UNIT}%cs${UNIT}%B`,
      "HEAD"
    )
  );
  const head = commits[0]?.hash;
  const workingTree: Commit = {
    date: day(now),
    hash: WORKING_TREE,
    message: "",
    parents: head === undefined ? [] : [head],
    time: Math.floor(now.getTime() / 1000),
  };
  return {
    added: addedCommits(repository, folder),
    commits: [...commits, workingTree],
    tags: parseTags(
      git(
        repository,
        "for-each-ref",
        "refs/tags",
        `--format=%(refname:short)${UNIT}%(objectname)${UNIT}%(*objectname)`
      )
    ),
  };
};
