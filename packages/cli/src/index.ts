import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { analyze, flattenAnalysis } from "@lionlang/core/analysis/analyze";
import { lint } from "@lionlang/core/analysis/lint";
import { run } from "@lionlang/core/evaluation/evaluate";
import { readJson, writeJson } from "@lionlang/core/evaluation/reading";
import { headsOf } from "@lionlang/core/logic/compile";
import {
  LogicDatabase,
  mergeOption,
  relationBindings,
  writtenRules,
} from "@lionlang/core/logic/database";
import { keyColumns } from "@lionlang/core/logic/model";
import { loadDatabase, saveDatabase } from "@lionlang/core/logic/snapshot";
import {
  compareValues,
  render,
  schemaOf,
  valueKey,
} from "@lionlang/core/logic/terms";
import { stdlib } from "@lionlang/core/modules";
import { Console, Effect, Option } from "effect";
import { Argument, CliError, Command, Flag } from "effect/cli";

export const VERSION = "0.16.0";

const file = Argument.String("file").pipe(
  Argument.withDescription(
    "Path to a Lion JSON program, or - to read from standard input"
  ),
  Argument.optional
);

const files = Argument.String("file").pipe(
  Argument.withDescription(
    "Paths to Lion JSON programs (evaluated in order against one database), or - to read from standard input"
  ),
  Argument.atLeast(0)
);

const inspectFile = Argument.String("file").pipe(
  Argument.withDescription("Path to a saved Lion database file to inspect"),
  Argument.optional
);

const diffBeforeFile = Argument.String("before").pipe(
  Argument.withDescription("Path to the base Lion database file")
);

const diffAfterFile = Argument.String("after").pipe(
  Argument.withDescription(
    "Path to the updated Lion database file (omit when using --apply or --eval)"
  ),
  Argument.optional
);

const applyFlag = Flag.String("apply").pipe(
  Flag.withAlias("a"),
  Flag.withDescription(
    "Lion program file to apply in memory to the base database to preview its semantic diff (repeatable; never modifies disk)"
  ),
  Flag.atLeast(0)
);

const evalFlag = Flag.String("eval").pipe(
  Flag.withAlias("e"),
  Flag.withDescription("Lion JSON program given directly on the command line"),
  Flag.optional
);

const database = Flag.String("database").pipe(
  Flag.withDescription(
    "Lion JSON file that holds the logic database. It is loaded before the program runs and saved afterwards if changed."
  ),
  Flag.optional
);

const readOnlyFlag = Flag.Boolean("read-only").pipe(
  Flag.withAlias("r"),
  Flag.withDescription(
    "Load --database without writing any changes back to disk"
  ),
  Flag.withDefault(false)
);

const derivedFlag = Flag.Boolean("derived").pipe(
  Flag.withAlias("d"),
  Flag.withDescription(
    "Also evaluate rules to include total row counts (facts plus derived rows) per relation"
  ),
  Flag.withDefault(false)
);

const checkDatabase = Flag.String("database").pipe(
  Flag.withDescription(
    "Lion JSON file whose relations and schemas are in scope while checking the program. Never modified."
  ),
  Flag.optional
);

const bindFlag = Flag.String("bind").pipe(
  Flag.withAlias("b"),
  Flag.withDescription(
    "Bind a top-level name to a JSON value, as name=<json> (repeatable; exact numbers preserved)"
  ),
  Flag.atLeast(0)
);

const bindFileFlag = Flag.String("bind-file").pipe(
  Flag.withDescription(
    "Bind a top-level name to the JSON value in a file, as name=<path> (repeatable; exact numbers preserved)"
  ),
  Flag.atLeast(0)
);

const splitBinding = (flag: string, spec: string) => {
  const eq = spec.indexOf("=");
  const name = eq <= 0 ? "" : spec.slice(0, eq);
  return name.length === 0 || name === "__proto__"
    ? Effect.fail(
        new Error(
          `Invalid ${flag} ${JSON.stringify(spec)}: expected name=value with a valid name.`
        )
      )
    : Effect.succeed([name, spec.slice(eq + 1)] as const);
};

