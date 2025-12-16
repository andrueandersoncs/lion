// Import necessary modules from the libraries
import { Args, Command } from "@effect/cli";
import { FileSystem } from "@effect/platform";
import { BunContext, BunFileSystem, BunRuntime } from "@effect/platform-bun";
import { Console, Effect, Ref } from "effect";
import { evaluate, LionEnvironment } from "@lion/core";

const file = Args.file({ name: "file" });

const command = Command.make(
  "evaluate",
  { file },
  Effect.fn(function* ({ file }) {
    const fs = yield* FileSystem.FileSystem;
    const content = yield* fs.readFileString(file);
    const result = yield* evaluate(JSON.parse(content));
    yield* Console.log(result);
    return result;
  })
);

const cli = Command.run(command, {
  name: "Hello World CLI",
  version: "v1.0.0",
});

cli(process.argv).pipe(
  Effect.provide(BunContext.layer),
  Effect.provide(BunFileSystem.layer),
  Effect.provideServiceEffect(LionEnvironment, Ref.make({})),
  BunRuntime.runMain
);
