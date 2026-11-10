// Stamps the script and stylesheet URLs in docs/index.html with a hash of the
// site's assets. GitHub Pages lets browsers cache every file for ten minutes,
// so without a version a new page can run its examples on a cached evaluator
// from the previous release. playground.js and script.js pass the same version
// on to lion-worker.js and highlight.js.
//
//   bun run stamp           update docs/index.html
//   bun run stamp --check   fail when docs/index.html is out of date
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DOCS = join(import.meta.dirname, "../../docs");
const INDEX = join(DOCS, "index.html");

/** Every file whose change must reach returning visitors at once. */
const HASHED = [
  "lion-worker.js",
  "playground.js",
  "script.js",
  "constellation.js",
  "highlight.js",
  "styles.css",
];

/** Files that index.html references directly. */
const REFERENCED = [
  "styles.css",
  "constellation.js",
  "script.js",
  "playground.js",
];

const REFERENCE = (file: string) =>
  new RegExp(`"${file.replaceAll(".", "\\.")}(?:\\?v=[0-9a-f]+)?"`, "g");

const hash = createHash("sha256");
for (const file of HASHED) {
  hash.update(file);
  hash.update(readFileSync(join(DOCS, file)));
}
const version = hash.digest("hex").slice(0, 10);

const current = readFileSync(INDEX, "utf8");
let stamped = current;
for (const file of REFERENCED) {
  const pattern = REFERENCE(file);
  const count = stamped.match(pattern)?.length ?? 0;
  if (count !== 1) {
    throw new Error(
      `docs/index.html should reference ${file} once, but found ${count}.`
    );
  }
  stamped = stamped.replace(pattern, `"${file}?v=${version}"`);
}

const check = process.argv.includes("--check");

if (stamped === current) {
  console.log(`docs/index.html asset version is current (v=${version}).`);
} else if (check) {
  console.error(
    "docs/index.html asset versions are out of date. Run `bun run --cwd packages/site-runtime stamp` and commit the result."
  );
  process.exitCode = 1;
} else {
  writeFileSync(INDEX, stamped);
  console.log(`Stamped docs/index.html assets with v=${version}.`);
}