const readBindings = (binds: readonly string[], bindFiles: readonly string[]) =>
  Effect.gen(function* () {
    const out: Record<string, unknown> = {};
    for (const spec of bindFiles) {
      const [name, filePath] = yield* splitBinding("--bind-file", spec);
      const text = yield* Effect.tryPromise({
        try: () => readFile(filePath, "utf8"),
        catch: (cause) => cause,
      });
      out[name] = yield* readJson(text).pipe(
        Effect.mapError((cause) => new Error(`${filePath}: ${cause.message}`))
      );
    }
    for (const spec of binds) {
      const [name, raw] = yield* splitBinding("--bind", spec);
      out[name] = yield* readJson(raw).pipe(
        Effect.mapError(
          (cause) => new Error(`--bind ${name}: ${cause.message}`)
        )
      );
    }
    return out;
  });

const readStdin = () =>
  Effect.tryPromise({
    try: async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      return Buffer.concat(chunks).toString("utf8");
    },
    catch: (cause) => cause,
  });

const readProgramSource = (
  fileOption: Option.Option<string>,
  evalOption: Option.Option<string>
) => {
  const filePath = Option.getOrUndefined(fileOption);
  const inline = Option.getOrUndefined(evalOption);
  if (filePath !== undefined && inline !== undefined) {
    return Effect.fail(
      new Error("Give either a program file or --eval, not both.")
    );
  }
  if (inline !== undefined) {
    return Effect.succeed(inline);
  }
  if (filePath === "-") {
    return readStdin();
  }
  if (filePath !== undefined) {
    return Effect.tryPromise({
      try: () => readFile(filePath, "utf8"),
      catch: (cause) => cause,
    });
  }
  if (!process.stdin.isTTY) {
    return readStdin();
  }
  return Effect.fail(
    new Error("Give a program file, - for standard input, or --eval '<json>'.")
  );
};

const readProgramSources = (
  fileList: readonly string[],
  evalOption: Option.Option<string>
): Effect.Effect<
  readonly (readonly [string | undefined, string])[],
  unknown
> => {
  const inline = Option.getOrUndefined(evalOption);
  if (fileList.length > 0 && inline !== undefined) {
    return Effect.fail(
      new Error("Give either a program file or --eval, not both.")
    );
  }
  if (inline !== undefined) {
    return Effect.succeed([[undefined, inline]]);
  }
  if (fileList.length === 0) {
    if (!process.stdin.isTTY) {
      return Effect.map(readStdin(), (text) => [[undefined, text]] as const);
    }
    return Effect.fail(
      new Error(
        "Give a program file, - for standard input, or --eval '<json>'."
      )
    );
  }
  return Effect.forEach(fileList, (filePath) =>
    filePath === "-"
      ? Effect.map(readStdin(), (text) => ["-", text] as const)
      : Effect.tryPromise({
          try: () => readFile(filePath, "utf8"),
          catch: (cause) => cause,
        }).pipe(Effect.map((text) => [filePath, text] as const))
  );
};

/** One form per line, and one fact per line, so saved databases diff well. */
export const formatSnapshot = (program: readonly unknown[]) => {
  const [head, ...forms] = program;
  const lines = forms.map((form) =>
    Array.isArray(form) && form[0] === "fact"
      ? `["fact",\n    ${form
          .slice(1)
          .map((fact) => JSON.stringify(fact))
          .join(",\n    ")}]`
      : JSON.stringify(form)
  );
  return `[${JSON.stringify(head)}${lines.map((line) => `,\n  ${line}`).join("")}]\n`;
};

