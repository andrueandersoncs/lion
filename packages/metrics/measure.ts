// Measures Lion's complexity, in the code and in the semantics.
//
// The code: lines, functions, paths through them, nesting, and tests of what
// kind a value is, counted from the source of @lionlang/core without its
// tests. The semantics: the names a programmer has to know, the messages
// that say a program broke a rule, and the interop grid, which runs every
// kind of expression in every place and counts the cells that do not give
// what plain code gives.
//
//   bun run measure                    the working tree
//   bun run measure --against main     and the change since a commit
//   bun run measure --files            each file as well
//   bun run measure --grid             the whole grid as well
//   bun run measure --json             everything, as JSON
import { join } from "node:path";
import { Cause, Effect, Exit } from "effect";
import { withCheckout } from "./src/checkout.ts";
import {
  type CodeMetrics,
  type FileMetrics,
  MEASURES,
  measureSource,
  total,
} from "./src/code.ts";
import {
  type Cell,
  type GridSummary,
  isException,
  runGrid,
  summarize,
} from "./src/grid.ts";
import { EXPRESSIONS, POSITIONS } from "./src/grid-cases.ts";
import { load } from "./src/lion.ts";
import { change, count, readArguments, table } from "./src/report.ts";
import {
  atCommit,
  CORE,
  commitOf,
  inWorkingTree,
  REPOSITORY,
  type Source,
} from "./src/sources.ts";
import { type Vocabulary, vocabularyOf } from "./src/vocabulary.ts";

interface Semantics {
  readonly cells: readonly Cell[];
  readonly grid: GridSummary;
  readonly vocabulary: Vocabulary;
}

/** Everything measured of one version. */
interface Measurement {
  readonly code: CodeMetrics;
  readonly files: readonly FileMetrics[];
  /** What the version is called in the report, such as `main` or `now`. */
  readonly label: string;
  /** The measures of the semantics, or why the evaluator did not load. */
  readonly semantics: Semantics | string;
}

const semanticsOf = (sources: readonly Source[], root: string) =>
  Effect.gen(function* () {
    const loaded = yield* Effect.exit(load(root));
    if (Exit.isFailure(loaded)) {
      return String(Cause.squash(loaded.cause)).split("\n", 1)[0] ?? "";
    }
    const cells = yield* runGrid(loaded.value);
    return {
      cells,
      grid: summarize(cells),
      vocabulary: vocabularyOf(loaded.value, sources),
    };
  });

const measure = (label: string, sources: readonly Source[], root: string) =>
  Effect.map(semanticsOf(sources, root), (semantics): Measurement => {
    const files = sources.map(({ path, text }) => measureSource(path, text));
    return { code: total(files), files, label, semantics };
  });

const LABELS: Readonly<Record<(typeof MEASURES)[number], string>> = {
  cognitive: "nesting-weighted decisions",
  cyclomatic: "paths through functions",
  dispatch: "tests of a value's kind",
  functions: "functions",
  lines: "code lines",
};

/** One line of a comparison: a label, then a number for each version. */
const line = (label: string, values: readonly (number | undefined)[]) => {
  const [before, after] = values;
  return [
    `  ${label}`,
    ...values.map(count),
    ...(values.length === 2 ? [change(before, after)] : []),
  ];
};

const header = (versions: readonly Measurement[]) => [
  "",
  ...versions.map(({ label }) => label),
  ...(versions.length === 2 ? ["change"] : []),
];

const codeTable = (versions: readonly Measurement[]) =>
  table([
    header(versions),
    ...MEASURES.map((measure) =>
      line(
        LABELS[measure],
        versions.map(({ code }) => code[measure])
      )
    ),
  ]);

const known = (semantics: Semantics | string) =>
  typeof semantics === "string" ? undefined : semantics;

const semanticsTable = (versions: readonly Measurement[]) => {
  const of = (pick: (semantics: Semantics) => number | undefined) =>
    versions.map(({ semantics }) => {
      const measured = known(semantics);
      return measured === undefined ? undefined : pick(measured);
    });
  return table([
    header(versions),
    line(
      "special forms",
      of(({ vocabulary }) => vocabulary.forms)
    ),
    line(
      "library functions",
      of(({ vocabulary }) => vocabulary.functions)
    ),
    line(
      "kinds of error",
      of(({ vocabulary }) => vocabulary.errors)
    ),
    line(
      "messages",
      of(({ vocabulary }) => vocabulary.messages)
    ),
    line(
      "grid: cells like plain code",
      of(({ grid }) => grid.same)
    ),
    line(
      "grid: exceptions",
      of(({ grid }) => grid.exceptions)
    ),
  ]);
};

/** The functions with the most paths through them, hardest first. */
const hardest = (files: readonly FileMetrics[], shown = 3) =>
  [...files]
    .sort((a, b) => b.worst.cyclomatic - a.worst.cyclomatic)
    .slice(0, shown)
    .map(({ path, worst }) => `${worst.name} (${worst.cyclomatic}) in ${path}`)
    .join(", ");

