#!/usr/bin/env node
// Writes a step from notes on what you observed and what you believe, and
// refuses a quote that is not in the text it was taken from.
//
//   node record.mjs notes/03-tests.json
//
// Run it in the task folder. The notes are plain JSON, with nothing to quote
// or escape; every part is optional:
//
//   {"sources": [{"id": "r1", "kind": "read", "what": "src/parse.ts"}],
//    "observations": [{"id": "o1", "source": "t1", "quote": "3 failed",
//                      "question": {"failing tests": "core"}, "value": 3}],
//    (a quote may also be a list of quotes, each in the text: lines of a
//    list the output does not print together)
//    "problems": [{"id": "p1", "statement": "…",
//                  "question": {…}, "value": …}],
//    "beliefs": [{"id": "b1", "statement": "…",
//                 "predicts": [{"question": {…}, "value": …}],
//                 "explains": ["p1"]}],
//    "needed": [{"cause of": "p1"}]}
//
// A source run with see.mjs needs no entry in "sources": it is taken from
// seen/<id>.json, with the hashes of what it depended on when it ran. A
// source's quotes are looked for in seen/<source id>.txt, or, when there is
// none, in the file its `what` names. A source you list depends on the paths
// in its `about`, hashed now; without one, a file you read depends on that
// file, a command on the whole project, and what you were told or recalled
// on nothing. It writes steps/<the notes file's name> and rebuilds the
// model; if the model refuses the step, the step is taken back. Runs under
// node or bun.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import {
  hasherFor,
  hasQuote,
  inTaskFolder,
  isMain,
  latestVersion,
  pathIn,
  projectRoot,
  readJson,
  rowsOf,
  snapshot,
} from "./lib.mjs";
import { replay } from "./replay.mjs";

const SHOWN = 80;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const KINDS = ["ran", "read", "told", "recalled"];

const quoted = (value) => ["quote", value];

const local = (root, what) => {
  if (typeof what !== "string" || what === "") {
    return undefined;
  }
  const full = isAbsolute(what) ? what : join(root, what);
  return existsSync(full) ? full : undefined;
};

/**
 * The paths a listed source's observations depend on. Without an `about` of
 * its own, a file you read depends on that file, a command you ran on the
 * whole project, and what you were told or recalled on nothing.
 */
export const aboutOf = (source, root) => {
  if (Array.isArray(source.about)) {
    return [...new Set(source.about.map((path) => pathIn(root, path)))];
  }
  if (source.kind === "read" && local(root, source.what) !== undefined) {
    return [pathIn(root, source.what)];
  }
  return source.kind === "ran" ? ["."] : [];
};

/**
 * Every source the notes need, each with the hash of each path it depends
 * on: the ones the notes list, hashed by `hash`, and the ones `ran` gives
 * for sources run with see.mjs that are neither listed nor `known` already.
 */
export const sourcesOf = (notes, { hash, known, ran, root }) => {
  const listed = (notes.sources ?? []).map((source) => {
    const run = Array.isArray(source.about) ? undefined : ran(source.id);
    return {
      hashes:
        run?.hashes ??
        Object.fromEntries(
          aboutOf(source, root).map((path) => [path, hash(path)])
        ),
      id: source.id,
      kind: source.kind,
      what: source.what,
    };
  });
  const named = new Set([...listed.map((source) => source.id), ...known]);
  const fromRuns = [
    ...new Set((notes.observations ?? []).map((seen) => seen.source)),
  ]
    .filter((id) => !named.has(id) && ran(id) !== undefined)
    .map((id) => ({ id, ...ran(id) }));
  return [...listed, ...fromRuns];
};

/**
 * The step that records the notes: one `fact` form, so a source and what it
 * showed go in together. Everything is written as data, so no text in the
 * notes can be read as a name, a variable, or code. Each belief is judged
 * from `version` on, the version of the project it was formed in.
 */