const loadExistingDatabase = (path: string) =>
  Effect.tryPromise({
    try: () => readFile(path, "utf8"),
    catch: (cause) => cause,
  }).pipe(
    Effect.flatMap((text) =>
      readJson(text).pipe(
        Effect.mapError((cause) => new Error(`${path}: ${cause.message}`)),
        Effect.flatMap((saved) => loadDatabase(saved, stdlib))
      )
    )
  );

const readDatabase = (path: string) =>
  Effect.tryPromise({
    try: () => readFile(path, "utf8"),
    catch: (cause) => cause,
  }).pipe(
    Effect.option,
    Effect.flatMap(
      Option.match({
        // A database file that does not exist yet starts empty.
        onNone: () =>
          Effect.succeed({ existed: false, store: new LogicDatabase() }),
        onSome: (text) =>
          readJson(text).pipe(
            Effect.mapError((cause) => new Error(`${path}: ${cause.message}`)),
            Effect.flatMap((saved) => loadDatabase(saved, stdlib)),
            Effect.map((store) => ({ existed: true, store }))
          ),
      })
    )
  );

const writeDatabase = (path: string, store: LogicDatabase) =>
  saveDatabase(store).pipe(
    Effect.flatMap((saved) =>
      Effect.tryPromise({
        try: () => writeFile(path, formatSnapshot(saved)),
        catch: (cause) => cause,
      })
    )
  );

const evaluateCommand = Command.make(
  "lion",
  {
    files,
    eval: evalFlag,
    database,
    readOnly: readOnlyFlag,
    bind: bindFlag,
    bindFile: bindFileFlag,
  },
  Effect.fn(
    function* ({
      files: fileList,
      eval: inline,
      database,
      readOnly,
      bind,
      bindFile,
    }) {
      const path = Option.getOrUndefined(database);
      const { existed, store } =
        path === undefined
          ? { existed: false, store: new LogicDatabase() }
          : yield* readDatabase(path);
      const before = store.revision;
      const bindings = yield* readBindings(bind, bindFile);
      const sources = yield* readProgramSources(fileList, inline);
      let result: unknown;
      for (const [label, text] of sources) {
        const program = yield* readJson(text).pipe(
          Effect.mapError((cause) =>
            label === undefined
              ? cause
              : new Error(`${label}: ${cause.message}`)
          )
        );
        result = yield* run(
          program,
          { ...stdlib, ...bindings },
          { database: store }
        ).pipe(
          Effect.mapError((cause) =>
            sources.length > 1 && label !== undefined
              ? new Error(
                  `${label}: ${cause instanceof Error ? cause.message : String(cause)}`
                )
              : cause
          )
        );
      }
      yield* Console.log(yield* writeJson(result, 2));
      if (
        path !== undefined &&
        !readOnly &&
        (!existed || store.revision !== before)
      ) {
        yield* writeDatabase(path, store);
      }
    },
    Effect.mapError((cause) => new CliError.UserError({ cause }))
  )
).pipe(Command.withDescription("Evaluate one or more Lion JSON programs"));

const host = Flag.String("host").pipe(
  Flag.withDescription("Host address for the graph editor"),
  Flag.withDefault("127.0.0.1")
);
const port = Flag.Int("port").pipe(
  Flag.withDescription("Port for the graph editor"),
  Flag.withDefault(3000)
);
const replEntry = new URL("./repl/server/index.mjs", import.meta.url);

const replCommand = Command.make(
  "repl",
  { host, port },
  Effect.fn(function* ({ host, port }) {
    if (port < 1 || port > 65_535) {
      return yield* new CliError.UserError({
        cause: new Error("Port must be between 1 and 65535."),
      });
    }

    process.env.NITRO_HOST = host;
    process.env.NITRO_PORT = String(port);
    yield* Effect.tryPromise({
      try: () => import(replEntry.href),
      catch: (cause) => new CliError.UserError({ cause }),
    });
    yield* Console.log(`Lion graph editor: http://${host}:${port}`);
    return yield* Effect.never;
  })
).pipe(Command.withDescription("Serve the Lion graph editor"));

