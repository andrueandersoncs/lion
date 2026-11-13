#!/usr/bin/env node
// Packs a research model and the plan of its page into one HTML file that
// runs Lion in the browser.
//
//   node build-explorer.mjs <model.json> --page page.json [--out explorer.html]
//
// The plan says what the page is called, the short answer on top, and the
// views it has, each a list of blocks chosen for what this reader wants to
// know. The file carries the model, the plan, and the Lion engine, so it
// opens from disk with no server and no network. It also carries the saved
// text of each source a claim quotes, from sources/ beside the model, so a
// reader can see each quote where it stands.
//
// It also writes page-check.json beside the page: every query the plan asks,
// as one Lion record, so they can all be run at once with the lion command.
// Runs under node or bun.
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { claimsOf, whereIn } from "./check-quotes.mjs";

const USAGE =
  "Usage: node build-explorer.mjs <model.json> --page page.json [--out explorer.html]";
const OPTIONS = ["page", "out"];
const DIGIT = /\d/;
const SHOWN = 70;
const assets = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
const asset = (name) => readFileSync(join(assets, name));

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const readJson = (path, what) => {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return fail(`Cannot read the ${what} file ${path}.`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    return fail(`The ${what} file ${path} is not valid JSON: ${error.message}`);
  }
};

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * JSON that is safe inside a <script> element. A "<" is the only way to end
 * the element or open a comment in it, and JSON has one only inside a string,
 * where the escape means the same.
 */
export const embedJson = (value) =>
  JSON.stringify(value).replaceAll("<", "\\u003c");

const escapeHtml = (text) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const words = () => JSON.parse(asset("words.json").toString("utf8"));

/**
 * An expression of the plan as it runs: after the wording helpers the page
 * carries and the plan's own definitions.
 */
export const within = (page, expression) => [
  "begin",
  ...Object.entries({ ...words(), ...(page.define ?? {}) }).map(
    ([name, value]) => ["define", name, value]
  ),
  expression,
];

/** The texts of a block that the plan may compute, each with what it is. */
const textsOfBlock = (block) => [
  ["answer", block.answer],
  ["note", block.note],
  ["text", block.text],
  ...(block.type === "figures"
    ? (block.items ?? []).flatMap((item) => [
        [`figure: ${item.label}`, item.value],
        [`note on ${item.label}`, item.note],
      ])
    : []),
];

/** The queries one block asks, each under a name that says what it is for. */
const queriesOfBlock = (block) => {
  if (block.type === "answer") {
    return [["evidence", block.evidence]];
  }
  if (block.type === "lookup") {
    const choices = Object.entries(block.choose ?? {});
    return [
      ...choices.map(([name, choice]) => [
        `choices for ${name}`,
        choice.options,
      ]),
      // The query is a function of the choices; the example is one call of it.
      [
        "with the example",
        isRecord(block.example)
          ? [
              block.query,
              ...choices.map(([name]) => ["quote", block.example[name]]),
            ]
          : undefined,
      ],
    ];
  }
  return [["query", block.query]];
};

const computed = (value) => value !== undefined && typeof value !== "string";

/**
 * Everything a plan asks of the model, as one Lion record: each text it
 * computes and each query it runs. Running it shows, before the page is
 * opened, that each one works and what it gives.
 */
export const queriesOf = (page) =>
  Object.fromEntries(
    numbered(
      [
        ["summary", page.summary],
        ...(page.views ?? []).flatMap((view, viewAt) =>
          (view.blocks ?? []).flatMap((block, blockAt) => {
            const title =
              block.question ?? block.title ?? `${block.type} ${blockAt + 1}`;
            const place = `${view.name ?? `view ${viewAt + 1}`} › ${title}`;
            return [...textsOfBlock(block), ...queriesOfBlock(block)].map(
              ([name, expression]) => [`${place} › ${name}`, expression]
            );
          })
        ),
      ]
        .filter(([, expression]) => computed(expression))
        .map(([name, expression]) => [name, within(page, expression)])
    )
  );

/**
 * The entries with each name told apart: a name that comes again, as it
 * does for two blocks with one title, is numbered, so no entry replaces
 * another.
 */
const numbered = (entries) => {
  const seen = new Map();
  return entries.map(([name, value]) => {
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    return [count === 1 ? name : `${name} (${count})`, value];
  });
};

/**
 * The goals whose first argument is a question with its readings left out,
 * which they look up the readings of, so naming one there is how a plan
 * should ask about it.
 */
const BASES = new Set(["meant", "ambiguous", "readings", "base"]);

/**
 * Every record the plan's expressions hold, except a base given to one of
 * the goals above. A pattern among them, such as `{"revenue": "?company"}`,
 * is compared as data, so it matches no question.
 */
const recordsIn = (value, found = []) => {
  if (Array.isArray(value)) {
    const skip = BASES.has(value[0]) ? 1 : -1;
    for (const [at, item] of value.entries()) {
      if (at !== skip) {
        recordsIn(item, found);
      }
    }
  } else if (isRecord(value)) {
    found.push(value);
    for (const item of Object.values(value)) {
      recordsIn(item, found);
    }
  }
  return found;
};

/**
 * A check for page-check.json: the questions the plan names as they stand
 * that the reader's choices set aside, or that sources answer in more than
 * one sense nobody chose between. A plan reaches those through `meant`.
 */
