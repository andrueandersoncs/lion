/**
 * Incremental write-ahead journal (WAL), checkpoint compaction, optimistic
 * concurrency control, time-travel checkout, and persistent copy-on-write
 * branching for `LogicDatabase`.
 *
 * Keeps core strictly in-memory with zero I/O while providing a clean
 * `JournalStore` adapter interface for SQLite, Postgres, Durable Objects, or
 * file-backed stores. All persisted programs and snapshots are wire-encoded so
 * exact rationals (such as 1/3) and large integers round-trip losslessly.
 */
import { Effect, Exit } from "effect";
import { ConflictError, LogicError } from "@/errors/evaluation";
import { type RunOptions, run, runWithMetrics } from "@/evaluation/evaluate";
import type {
  DatabasePermissions,
  ExecutionLimits,
  ExecutionMetrics,
} from "@/evaluation/sandbox";
import { decodeWire, encodeWire } from "@/evaluation/wire";
import { LogicDatabase } from "@/logic/database";
import { loadDatabase, saveDatabase } from "@/logic/snapshot";
import type { EvaluationError } from "@/types/evaluation";

/** One committed transaction recorded in the append-only journal. */
export interface JournalEntry {
  readonly baseRevision: number;
  readonly meta?: Readonly<Record<string, unknown>>;
  /** Wire-encoded Lion program that reproduces this transaction's mutations. */
  readonly program: unknown;
  readonly revision: number;
  readonly timestampMs: number;
}

/** A compacted full-database snapshot at a specific journal revision. */
export interface JournalCheckpoint {
  readonly revision: number;
  /** Wire-encoded Lion snapshot program produced by `saveDatabase`. */
  readonly snapshot: unknown;
  readonly timestampMs: number;
}

/** Pluggable storage backend for journal entries and compacted checkpoints. */
export interface JournalStore {
  readonly append: (entry: JournalEntry) => Effect.Effect<void, LogicError>;
  readonly latestCheckpoint: (
    atOrBeforeRevision?: number
  ) => Effect.Effect<JournalCheckpoint | undefined, LogicError>;
  readonly readRange: (
    afterRevision: number,
    upToRevision?: number
  ) => Effect.Effect<readonly JournalEntry[], LogicError>;
  readonly saveCheckpoint: (
    checkpoint: JournalCheckpoint
  ) => Effect.Effect<void, LogicError>;
}

/** Default in-memory `JournalStore` for tests, workers, and embedded hosts. */
export class MemoryJournalStore implements JournalStore {
  private readonly entries: JournalEntry[] = [];
  private readonly checkpoints: JournalCheckpoint[] = [];

  append(entry: JournalEntry): Effect.Effect<void, LogicError> {
    return Effect.sync(() => {
      this.entries.push(entry);
    });
  }

  latestCheckpoint(
    atOrBeforeRevision?: number
  ): Effect.Effect<JournalCheckpoint | undefined, LogicError> {
    return Effect.sync(() => {
      let best: JournalCheckpoint | undefined;
      for (const cp of this.checkpoints) {
        if (
          (atOrBeforeRevision === undefined ||
            cp.revision <= atOrBeforeRevision) &&
          (best === undefined || cp.revision > best.revision)
        ) {
          best = cp;
        }
      }
      return best;
    });
  }

  readRange(
    afterRevision: number,
    upToRevision?: number
  ): Effect.Effect<readonly JournalEntry[], LogicError> {
    return Effect.sync(() =>
      this.entries.filter(
        (entry) =>
          entry.revision > afterRevision &&
          (upToRevision === undefined || entry.revision <= upToRevision)
      )
    );
  }

  saveCheckpoint(
    checkpoint: JournalCheckpoint
  ): Effect.Effect<void, LogicError> {
    return Effect.sync(() => {
      this.checkpoints.push(checkpoint);
    });
  }
}

export interface CommitOptions {
  /** Optimistic concurrency check: fails with `ConflictError` if stale. */
  readonly expectedRevision?: number;
  readonly limits?: ExecutionLimits;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly permissions?: DatabasePermissions;
}

export interface CommitResult {
  readonly changed: boolean;
  readonly entry: JournalEntry | undefined;
  readonly metrics: ExecutionMetrics;
  readonly revision: number;
  readonly value: unknown;
}

export interface Branch {
  readonly baseRevision: number;
  readonly journal: JournaledDatabase;
  readonly name: string;
}