// The build writes the worker beside the command, as dist/worker.js. From
// src/ and from dist/ alike, this names that file.
const workerScript = new URL("../dist/worker.js", import.meta.url);

const workerCommand = Command.make(
  "worker",
  {},
  Effect.fn(function* () {
    const script = yield* Effect.tryPromise({
      try: () => readFile(fileURLToPath(workerScript), "utf8"),
      catch: () =>
        new CliError.UserError({
          cause: new Error(
            `This lion command has no worker at ${fileURLToPath(workerScript)}: build it with \`bun run --cwd packages/cli build\`.`
          ),
        }),
    });
    yield* Console.log(script);
  })
).pipe(
  Command.withDescription(
    "Print the Lion evaluator as a Web Worker script, for a page that runs Lion in a browser. It loads a saved database and runs programs against it, as --database does."
  )
);

/**
 * What reading a program without running it finds: each part that would
 * fail when it runs, and each that is wrong though nothing fails, such as a
 * match case no value can reach, with where it stands as a JSON pointer.
 */
export const findings = (
  program: unknown,
  environment: Readonly<Record<string, unknown>> = stdlib
) =>
  flattenAnalysis(analyze(program as never, environment)).flatMap((node) => [
    ...(node.diagnostic === undefined
      ? []
      : [{ at: node.pointer, error: node.diagnostic }]),
    ...(node.warning === undefined
      ? []
      : [{ at: node.pointer, warning: node.warning }]),
  ]);

const checkCommand = Command.make(
  "check",
  {
    file,
    eval: evalFlag,
    database: checkDatabase,
    bind: bindFlag,
    bindFile: bindFileFlag,
  },
  Effect.fn(
    function* ({ file, eval: inline, database, bind, bindFile }) {
      const path = Option.getOrUndefined(database);
      const store =
        path === undefined ? undefined : (yield* readDatabase(path)).store;
      const bindings = yield* readBindings(bind, bindFile);
      const text = yield* readProgramSource(file, inline);
      const program = yield* readJson(text);
      const environment = {
        ...stdlib,
        ...(store === undefined
          ? {}
          : {
              ...relationBindings(store),
              ...Object.fromEntries(store.schemas),
            }),
        ...bindings,
      };
      const declared = store === undefined ? [] : [...store.relations.keys()];
      // What the analysis finds, then what the lints written in Lion find.
      const found = [
        ...findings(program, environment),
        ...(yield* lint(program, declared)),
      ];
      yield* Console.log(JSON.stringify(found, null, 2));
      if (found.some((each) => "error" in each)) {
        return yield* new CliError.UserError({
          cause: new Error("The program has parts that fail when they run."),
        });
      }
    },
    Effect.mapError((cause) =>
      cause instanceof CliError.UserError
        ? cause
        : new CliError.UserError({ cause })
    )
  )
).pipe(
  Command.withDescription(
    "Read a Lion JSON program without running it, and print what is wrong with it: parts that fail when they run, parts that are wrong though nothing fails, such as a match case no value can reach, and what the lints written as Lion rules find, such as a list written as a call"
  )
);

const ruleCountsByRelation = (store: LogicDatabase) => {
  const byRelation = new Map<string, Set<unknown>>();
  const allRules = new Set<unknown>();
  for (const rule of writtenRules(store.rules)) {
    if (rule.given) {
      continue;
    }
    allRules.add(rule.source);
    for (const head of headsOf(rule)) {
      const set = byRelation.get(head.relation.name) ?? new Set<unknown>();
      set.add(rule.source);
      byRelation.set(head.relation.name, set);
    }
  }
  return { byRelation, total: allRules.size };
};

const derivedRowCount = (
  store: LogicDatabase,
  relation: Parameters<typeof mergeOption>[0]
) =>
  Effect.map(
    run(
      ["query", [relation.name, ...relation.columns.map((_, at) => `?c${at}`)]],
      stdlib,
      { database: store }
    ),
    (found) => (Array.isArray(found) ? found.length : 0)
  );

