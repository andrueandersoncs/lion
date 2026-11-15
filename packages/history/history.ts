/**
 * The project record's command line.
 *
 *   bun run history write          write the pages history/outputs.json names
 *   bun run history check          fail when a check finds something, or a page is out of date
 *   bun run history ask <lion>     evaluate a Lion expression, or a file holding one, against the record
 *   bun run history sources        write the text of every commit for the research in history/research
 *   bun run history probe          run the probes in history/research/probes.json on Lion as it is now
 *   bun run history research       build the research model and its page, and say what it finds
 *   bun run history query <lion>   evaluate a Lion expression, or a file holding one, against the research model
 */
import { existsSync, readFileSync } from "node:fs";
import { Cause, Effect, Exit } from "effect";
import {
  buildResearch,
  findingsOf,
  queryResearch,
} from "./src/build-research.ts";
import { readHistory } from "./src/git.ts";
import { checkRecord, writePages } from "./src/pages.ts";
import { writeObservations } from "./src/probes.ts";
import { ask, REPOSITORY, readSources, type Sources } from "./src/record.ts";
import { publishedOf, RESEARCH, writeCommitSources } from "./src/research.ts";

const USAGE =
  "Usage: bun run history write | check | sources | probe | research | ask <expression or file> | query <expression or file>";

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
  (sources: Sources, argument?: string) => Effect.Effect<Outcome, unknown>
> = {
  ask: (sources, argument) =>
    argument === undefined
      ? Effect.succeed({ ok: false, text: USAGE })
      : Effect.map(ask(sources, expressionOf(argument)), (value) => ({
          ok: true,
          text: JSON.stringify(value, null, 2),
        })),
  query: (_sources, argument) =>
    argument === undefined
      ? Effect.succeed({ ok: false, text: USAGE })
      : Effect.map(
          queryResearch(REPOSITORY, expressionOf(argument)),
          (value) => ({ ok: true, text: JSON.stringify(value, null, 2) })
        ),
  check: (sources) =>
    Effect.map(checkRecord(sources), ({ ok, text }) => ({ ok, text })),
  probe: () => {
    const [head] = readHistory(REPOSITORY, "history").commits;
    return Effect.map(
      writeObservations(REPOSITORY, head === undefined ? 0 : publishedOf(head)),
      (observations) => ({
        ok: true,
        text: `ran ${observations.length} probes into ${RESEARCH}/notes/20-runs.json`,
      })
    );
  },
  research: () =>
    Effect.gen(function* () {
      const built = yield* buildResearch(REPOSITORY);
      const found = yield* findingsOf(built.database);
      const line = (finding: { assumption: string; witness: unknown }) =>
        `    ${finding.assumption}: ${JSON.stringify(finding.witness)}`;
      const section = (
        title: string,
        findings: readonly { assumption: string; witness: unknown }[]
      ) => (findings.length === 0 ? [] : [title, ...findings.map(line)]);
      const lines = [
        ...built.problems.map((problem) => `✗ ${problem}`),
        ...section(
          `✗ New findings: list each in ${RESEARCH}/known.json with a note, or settle it (${found.fresh.length})`,
          found.fresh
        ),
        ...section(
          `✗ Listed findings the model no longer finds: remove them from known.json or accepted.json (${found.stale.length})`,
          found.stale
        ),
        `• ${found.known.length} known findings wait for a decision, ${found.accepted.length} are accepted, ${found.unread.length} commits are not read yet`,
        `${built.steps.length} steps built ${RESEARCH}/model.json`,
      ];
      return {
        ok:
          built.problems.length === 0 &&
          found.fresh.length === 0 &&
          found.stale.length === 0,
        text: lines.join("\n"),
      };
    }),
  sources: () =>
    Effect.sync(() => ({
      ok: true,
      text: `wrote ${writeCommitSources(REPOSITORY)} commits to ${RESEARCH}/sources and ${RESEARCH}/notes/02-commits.json`,
    })),
  write: (sources) =>
    Effect.map(writePages(sources), (pages) => ({
      ok: true,
      text: pages.map((page) => `wrote ${page}`).join("\n"),
    })),
};

const [command = "", argument] = process.argv.slice(2);
const run = COMMANDS[command];
const exit = await Effect.runPromiseExit(
  run === undefined
    ? Effect.succeed({ ok: false, text: USAGE })
    : run(readSources(REPOSITORY), argument)
);

if (Exit.isSuccess(exit)) {
  (exit.value.ok ? console.log : console.error)(exit.value.text);
  process.exitCode = exit.value.ok ? 0 : 1;
} else {
  const error = Cause.squash(exit.cause);
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