export const namedReadingsOf = (page) => {
  const named = recordsIn(Object.values(queriesOf(page)).map((e) => e.at(-1)));
  return named.length === 0
    ? {}
    : {
        "Questions the plan names that a choice set aside, or that have readings nobody chose between":
          [
            "find",
            "?question",
            [
              "and",
              ["in", "?question", ["quote", named]],
              [
                "or",
                ["set_aside", "?question", "?_", "?_", "?_"],
                ["ambiguous", "?question", "?_", "?_"],
              ],
            ],
          ],
      };
};

/**
 * What a reviewer should look at: text typed into the plan that holds a
 * digit, since a figure should be worked out from the model, and a figure
 * whose value was typed in.
 */
export const typedFigures = (page) =>
  [
    ["summary", page.summary],
    ...(page.views ?? []).flatMap((view) =>
      (view.blocks ?? []).flatMap((block) =>
        textsOfBlock(block).map(([name, text]) => [
          `${view.name} › ${block.question ?? block.title ?? block.type} › ${name}`,
          text,
        ])
      )
    ),
  ].filter(([name, text]) =>
    name.includes("figure: ")
      ? typeof text === "string" || typeof text === "number"
      : typeof text === "string" && DIGIT.test(text)
  );

/**
 * The saved text of each source a claim quotes, and where each claim's
 * quote stands in it, so the page can show a quote in its place. `textOf`
 * gives a source's saved text, or undefined when none was saved.
 */
export const passagesOf = (database, textOf) => {
  const texts = {};
  const marks = {};
  for (const claim of claimsOf(database)) {
    const text = textOf(String(claim.source));
    const at =
      text === undefined ? undefined : whereIn(text, String(claim.quote));
    if (at !== undefined) {
      texts[claim.source] = text;
      marks[claim.id] = at;
    }
  }
  return { marks, texts };
};

/**
 * The page for a model: the shell, with the data, engine, and script added.
 * `passages`, from `passagesOf`, lets the page show each quote in its source.
 */
export const buildExplorer = ({ database, page, generated, passages }) => {
  const data = embedJson({
    generated,
    database,
    page,
    words: words(),
    ...passages,
  });
  const engine = asset("lion-engine.js").toString("base64");
  const script = asset("explorer.js")
    .toString("utf8")
    .replaceAll("</script", "<\\/script");
  const scripts = [
    `<script type="application/json" id="lion-data">${data}</script>`,
    `<script type="text/plain" id="lion-engine">${engine}</script>`,
    `<script>${script}</script>`,
  ];
  const title = String(page?.title ?? "Research model");
  // Functions as replacements, so a "$" in the data is not read as a pattern.
  return asset("explorer.html")
    .toString("utf8")
    .replace(
      "<title>Research model</title>",
      () => `<title>${escapeHtml(title)}</title>`
    )
    .replace("<!--LION:SCRIPTS-->", () => scripts.join("\n"));
};

/** Splits the arguments into the `--name value` options and the paths. */
const parseArguments = (args) => {
  const options = {};
  const paths = [];
  const rest = [...args];
  while (rest.length > 0) {
    const arg = rest.shift();
    const name = arg.startsWith("--") ? arg.slice(2) : undefined;
    if (name !== undefined && OPTIONS.includes(name)) {
      options[name] = rest.shift();
    } else {
      paths.push(arg);
    }
  }
  return { options, paths };
};

const main = (args) => {
  const { options, paths } = parseArguments(args);
  if (paths.length !== 1 || options.page === undefined) {
    fail(USAGE);
  }
  const [path] = paths;
  const database = readJson(path, "model");
  if (!(Array.isArray(database) && database[0] === "begin")) {
    fail(
      `${path} is not a saved Lion database. Pass the file that the lion command was given as --database.`
    );
  }
  const page = readJson(options.page, "page plan");
  if (!(isRecord(page) && Array.isArray(page.views) && page.views.length > 0)) {
    fail(
      `${options.page} must hold one JSON record with "title", "summary", and "views": a list of views, each with a "name" and its "blocks".`
    );
  }
  const out = resolve(options.out ?? join(dirname(path), "explorer.html"));
  const passages = passagesOf(database, (source) => {
    const saved = join(dirname(path), "sources", `${source}.txt`);
    return existsSync(saved) ? readFileSync(saved, "utf8") : undefined;
  });
  const html = buildExplorer({
    database,
    page,
    generated: new Date().toISOString().slice(0, 10),
    passages,
  });
  writeFileSync(out, html);
  const check = join(dirname(out), "page-check.json");
  const checks = { ...queriesOf(page), ...namedReadingsOf(page) };
  writeFileSync(check, `${JSON.stringify(checks, null, 1)}\n`);
  console.log(
    `${out} (${Math.round(html.length / 1024)} KB, with the saved text of ${Object.keys(passages.texts).length} sources, so ${Object.keys(passages.marks).length} quotes show where they stand)`
  );
  console.log(
    `${check} (${Object.keys(checks).length} texts, queries, and checks)`
  );
  const typed = typedFigures(page);
  for (const [name, text] of typed) {
    console.log(`typed in  ${name}: ${String(text).slice(0, SHOWN)}`);
  }
  if (typed.length > 0) {
    console.log(
      "The texts above were typed into the plan and hold a digit. A figure should be a Lion expression, so the model works it out. A digit in a name, such as a product's, is fine."
    );
  }
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
  main(process.argv.slice(2));
}