export interface DatabaseSummary {
  readonly counts: {
    readonly facts: number;
    readonly invariants: number;
    readonly relations: number;
    readonly rules: number;
    readonly schemas: number;
  };
  readonly invariants: readonly {
    readonly assert: "none" | "some";
    readonly goal: unknown;
  }[];
  readonly relations: readonly {
    readonly columns: readonly string[];
    readonly facts: number;
    readonly key?: readonly string[];
    readonly merge?: Record<string, unknown>;
    readonly name: string;
    readonly rows?: number;
    readonly rules: number;
  }[];
  readonly schemas: readonly {
    readonly name: string;
    readonly shape: unknown;
  }[];
}

/** Structured ontology summary of a saved logic database. */
export const inspectDatabase = (
  store: LogicDatabase,
  options: { readonly derived?: boolean } = {}
): Effect.Effect<DatabaseSummary, unknown> =>
  Effect.gen(function* () {
    const { byRelation, total: totalRules } = ruleCountsByRelation(store);
    const sortedRelations = [...store.relations.values()].sort((a, b) =>
      a.name < b.name ? -1 : Number(a.name > b.name)
    );
    const relations = yield* Effect.forEach(sortedRelations, (relation) =>
      Effect.gen(function* () {
        const facts = store.facts.get(relation.name)?.size ?? 0;
        const merge = mergeOption(relation);
        const rows = options.derived
          ? yield* derivedRowCount(store, relation)
          : undefined;
        return {
          name: relation.name,
          columns: relation.columns,
          ...(relation.key === undefined
            ? {}
            : {
                key: keyColumns(relation).filter(
                  (col): col is string => col !== undefined
                ),
              }),
          ...(merge === undefined ? {} : { merge }),
          facts,
          rules: byRelation.get(relation.name)?.size ?? 0,
          ...(rows === undefined ? {} : { rows }),
        };
      })
    );
    const totalFacts = relations.reduce((acc, item) => acc + item.facts, 0);
    const schemas = [...store.schemas.entries()]
      .sort(([a], [b]) => (a < b ? -1 : Number(a > b)))
      .map(([name, fn]) => ({
        name,
        shape: render(schemaOf(fn)?.definition),
      }));
    const invariants = store.invariants.map(({ assert, goal }) => ({
      assert,
      goal: render(goal),
    }));
    return {
      relations,
      schemas,
      invariants,
      counts: {
        relations: relations.length,
        schemas: schemas.length,
        facts: totalFacts,
        rules: totalRules,
        invariants: invariants.length,
      },
    };
  });

const inspectCommand = Command.make(
  "inspect",
  {
    file: inspectFile,
    database: checkDatabase,
    derived: derivedFlag,
  },
  Effect.fn(
    function* ({ file: fileOption, database: dbOption, derived }) {
      const filePath = Option.getOrUndefined(fileOption);
      const dbPath = Option.getOrUndefined(dbOption);
      if (filePath !== undefined && dbPath !== undefined) {
        return yield* Effect.fail(
          new Error("Give either a database file or --database, not both.")
        );
      }
      const target = filePath ?? dbPath;
      if (target === undefined) {
        return yield* Effect.fail(
          new Error(
            "Give a database file to inspect, as `lion inspect model.json`."
          )
        );
      }
      const store = yield* loadExistingDatabase(target);
      const summary = yield* inspectDatabase(store, { derived });
      yield* Console.log(yield* writeJson(summary, 2));
    },
    Effect.mapError((cause) => new CliError.UserError({ cause }))
  )
).pipe(
  Command.withDescription(
    "Summarize a saved Lion database's relations, columns, keys, merges, schemas, invariants, and counts as JSON without modifying it"
  )
);

interface RelationSpec {
  readonly columns: readonly string[];
  readonly key?: readonly string[];
  readonly merge?: Record<string, unknown>;
}

