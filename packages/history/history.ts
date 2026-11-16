/**
 * The command line of the model of Lion's development.
 *
 *   bun run history write          build the model and write every page history/outputs.json names
 *   bun run history check          build the model, and fail when a check finds something or a page is out of date
 *   bun run history ask <lion>     evaluate a Lion expression, or a file holding one, against the model
 */
import { existsSync, readFileSync } from "node:fs";
import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";
import { Cause, Effect, Exit } from "effect";
import { buildModel, savedModel } from "./src/model.ts";
import { checkModel, pagesOf, writePages } from "./src/pages.ts";
import { REPOSITORY } from "./src/record.ts";

const USAGE = "Usage: bun run history write | check | ask <expression or file>";

/** What a command printed, and whether it succeeded. */
interface Outcome {
  readonly ok: boolean;
  readonly text: string;
}

const expressionOf = (argument: string): unknown =>
  JSON.parse(
    existsSync(argument) ? readFileSync(argument, "utf8") : argument
  ) as unknown;

const COMMANDS: Record<
  string,
  (argument?: string) => Effect.Effect<Outcome, unknown>
> = {
  ask: (argument) =>
    argument === undefined
      ? Effect.succeed({ ok: false, text: USAGE })
      : Effect.gen(function* () {
          const database = yield* savedModel(REPOSITORY);
          const value = yield* run(expressionOf(argument) as never, stdlib, {
            database,
          });
          return { ok: true, text: JSON.stringify(value, null, 2) };
        }),
  check: () =>
    Effect.gen(function* () {
      const built = yield* buildModel(REPOSITORY);
      const { ok, text } = yield* checkModel(built, REPOSITORY);
      return { ok, text };
    }),
  write: () =>
    Effect.gen(function* () {
      const built = yield* buildModel(REPOSITORY);
      if (built.problems.length > 0) {
        const { text } = yield* checkModel(built, REPOSITORY, {});
        return {
          ok: false,
          text: `${text}\nNo page was written: the model is missing the notes above.`,
        };
      }
      const pages = yield* pagesOf(built.database, REPOSITORY);
      const written = writePages(pages, REPOSITORY);
      const { ok, text } = yield* checkModel(built, REPOSITORY, pages);
      return {
        ok,
        text: [...written.map((page) => `wrote ${page}`), text].join("\n"),
      };
    }),
};

const [command = "", argument] = process.argv.slice(2);
const chosen = COMMANDS[command];
const exit = await Effect.runPromiseExit(
  chosen === undefined
    ? Effect.succeed({ ok: false, text: USAGE })
    : chosen(argument)
);

if (Exit.isSuccess(exit)) {
  (exit.value.ok ? console.log : console.error)(exit.value.text);
  process.exitCode = exit.value.ok ? 0 : 1;
} else {
  const error = Cause.squash(exit.cause);
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
