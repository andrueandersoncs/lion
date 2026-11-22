import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import {
  type Change,
  type Checked,
  pick,
  type Reached,
  type ReachMap,
} from "../affected.ts";
import { load } from "../lion.ts";
import { refusedMap, repositoryPath, sourceOf, testScript } from "../reach.ts";
import { CORE, REPOSITORY } from "../sources.ts";
import { between, element, word } from "./generators.ts";

/** The evaluator of the working tree, loaded once. */
const lion = Effect.runPromise(load(join(REPOSITORY, CORE)));

const TESTS = [
  "packages/a/src/tests/one.test.ts",
  "packages/a/src/tests/two.test.ts",
  "packages/b/src/tests/three.test.ts",
];
/** Files a change can touch: sources, a package's own file, docs, a root file, and the tests. */
const FILES = [
  "packages/a/src/x.ts",
  "packages/a/src/y.ts",
  "packages/a/package.json",
  "packages/b/src/z.ts",
  "packages/c/src/w.ts",
  "docs/page.md",
  "bun.lock",
  "CHANGELOG.md",
  ...TESTS,
];

const boolean = Arbitrary.schema(Schema.Boolean);

/** Some of the items, each kept or left out. */
const someOf = <A>(items: readonly A[]) =>
  Arbitrary.map(
    Arbitrary.array(boolean, {
      maxLength: items.length,
      minLength: items.length,
    }),
    (keep) => items.filter((_, at) => keep[at] === true)
  );

/** Some of the items, at least one. */
const oneOrMore = <A>(items: readonly A[]) =>
  Arbitrary.map(
    Arbitrary.all({ at: between(0, items.length - 1), more: someOf(items) }),
    ({ at, more }) => [...new Set([items[at] as A, ...more])]
  );

const reached = (test: string): Arbitrary.Arbitrary<Reached> =>
  Arbitrary.map(
    Arbitrary.all({
      packages: someOf(["packages/a", "packages/b", "packages/c"]),
      reaches: someOf(FILES),
      repository: Arbitrary.map(between(0, 5), (n) => n === 0),
      seconds: between(0, 30),
    }),
    (r) => ({
      ...r,
      package: test.split("/").slice(0, 2).join("/"),
      test,
    })
  );

const map: Arbitrary.Arbitrary<ReachMap> = Arbitrary.map(
  Arbitrary.all({
    a: reached(TESTS[0] as string),
    b: reached(TESTS[1] as string),
    c: reached(TESTS[2] as string),
    kept: oneOrMore([0, 1, 2]),
  }),
  ({ a, b, c, kept }) => ({
    commit: "c0",
    tests: kept.map((at) => [a, b, c][at] as Reached),
  })
);

/** Changes of one to three files each, so a single rule often decides what one picks. */
const changes: Arbitrary.Arbitrary<Change[]> = Arbitrary.map(
  Arbitrary.array(
    Arbitrary.array(element(FILES), { maxLength: 3, minLength: 1 }),
    { maxLength: 3, minLength: 1 }
  ),
  (lists) =>
    lists.map((files, at) => ({
      files: [...new Set(files)],
      id: `change ${at}`,
    }))
);

const mutations: Arbitrary.Arbitrary<Checked[]> = Arbitrary.map(
  Arbitrary.array(
    Arbitrary.all({ file: between(0, FILES.length - 1), tests: someOf(TESTS) }),
    { maxLength: 3 }
  ),
  (list) =>
    list.map(({ file, tests }, at) => ({
      file: FILES[file] as string,
      name: `mutation ${at}`,
      tests,
    }))
);

const NAMES = ["f", "g", "h"];
const SCRIPTS = FILES.filter((f) => f.endsWith(".ts"));

/** A test that ran some named functions of the scripts it reached. */
const withFunctions = (
  r: Arbitrary.Arbitrary<Reached>
): Arbitrary.Arbitrary<Reached> =>
  Arbitrary.map(
    Arbitrary.all({
      r,
      ran: someOf(SCRIPTS.flatMap((f) => NAMES.map((n) => [f, n] as const))),
    }),
    ({ r: test, ran }) => ({
      ...test,
      functions: ran.filter(([f]) => test.reaches.includes(f)),
    })
  );

const functionMap: Arbitrary.Arbitrary<ReachMap> = Arbitrary.map(
  Arbitrary.all({
    a: withFunctions(reached(TESTS[0] as string)),
    b: withFunctions(reached(TESTS[1] as string)),
    c: withFunctions(reached(TESTS[2] as string)),
    kept: oneOrMore([0, 1, 2]),
  }),
  ({ a, b, c, kept }) => ({
    commit: "c0",
    tests: kept.map((at) => [a, b, c][at] as Reached),
  })
);

