#!/usr/bin/env node
// Checks that every claim's quote appears, word for word, in the saved text
// of its source.
//
//   node check-quotes.mjs [research folder]
//
// It reads model.json and sources/<source id>.txt in the folder, the current
// one by default. It exits with 1 when a quote is not in its source's text.
// Runs under node or bun.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SINGLE_QUOTES = /[‘’‚‛′]/g;
const DOUBLE_QUOTES = /[“”„‟″]/g;
const DASHES = /[‐-―−]/g;
const ELLIPSIS = /…/g;
const WHITESPACE = /\s+/g;
const SHOWN = 90;

/** A character with the marks that combine with it, such as an accent. */
const CLUSTER = /\P{M}\p{M}*|\p{M}+/gsu;
const SPACE = /^\s+$/;

/**
 * Text as it is compared: differences of spacing, line breaks, and
 * typographic quotes and dashes do not count, and every word does. Beside
 * the text, `from` and `to` say where in the original each of its
 * characters came from, so a match can be shown where it stands.
 */
const indexed = (text) => {
  let out = "";
  const from = [];
  const to = [];
  for (const { 0: cluster, index } of text.matchAll(CLUSTER)) {
    const piece = SPACE.test(cluster)
      ? " "
      : cluster
          .normalize("NFKC")
          .replace(SINGLE_QUOTES, "'")
          .replace(DOUBLE_QUOTES, '"')
          .replace(DASHES, "-")
          .replace(ELLIPSIS, "...")
          .replace(WHITESPACE, " ");
    for (const char of piece) {
      // Spacing counts once, and not at all at the start.
      if (char === " " && (out === "" || out.endsWith(" "))) {
        continue;
      }
      out += char;
      from.push(index);
      to.push(index + cluster.length);
    }
  }
  const kept = out.endsWith(" ") ? out.length - 1 : out.length;
  return {
    from: from.slice(0, kept),
    text: out.slice(0, kept),
    to: to.slice(0, kept),
  };
};

export const normalize = (text) => indexed(text).text;

/** Whether the quote is in the text, word for word. */
export const hasQuote = (text, quote) =>
  normalize(quote) !== "" && normalize(text).includes(normalize(quote));

/**
 * Where the quote first stands in the text, as the start and end of that
 * stretch of the original, or undefined when it is not there.
 */
export const whereIn = (text, quote) => {
  const wanted = normalize(quote);
  const { from, text: compared, to } = indexed(text);
  const at = wanted === "" ? -1 : compared.indexOf(wanted);
  return at === -1 ? undefined : [from[at], to[at + wanted.length - 1]];
};

const unquoted = (value) =>
  Array.isArray(value) && value[0] === "quote" && value.length === 2
    ? value[1]
    : value;

/** The claims a saved model holds: each one's id, source, and quote. */
export const claimsOf = (model) =>
  (Array.isArray(model) ? model : [])
    .filter((form) => Array.isArray(form) && form[0] === "fact")
    .flatMap((form) => form.slice(1))
    .filter((fact) => Array.isArray(fact) && fact[0] === "claim")
    .map(([, id, source, quote]) => ({
      id: unquoted(id),
      quote: unquoted(quote),
      source: unquoted(source),
    }));

/**
 * Sorts claims by what their source's saved text shows. `textOf` gives the
 * text saved for a source, or undefined when none was saved.
 */
export const checkQuotes = (claims, textOf) => {
  const result = { found: [], missing: [], unsaved: [] };
  for (const claim of claims) {
    const text = textOf(claim.source);
    if (text === undefined) {
      result.unsaved.push(claim);
    } else if (hasQuote(text, String(claim.quote))) {
      result.found.push(claim);
    } else {
      result.missing.push(claim);
    }
  }
  return result;
};

const shorten = (text) =>
  text.length > SHOWN ? `${text.slice(0, SHOWN)}…` : text;

const main = (folder) => {
  const modelPath = join(folder, "model.json");
  if (!existsSync(modelPath)) {
    console.error(
      `There is no model.json in ${folder}. Run this in the research folder, or pass its path.`
    );
    process.exit(1);
  }
  const claims = claimsOf(JSON.parse(readFileSync(modelPath, "utf8")));
  const { found, missing, unsaved } = checkQuotes(claims, (source) => {
    const path = join(folder, "sources", `${source}.txt`);
    return existsSync(path) ? readFileSync(path, "utf8") : undefined;
  });
  console.log(
    `${claims.length} claims: ${found.length} quotes found in their source's text, ${missing.length} not found, ${unsaved.length} with no saved text.`
  );
  for (const claim of missing) {
    console.log(
      `not found  ${claim.id}  sources/${claim.source}.txt  "${shorten(String(claim.quote))}"`
    );
  }
  for (const source of new Set(unsaved.map((claim) => claim.source))) {
    const count = unsaved.filter((claim) => claim.source === source).length;
    console.log(
      `no text    sources/${source}.txt  (${count} ${count === 1 ? "claim" : "claims"})`
    );
  }
  process.exit(missing.length > 0 ? 1 : 0);
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
  main(resolve(process.argv[2] ?? "."));
}
