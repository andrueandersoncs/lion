/**
 * The facts the record takes from git, checked in real repositories built
 * from generated steps: each file of the record is traced to the commit that
 * added it, through renames, and a file git does not have yet belongs to the
 * working tree. Each commit comes back with its message and its parents.
 */
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Schema } from "effect";
import { ownEnvironment, readHistory, WORKING_TREE } from "../git.ts";

const NAMES = ["a", "b", "c", "d"];

type Step =
  | { readonly kind: "add"; readonly name: string }
  | { readonly kind: "commit"; readonly message: string }
  | { readonly kind: "remove"; readonly name: string }
  | { readonly from: string; readonly kind: "rename"; readonly to: string };

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

const name = Arbitrary.map(
  int(0, NAMES.length - 1),
  (at) => NAMES[at] as string
);

const MESSAGES = [
  "feat: add a rule",
  "fix(core): mend it\n\nThe body says why,\nover two lines.",
  "docs: write",
];

/** A change to the files of the record, short of a commit. */
const operation: Arbitrary.Arbitrary<Step> = Arbitrary.flatMap(
  int(0, 3),
  (kind) => {
    if (kind <= 1) {
      return Arbitrary.map(name, (n): Step => ({ kind: "add", name: n }));
    }
    if (kind === 2) {
      return Arbitrary.map(name, (n): Step => ({ kind: "remove", name: n }));
    }
    return Arbitrary.map(
      Arbitrary.all([name, name]),
      ([from, to]): Step => ({ from, kind: "rename", to })
    );
  }
);

const commit = Arbitrary.map(
  int(0, MESSAGES.length - 1),
  (at): Step => ({ kind: "commit", message: MESSAGES[at] as string })
);

/**
 * Rounds of changes, each ending in a commit, so a file is often added in
 * one commit and renamed in a later one; then changes left uncommitted.
 */
const steps = Arbitrary.map(
  Arbitrary.all([
    Arbitrary.array(
      Arbitrary.all([Arbitrary.array(operation, { maxLength: 3 }), commit]),
      { maxLength: 5 }
    ),
    Arbitrary.array(operation, { maxLength: 3 }),
  ]),
  ([rounds, rest]): Step[] => [
    ...rounds.flatMap(([operations, made]) => [...operations, made]),
    ...rest,
  ]
);

const pathOf = (n: string) => `history/changes/${n}.json`;

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: ownEnvironment(),
    stdio: "pipe",
  }).trim();

/**
 * The commit that added each file of `after`, given the files of `before`
 * and the commit that added each of them, read the way git reads a commit:
 * a file that stays keeps its commit, a new file with exactly the content of
 * one that went is that file renamed, and any other new file is added by
 * `commit`. Files whose content is only similar are not renames.
 */
const diffed = (
  before: ReadonlyMap<string, number>,
  addedBefore: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, number>,
  commit: string
) =>
  new Map(
    [...after].map(([path, content]) => {
      if (before.has(path)) {
        return [path, addedBefore.get(path) ?? commit];
      }
      const source = [...before].find(
        ([old, was]) => was === content && !after.has(old)
      );
      return [
        path,
        source === undefined ? commit : (addedBefore.get(source[0]) ?? commit),
      ];
    })
  );

/**
 * Runs the steps in a new repository, skipping any that cannot be done, and
 * says, as a model, which commit added each file that is there at the end.
 */
