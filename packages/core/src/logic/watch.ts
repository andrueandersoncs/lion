/**
 * Watching a query: host code told when its answers change. A watcher holds
 * a query, as Lion code, the environment to run it in, and the answers it
 * gave last. After each change a `fact`, `retract`, `rule`, or `invariant`
 * form makes, the query is asked again of the database as it now is, with
 * its derived rows already kept up to date, and the watcher is told the
 * answers that came and went, when any did. A change refused, and what
 * `assuming` asks, change nothing, so they tell nothing.
 */
import { Effect } from "effect";
import type { LogicDatabase } from "@/logic/database";
import { valueKey } from "@/logic/terms";
import type { EvaluationError } from "@/types/evaluation";

/** What a watcher is told: the answers now, and those that came and went. */
export interface Watched {
  readonly added: readonly unknown[];
  readonly answers: readonly unknown[];
  readonly removed: readonly unknown[];
}

/** A query a host watches. */
interface Watcher {
  readonly ask: () => Effect.Effect<unknown, EvaluationError>;
  last: ReadonlyMap<string, unknown>;
  readonly onChange: (watched: Watched) => void;
}

const WATCHERS = new WeakMap<LogicDatabase, Set<Watcher>>();

/** The answers of a query, by their value, in the order given. */
const keyed = (answers: unknown): ReadonlyMap<string, unknown> =>
  new Map(
    (Array.isArray(answers) ? answers : [answers]).map((answer) => [
      valueKey(answer),
      answer,
    ])
  );

/** The answers in `a` that `b` does not have. */
const without = (
  a: ReadonlyMap<string, unknown>,
  b: ReadonlyMap<string, unknown>
) => [...a].filter(([key]) => !b.has(key)).map(([, answer]) => answer);

/**
 * Watches a query of a database: `ask` runs it, as `run` runs Lion code
 * against the database. Gives the answers now, and a function that stops
 * the watching; `onChange` is called after each change that adds or takes
 * away an answer.
 */
export const watchQuery = (
  database: LogicDatabase,
  ask: () => Effect.Effect<unknown, EvaluationError>,
  onChange: (watched: Watched) => void
) =>
  Effect.map(ask(), (answers) => {
    const watcher: Watcher = { ask, last: keyed(answers), onChange };
    const watchers = WATCHERS.get(database) ?? new Set<Watcher>();
    WATCHERS.set(database, watchers);
    watchers.add(watcher);
    return {
      answers,
      stop: () => {
        watchers.delete(watcher);
      },
    };
  });

/**
 * Tells each watcher of a database what its query gives now, when its
 * answers changed: run after a change the database kept.
 */
export const tellWatchers = (database: LogicDatabase) =>
  Effect.suspend(() => {
    const watchers = WATCHERS.get(database);
    if (watchers === undefined || watchers.size === 0) {
      return Effect.void;
    }
    return Effect.forEach(
      [...watchers],
      (watcher) =>
        Effect.map(watcher.ask(), (answers) => {
          const now = keyed(answers);
          const added = without(now, watcher.last);
          const removed = without(watcher.last, now);
          watcher.last = now;
          if (added.length > 0 || removed.length > 0) {
            watcher.onChange({
              added,
              answers: Array.isArray(answers) ? answers : [answers],
              removed,
            });
          }
        }),
      { discard: true }
    );
  });
