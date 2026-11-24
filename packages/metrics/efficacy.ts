// Measures Lion's efficacy for AI agents building deep research artifacts,
// knowledge bases, ontologies, and knowledge graphs — on the working tree or
// directly beside an earlier commit (`--against main`).
//
//   bun run efficacy
//   bun run efficacy --against main
//   bun run efficacy --json
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { Effect } from "effect";
import { withCheckout } from "./src/checkout.ts";
import { type EfficacySummary, evaluateEfficacy } from "./src/efficacy.ts";
import { load } from "./src/lion.ts";
import { readArguments, table } from "./src/report.ts";
import { CORE, commitOf, REPOSITORY } from "./src/sources.ts";

const args = readArguments(process.argv.slice(2), ["against", "source"]);
const ref = args.option("against");
const commit = ref === undefined ? undefined : commitOf(ref);
const asJson = args.flag("json");

const runInSubprocess = (sourceDir: string) =>
  Effect.sync((): EfficacySummary => {
    const { status, stderr, stdout } = spawnSync(
      process.execPath,
      [import.meta.filename, "--source", sourceDir],
      { encoding: "utf8" }
    );
    if (status !== 0) {
      throw new Error(`Efficacy run failed for ${sourceDir}: ${stderr}`);
    }
    const lines = stdout.trim().split("\n");
    return JSON.parse(lines.at(-1) ?? "{}") as EfficacySummary;
  });

const formatCell = (result: EfficacySummary["results"][number] | undefined) => {
  if (result === undefined) {
    return "-";
  }
  if (!result.passed) {
    return "inexpressible";
  }
  return `${result.mode} (${result.astNodes} AST, ${result.snapshotBytes} B, ${result.ms.toFixed(1)} ms)`;
};

const main = Effect.gen(function* () {
  if (ref !== undefined && commit === undefined) {
    console.error(`git knows no commit called "${ref}".`);
    process.exitCode = 1;
    return;
  }
  const before =
    ref === undefined || commit === undefined
      ? undefined
      : yield* withCheckout(commit, (dir) => runInSubprocess(join(dir, CORE)));
  const now = yield* runInSubprocess(join(REPOSITORY, CORE));

  if (asJson) {
    console.log(
      JSON.stringify(before === undefined ? { now } : { before, now }, null, 2)
    );
    return;
  }

  console.log(
    table([
      [
        "task",
        "category",
        ...(before === undefined ? [] : [ref ?? "before"]),
        "now",
      ],
      ...now.results.map((result, index) => [
        result.id,
        result.category,
        ...(before === undefined ? [] : [formatCell(before.results[index])]),
        formatCell(result),
      ]),
    ])
  );
  console.log("");
  const summaryRows: string[][] = [
    ["metric", ...(before === undefined ? [] : [ref ?? "before"]), "now"],
    [
      "tasks passed",
      ...(before === undefined
        ? []
        : [`${before.passedCount}/${before.totalCount}`]),
      `${now.passedCount}/${now.totalCount}`,
    ],
    [
      "native expressibility",
      ...(before === undefined
        ? []
        : [`${before.nativeCount}/${before.totalCount}`]),
      `${now.nativeCount}/${now.totalCount}`,
    ],
    [
      "workaround required",
      ...(before === undefined ? [] : [String(before.workaroundCount)]),
      String(now.workaroundCount),
    ],
    [
      "inexpressible",
      ...(before === undefined ? [] : [String(before.inexpressibleCount)]),
      String(now.inexpressibleCount),
    ],
    [
      "total AST nodes (passing tasks)",
      ...(before === undefined ? [] : [String(before.totalAstNodes)]),
      String(now.totalAstNodes),
    ],
    [
      "total snapshot bytes (passing tasks)",
      ...(before === undefined ? [] : [String(before.totalSnapshotBytes)]),
      String(now.totalSnapshotBytes),
    ],
    [
      "median task latency",
      ...(before === undefined ? [] : [`${before.medianMs.toFixed(1)} ms`]),
      `${now.medianMs.toFixed(1)} ms`,
    ],
    [
      "scaled KB benchmark (40 src / 120 claims)",
      ...(before === undefined ? [] : [`${before.scaledKbMs.toFixed(1)} ms`]),
      `${now.scaledKbMs.toFixed(1)} ms`,
    ],
    [
      "composite efficacy score (0-100)",
      ...(before === undefined
        ? []
        : [`${before.compositeScore.toFixed(1)} / 100`]),
      `${now.compositeScore.toFixed(1)} / 100`,
    ],
  ];
  console.log(table(summaryRows));
});

const source = args.option("source");
if (source === undefined) {
  await Effect.runPromise(main);
} else {
  const lion = await Effect.runPromise(load(source));
  const summary = await Effect.runPromise(evaluateEfficacy(source, lion));
  console.log(JSON.stringify(summary));
}