const build = (steps: readonly Step[]) => {
  const root = mkdtempSync(join(tmpdir(), "lion-history-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "record@example.com");
  git(root, "config", "user.name", "Record");
  git(root, "config", "commit.gpgsign", "false");
  /** Each file's content, by the number written into it. */
  const tree = new Map<string, number>();
  let committed = new Map<string, number>();
  let added = new Map<string, string>();
  const commits: { hash: string; message: string; parents: string[] }[] = [];
  let content = 0;
  for (const s of steps) {
    if (s.kind === "add" && !tree.has(s.name)) {
      const file = join(root, pathOf(s.name));
      mkdirSync(dirname(file), { recursive: true });
      content += 1;
      // Laid out as an entry is, every file shares most of its lines with
      // every other, so a rename by likeness would pair different files.
      writeFileSync(
        file,
        `[\n  {\n    "kind": "Added",\n    "text": "file ${content}"\n  }\n]\n`
      );
      git(root, "add", pathOf(s.name));
      tree.set(s.name, content);
    } else if (s.kind === "rename" && tree.has(s.from) && !tree.has(s.to)) {
      git(root, "mv", pathOf(s.from), pathOf(s.to));
      tree.set(s.to, tree.get(s.from) ?? 0);
      tree.delete(s.from);
    } else if (s.kind === "remove" && tree.has(s.name)) {
      git(root, "rm", "-q", "-f", pathOf(s.name));
      tree.delete(s.name);
    } else if (s.kind === "commit") {
      const parents =
        commits.length === 0 ? [] : [commits.at(-1)?.hash as string];
      git(root, "commit", "-q", "--allow-empty", "-m", s.message);
      const hash = git(root, "rev-parse", "HEAD");
      commits.push({ hash, message: s.message, parents });
      added = diffed(committed, added, tree, hash);
      committed = new Map(tree);
    }
  }
  // What is not committed yet reads as one more commit: the working tree.
  const expected = new Map(
    [...diffed(committed, added, tree, WORKING_TREE)].map(([n, at]) => [
      pathOf(n),
      at,
    ])
  );
  return { commits, expected, root };
};

describe("readHistory", () => {
  it.prop(
    "traces each file to the commit that added it, and reads every commit",
    { steps },
    ({ steps }) => {
      const { commits, expected, root } = build(steps);
      try {
        const history = readHistory(root, "history");
        const traced = new Map(
          [...expected.keys()].map((path) => [
            path,
            history.added.get(path) ?? WORKING_TREE,
          ])
        );
        expect(traced).toEqual(expected);
        expect(history.commits.slice(0, -1).reverse()).toEqual(
          commits.map((c) => expect.objectContaining(c))
        );
        expect(history.commits.at(-1)).toMatchObject({
          hash: WORKING_TREE,
          parents: commits.length === 0 ? [] : [commits.at(-1)?.hash],
        });
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    },
    { arbitrary: { runs: 100 }, timeout: 300_000 }
  );
});

/**
 * The variables a git hook sets, which name a repository: a test that runs
 * git in a folder of its own inside a hook must not reach that one.
 */
const LOCATIONS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
] as const;

const locations = Arbitrary.map(
  Arbitrary.array(Arbitrary.schema(Schema.Literals(LOCATIONS)), {
    maxLength: LOCATIONS.length,
    minLength: 1,
  }),
  (names) => [...new Set(names)]
);

/** The environment with none of git's repository variables, for the decoy. */
const plain = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([variable]) => !variable.startsWith("GIT_")
    )
  );

/** A repository with one commit, which the environment will name. */
const decoyRepository = () => {
  const root = mkdtempSync(join(tmpdir(), "lion-decoy-"));
  const run = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", env: plain() });
  run("init", "-q", "-b", "main");
  writeFileSync(join(root, "kept.txt"), "kept\n");
  run("add", "kept.txt");
  run(
    "-c",
    "user.name=Decoy",
    "-c",
    "user.email=decoy@example.com",
    "commit",
    "-q",
    "-m",
    "decoy"
  );
  const values: Record<(typeof LOCATIONS)[number], string> = {
    GIT_COMMON_DIR: join(root, ".git"),
    GIT_DIR: join(root, ".git"),
    GIT_INDEX_FILE: join(root, ".git", "index"),
    GIT_OBJECT_DIRECTORY: join(root, ".git", "objects"),
    GIT_WORK_TREE: root,
  };
  const state = () => ({
    config: readFileSync(join(root, ".git", "config"), "utf8"),
    head: run("rev-parse", "HEAD").trim(),
    index: readFileSync(join(root, ".git", "index")).toString("hex"),
  });
  return { root, state, values };
};

describe("git run for a folder, inside a git hook", () => {
  it.prop(
    "reads and writes the folder's own repository, whatever repository the environment names",
    { names: locations, steps },
    ({ names, steps }) => {
      const decoy = decoyRepository();
      const before = decoy.state();
      const saved = new Map(names.map((n) => [n, process.env[n]]));
      for (const n of names) {
        process.env[n] = decoy.values[n];
      }
      let root: string | undefined;
      try {
        const built = build(steps);
        root = built.root;
        const history = readHistory(built.root, "history");
        expect(history.commits.slice(0, -1).reverse()).toEqual(
          built.commits.map((c) => expect.objectContaining(c))
        );
      } finally {
        for (const [n, value] of saved) {
          if (value === undefined) {
            delete process.env[n];
          } else {
            process.env[n] = value;
          }
        }
        if (root !== undefined) {
          rmSync(root, { force: true, recursive: true });
        }
      }
      expect(decoy.state()).toEqual(before);
      rmSync(decoy.root, { force: true, recursive: true });
    },
    { arbitrary: { runs: 20 }, timeout: 300_000 }
  );
});
