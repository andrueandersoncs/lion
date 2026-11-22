/**
 * The capability corpus: tasks for Lion's three pillars, general
 * computation, logic programming, and formal proofs, each judged by a Lion
 * lambda, and the programs that solve them. Lion does the grading: a task's
 * `check` is called with what a program gave, and the task is passed when
 * the check gives `true`.
 *
 * A corpus is a folder:
 *
 * - `tasks/<id>.json`, one task each, `{id, pillar, statement, inputs,
 *   check, tags, origin}`, which must fit the Lion schema in the public
 *   corpus's `task.json`;
 * - `solutions/<id>.json`, the Lion program that solves the task;
 * - `gaps.json`, optional, `{"<id>": "what Lion lacks"}` for each task Lion
 *   cannot express yet, which therefore has no solution.
 *
 * The public corpus is `packages/metrics/corpus/`, where each task has its
 * reference program. The held-out corpus has the same layout, in a folder
 * outside the repository that `LION_HELD_OUT` names.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Effect } from "effect";
import { canonical, evaluate, type Lion, newDatabase } from "./lion.ts";
import { REPOSITORY } from "./sources.ts";

/** What Lion is for, and what each task tests. */
export const PILLARS = ["computation", "logic", "proofs"] as const;
export type Pillar = (typeof PILLARS)[number];

/** One task, as its file holds it. */
export interface Task {
  /** Lion code that gives a function of one argument: what a program gave. */
  readonly check: unknown;
  readonly id: string;
  /** Names the program and the check both see, bound to these values. */
  readonly inputs: Readonly<Record<string, unknown>>;
  /** Where the task comes from, such as a textbook exercise. */
  readonly origin: string;
  readonly pillar: Pillar;
  /** What a program must do, in words. */
  readonly statement: string;
  /** The features of Lion a program needs. */
  readonly tags: readonly string[];
}

/** The tasks of a folder, the programs that solve them, and its gaps. */
export interface Corpus {
  /** Why each task that has no solution cannot be solved in Lion yet. */
  readonly gaps: ReadonlyMap<string, string>;
  /** What is wrong with the folder: each problem, as a sentence. */
  readonly problems: readonly string[];
  readonly solutions: ReadonlyMap<string, unknown>;
  readonly tasks: readonly Task[];
}

/** The public corpus. */
export const PUBLIC_CORPUS = join(REPOSITORY, "packages/metrics/corpus");

/**
 * The folder of the outside suites: tasks drawn from benchmarks of other
 * fields, such as OpenRuleBench for rule engines and SV-COMP for software
 * verifiers, each suite a folder of its own with the corpus's layout.
 */
export const OUTSIDE_SUITES = join(REPOSITORY, "packages/metrics/suites");

