import { Terminal } from "@effect/platform";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect, Option, Ref } from "effect";
import { evaluate, LionEnvironment } from "@lion/core";
import type { UserInput } from "@effect/platform/Terminal";

const program = Effect.gen(function* () {
  const terminal = yield* Terminal.Terminal;

  yield* terminal.display("Lion REPL v0.0.1\n");
  yield* terminal.display("Type 'exit' to exit\n");
  yield* terminal.display("> ");

  let totalInput = "";
  let input: UserInput;
  do {
    const inputMailbox = yield* terminal.readInput;
    input = yield* inputMailbox.take;
    totalInput += yield* input.input;
    yield* Option.match(input.input, {
      onSome: (s) => terminal.display(s),
      onNone: () => Effect.succeed(undefined),
    });
  } while (input.key.name !== "Enter");

  if (totalInput === "exit") {
    yield* Effect.succeed(undefined);
  }

  const result = yield* evaluate(JSON.parse(totalInput));

  yield* terminal.display(`=> ${JSON.stringify(result, null, 2)}\n`);
});

BunRuntime.runMain(
  program.pipe(
    Effect.provide(BunContext.layer),
    Effect.provideServiceEffect(LionEnvironment, Ref.make({})),
    Effect.scoped
  )
);