const filesTable = (files: readonly FileMetrics[]) =>
  table([
    ["  file", ...MEASURES, "hardest function"],
    ...[...files]
      .sort((a, b) => b.cyclomatic - a.cyclomatic)
      .map((file) => [
        `  ${file.path}`,
        ...MEASURES.map((measure) => count(file[measure])),
        `${file.worst.name} (${file.worst.cyclomatic})`,
      ]),
  ]);

const MARKS: Readonly<Record<Cell["verdict"], string>> = {
  absent: "?",
  different: "≠",
  refused: "✗",
  same: "✓",
  skipped: "·",
};

/** The grid as a table: a row for each expression, a column for each place. */
const gridTable = (cells: readonly Cell[]) => {
  const letters = POSITIONS.map((_, index) =>
    String.fromCharCode("A".charCodeAt(0) + index)
  );
  const rows = EXPRESSIONS.map(({ name }) => [
    `  ${name}`,
    ...POSITIONS.map((position) => {
      const cell = cells.find(
        (item) => item.expression === name && item.position === position.name
      );
      return MARKS[cell?.verdict ?? "absent"];
    }),
  ]);
  const legend = POSITIONS.map(
    (position, index) => `${letters[index]} ${position.name}`
  ).join(", ");
  return [
    table([["", ...letters], ...rows]),
    "",
    `  ${legend}`,
    "  ✓ like plain code, ✗ refused, ≠ different, · takes only goals, ? not in this version",
  ].join("\n");
};

const describeException = (cell: Cell) => {
  const rule =
    cell.known === undefined
      ? `NOT DOCUMENTED: ${cell.detail}`
      : `as documented: ${cell.known}`;
  return `  ${cell.expression} × ${cell.position}: ${cell.verdict}, ${rule}`;
};

const exceptionsOf = ({ semantics }: Measurement) =>
  (known(semantics)?.cells ?? []).filter(isException);

interface Changes {
  /** How many cells went from one verdict to another, by the pair. */
  readonly moves: ReadonlyMap<string, number>;
  /** Cells that were like plain code, or not there, and are exceptions now. */
  readonly worse: readonly string[];
}

/** How the grid's cells changed between two versions. */
const changedCells = (before: Measurement, after: Measurement): Changes => {
  const earlier = new Map(
    (known(before.semantics)?.cells ?? []).map((cell) => [
      `${cell.expression} × ${cell.position}`,
      cell,
    ])
  );
  const moves = new Map<string, number>();
  const worse: string[] = [];
  for (const cell of known(after.semantics)?.cells ?? []) {
    const name = `${cell.expression} × ${cell.position}`;
    const was = earlier.get(name);
    if (was === undefined || was.verdict === cell.verdict) {
      continue;
    }
    const move = `${was.verdict} → ${cell.verdict}`;
    moves.set(move, (moves.get(move) ?? 0) + 1);
    if (isException(cell) && !isException(was)) {
      worse.push(`  ${name}: ${move}, ${cell.detail}`);
    }
  }
  return { moves, worse };
};

const section = (title: string, lines: readonly string[]) =>
  lines.length === 0 ? [] : ["", title, ...lines];

const report = (
  versions: readonly Measurement[],
  options: { readonly files: boolean; readonly grid: boolean }
) => {
  const now = versions.at(-1) as Measurement;
  const [before] = versions.length === 2 ? versions : [];
  const unloaded = versions.flatMap(({ label, semantics }) =>
    typeof semantics === "string"
      ? [`  The evaluator of ${label} did not load: ${semantics}`]
      : []
  );
  const changes = before === undefined ? undefined : changedCells(before, now);
  const moves = [...(changes?.moves ?? [])];
  const exceptions = exceptionsOf(now);
  return [
    `Code: ${CORE}, without tests`,
    codeTable(versions),
    `  hardest functions: ${hardest(now.files)}`,
    ...(options.files ? ["", filesTable(now.files)] : []),
    "",
    "Semantics",
    semanticsTable(versions),
    ...unloaded,
    ...section(
      `Exceptions: ${exceptions.length}`,
      exceptions.map(describeException)
    ),
    ...section(
      `Grid cells that changed since ${before?.label}`,
      moves.map(([move, cells]) => `  ${move}: ${cells}`)
    ),
    ...section("Grid cells that got worse", changes?.worse ?? []),
    ...(options.grid && typeof now.semantics !== "string"
      ? ["", "Interop grid", gridTable(now.semantics.cells)]
      : []),
  ].join("\n");
};

const args = readArguments(process.argv.slice(2), ["against"]);
const ref = args.option("against");
const commit = ref === undefined ? undefined : commitOf(ref);

const main = Effect.gen(function* () {
  if (ref !== undefined && commit === undefined) {
    console.error(`git knows no commit called "${ref}".`);
    process.exitCode = 1;
    return;
  }
  const now = yield* measure(
    "now",
    inWorkingTree(CORE),
    join(REPOSITORY, CORE)
  );
  const before =
    ref === undefined || commit === undefined
      ? []
      : [
          yield* withCheckout(commit, (directory) =>
            measure(ref, atCommit(commit, CORE), join(directory, CORE))
          ),
        ];
  const versions = [...before, now];
  console.log(
    args.flag("json")
      ? JSON.stringify(versions, null, 1)
      : report(versions, { files: args.flag("files"), grid: args.flag("grid") })
  );
});

await Effect.runPromise(main);
