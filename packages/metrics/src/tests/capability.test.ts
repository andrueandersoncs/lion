/**
 * The capability corpus and its grader. The public tasks' reference
 * programs are a ratchet: every one must pass its check, so a change to
 * Lion that breaks one fails here. The grader is checked against a plain
 * model of what passing means, and the loader against the files it was
 * given.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";
import {
  type Graded,
  grade,
  HELD_OUT_VARIABLE,
  heldOutFolder,
  loadCorpus,
  loadSolutions,
  PILLARS,
  type Pillar,
  PUBLIC_CORPUS,
  type Task,
  tally,
} from "../capability.ts";
import { canonical, evaluate, load } from "../lion.ts";
import { CORE, REPOSITORY } from "../sources.ts";
import { between, element, oneOf, word } from "./generators.ts";

/** The evaluator of the working tree and the public corpus, loaded once. */
const lion = Effect.runPromise(load(join(REPOSITORY, CORE)));
const corpus = lion.then((evaluator) =>
  Effect.runPromise(loadCorpus(evaluator, PUBLIC_CORPUS))
);
const loaded = Effect.promise(() =>
  Promise.all([lion, corpus]).then(([evaluator, tasks]) => ({
    corpus: tasks,
    lion: evaluator,
  }))
);

/** A JSON value of a few levels. */
const leaf: Arbitrary.Arbitrary<unknown> = oneOf<unknown>(
  between(-5, 5),
  word,
  element([true, false, null])
);
const json: Arbitrary.Arbitrary<unknown> = oneOf<unknown>(
  leaf,
  Arbitrary.array(leaf, { maxLength: 4 }),
  Arbitrary.map(
    Arbitrary.array(Arbitrary.all([word, leaf]), { maxLength: 3 }),
    (entries) => Object.fromEntries(entries)
  ),
  Arbitrary.array(Arbitrary.array(leaf, { maxLength: 3 }), { maxLength: 3 })
);

/** A task with only what the grader reads. */
const taskOf = (
  check: unknown,
  inputs: Record<string, unknown> = {},
  pillar: Pillar = "computation"
): Task => ({
  check,
  id: "generated",
  inputs,
  origin: "a property",
  pillar,
  statement: "a generated task",
  tags: [],
});

describe("the public corpus", () => {
  it.effect.prop(
    "every reference program passes its check, whatever order the tasks are graded in",
    {
      keys: Arbitrary.array(between(0, 1_000_000), {
        maxLength: 80,
        minLength: 80,
      }),
    },
    ({ keys }) =>
      Effect.gen(function* () {
        const { corpus: tasks, lion: evaluator } = yield* loaded;
        expect(tasks.problems).toEqual([]);
        const order = tasks.tasks
          .map((task, at) => ({ key: keys[at % keys.length] ?? at, task }))
          .sort((a, b) => a.key - b.key)
          .map(({ task }) => task);
        const graded: Graded[] = [];
        for (const task of order) {
          const program = tasks.solutions.get(task.id);
          graded.push({
            task,
            verdict:
              program === undefined
                ? undefined
                : yield* grade(evaluator, task, program),
          });
        }
        expect(graded.filter((each) => each.verdict?.passed === false)).toEqual(
          []
        );
        expect(
          tasks.tasks.filter(
            (task) => tasks.solutions.has(task.id) === tasks.gaps.has(task.id)
          )
        ).toEqual([]);
        expect(tally(graded)).toEqual(
          PILLARS.map((pillar) => {
            const mine = tasks.tasks.filter((task) => task.pillar === pillar);
            return {
              passed: mine.filter((task) => tasks.solutions.has(task.id))
                .length,
              pillar,
              total: mine.length,
            };
          })
        );
      }),
    { arbitrary: { runs: 2 } }
  );

  it.effect.prop(
    "no check passes a generated value, unless it is what the reference program gives",
    { value: json },
    ({ value }) =>
      Effect.gen(function* () {
        const { corpus: tasks, lion: evaluator } = yield* loaded;
        for (const task of tasks.tasks) {
          const made = yield* evaluate(evaluator, task.check, {
            environment: task.inputs,
          });
          expect(made.ok && typeof made.value === "function").toBe(true);
          const verdict = yield* grade(evaluator, task, ["quote", value]);
          if (verdict.passed) {
            const reference = tasks.solutions.get(task.id);
            const given =
              reference === undefined
                ? undefined
                : yield* evaluate(evaluator, reference, {
                    environment: task.inputs,
                  });
            expect(given?.ok && canonical(given.value)).toBe(canonical(value));
          }
        }
      }),
    { arbitrary: { runs: 20 } }
  );
});