/** Rebuilds a `LogicDatabase` from a checkpoint and subsequent journal entries. */
const replayIntoDatabase = (
  store: JournalStore,
  environment: Record<string, unknown>,
  upToRevision?: number
): Effect.Effect<
  { readonly database: LogicDatabase; readonly revision: number },
  EvaluationError
> =>
  Effect.gen(function* () {
    const checkpoint = yield* store.latestCheckpoint(upToRevision);
    let database = new LogicDatabase();
    let revision = 0;
    if (checkpoint !== undefined) {
      const snapshot = yield* decodeWire(checkpoint.snapshot);
      database = yield* loadDatabase(snapshot, environment);
      revision = checkpoint.revision;
    }
    const entries = yield* store.readRange(revision, upToRevision);
    for (const entry of entries) {
      const program = yield* decodeWire(entry.program);
      yield* run(program, environment, { database });
      revision = entry.revision;
    }
    return { database, revision };
  });

/**
 * A `LogicDatabase` backed by an append-only `JournalStore` with:
 * - whole-transaction atomicity (multi-form `begin` rolls back on failure),
 * - optimistic concurrency (`expectedRevision`),
 * - checkpoint compaction (`compact()`),
 * - time-travel reads (`checkout(revision)`),
 * - persistent copy-on-write branching (`fork()`) and merging (`merge()`).
 */
export class JournaledDatabase {
  private _database: LogicDatabase;
  private _revision: number;
  readonly store: JournalStore;
  private readonly environment: Record<string, unknown>;

  constructor(
    store: JournalStore,
    environment: Record<string, unknown>,
    database: LogicDatabase,
    revision: number
  ) {
    this.store = store;
    this.environment = environment;
    this._database = database;
    this._revision = revision;
  }

  get database(): LogicDatabase {
    return this._database;
  }

  get revision(): number {
    return this._revision;
  }

  /**
   * Evaluates a read-only expression against the current database state
   * (queries, `find`, `why`, `proof/*`, `assuming`). Persistent mutations are
   * blocked automatically.
   */
  read(
    expression: unknown,
    options: Pick<RunOptions, "limits" | "onMetrics"> = {}
  ): Effect.Effect<unknown, EvaluationError> {
    return run(expression, this.environment, {
      ...options,
      database: this._database,
      permissions: { readOnly: true },
    });
  }

  /**
   * Evaluates `program` as an atomic transaction.
   * - Checks `expectedRevision` before mutating.
   * - If `program` fails mid-way (even in a multi-form `begin`), rolls back to
   *   the pre-commit state and appends nothing to the journal.
   * - If the database changed, appends one wire-encoded `JournalEntry` and
   *   advances `revision`.
   */
  commit(
    program: unknown,
    options: CommitOptions = {}
  ): Effect.Effect<CommitResult, EvaluationError> {
    const self = this;
    return Effect.gen(function* () {
      if (
        options.expectedRevision !== undefined &&
        options.expectedRevision !== self._revision
      ) {
        return yield* Effect.fail(
          new ConflictError({
            actual: self._revision,
            expected: options.expectedRevision,
            message: `Expected revision ${options.expectedRevision}, but database is at revision ${self._revision}.`,
          })
        );
      }

      // Take a lightweight rollback snapshot only when multi-form programs
      // could partially mutate before a later form fails.
      const needsRollbackGuard =
        Array.isArray(program) && program[0] === "begin" && program.length > 2;
      const rollbackSnapshot = needsRollbackGuard
        ? yield* saveDatabase(self._database, {
            isBound: (name) => Object.hasOwn(self.environment, name),
          })
        : undefined;

      const dbRevisionBefore = self._database.revision;
      const runOptions: Omit<RunOptions, "onMetrics"> = {
        database: self._database,
        ...(options.limits === undefined ? {} : { limits: options.limits }),
        ...(options.permissions === undefined
          ? {}
          : { permissions: options.permissions }),
      };

      const outcome = yield* Effect.exit(
        runWithMetrics(program, self.environment, runOptions)
      );

      if (Exit.isFailure(outcome)) {
        if (
          rollbackSnapshot !== undefined &&
          self._database.revision !== dbRevisionBefore
        ) {
          self._database = yield* loadDatabase(
            rollbackSnapshot,
            self.environment
          );
        }
        return yield* Effect.failCause(outcome.cause);
      }

      const { metrics, value } = outcome.value;
      const changed = self._database.revision !== dbRevisionBefore;
      if (!changed) {
        return {
          changed: false,
          entry: undefined,
          metrics,
          revision: self._revision,
          value,
        };
      }

      const nextRevision = self._revision + 1;
      const entry: JournalEntry = {
        baseRevision: self._revision,
        ...(options.meta === undefined ? {} : { meta: options.meta }),
        program: encodeWire(program),
        revision: nextRevision,
        timestampMs: Date.now(),
      };
      yield* self.store.append(entry);
      self._revision = nextRevision;

      return {
        changed: true,
        entry,
        metrics,
        revision: nextRevision,
        value,
      };
    });
  }

