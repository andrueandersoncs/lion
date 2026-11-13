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
//                   "words": "the reader's own words"}]}
//
// `credits`, `where` (where in the source the quote stands), and
// `decisions` (the reader's choice of a reading) may be left out.
//
// It writes steps/<the notes file's name>, which the lion command then runs.
// Each quote is looked for in sources/<source id>.txt, word for word. A
// source that could not be read has no text and can have no claims.
// Runs under node or bun.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasQuote } from "./check-quotes.mjs";

const SHOWN = 80;
const quoted = (value) => ["quote", value];

/**
 * The step that records the notes: one `fact` form, so sources and the
 * claims that cite them go in together. Everything is written as data, so no
 * text in the notes can be read as a name, a variable, or code.
 */
export const stepOf = (notes) => [
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
  writeFileSync(step, `${JSON.stringify(stepOf(notes), null, 1)}\n`);
  console.log(
    `${step}: sources ${(notes.sources ?? []).length}, claims ${(notes.claims ?? []).length}, every quote found.`
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