const PROGRAM_FAILED = /^the program failed/;
const NOT_JSON = /is not JSON/;

/** How a generated program gives its value. */
const PROGRAMS = ["quoted", "input", "fails"] as const;
/** How a generated check judges it. */
const CHECKS = ["equals", "is-true"] as const;

const gradedCase = Arbitrary.all({
  check: element(CHECKS),
  expected: json,
  given: oneOf<unknown>(json, element([true])),
  pillar: element(PILLARS),
  program: element(PROGRAMS),
  same: element([true, false]),
});

describe("grade", () => {
  it.effect.prop(
    "passes a task exactly when the program runs and its check gives true, and tally counts the passes",
    { cases: Arbitrary.array(gradedCase, { maxLength: 6 }) },
    ({ cases }) =>
      Effect.gen(function* () {
        const evaluator = yield* Effect.promise(() => lion);
        const graded: Graded[] = [];
        for (const each of cases) {
          const value = each.same ? each.expected : each.given;
          const check =
            each.check === "equals"
              ? ["lambda", ["r"], ["=", "r", ["quote", each.expected]]]
              : ["lambda", ["r"], "r"];
          const inputs = each.program === "input" ? { given: value } : {};
          const program = {
            fails: ["func/raise", "no answer"],
            input: "given",
            quoted: ["quote", value],
          }[each.program];
          const task = taskOf(check, inputs, each.pillar);
          const verdict = yield* grade(evaluator, task, program);
          const expected =
            each.program !== "fails" &&
            (each.check === "equals"
              ? canonical(value) === canonical(each.expected)
              : value === true);
          expect(verdict.passed).toBe(expected);
          if (each.program === "fails") {
            expect(verdict.passed === false && verdict.reason).toMatch(
              PROGRAM_FAILED
            );
          }
          graded.push({ task, verdict });
        }
        expect(tally(graded)).toEqual(
          PILLARS.map((pillar) => {
            const mine = graded.filter((each) => each.task.pillar === pillar);
            return {
              passed: mine.filter((each) => each.verdict?.passed).length,
              pillar,
              total: mine.length,
            };
          })
        );
      })
  );

  it.effect.prop(
    "makes the check where the program's names mean nothing, and calls it in the program's database",
    {
      edges: Arbitrary.array(Arbitrary.all([between(0, 3), between(0, 3)]), {
        maxLength: 5,
      }),
      name: word,
    },
    ({ edges, name }) =>
      Effect.gen(function* () {
        const evaluator = yield* Effect.promise(() => lion);
        const relation = `${name}_edge`;
        const defined = `${name}_count`;
        const program = [
          "begin",
          ["relation", relation, ["from", "to"]],
          ["define", defined, 0],
          ...edges.map(([from, to]) => ["fact", [relation, from, to]]),
          [
            "lambda",
            [],
            ["find", ["array/make", "?a", "?b"], [relation, "?a", "?b"]],
          ],
        ];
        const pairs = [
          ...new Set(edges.map((edge) => JSON.stringify(edge))),
        ].map((edge) => JSON.parse(edge) as unknown);
        const check = [
          "lambda",
          ["asks"],
          [
            "and",
            ["=", relation, ["quote", relation]],
            ["=", defined, ["quote", defined]],
            [
              "=",
              ["aggregate/unique", ["asks"]],
              ["aggregate/unique", ["quote", pairs]],
            ],
          ],
        ];
        const verdict = yield* grade(evaluator, taskOf(check), program);
        expect(verdict).toEqual({ passed: true });
      }),
    { arbitrary: { runs: 50 } }
  );
});

/** What a generated file of a corpus folder is. */
const ENTRIES = [
  "solved",
  "gap",
  "unsolved",
  "bad-pillar",
  "wrong-id",
  "orphan-solution",
  "orphan-gap",
  "gap-and-solution",
  "not-json",
] as const;
type Entry = (typeof ENTRIES)[number];

const PROBLEMS: ReadonlySet<Entry> = new Set([
  "bad-pillar",
  "wrong-id",
  "orphan-solution",
  "orphan-gap",
  "gap-and-solution",
  "not-json",
]);

const fileOf = (id: string, pillar: string) => ({
  check: ["lambda", ["r"], true],
  id,
  inputs: {},
  origin: "a property",
  pillar,
  statement: "a generated task",
  tags: ["generated"],
});

