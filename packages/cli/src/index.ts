import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { analyze, flattenAnalysis } from "@lionlang/core/analysis/analyze";
import { lint } from "@lionlang/core/analysis/lint";
import { run } from "@lionlang/core/evaluation/evaluate";
import { readJson, writeJson } from "@lionlang/core/evaluation/reading";
import { LogicDatabase } from "@lionlang/core/logic/database";
import { loadDatabase, saveDatabase } from "@lionlang/core/logic/snapshot";
import { stdlib } from "@lionlang/core/modules";
import { Console, Effect, Option } from "effect";
import { Argument, CliError, Command, Flag } from "effect/cli";

export const VERSION = "0.14.0";

const file = Argument.FileText("file").pipe(
  Argument.withDescription("Path to a Lion JSON program")
);

const database = Flag.String("database").pipe(
  Flag.withDescription(
    "Lion JSON file that holds the logic database. It is loaded before the program runs and saved afterwards as a snapshot program."
  ),
  Flag.optional
);

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
  { file, database },
  Effect.fn(
    function* ({ file, database }) {
      const path = Option.getOrUndefined(database);
      const store =
        path === undefined ? new LogicDatabase() : yield* readDatabase(path);
      const program = yield* readJson(file);
      const result = yield* run(program, stdlib, { database: store });
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
export const findings = (program: unknown) =>
  flattenAnalysis(analyze(program as never, stdlib)).flatMap((node) => [
    ...(node.diagnostic === undefined
      ? []
      : [{ at: node.pointer, error: node.diagnostic }]),
    ...(node.warning === undefined
      ? []
      : [{ at: node.pointer, warning: node.warning }]),
  ]);

const checkCommand = Command.make(
  "check",
  { file: Argument.FileText("file") },
  Effect.fn(
    function* ({ file }) {
      const program = yield* readJson(file);
      // What the analysis finds, then what the lints written in Lion find.
      const found = [...findings(program), ...(yield* lint(program))];
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