/** The outside suites, by name, each with its folder, in order of name. */
export const outsideSuites = (
  folder: string = OUTSIDE_SUITES
): { readonly folder: string; readonly name: string }[] =>
  existsSync(folder)
    ? readdirSync(folder, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
        .map((name) => ({ folder: join(folder, name), name }))
    : [];

/** The variable that names the held-out corpus's folder. */
export const HELD_OUT_VARIABLE = "LION_HELD_OUT";

/**
 * The held-out corpus's folder, from the environment: nothing when the
 * variable is unset or empty, and an error when it names a folder inside
 * the repository, where the agents that are scored could read its tasks.
 */
export const heldOutFolder = (
  environment: Readonly<Record<string, string | undefined>>,
  repository: string = REPOSITORY
): { readonly folder?: string } | { readonly error: string } => {
  const named = environment[HELD_OUT_VARIABLE];
  if (named === undefined || named === "") {
    return {};
  }
  const folder = resolve(named);
  const from = relative(resolve(repository), folder);
  const outside =
    isAbsolute(from) || from === ".." || from.startsWith(`..${sep}`);
  return outside
    ? { folder }
    : {
        error: `${HELD_OUT_VARIABLE} names ${folder}, which is inside the repository: keep held-out tasks outside it, where no agent that is scored can read them.`,
      };
};

const JSON_FILE = /\.json$/;

/** The JSON files of a folder, by name, in order; none when it is missing. */
const jsonFiles = (folder: string): readonly string[] =>
  existsSync(folder)
    ? readdirSync(folder)
        .filter((name) => JSON_FILE.test(name))
        .sort()
    : [];

const read = (path: string): { value: unknown } | { error: string } => {
  try {
    return { value: JSON.parse(readFileSync(path, "utf8")) as unknown };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

/** The Lion program that gives the schema every task must fit. */
const taskSchema = (): unknown => {
  const read_ = read(join(PUBLIC_CORPUS, "task.json"));
  if ("error" in read_) {
    throw new Error(`The task schema cannot be read: ${read_.error}`);
  }
  return read_.value;
};

/** Where a value does not fit a schema, as Lion's `schema/problems` says. */
interface Misfit {
  readonly expected?: unknown;
  readonly found?: unknown;
  readonly path: readonly unknown[];
}

const said = (misfit: Misfit) => {
  const where = misfit.path.length === 0 ? "the task" : misfit.path.join(".");
  if (!("found" in misfit)) {
    return `${where} is missing`;
  }
  return "expected" in misfit
    ? `${where} must fit ${canonical(misfit.expected)} but is ${canonical(misfit.found)}`
    : `${where} is not a field of a task`;
};

/** A task file as a task, or what is wrong with it. */
const taskIn = (
  lion: Lion,
  schema: unknown,
  folder: string,
  name: string
): Effect.Effect<{ readonly task: Task } | { readonly problems: string[] }> =>
  Effect.gen(function* () {
    const file = read(join(folder, "tasks", name));
    if ("error" in file) {
      return { problems: [`tasks/${name} is not JSON: ${file.error}`] };
    }
    const fits = yield* evaluate(lion, [
      "schema/problems",
      ["quote", file.value],
      schema,
    ]);
    if (!fits.ok) {
      return { problems: [`tasks/${name} cannot be checked: ${fits.error}`] };
    }
    const misfits = fits.value as readonly Misfit[];
    if (misfits.length > 0) {
      return {
        problems: misfits.map((misfit) => `tasks/${name}: ${said(misfit)}`),
      };
    }
    const task = file.value as Task;
    if (task.id !== basename(name, ".json")) {
      return { problems: [`tasks/${name} holds the task "${task.id}"`] };
    }
    return { task };
  });

/** The solutions of a folder's tasks, adding what is wrong to `problems`. */
const solutionsIn = (
  folder: string,
  ids: ReadonlySet<string>,
  problems: string[]
): Map<string, unknown> => {
  const solutions = new Map<string, unknown>();
  for (const name of jsonFiles(join(folder, "solutions"))) {
    const id = basename(name, ".json");
    const file = read(join(folder, "solutions", name));
    if ("error" in file) {
      problems.push(`solutions/${name} is not JSON: ${file.error}`);
    } else if (ids.has(id)) {
      solutions.set(id, file.value);
    } else {
      problems.push(`solutions/${name} solves no task`);
    }
  }
  return solutions;
};

/** The gaps of a folder's tasks, adding what is wrong to `problems`. */
const gapsIn = (
  folder: string,
  ids: ReadonlySet<string>,
  solutions: ReadonlyMap<string, unknown>,
  problems: string[]
): Map<string, string> => {
  const gaps = new Map<string, string>();
  const gapsFile = join(folder, "gaps.json");
  if (!existsSync(gapsFile)) {
    return gaps;
  }
  const file = read(gapsFile);
  if ("error" in file) {
    problems.push(`gaps.json is not JSON: ${file.error}`);
    return gaps;
  }
  for (const [id, why] of Object.entries(
    file.value as Record<string, unknown>
  )) {
    if (!ids.has(id)) {
      problems.push(`gaps.json names "${id}", which is no task`);
    } else if (solutions.has(id)) {
      problems.push(
        `gaps.json names "${id}", which has a solution: take the gap out`
      );
    } else {
      gaps.set(id, String(why));
    }
  }
  return gaps;
};

/**
 * The tasks of a folder, the programs that solve them, and its gaps, with
 * what is wrong: a file that is not JSON, a task that does not fit the
 * schema in `task.json` or whose id is not its file's name, a gap or a
 * solution of no task, and a task with both a solution and a gap.
 */
export const loadCorpus = (lion: Lion, folder: string): Effect.Effect<Corpus> =>
  Effect.gen(function* () {
    const problems: string[] = [];
    const tasks: Task[] = [];
    const schema = taskSchema();
    for (const name of jsonFiles(join(folder, "tasks"))) {
      const found = yield* taskIn(lion, schema, folder, name);
      if ("task" in found) {
        tasks.push(found.task);
      } else {
        problems.push(...found.problems);
      }
    }
    const ids = new Set(tasks.map((task) => task.id));
    const solutions = solutionsIn(folder, ids, problems);
    const gaps = gapsIn(folder, ids, solutions, problems);
    return { gaps, problems, solutions, tasks };
  });

/** Whether a program passed a task, and why not when it did not. */
export type Verdict =
  | { readonly passed: true }
  | { readonly passed: false; readonly reason: string };

const failed = (reason: string): Verdict => ({ passed: false, reason });

/**
 * Runs a program with the task's inputs bound, then calls the task's check
 * with what it gave. The check is made in a run of its own, so the names
 * the program defines never change what the check's words mean, and it is
 * called in the program's database, so a function the program gave can ask
 * the relations the program declared.
 */
export const grade = (
  lion: Lion,
  task: Task,
  program: unknown
): Effect.Effect<Verdict> =>
  Effect.gen(function* () {
    const database = newDatabase(lion);
    const solved = yield* evaluate(lion, program, {
      database,
      environment: task.inputs,
    });
    if (!solved.ok) {
      return failed(`the program failed: ${solved.error}`);
    }
    const made = yield* evaluate(lion, task.check, {
      environment: task.inputs,
    });
    if (!made.ok) {
      return failed(`the check could not be made: ${made.error}`);
    }
    const judged = yield* evaluate(lion, ["check", "result"], {
      database,
      environment: { check: made.value, result: solved.value },
    });
    if (!judged.ok) {
      return failed(`the check failed: ${judged.error}`);
    }
    return judged.value === true
      ? { passed: true }
      : failed(`the check gave ${canonical(judged.value)}`);
  });

/** A task, and how the program for it did, or that it has none. */
export interface Graded {
  readonly task: Task;
  /** Nothing when no program solves the task. */
  readonly verdict: Verdict | undefined;
}

/** Grades every task of a corpus with its solution, when it has one. */
export const gradeCorpus = (
  lion: Lion,
  corpus: Corpus,
  solutions: ReadonlyMap<string, unknown> = corpus.solutions
): Effect.Effect<readonly Graded[]> =>
  Effect.forEach(corpus.tasks, (task): Effect.Effect<Graded> => {
    const program = solutions.get(task.id);
    return program === undefined
      ? Effect.succeed({ task, verdict: undefined })
      : Effect.map(grade(lion, task, program), (verdict) => ({
          task,
          verdict,
        }));
  });

/** A pillar's score: the tasks passed, of all its tasks. */
export interface Score {
  readonly passed: number;
  readonly pillar: Pillar;
  readonly total: number;
}

/** The score of each pillar, in the order of `PILLARS`. */
export const tally = (graded: readonly Graded[]): readonly Score[] =>
  PILLARS.map((pillar) => {
    const mine = graded.filter((each) => each.task.pillar === pillar);
    return {
      passed: mine.filter((each) => each.verdict?.passed === true).length,
      pillar,
      total: mine.length,
    };
  });

/**
 * The programs of a folder of solutions, `<id>.json` each, by id. A file
 * that is not JSON is a program that fails, saying so, since an attempt
 * that cannot be read has not solved its task.
 */
export const loadSolutions = (folder: string): ReadonlyMap<string, unknown> =>
  new Map(
    jsonFiles(folder).map((name): [string, unknown] => {
      const file = read(join(folder, name));
      return [
        basename(name, ".json"),
        "error" in file
          ? ["func/raise", `${name} is not JSON: ${file.error}`]
          : file.value,
      ];
    })
  );