describe("loadCorpus", () => {
  it.effect.prop(
    "loads the tasks, solutions, and gaps a folder holds, and says what is wrong with the rest",
    { entries: Arbitrary.array(element(ENTRIES), { maxLength: 8 }) },
    ({ entries }) =>
      Effect.gen(function* () {
        const evaluator = yield* Effect.promise(() => lion);
        const folder = mkdtempSync(join(tmpdir(), "lion-corpus-"));
        try {
          mkdirSync(join(folder, "tasks"));
          mkdirSync(join(folder, "solutions"));
          const gaps: Record<string, string> = {};
          const write = (path: string, value: unknown) =>
            writeFileSync(join(folder, path), JSON.stringify(value));
          entries.forEach((entry, at) => {
            const id = `t${at}`;
            if (entry !== "orphan-solution" && entry !== "orphan-gap") {
              if (entry === "not-json") {
                writeFileSync(
                  join(folder, "tasks", `${id}.json`),
                  "{ not json"
                );
              } else {
                write(
                  `tasks/${id}.json`,
                  fileOf(
                    entry === "wrong-id" ? `${id}-other` : id,
                    entry === "bad-pillar" ? "poetry" : "logic"
                  )
                );
              }
            }
            if (
              ["solved", "orphan-solution", "gap-and-solution"].includes(entry)
            ) {
              write(`solutions/${id}.json`, ["quote", at]);
            }
            if (["gap", "orphan-gap", "gap-and-solution"].includes(entry)) {
              gaps[id] = "what Lion lacks";
            }
          });
          write("gaps.json", gaps);
          const found = yield* loadCorpus(evaluator, folder);
          const ids = (kinds: readonly Entry[]) =>
            entries.flatMap((entry, at) =>
              kinds.includes(entry) ? [`t${at}`] : []
            );
          expect(found.tasks.map((task) => task.id)).toEqual(
            ids(["solved", "gap", "unsolved", "gap-and-solution"])
          );
          expect([...found.solutions.keys()]).toEqual(
            ids(["solved", "gap-and-solution"])
          );
          expect([...found.gaps.keys()]).toEqual(ids(["gap"]));
          expect(found.problems).toHaveLength(
            entries.filter((entry) => PROBLEMS.has(entry)).length
          );
        } finally {
          rmSync(folder, { force: true, recursive: true });
        }
      }),
    { arbitrary: { runs: 50 } }
  );

  it.effect.prop(
    "reads back every program of a folder of solutions, and a file that is not JSON is a program that fails",
    {
      programs: Arbitrary.array(oneOf<unknown>(json, element(["not json"])), {
        maxLength: 5,
      }),
    },
    ({ programs }) =>
      Effect.gen(function* () {
        const evaluator = yield* Effect.promise(() => lion);
        const folder = mkdtempSync(join(tmpdir(), "lion-solutions-"));
        try {
          for (const [at, program] of programs.entries()) {
            writeFileSync(
              join(folder, `p${at}.json`),
              program === "not json"
                ? "[unclosed"
                : JSON.stringify(["quote", program])
            );
          }
          const read = loadSolutions(folder);
          expect([...read.keys()].sort()).toEqual(
            programs.map((_, at) => `p${at}`).sort()
          );
          for (const [at, program] of programs.entries()) {
            const outcome = yield* evaluate(evaluator, read.get(`p${at}`));
            if (program === "not json") {
              expect(outcome.ok === false && outcome.error).toMatch(NOT_JSON);
            } else {
              expect(outcome.ok && canonical(outcome.value)).toBe(
                canonical(program)
              );
            }
          }
        } finally {
          rmSync(folder, { force: true, recursive: true });
        }
      }),
    { arbitrary: { runs: 30 } }
  );
});

describe("heldOutFolder", () => {
  it.prop(
    "takes a folder outside the repository, refuses one inside it, and is nothing when unset",
    {
      depth: between(0, 3),
      inside: element([true, false]),
      parts: Arbitrary.array(word, { maxLength: 3 }),
      set: element([true, false]),
    },
    ({ depth, inside, parts, set }) => {
      const repository = join(tmpdir(), "repository");
      const named = inside
        ? join(repository, ...parts)
        : join(
            repository,
            ...Array.from({ length: depth + 1 }, () => ".."),
            "held",
            ...parts
          );
      const found = heldOutFolder(
        set ? { [HELD_OUT_VARIABLE]: named } : { [HELD_OUT_VARIABLE]: "" },
        repository
      );
      if (!set) {
        expect(found).toEqual({});
      } else if (inside) {
        expect("error" in found).toBe(true);
      } else {
        expect(found).toEqual({ folder: named });
      }
    }
  );
});
