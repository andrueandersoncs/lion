import { readFile, writeFile } from "node:fs/promises";
import { run } from "@lionlang/core/evaluation/evaluate";
import { LogicDatabase } from "@lionlang/core/logic/database";
import { loadDatabase, saveDatabase } from "@lionlang/core/logic/snapshot";
import { stdlib } from "@lionlang/core/modules";
import { LionExpressionSchema } from "@lionlang/core/schemas/lion-expression";
import { Console, Effect, Option } from "effect";
import { Argument, CliError, Command, Flag } from "effect/cli";

export const VERSION = "0.6.0";

const file = Argument.FileSchema("file", LionExpressionSchema, {
  format: "json",
}).pipe(Argument.withDescription("Path to a Lion JSON program"));

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
          Effect.try({
            try: () => JSON.parse(text) as unknown,
            catch: (cause) =>
              new Error(`${path} is not valid JSON: ${String(cause)}`),
          }).pipe(Effect.flatMap((saved) => loadDatabase(saved, stdlib))),
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
      const result = yield* run(file, stdlib, { database: store });
      yield* Console.log(JSON.stringify(result, null, 2));
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

export const command = evaluateCommand.pipe(
  Command.withSubcommands([replCommand]),
  Command.withDescription("Evaluate Lion programs and serve the graph editor")
);

export const program = Command.run(command, { version: VERSION });