export interface RowDelta {
  readonly added: readonly (readonly unknown[])[];
  readonly removed: readonly (readonly unknown[])[];
}

export interface DatabaseDiff {
  readonly counts: {
    readonly derivedAdded?: number;
    readonly derivedRemoved?: number;
    readonly factsAdded: number;
    readonly factsRemoved: number;
    readonly invariantsAdded: number;
    readonly invariantsRemoved: number;
    readonly relationsAdded: number;
    readonly relationsChanged: number;
    readonly relationsRemoved: number;
    readonly rulesAdded: number;
    readonly rulesRemoved: number;
    readonly schemasAdded: number;
    readonly schemasChanged: number;
    readonly schemasRemoved: number;
  };
  readonly derived?: Readonly<Record<string, RowDelta>>;
  readonly facts: Readonly<Record<string, RowDelta>>;
  readonly invariants: {
    readonly added: readonly {
      readonly assert: "none" | "some";
      readonly goal: unknown;
    }[];
    readonly removed: readonly {
      readonly assert: "none" | "some";
      readonly goal: unknown;
    }[];
  };
  readonly relations: {
    readonly added: readonly string[];
    readonly changed: readonly {
      readonly after: RelationSpec;
      readonly before: RelationSpec;
      readonly name: string;
    }[];
    readonly removed: readonly string[];
  };
  readonly rules: {
    readonly added: readonly unknown[];
    readonly removed: readonly unknown[];
  };
  readonly schemas: {
    readonly added: readonly string[];
    readonly changed: readonly string[];
    readonly removed: readonly string[];
  };
}

const relationSpec = (
  relation: Parameters<typeof mergeOption>[0]
): RelationSpec => {
  const merge = mergeOption(relation);
  return {
    columns: relation.columns,
    ...(relation.key === undefined
      ? {}
      : {
          key: keyColumns(relation).filter(
            (col): col is string => col !== undefined
          ),
        }),
    ...(merge === undefined ? {} : { merge }),
  };
};

const diffTupleMaps = (
  beforeRows: ReadonlyMap<string, readonly unknown[]>,
  afterRows: ReadonlyMap<string, readonly unknown[]>
): RowDelta | undefined => {
  const added: (readonly unknown[])[] = [];
  const removed: (readonly unknown[])[] = [];
  for (const [key, tuple] of afterRows) {
    if (!beforeRows.has(key)) {
      added.push(tuple);
    }
  }
  for (const [key, tuple] of beforeRows) {
    if (!afterRows.has(key)) {
      removed.push(tuple);
    }
  }
  if (added.length === 0 && removed.length === 0) {
    return undefined;
  }
  return {
    added: added.sort(compareValues),
    removed: removed.sort(compareValues),
  };
};

const baseRowsOf = (
  store: LogicDatabase,
  name: string
): ReadonlyMap<string, readonly unknown[]> => {
  const rows = new Map<string, readonly unknown[]>();
  const set = store.facts.get(name);
  if (set !== undefined) {
    for (const tuple of set.values()) {
      rows.set(valueKey(tuple), tuple);
    }
  }
  return rows;
};

const derivedRowsOf = (
  store: LogicDatabase,
  name: string
): Effect.Effect<ReadonlyMap<string, readonly unknown[]>, unknown> => {
  const relation = store.relations.get(name);
  if (relation === undefined) {
    return Effect.succeed(new Map());
  }
  const vars = relation.columns.map((_, at) => `?c${at}`);
  return Effect.map(
    run(["find", ["array/make", ...vars], [relation.name, ...vars]], stdlib, {
      database: store,
    }),
    (found) => {
      const rows = new Map<string, readonly unknown[]>();
      if (Array.isArray(found)) {
        for (const tuple of found as readonly (readonly unknown[])[]) {
          rows.set(valueKey(tuple), tuple);
        }
      }
      return rows;
    }
  );
};

