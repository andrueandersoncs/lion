#!/usr/bin/env node
// Writes a step from notes on what sources said, and refuses a quote that is
// not in the saved text of its source.
//
//   node record.mjs notes/02-press.json
//
// Run it in the research folder. The notes are plain JSON, with nothing to
// quote or escape:
//
//   {"sources": [{"id": "pr", "url": "https://…", "title": "…",
//                 "publisher": "Acme", "kind": "primary", "published": 20250201}],
//    "claims":  [{"id": "c1", "source": "pr", "quote": "the source's words",
//                 "says": {"revenue": "acme", "year": 2024, "usd_m": 120},
//                 "credits": ["another source's id"],
//                 "where": "p. 4, Highlights"}],
//    "decisions": [{"key": "basis", "value": "gaap",
//                   "words": "the reader's own words"}],
//    "leads": [{"id": "outside-revenue", "statement": "…",
//               "pursues": [{"revenue": "acme"}], "patience": 3}]}
//
// `credits`, `where` (where in the source the quote stands), and
// `decisions` (the reader's choice of a reading) may be left out. A lead
// is a line of inquiry: the questions it pursues, and how many sources in a
// row may give nothing first-hand on them before it is set aside, 3 unless
// it says. A source read to follow leads names them in `"for"`, and is
// numbered in the order it was recorded.
//
// It writes steps/<the notes file's name>, which the lion command then runs.
// Each quote is looked for in sources/<source id>.txt, word for word. A
// source that could not be read has no text and can have no claims.
// Runs under node or bun.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasQuote } from "./check-quotes.mjs";

const SHOWN = 80;
/** How many sources in a row a lead may read for nothing, unless it says. */
const PATIENCE = 3;
const quoted = (value) => ["quote", value];

/**
 * The step that records the notes: one `fact` form, so sources and the
 * claims that cite them go in together. Everything is written as data, so no
 * text in the notes can be read as a name, a variable, or code. The sources
 * read for a lead are numbered from `first` on, in the order they are listed.
 */
export const stepOf = (notes, first = 1) => [
  "begin",
  [
    "fact",
    ...(notes.sources ?? []).map((source) => [
      "source",
      quoted(source.id),
      quoted(source.url),
      quoted(source.title),
      quoted(source.publisher),
      quoted(source.kind),
      quoted(source.published ?? null),
    ]),
    ...(notes.claims ?? []).flatMap((claim) => [
      [
        "claim",
        quoted(claim.id),
        quoted(claim.source),
        quoted(claim.quote),
        quoted(claim.says),
      ],
      ...(claim.credits ?? []).map((to) => [
        "attributed",
        quoted(claim.id),
        quoted(to),
      ]),
      ...(claim.where === undefined
        ? []
        : [["located", quoted(claim.id), quoted(claim.where)]]),
    ]),
    ...(notes.decisions ?? []).map((decision) => [
      "decided",
      quoted(decision.key),
      quoted(decision.value),
      quoted(decision.words),
    ]),
    ...(notes.leads ?? []).flatMap((lead) => [
      [
        "lead",
        quoted(lead.id),
        quoted(lead.statement ?? ""),
        quoted(lead.patience ?? PATIENCE),
      ],
      ...(lead.pursues ?? []).map((question) => [
        "pursues",
        quoted(lead.id),
        quoted(question),
      ]),
    ]),
    ...(notes.sources ?? [])
      .filter((source) => [source.for ?? []].flat().length > 0)
      .flatMap((source, at) =>
        [source.for]
          .flat()
          .map((lead) => [
            "read_for",
            quoted(source.id),
            quoted(lead),
            first + at,
          ])
      ),
  ],
  "recorded",
];

/**
 * What is wrong with the notes' quotes: each claim whose quote is not in its
 * source's saved text, or whose source has none. `textOf` gives the text
 * saved for a source, or undefined.
 */
export const problemsOf = (notes, textOf) =>
  (notes.claims ?? []).flatMap((claim) => {
    const text = textOf(claim.source);
    if (text === undefined) {
      return [
        `${claim.id}: there is no sources/${claim.source}.txt. Save the text the quote was taken from first.`,
      ];
    }
    return hasQuote(text, String(claim.quote))
      ? []
      : [
          `${claim.id}: these words are not in sources/${claim.source}.txt: "${String(claim.quote).slice(0, SHOWN)}"`,
        ];
  });

/**
 * The number of the last source read for a lead in the steps before `name`,
 * or 0: a step recorded again keeps its sources' numbers.
 */
export const readBefore = (name, folder = "steps") =>
  existsSync(folder)
    ? Math.max(
        0,
        ...readdirSync(folder)
          .filter((file) => file.endsWith(".json") && file < name)
          .flatMap((file) => {
            const step = JSON.parse(readFileSync(join(folder, file), "utf8"));
            return (Array.isArray(step) ? step : [])
              .filter((form) => Array.isArray(form) && form[0] === "fact")
              .flatMap((form) => form.slice(1))
              .filter((row) => Array.isArray(row) && row[0] === "read_for")
              .map((row) => Number(row[3]));
          })
      )
    : 0;

const main = (path) => {
  if (path === undefined || !existsSync(path)) {
    console.error("Usage: node record.mjs notes/<name>.json");
    process.exit(1);
  }
  const notes = JSON.parse(readFileSync(path, "utf8"));
  const problems = problemsOf(notes, (source) => {
    const file = join("sources", `${source}.txt`);
    return existsSync(file) ? readFileSync(file, "utf8") : undefined;
  });
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    console.error(
      "Nothing was written. Copy each quote from the saved text, word for word."
    );
    process.exit(1);
  }
  mkdirSync("steps", { recursive: true });
  const step = join("steps", basename(path));
  writeFileSync(
    step,
    `${JSON.stringify(stepOf(notes, readBefore(basename(path)) + 1), null, 1)}\n`
  );
  console.log(
    `${step}: sources ${(notes.sources ?? []).length}, claims ${(notes.claims ?? []).length}${(notes.leads ?? []).length > 0 ? `, leads ${notes.leads.length}` : ""}, every quote found.`
  );
};

// True when this file is the program that was started, by whatever path:
// the skill is often installed as a link.
const started = () => {
  try {
    return (
      realpathSync(process.argv[1] ?? "") ===
      realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
};

if (started()) {
  main(process.argv[2]);
}
