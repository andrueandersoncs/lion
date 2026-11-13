#!/usr/bin/env node
// Prints the text of a web page, so the words a claim quotes can be kept
// beside the model and checked against it later.
//
//   node page-text.mjs <url> > sources/<source id>.txt
//
// The text is the page's own, not a summary of it. Runs under node or bun.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HIDDEN =
  /<(script|style|noscript|template|svg|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const COMMENT = /<!--[\s\S]*?-->/g;
const DECLARATION = /<[!?][^>]*>/g;
const BREAK =
  /<(?:br|hr)\b[^>]*>|<\/(?:p|div|li|tr|h[1-6]|blockquote|section|article|header|footer|table|ul|ol|pre|title|dd|dt)\s*>/gi;
const TAG = /<\/?[a-zA-Z][^>]*>/g;
const ENTITY = /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi;
const SPACES = /[ \t\f\v ]+/g;
const AROUND_LINES = / ?\n ?/g;
const BLANK_LINES = /\n{2,}/g;
const NAMED = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: '"',
  rdquo: "”",
  rsquo: "’",
};

const decodeEntity = (whole, name) => {
  const lower = name.toLowerCase();
  if (lower.startsWith("#x")) {
    return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
  }
  if (lower.startsWith("#")) {
    return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
  }
  return NAMED[lower] ?? whole;
};

/**
 * The text a reader sees in a page: no scripts, styles, or tags, one line for
 * each block, and entities as the characters they stand for.
 */
export const htmlToText = (html) =>
  html
    .replace(HIDDEN, " ")
    .replace(COMMENT, " ")
    .replace(DECLARATION, " ")
    .replace(BREAK, "\n")
    .replace(TAG, " ")
    .replace(ENTITY, decodeEntity)
    .replace(SPACES, " ")
    .replace(AROUND_LINES, "\n")
    .replace(BLANK_LINES, "\n")
    .trim();

const main = async (url) => {
  if (url === undefined) {
    console.error("Usage: node page-text.mjs <url> > sources/<source id>.txt");
    process.exit(1);
  }
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; research-reader)" },
    redirect: "follow",
  });
  if (!response.ok) {
    console.error(
      `${url} answered ${response.status}. Nothing was read, so record the source without claims of its own, or read it another way.`
    );
    process.exit(1);
  }
  const body = await response.text();
  const type = response.headers.get("content-type") ?? "";
  console.log(type.includes("html") ? htmlToText(body) : body.trim());
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
  await main(process.argv[2]);
}
