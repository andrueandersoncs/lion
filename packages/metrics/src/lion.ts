/**
 * Loads the evaluator from a source tree of @lionlang/core, the working tree
 * or a checkout of an earlier commit, and runs programs on it. Loading from
 * source means a tool can run the same program on two versions.
 */
import { Cause, Effect, Exit } from "effect";

type Run = (
  program: unknown,
  environment: Record<string, unknown>,
  options: { readonly database: unknown }
) => Effect.Effect<unknown, unknown>;

/** What the tools use of one version of the evaluator. */
export interface Lion {
  /** The names of the error classes this version exports. */
  readonly errors: readonly string[];
  /** The names of the special forms, when this version lists them. */
  readonly forms: readonly string[] | undefined;
  readonly LogicDatabase: new (options?: {
    readonly goalDirected?: boolean;
  }) => unknown;
  readonly run: Run;
  readonly stdlib: Readonly<Record<string, unknown>>;
}

/** What a program gave: its value, or the first line of why it failed. */
export type Outcome =
  | { readonly ok: true; readonly value: unknown }
  | { readonly error: string; readonly ok: false };

type Module = Readonly<Record<string, unknown>>;

const imported = (path: string): Effect.Effect<Module> =>
  Effect.promise(() => import(path) as Promise<Module>);

/** A module that an earlier version may not have. */
const optional = (path: string): Effect.Effect<Module> =>
  Effect.promise(() =>
    (import(path) as Promise<Module>).catch((): Module => ({}))
  );

const ERROR_NAME = /Error$/;

/** Loads the evaluator whose source is in `source`, such as `packages/core/src`. */
export const load = (source: string): Effect.Effect<Lion> =>
  Effect.gen(function* () {
    const evaluate = yield* imported(`${source}/evaluation/evaluate.ts`);
    const modules = yield* imported(`${source}/modules/index.ts`);
    const database = yield* imported(`${source}/logic/database.ts`);
    const schemas = yield* optional(`${source}/schemas/evaluation.ts`);
    const errors = yield* optional(`${source}/errors/evaluation.ts`);
    const forms = schemas.SPECIAL_FORM_NAMES;
    return {
      errors: Object.keys(errors).filter(
        (name) => ERROR_NAME.test(name) && typeof errors[name] === "function"
      ),
      forms: Array.isArray(forms) ? (forms as string[]) : undefined,
      LogicDatabase: database.LogicDatabase as Lion["LogicDatabase"],
      run: evaluate.run as Run,
      stdlib: modules.stdlib as Lion["stdlib"],
    };
  });

const firstLine = (text: string) => text.split("\n", 1)[0] ?? "";

const describe = (error: unknown): string => {
  if (typeof error !== "object" || error === null) {
    return String(error);
  }
  const { _tag, message } = error as { _tag?: unknown; message?: unknown };
  const text = firstLine(String(message ?? error));
  return typeof _tag === "string" && text === "" ? _tag : text;
};

export interface RunOptions {
  /** The database to run in; a new one when left out. */
  readonly database?: unknown;
  /** Bindings to add to the standard library. */
  readonly environment?: Readonly<Record<string, unknown>>;
  /** False to turn goal-directed queries off in a new database. */
  readonly goalDirected?: boolean;
}

/** A new, empty logic database of this version. */
export const newDatabase = (lion: Lion, goalDirected = true): unknown =>
  new lion.LogicDatabase(goalDirected ? {} : { goalDirected: false });

/** Runs a program and reports what it gave. It never fails. */
export const evaluate = (
  lion: Lion,
  program: unknown,
  options: RunOptions = {}
): Effect.Effect<Outcome> =>
  Effect.suspend(() =>
    lion.run(
      program,
      { ...lion.stdlib, ...options.environment },
      {
        database:
          options.database ?? newDatabase(lion, options.goalDirected ?? true),
      }
    )
  ).pipe(
    Effect.exit,
    Effect.map(
      (exit): Outcome =>
        Exit.isSuccess(exit)
          ? { ok: true, value: exit.value }
          : { error: describe(Cause.squash(exit.cause)), ok: false }
    )
  );

const sorted = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sorted);
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, sorted(record[key])])
    );
  }
  return value;
};

/**
 * Writes a value as text that is equal for equal values, whatever order
 * their records list their keys in. A logic value is written as the Lion
 * expression it shows as.
 */
export const canonical = (value: unknown): string => {
  try {
    // Parsing what JSON writes turns logic values into their written form.
    const written = JSON.stringify(value);
    return written === undefined
      ? String(value)
      : JSON.stringify(sorted(JSON.parse(written)));
  } catch {
    return String(value);
  }
};