const userRulesMap = (store: LogicDatabase) => {
  const map = new Map<string, unknown>();
  for (const rule of writtenRules(store.rules)) {
    if (rule.given) {
      continue;
    }
    map.set(valueKey(rule.source), rule.source);
  }
  return map;
};

const invariantsMap = (store: LogicDatabase) => {
  const map = new Map<
    string,
    { readonly assert: "none" | "some"; readonly goal: unknown }
  >();
  for (const { assert, goal } of store.invariants) {
    const entry = { assert, goal: render(goal) };
    map.set(valueKey(entry), entry);
  }
  return map;
};

const diffRelations = (
  before: LogicDatabase,
  after: LogicDatabase,
  names: readonly string[]
) => {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: {
    readonly after: RelationSpec;
    readonly before: RelationSpec;
    readonly name: string;
  }[] = [];
  for (const name of names) {
    const prev = before.relations.get(name);
    const next = after.relations.get(name);
    if (prev === undefined && next !== undefined) {
      added.push(name);
    } else if (prev !== undefined && next === undefined) {
      removed.push(name);
    } else if (prev !== undefined && next !== undefined) {
      const beforeSpec = relationSpec(prev);
      const afterSpec = relationSpec(next);
      if (valueKey(beforeSpec) !== valueKey(afterSpec)) {
        changed.push({ name, before: beforeSpec, after: afterSpec });
      }
    }
  }
  return { added, removed, changed };
};

const diffSchemas = (before: LogicDatabase, after: LogicDatabase) => {
  const names = [
    ...new Set([...before.schemas.keys(), ...after.schemas.keys()]),
  ].sort();
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const name of names) {
    const prev = before.schemas.get(name);
    const next = after.schemas.get(name);
    if (prev === undefined && next !== undefined) {
      added.push(name);
    } else if (prev !== undefined && next === undefined) {
      removed.push(name);
    } else if (
      prev !== undefined &&
      next !== undefined &&
      valueKey(render(schemaOf(prev)?.definition)) !==
        valueKey(render(schemaOf(next)?.definition))
    ) {
      changed.push(name);
    }
  }
  return { added, removed, changed };
};

const diffEntries = <T>(
  prev: ReadonlyMap<string, T>,
  next: ReadonlyMap<string, T>
) => ({
  added: [...next.entries()]
    .filter(([key]) => !prev.has(key))
    .map(([, item]) => item)
    .sort(compareValues),
  removed: [...prev.entries()]
    .filter(([key]) => !next.has(key))
    .map(([, item]) => item)
    .sort(compareValues),
});

const diffBaseFacts = (
  before: LogicDatabase,
  after: LogicDatabase,
  names: readonly string[]
) => {
  const facts: Record<string, RowDelta> = {};
  let added = 0;
  let removed = 0;
  for (const name of names) {
    const delta = diffTupleMaps(
      baseRowsOf(before, name),
      baseRowsOf(after, name)
    );
    if (delta !== undefined) {
      facts[name] = delta;
      added += delta.added.length;
      removed += delta.removed.length;
    }
  }
  return { facts, added, removed };
};

const diffDerivedRows = (
  before: LogicDatabase,
  after: LogicDatabase,
  names: readonly string[]
) =>
  Effect.gen(function* () {
    const derived: Record<string, RowDelta> = {};
    let added = 0;
    let removed = 0;
    for (const name of names) {
      const delta = diffTupleMaps(
        yield* derivedRowsOf(before, name),
        yield* derivedRowsOf(after, name)
      );
      if (delta !== undefined) {
        derived[name] = delta;
        added += delta.added.length;
        removed += delta.removed.length;
      }
    }
    return { derived, added, removed };
  });

