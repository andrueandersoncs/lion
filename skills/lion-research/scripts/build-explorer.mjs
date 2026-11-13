#!/usr/bin/env node
// Packs a research model and the plan of its page into one HTML file that
// runs Lion in the browser.
//
//   node build-explorer.mjs <model.json> --page page.json [--out explorer.html]
//
// The plan says what the page is called, the short answer on top, and the
// views it has, each a list of blocks chosen for what this reader wants to
// know. The file carries the model, the plan, and the Lion engine, so it
// opens from disk with no server and no network.
//
// It also writes page-check.json beside the page: every query the plan asks,
// as one Lion record, so they can all be run at once with the lion command.
// Runs under node or bun.
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE =
  "Usage: node build-explorer.mjs <model.json> --page page.json [--out explorer.html]";
const OPTIONS = ["page", "out"];
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

/** A query with each "$name" in it replaced by the value chosen for it. */
export const filled = (query, chosen) => {
  if (typeof query === "string" && query.startsWith("$")) {
    return query.slice(1) in chosen ? ["quote", chosen[query.slice(1)]] : query;
  }
  if (Array.isArray(query)) {
    return query.map((part) => filled(part, chosen));
  }
  return isRecord(query)
    ? Object.fromEntries(
        Object.entries(query).map(([key, part]) => [key, filled(part, chosen)])
      )
    : query;
};

/** The queries one block asks, each under a name that says what it is for. */
const queriesOfBlock = (block) => {
  if (block.type === "answer") {
    return block.evidence === undefined ? [] : [["evidence", block.evidence]];
  }
  if (block.type === "figures") {
    return (block.items ?? [])
      .filter((item) => item.query !== undefined)
      .map((item) => [`figure: ${item.label}`, item.query]);
  }
  if (block.type === "lookup") {
    const options = Object.entries(block.choose ?? {}).map(([name, choice]) => [
      `choices for ${name}`,
      choice.options,
    ]);
    return isRecord(block.example)
      ? [...options, ["with the example", filled(block.query, block.example)]]
      : options;
  }
  return block.query === undefined ? [] : [["query", block.query]];
};

/**
 * Every query a plan asks, as one Lion record. Running it shows, before the
 * page is opened, that each one runs and what it gives.
 */
export const queriesOf = (page) =>
  Object.fromEntries(
    (page.views ?? []).flatMap((view, viewAt) =>
      (view.blocks ?? []).flatMap((block, blockAt) => {
        const title =
          block.question ?? block.title ?? `${block.type} ${blockAt + 1}`;
        return queriesOfBlock(block).map(([name, query]) => [
          `${view.name ?? `view ${viewAt + 1}`} › ${title} › ${name}`,
          query,
        ]);
      })
    )
  );

/** The page for a model: the shell, with the data, engine, and script added. */
export const buildExplorer = ({ database, page, generated }) => {
  const data = embedJson({ generated, database, page });
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
  const html = buildExplorer({
    database,
    page,
    generated: new Date().toISOString().slice(0, 10),
  });
  writeFileSync(out, html);
  const check = join(dirname(out), "page-check.json");
  writeFileSync(check, `${JSON.stringify(queriesOf(page), null, 1)}\n`);
  console.log(`${out} (${Math.round(html.length / 1024)} KB)`);
  console.log(`${check} (${Object.keys(queriesOf(page)).length} queries)`);
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
