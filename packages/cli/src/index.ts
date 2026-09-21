import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";
import { LionExpressionSchema } from "@lionlang/core/schemas/lion-expression";
import { Console, Effect } from "effect";
import { Argument, CliError, Command, Flag } from "effect/unstable/cli";

export const VERSION = "0.1.0";

const file = Argument.FileSchema("file", LionExpressionSchema, {
  format: "json",
}).pipe(Argument.withDescription("Path to a Lion JSON program"));

const evaluateCommand = Command.make("lion", { file }, ({ file }) =>
  run(file, stdlib).pipe(
    Effect.flatMap((result) => Console.log(JSON.stringify(result, null, 2))),
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