/** Semantic diff between two Lion databases (ontology, rules, invariants, facts, and optionally derived rows). */
export const diffDatabases = (
  before: LogicDatabase,
  after: LogicDatabase,
  options: { readonly derived?: boolean } = {}
): Effect.Effect<DatabaseDiff, unknown> =>
  Effect.gen(function* () {
    const relationNames = [
      ...new Set([...before.relations.keys(), ...after.relations.keys()]),
    ].sort();
    const relations = diffRelations(before, after, relationNames);
    const schemas = diffSchemas(before, after);
    const rules = diffEntries(userRulesMap(before), userRulesMap(after));
    const invariants = diffEntries(invariantsMap(before), invariantsMap(after));
    const base = diffBaseFacts(before, after, relationNames);
    const derived = options.derived
      ? yield* diffDerivedRows(before, after, relationNames)
      : undefined;

    return {
      relations,
      schemas,
      rules,
      invariants,
      facts: base.facts,
      ...(derived === undefined ? {} : { derived: derived.derived }),
      counts: {
        relationsAdded: relations.added.length,
        relationsRemoved: relations.removed.length,
        relationsChanged: relations.changed.length,
        schemasAdded: schemas.added.length,
        schemasRemoved: schemas.removed.length,
        schemasChanged: schemas.changed.length,
        rulesAdded: rules.added.length,
        rulesRemoved: rules.removed.length,
        invariantsAdded: invariants.added.length,
        invariantsRemoved: invariants.removed.length,
        factsAdded: base.added,
        factsRemoved: base.removed,
        ...(derived === undefined
          ? {}
          : { derivedAdded: derived.added, derivedRemoved: derived.removed }),
      },
    };
  });

const diffCommand = Command.make(
  "diff",
  {
    before: diffBeforeFile,
    after: diffAfterFile,
    apply: applyFlag,
    eval: evalFlag,
    derived: derivedFlag,
    bind: bindFlag,
    bindFile: bindFileFlag,
  },
  Effect.fn(
    function* ({
      before: beforePath,
      after: afterOption,
      apply: applyFiles,
      eval: inline,
      derived,
      bind,
      bindFile,
    }) {
      const afterPath = Option.getOrUndefined(afterOption);
      const hasPreview = applyFiles.length > 0 || Option.isSome(inline);
      if (afterPath !== undefined && hasPreview) {
        return yield* Effect.fail(
          new Error(
            "Give either a second database file or --apply/--eval, not both."
          )
        );
      }
      if (afterPath === undefined && !hasPreview) {
        return yield* Effect.fail(
          new Error(
            "Give a second database file to compare against, or pass --apply <file> or --eval '<json>' to preview changes."
          )
        );
      }
      const beforeStore = yield* loadExistingDatabase(beforePath);
      let afterStore: LogicDatabase;
      if (afterPath === undefined) {
        afterStore = yield* loadExistingDatabase(beforePath);
        const bindings = yield* readBindings(bind, bindFile);
        const sources = yield* readProgramSources(applyFiles, inline);
        for (const [label, text] of sources) {
          const program = yield* readJson(text).pipe(
            Effect.mapError((cause) =>
              label === undefined
                ? cause
                : new Error(`${label}: ${cause.message}`)
            )
          );
          yield* run(
            program,
            { ...stdlib, ...bindings },
            { database: afterStore }
          );
        }
      } else {
        afterStore = yield* loadExistingDatabase(afterPath);
      }
      const diff = yield* diffDatabases(beforeStore, afterStore, { derived });
      yield* Console.log(yield* writeJson(diff, 2));
    },
    Effect.mapError((cause) => new CliError.UserError({ cause }))
  )
).pipe(
  Command.withDescription(
    "Compute the semantic diff between two Lion databases (or preview the impact of --apply/--eval steps in memory), including derived conclusions with --derived"
  )
);

export const command = evaluateCommand.pipe(
  Command.withSubcommands([
    replCommand,
    workerCommand,
    checkCommand,
    inspectCommand,
    diffCommand,
  ]),
  Command.withDescription(
    "Evaluate Lion programs, inspect and diff databases, serve the graph editor, and print Lion for a browser"
  )
);

export const program = Command.run(command, { version: VERSION });
