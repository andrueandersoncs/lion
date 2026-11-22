/**
 * The checks a change can reach: which test files and which mutations a
 * change to some files can make give another result. A Lion program in
 * `affected.json` picks them from a map of what each test file reached when
 * it last ran, the source files whose functions it ran, the files it read,
 * and whether it ran git, which reads files the map cannot see.
 *
 * Every change in the program has an id, so the same rules pick the checks
 * for the working tree, for each commit of a replay, and for each listed
 * mutation, whose own change is the file it breaks. A mutation whose
 * declared tests are not picked for its own change is unsound: picking
 * would skip a test that catches it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import { evaluate, type Lion } from "./lion.ts";
import { DEFAULT_TESTS, type Mutation } from "./mutation.ts";

/** What one test file reached when it last ran. */
export interface Reached {
  /**
   * The named functions it ran, as file and name. A map made before these
   * were kept has none, and its changes are read a file at a time.
   */
  readonly functions?: readonly (readonly [string, string])[];
  /** The package it is in, as the folder, such as `packages/core`. */
  readonly package: string;
  /** The packages whose built code it ran where no source file is known. */
  readonly packages: readonly string[];
  /** Files of the repository whose functions it ran, or that it read. */
  readonly reaches: readonly string[];
  /** Whether it ran git, and so may read any file. */
  readonly repository: boolean;
  /** How long it took, in seconds. */
  readonly seconds: number;
  /** Its path from the repository root. */
  readonly test: string;
}

/** What every test reached, at a commit. */
export interface ReachMap {
  readonly commit: string;
  /**
   * The files the repository held at the commit, when git still has it. A
   * file it lacks is new since, so no test was seen to reach it.
   */
  readonly files?: readonly string[];
  readonly tests: readonly Reached[];
}

/**
 * Some files changed together, under an id. `functions` names the named
 * functions that hold its changed lines, as file and name, and `whole` the
 * files where a changed line is in no named function, or that are no
 * script. A change without them is read a file at a time.
 */
export interface Change {
  readonly files: readonly string[];
  readonly functions?: readonly (readonly [string, string])[];
  readonly id: string;
  readonly whole?: readonly string[];
}

/**
 * A mutation as the rules see it: the file it breaks and the tests that
 * should catch it, and, when the file's named functions are known, the
 * ones its text is in, or `"whole"` when it is in none.
 */
export interface Checked {
  readonly file: string;
  readonly functions?: readonly string[] | "whole";
  readonly name: string;
  readonly tests: readonly string[];
}

/** A mutation as a change read by function. */
const functionsOfMutation = (m: Checked) =>
  m.functions === "whole" || m.functions === undefined
    ? { functions: [], whole: [m.file] }
    : {
        functions: m.functions.map((n) => [m.file, n] as const),
        whole: [],
      };

/**
 * What the project record's rules protect: each probe's case and the paths
 * it reads, and each rule and the cases it predicts (see `at-risk.ts`).
 */
export interface Protections {
  readonly predicts: readonly (readonly [string, string])[];
  readonly reads: readonly (readonly [string, string])[];
}

/** What the rules pick. */
export interface Picked {
  /** The rules in force each change puts at risk, by change. */
  readonly atRisk: Readonly<Record<string, readonly string[]>>;
  /** Each change's picked mutations. */
  readonly mutations: Readonly<Record<string, readonly string[]>>;
  /** Each change's picked test files. */
  readonly tests: Readonly<Record<string, readonly string[]>>;
  /** Each change's files that no test reached. */
  readonly unmapped: Readonly<Record<string, readonly string[]>>;
  /** Mutations whose declared tests are not picked for their own change. */
  readonly unsound: readonly (readonly [string, string])[];
}

const RULES = join(import.meta.dirname, "affected.json");

/** The rules, as the forms of their program. */
const rules = (): readonly unknown[] =>
  (JSON.parse(readFileSync(RULES, "utf8")) as unknown[]).slice(1);

/** The folder of a package, from its name in a mutation: `packages/<name>`. */
export const packageFolder = (name = "core") => `packages/${name}`;

/** A mutation's file and the tests that should catch it, from the repository root. */
export const checkedOf = (mutation: Mutation): Checked => {
  const folder = packageFolder(mutation.package);
  return {
    file: mutation.file,
    name: mutation.name,
    tests: (mutation.tests ?? DEFAULT_TESTS).map((test) => `${folder}/${test}`),
  };
};

const quoted = (value: unknown) => ["quote", value];

const fact = (relation: string, rows: readonly (readonly unknown[])[]) =>
  rows.length === 0
    ? []
    : [["fact", ...rows.map((row) => [relation, ...row.map(quoted)])]];

