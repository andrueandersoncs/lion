import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { analyze, flattenAnalysis } from "@lionlang/core/analysis/analyze";
import { lint } from "@lionlang/core/analysis/lint";
import { run } from "@lionlang/core/evaluation/evaluate";
import { readJson, writeJson } from "@lionlang/core/evaluation/reading";
import { LogicDatabase, relationBindings } from "@lionlang/core/logic/database";
import { loadDatabase, saveDatabase } from "@lionlang/core/logic/snapshot";
import { stdlib } from "@lionlang/core/modules";
import { Console, Effect, Option } from "effect";
import { Argument, CliError, Command, Flag } from "effect/cli";

export const VERSION = "0.15.0";

const file = Argument.String("file").pipe(
  Argument.withDescription(
    "Path to a Lion JSON program, or - to read from standard input"
  ),
  Argument.optional
);

const evalFlag = Flag.String("eval").pipe(
  Flag.withAlias("e"),
  Flag.withDescription("Lion JSON program given directly on the command line"),
  Flag.optional
);

const database = Flag.String("database").pipe(
  Flag.withDescription(
    "Lion JSON file that holds the logic database. It is loaded before the program runs and saved afterwards as a snapshot program."
  ),
  Flag.optional
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

const readDatabase = (path: string) =>
  Effect.tryPromise({
    try: () => readFile(path, "utf8"),
    catch: (cause) => cause,
  }).pipe(
    Effect.option,
    Effect.flatMap(
      Option.match({
        // A database file that does not exist yet starts empty.
        onNone: () => Effect.succeed(new LogicDatabase()),
        onSome: (text) =>
          readJson(text).pipe(
            Effect.mapError((cause) => new Error(`${path}: ${cause.message}`)),
            Effect.flatMap((saved) => loadDatabase(saved, stdlib))
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
  { file, eval: evalFlag, database, bind: bindFlag, bindFile: bindFileFlag },
  Effect.fn(
    function* ({ file, eval: inline, database, bind, bindFile }) {
      const path = Option.getOrUndefined(database);
      const store =
        path === undefined ? new LogicDatabase() : yield* readDatabase(path);
      const bindings = yield* readBindings(bind, bindFile);
      const text = yield* readProgramSource(file, inline);
      const program = yield* readJson(text);
      const result = yield* run(
        program,
        { ...stdlib, ...bindings },
        { database: store }
      );
      yield* Console.log(yield* writeJson(result, 2));
      if (path !== undefined) {
        yield* writeDatabase(path, store);
      }
    },
    Effect.mapError((cause) => new CliError.UserError({ cause }))
  )
).pipe(Command.withDescription("Evaluate a Lion JSON program"));

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
      const store = path === undefined ? undefined : yield* readDatabase(path);
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

export const command = evaluateCommand.pipe(
  Command.withSubcommands([replCommand, workerCommand, checkCommand]),
  Command.withDescription(
    "Evaluate Lion programs, serve the graph editor, and print Lion for a browser"
  )
);

export const program = Command.run(command, { version: VERSION });
