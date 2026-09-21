import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";
import { LionExpressionSchema } from "@lionlang/core/schemas/lion-expression";
import { Console, Effect } from "effect";
import { Argument, CliError, Command } from "effect/unstable/cli";

export const VERSION = "0.1.0";

const file = Argument.FileSchema("file", LionExpressionSchema, {
  format: "json",
}).pipe(Argument.withDescription("Path to a Lion JSON program"));

export const command = Command.make("lion", { file }, ({ file }) =>
  run(file, stdlib).pipe(
    Effect.flatMap((result) => Console.log(JSON.stringify(result, null, 2))),
    Effect.mapError((cause) => new CliError.UserError({ cause }))
  )
).pipe(Command.withDescription("Evaluate a Lion JSON program"));

export const program = Command.run(command, { version: VERSION });