/** Changes read by function: a script is changed whole, or in some of its named functions. */
const functionChanges: Arbitrary.Arbitrary<Change[]> = Arbitrary.map(
  Arbitrary.all({
    lists: changes,
    names: Arbitrary.array(someOf(NAMES), { maxLength: 12, minLength: 12 }),
  }),
  ({ lists, names }) =>
    lists.map((change, at) => {
      const read = change.files.map((f, k) => ({
        f,
        names: f.endsWith(".ts") ? (names[(at * 3 + k) % 12] ?? []) : [],
        whole:
          !f.endsWith(".ts") || (names[(at * 3 + k) % 12] ?? []).length === 3,
      }));
      return {
        ...change,
        functions: read.flatMap((x) =>
          x.whole ? [] : x.names.map((n) => [x.f, n] as const)
        ),
        whole: read.filter((x) => x.whole).map((x) => x.f),
      };
    })
);

/** Mutations whose text is in some named functions of their file, or in none. */
const functionMutations: Arbitrary.Arbitrary<Checked[]> = Arbitrary.map(
  Arbitrary.all({
    list: mutations,
    names: Arbitrary.array(someOf(NAMES), { maxLength: 3, minLength: 3 }),
  }),
  ({ list, names }) =>
    list.map((x, at) => ({
      ...x,
      functions:
        x.file.endsWith(".ts") && (names[at] ?? []).length > 0
          ? (names[at] ?? [])
          : ("whole" as const),
    }))
);

/** A mutation as a change read by function, when its functions are known. */
const functionsOfMutation = (x: Checked) => {
  if (x.functions === undefined) {
    return {};
  }
  return x.functions === "whole"
    ? { functions: [], whole: [x.file] }
    : { functions: x.functions.map((n) => [x.file, n] as const), whole: [] };
};

/** What the rules should pick, written without them. */
const model = (
  m: ReachMap,
  asked: readonly Change[],
  all: readonly Checked[],
  asMutations: readonly Checked[]
) => {
  const packages = new Set(m.tests.flatMap((t) => [t.package, ...t.packages]));
  const inPackage = (f: string) =>
    [...packages].filter((p) => f.startsWith(`${p}/`));
  const reachedBy = (t: Reached, f: string) =>
    t.reaches.includes(f) || inPackage(f).some((p) => t.packages.includes(p));
  const unmapped = (f: string) => !m.tests.some((t) => reachedBy(t, f));
  // A change read by function: the names it touches in each file it does
  // not change whole. A function no test ran is read as its whole file.
  const touches = (change: Change, t: Reached, f: string) => {
    if (change.functions === undefined || change.whole === undefined) {
      return t.reaches.includes(f);
    }
    if (change.whole.includes(f)) {
      return t.reaches.includes(f);
    }
    return change.functions
      .filter(([file]) => file === f)
      .some(
        ([, n]) =>
          (t.functions ?? []).some(([g, k]) => g === f && k === n) ||
          (!m.tests.some((u) =>
            (u.functions ?? []).some(([g, k]) => g === f && k === n)
          ) &&
            t.reaches.includes(f))
      );
  };
  const picksIn = (change: Change, t: Reached, f: string) =>
    touches(change, t, f) ||
    inPackage(f).some((p) => t.packages.includes(p)) ||
    t.repository ||
    f === t.test ||
    (unmapped(f) &&
      (inPackage(f).includes(t.package) ||
        !(f.includes("/") || f.endsWith(".md"))));
  const every: Change[] = [
    ...asked,
    ...asMutations.map((x) => ({
      files: [x.file],
      id: x.name,
      ...functionsOfMutation(x),
    })),
  ];
  const tests: Record<string, string[]> = {};
  const mutationsOf: Record<string, string[]> = {};
  const unmappedOf: Record<string, string[]> = {};
  for (const change of every) {
    const picked = m.tests
      .filter((t) => change.files.some((f) => picksIn(change, t, f)))
      .map((t) => t.test);
    const set = (list: string[]) => [...new Set(list)].sort();
    if (picked.length > 0) {
      tests[change.id] = set([...(tests[change.id] ?? []), ...picked]);
    }
    const hit = all
      .filter(
        (x) =>
          change.files.includes(x.file) ||
          x.tests.some((t) => picked.includes(t))
      )
      .map((x) => x.name);
    if (hit.length > 0) {
      mutationsOf[change.id] = set([...(mutationsOf[change.id] ?? []), ...hit]);
    }
    const lost = change.files.filter(unmapped);
    if (lost.length > 0) {
      unmappedOf[change.id] = set([...(unmappedOf[change.id] ?? []), ...lost]);
    }
  }
  const unsound = asMutations.flatMap((x) =>
    x.tests
      .filter((t) => !(tests[x.name] ?? []).includes(t))
      .map((t) => [x.name, t] as const)
  );
  return { mutations: mutationsOf, tests, unmapped: unmappedOf, unsound };
};

