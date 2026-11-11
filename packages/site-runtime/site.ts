// Shared facts about the lionlang.dev pages in docs/: which assets they load
// and how their URLs are versioned. GitHub Pages lets browsers cache every
// file for ten minutes, so without a version a new page can run its examples
// on a cached evaluator from the previous release. playground.js and
// script.js pass the same version on to lion-worker.js and highlight.js.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const DOCS = join(import.meta.dirname, "../../docs");

/** Every file whose change must reach returning visitors at once. */
const HASHED = [
  "lion-worker.js",
  "playground.js",
  "script.js",
  "constellation.js",
  "highlight.js",
  "docs.js",
  "styles.css",
];

/** Each page, and the files it references directly. */
export const PAGES: Readonly<Record<string, readonly string[]>> = {
  "index.html": [
    "styles.css",
    "constellation.js",
    "script.js",
    "playground.js",
  ],
  "docs.html": ["styles.css", "script.js", "playground.js", "docs.js"],
};

/** A short hash of every hashed asset. */
export const assetVersion = () => {
  const hash = createHash("sha256");
  for (const file of HASHED) {
    hash.update(file);
    hash.update(readFileSync(join(DOCS, file)));
  }
  return hash.digest("hex").slice(0, 10);
};

const reference = (file: string) =>
  new RegExp(`"${file.replaceAll(".", "\\.")}(?:\\?v=[0-9a-f]+)?"`, "g");

/**
 * Points each of a page's asset references at the given version. Fails
 * unless the page references each of its assets exactly once.
 */
export const stampPage = (page: string, html: string, version: string) => {
  let stamped = html;
  for (const file of PAGES[page] ?? []) {
    const pattern = reference(file);
    const count = stamped.match(pattern)?.length ?? 0;
    if (count !== 1) {
      throw new Error(
        `docs/${page} should reference ${file} once, but found ${count}.`
      );
    }
    stamped = stamped.replace(pattern, `"${file}?v=${version}"`);
  }
  return stamped;
};