/** The program that asks the rules what each change picks. */
export const programOf = (
  map: ReachMap,
  changes: readonly Change[],
  mutations: readonly Checked[],
  asMutations: readonly Checked[] = [],
  protections: Protections = { predicts: [], reads: [] }
): unknown => {
  const packages = [
    ...new Set([
      ...map.tests.map((t) => t.package),
      ...map.tests.flatMap((t) => t.packages),
    ]),
  ];
  const asked: Change[] = [
    ...changes,
    ...asMutations.map((m) => ({
      files: [m.file],
      id: m.name,
      ...(m.functions === undefined ? {} : functionsOfMutation(m)),
    })),
  ];
  // A change read by function names the files it touches apart from the
  // files it changes whole; one read a file at a time changes every file.
  const wholeOf = (c: Change) =>
    c.whole === undefined || c.functions === undefined ? c.files : c.whole;
  const touchedOf = (c: Change) =>
    c.files.filter((f) => !wholeOf(c).includes(f));
  const touchedFiles = new Set(asked.flatMap(touchedOf));
  const held = map.files === undefined ? undefined : new Set(map.files);
  const newFiles = [
    ...new Set([
      ...asked.flatMap((c) => c.files),
      ...mutations.map((m) => m.file),
    ]),
  ].filter((f) => held !== undefined && !held.has(f));
  return [
    "begin",
    ...rules(),
    ...fact(
      "package",
      packages.map((p) => [p])
    ),
    ...fact(
      "test",
      map.tests.map((t) => [t.test, t.package, t.seconds])
    ),
    ...fact(
      "reaches",
      map.tests.flatMap((t) => t.reaches.map((f) => [t.test, f]))
    ),
    ...fact(
      "reaches_package",
      map.tests.flatMap((t) => t.packages.map((p) => [t.test, p]))
    ),
    ...fact(
      "reads_repository",
      map.tests.filter((t) => t.repository).map((t) => [t.test])
    ),
    ...fact(
      "changed",
      asked.flatMap((c) => wholeOf(c).map((f) => [c.id, f]))
    ),
    ...fact(
      "touched",
      asked.flatMap((c) => touchedOf(c).map((f) => [c.id, f]))
    ),
    ...fact(
      "function_change",
      asked.flatMap((c) =>
        c.whole === undefined || c.functions === undefined
          ? []
          : c.functions.map(([f, n]) => [c.id, f, n])
      )
    ),
    ...fact(
      "reaches_function",
      map.tests.flatMap((t) =>
        (t.functions ?? [])
          .filter(([f]) => touchedFiles.has(f))
          .map(([f, n]) => [t.test, f, n])
      )
    ),
    ...fact(
      "new_file",
      newFiles.map((f) => [f])
    ),
    ...fact(
      "mutation",
      mutations.map((m) => [m.name, m.file])
    ),
    ...fact("probe_reads", protections.reads),
    ...fact("predicts", protections.predicts),
    ...fact(
      "mutation_test",
      mutations.flatMap((m) => m.tests.map((t) => [m.name, t]))
    ),
    {
      atRisk: ["find", ["array/make", "?c", "?r"], ["at_risk", "?c", "?r"]],
      mutations: [
        "find",
        ["array/make", "?c", "?m"],
        ["picked_mutation", "?c", "?m"],
      ],
      tests: ["find", ["array/make", "?c", "?t"], ["picked", "?c", "?t"]],
      unmapped: ["find", ["array/make", "?c", "?f"], ["unmapped", "?c", "?f"]],
      unsound: ["find", ["array/make", "?m", "?t"], ["unsound", "?m", "?t"]],
    },
  ];
};

/** Rows of change and item, grouped by change, each list sorted. */
const grouped = (rows: readonly (readonly [string, string])[]) => {
  const groups: Record<string, string[]> = {};
  for (const [change, item] of rows) {
    groups[change] = [...(groups[change] ?? []), item];
  }
  for (const list of Object.values(groups)) {
    list.sort();
  }
  return groups;
};

/** Asks the rules, run by `lion`, what each change picks. */
export const pick = (
  lion: Lion,
  map: ReachMap,
  changes: readonly Change[],
  mutations: readonly Checked[],
  asMutations: readonly Checked[] = [],
  protections?: Protections
): Effect.Effect<Picked, string> =>
  evaluate(
    lion,
    programOf(map, changes, mutations, asMutations, protections)
  ).pipe(
    Effect.flatMap((outcome) => {
      if (!outcome.ok) {
        return Effect.fail(outcome.error);
      }
      const value = outcome.value as Record<
        string,
        (readonly [string, string])[]
      >;
      const unique = (rows: (readonly [string, string])[] | undefined) => [
        ...new Map(
          (rows ?? []).map((row) => [JSON.stringify(row), row] as const)
        ).values(),
      ];
      return Effect.succeed({
        atRisk: grouped(unique(value.atRisk)),
        mutations: grouped(unique(value.mutations)),
        tests: grouped(unique(value.tests)),
        unmapped: grouped(unique(value.unmapped)),
        unsound: unique(value.unsound).sort(
          ([a, b], [c, d]) => Number(a + b > c + d) - Number(a + b < c + d)
        ),
      });
    })
  );