describe("the checks a change can reach", () => {
  it.effect.prop(
    "are what a plain model of the reach map, the changes, and the mutations picks",
    { asked: changes, kept: someOf([0, 1, 2]), m: map, ms: mutations },
    ({ asked, kept, m, ms }) =>
      Effect.gen(function* () {
        const asMutations = ms.filter((_, at) => kept.includes(at));
        const got = yield* pick(
          yield* Effect.promise(() => lion),
          m,
          asked,
          ms,
          asMutations
        );
        const expected = model(m, asked, ms, asMutations);
        expect(got.tests).toEqual(expected.tests);
        expect(got.mutations).toEqual(expected.mutations);
        expect(got.unmapped).toEqual(expected.unmapped);
        expect([...got.unsound].map((r) => r.join(" ")).sort()).toEqual(
          expected.unsound.map((r) => r.join(" ")).sort()
        );
      }),
    { arbitrary: { runs: 200 } }
  );

  it.effect.prop(
    "read by function, are what the plain model picks: a test that ran a changed function, or reached a file whose changed function no test ran",
    {
      asked: functionChanges,
      kept: someOf([0, 1, 2]),
      m: functionMap,
      ms: functionMutations,
    },
    ({ asked, kept, m, ms }) =>
      Effect.gen(function* () {
        const asMutations = ms.filter((_, at) => kept.includes(at));
        const got = yield* pick(
          yield* Effect.promise(() => lion),
          m,
          asked,
          ms,
          asMutations
        );
        const expected = model(m, asked, ms, asMutations);
        expect(got.tests).toEqual(expected.tests);
        expect(got.mutations).toEqual(expected.mutations);
        expect(got.unmapped).toEqual(expected.unmapped);
        expect([...got.unsound].map((r) => r.join(" ")).sort()).toEqual(
          expected.unsound.map((r) => r.join(" ")).sort()
        );
      }),
    { arbitrary: { runs: 200 } }
  );
});

/** A path of words, such as `src/logic/weights`. */
const path = Arbitrary.map(
  Arbitrary.array(word, { maxLength: 4, minLength: 1 }),
  (words) => words.join("/")
);

describe("the reach map", () => {
  it.prop(
    "is refused when a package's tests failed, naming every such package, and written when all passed",
    {
      runs: Arbitrary.array(Arbitrary.all({ folder: path, passed: boolean }), {
        maxLength: 5,
      }),
    },
    ({ runs }) => {
      const refused = refusedMap(runs);
      const failed = runs.filter((run) => !run.passed);
      expect(refused === undefined).toBe(failed.length === 0);
      for (const run of failed) {
        expect(refused).toContain(run.folder);
      }
    }
  );

  it.prop(
    "keeps a path inside the repository, from a path or a file URL, and leaves out the rest",
    {
      // Capitalized, so no path can climb back into the root through a
      // folder of its own name: the root's folders are lowercase.
      at: Arbitrary.map(path, (p) => `F${p}`),
      root: path,
      url: boolean,
      where: element(["", "node_modules/", "out/", "../"]),
    },
    ({ at, root, url, where }) => {
      const absolute = `/${root}/${where}${at}`;
      const location = url ? `file://${absolute}?v=1` : absolute;
      expect(repositoryPath(`/${root}`, location)).toBe(
        where === "" ? at : undefined
      );
    }
  );

  it.prop(
    "reads a built file as the source of its name when there is one, and as its package when not",
    { at: path, exists: boolean, name: word },
    ({ at, exists, name }) => {
      const source = `packages/${name}/src/${at}.ts`;
      expect(
        sourceOf(
          `packages/${name}/dist/${at}.mjs`,
          (p) => exists && p === source
        )
      ).toEqual(exists ? { file: source } : { package: `packages/${name}` });
      expect(sourceOf(source, () => false)).toEqual({ file: source });
    }
  );

  it.prop(
    "splits a test script into its vitest run and its other commands",
    {
      at: between(0, 3),
      commands: Arbitrary.array(
        Arbitrary.map(
          Arbitrary.array(word, { maxLength: 3, minLength: 1 }),
          (w) => w.join(" ")
        ),
        { maxLength: 3 }
      ),
      vitest: boolean,
    },
    ({ at, commands, vitest }) => {
      const parts = [...commands];
      if (vitest) {
        parts.splice(Math.min(at, parts.length), 0, "vitest run");
      }
      const others = commands.filter((c) => c !== "vitest run");
      expect(testScript(parts.join(" && "))).toEqual({
        commands: others,
        vitest: vitest || commands.includes("vitest run"),
      });
    }
  );
});