export const stepOf = (notes, sources, version) => [
  "begin",
  [
    "fact",
    ...sources.flatMap((source) => [
      ["source", quoted(source.id), quoted(source.kind), quoted(source.what)],
      ...Object.entries(source.hashes).map(([path, hash]) => [
        "about",
        quoted(source.id),
        quoted(path),
        quoted(hash),
      ]),
    ]),
    ...(notes.observations ?? []).map((seen) => [
      "observed",
      quoted(seen.id),
      quoted(seen.source),
      quoted(seen.quote),
      quoted(seen.question),
      quoted(seen.value ?? null),
    ]),
    ...(notes.problems ?? []).map((problem) => [
      "problem",
      quoted(problem.id),
      quoted(problem.statement ?? ""),
      quoted(problem.question),
      quoted(problem.value ?? null),
    ]),
    ...(notes.beliefs ?? []).flatMap((belief) => [
      ["belief", quoted(belief.id), quoted(belief.statement ?? "")],
      ["since", quoted(belief.id), version],
      ...(belief.predicts ?? []).map(({ question, value }) => [
        "predicts",
        quoted(belief.id),
        quoted(question),
        quoted(value ?? null),
      ]),
      ...[belief.explains ?? []]
        .flat()
        .map((problem) => ["explains", quoted(belief.id), quoted(problem)]),
    ]),
    ...(notes.needed ?? []).map((question) => ["needed", quoted(question)]),
  ],
  "recorded",
];

/**
 * What is wrong with the notes: an id that cannot name a file, a kind that
 * is not one of the four, and each quote that is not in its source's text.
 * `textOf` gives the text of a source, or undefined when there is none.
 */
export const problemsOf = (notes, textOf) => [
  ...(notes.sources ?? []).flatMap((source) => [
    ...(ID.test(String(source.id))
      ? []
      : [
          `${source.id}: an id is letters, digits, and . _ - and starts with a letter or digit.`,
        ]),
    ...(KINDS.includes(source.kind)
      ? []
      : [`${source.id}: kind is one of ${KINDS.join(", ")}.`]),
  ]),
  ...(notes.observations ?? []).flatMap((seen) => {
    const text = textOf(String(seen.source));
    if (text === undefined) {
      return [
        `${seen.id}: there is no text for ${seen.source}. Run it with see.mjs, or save what you saw as seen/${seen.source}.txt, first.`,
      ];
    }
    return [seen.quote]
      .flat()
      .filter((quote) => !hasQuote(text, String(quote)))
      .map(
        (quote) =>
          `${seen.id}: these words are not in the text of ${seen.source}: "${String(quote).slice(0, SHOWN)}"`
      );
  }),
];

const fileText = (path) =>
  path !== undefined && existsSync(path)
    ? readFileSync(path, "utf8")
    : undefined;

const main = (path) => {
  if (path === undefined || !existsSync(path)) {
    console.error("Usage: node record.mjs notes/<number>-<name>.json");
    process.exit(1);
  }
  inTaskFolder();
  const notes = readJson(path);
  const root = projectRoot(".");
  const model = existsSync("model.json") ? readJson("model.json") : [];
  const whats = new Map(
    rowsOf(model, "source").map(([id, , what]) => [id, what])
  );
  const ran = (id) => {
    const saved = join("seen", `${id}.json`);
    return ID.test(String(id)) && existsSync(saved)
      ? readJson(saved)
      : undefined;
  };
  const manifest = snapshot(".", root);
  const sources = sourcesOf(notes, {
    hash: (p) => hasherFor(root, [p])(manifest, p),
    known: [...whats.keys()],
    ran,
    root,
  });
  for (const source of sources) {
    whats.set(source.id, source.what);
  }
  const problems = problemsOf(notes, (id) =>
    ID.test(id)
      ? (fileText(join("seen", `${id}.txt`)) ??
        fileText(local(root, whats.get(id))))
      : undefined
  );
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    console.error(
      "Nothing was recorded. Copy each quote from the text, word for word."
    );
    process.exit(1);
  }
  const step = join("steps", basename(path));
  const before = existsSync(step) ? readFileSync(step) : undefined;
  writeFileSync(
    step,
    `${JSON.stringify(stepOf(notes, sources, latestVersion(".")), null, 1)}\n`
  );
  const result = replay(".");
  if (!result.ok) {
    if (before === undefined) {
      rmSync(step);
    } else {
      writeFileSync(step, before);
    }
    console.error(result.error);
    console.error(
      `The model refused ${step}, so it was taken back. Fix the notes and record them again.`
    );
    process.exit(1);
  }
  const count = (name) => (notes[name] ?? []).length;
  console.log(
    `${step}: ${sources.length} sources, ${count("observations")} observations, ${count("problems")} problems, ${count("beliefs")} beliefs, ${count("needed")} needed; every quote found. The model has ${result.steps} steps.`
  );
};

if (isMain(import.meta.url)) {
  main(process.argv[2]);
}