  /** Saves a compacted snapshot checkpoint at the current revision. */
  compact(): Effect.Effect<JournalCheckpoint, LogicError> {
    const self = this;
    return Effect.gen(function* () {
      const snapshot = yield* saveDatabase(self._database, {
        isBound: (name) => Object.hasOwn(self.environment, name),
      });
      const checkpoint: JournalCheckpoint = {
        revision: self._revision,
        snapshot: encodeWire(snapshot),
        timestampMs: Date.now(),
      };
      yield* self.store.saveCheckpoint(checkpoint);
      return checkpoint;
    });
  }

  /** Reconstructs an isolated `LogicDatabase` at any historical revision. */
  checkout(
    targetRevision: number
  ): Effect.Effect<LogicDatabase, EvaluationError> {
    const self = this;
    return Effect.gen(function* () {
      if (targetRevision < 0 || targetRevision > self._revision) {
        return yield* Effect.fail(
          new LogicError({
            message: `Revision ${targetRevision} is out of range (current revision is ${self._revision}).`,
          })
        );
      }
      const { database } = yield* replayIntoDatabase(
        self.store,
        self.environment,
        targetRevision
      );
      return database;
    });
  }

  /**
   * Creates an independent, durable copy-on-write branch rooted at the current
   * revision (backed by a fresh store seeded with a checkpoint of this state).
   */
  fork(
    name = "branch",
    branchStore: JournalStore = new MemoryJournalStore()
  ): Effect.Effect<Branch, EvaluationError> {
    const self = this;
    return Effect.gen(function* () {
      const snapshot = yield* saveDatabase(self._database, {
        isBound: (nameKey) => Object.hasOwn(self.environment, nameKey),
      });
      const baseRevision = self._revision;
      const forkedDb = yield* loadDatabase(snapshot, self.environment);
      yield* branchStore.saveCheckpoint({
        revision: baseRevision,
        snapshot: encodeWire(snapshot),
        timestampMs: Date.now(),
      });
      return {
        baseRevision,
        journal: new JournaledDatabase(
          branchStore,
          self.environment,
          forkedDb,
          baseRevision
        ),
        name,
      };
    });
  }

  /**
   * Merges all commits made on `branch` since its `baseRevision` into this
   * database as a single atomic transaction, checking optimistic concurrency
   * unless `allowFastForwardOnly` is false.
   */
  merge(
    branch: Branch,
    options: Pick<CommitOptions, "limits" | "meta" | "permissions"> & {
      readonly requireBaseRevision?: boolean;
    } = {}
  ): Effect.Effect<CommitResult, EvaluationError> {
    const self = this;
    return Effect.gen(function* () {
      const entries = yield* branch.journal.store.readRange(
        branch.baseRevision
      );
      const programs = yield* Effect.forEach(entries, (entry) =>
        decodeWire(entry.program)
      );
      let combined: unknown = null;
      if (programs.length === 1) {
        combined = programs[0];
      } else if (programs.length > 1) {
        combined = ["begin", ...programs];
      }
      const expectedRevision =
        options.requireBaseRevision === false ? undefined : branch.baseRevision;
      return yield* self.commit(combined, {
        ...(expectedRevision === undefined ? {} : { expectedRevision }),
        ...(options.limits === undefined ? {} : { limits: options.limits }),
        ...(options.meta === undefined ? {} : { meta: options.meta }),
        ...(options.permissions === undefined
          ? {}
          : { permissions: options.permissions }),
      });
    });
  }
}

/**
 * Opens a `JournaledDatabase` by loading the latest checkpoint in `store` and
 * replaying any subsequent journal entries.
 */
export const openJournal = (
  store: JournalStore,
  environment: Record<string, unknown>
): Effect.Effect<JournaledDatabase, EvaluationError> =>
  Effect.map(
    replayIntoDatabase(store, environment),
    ({ database, revision }) =>
      new JournaledDatabase(store, environment, database, revision)
  );
