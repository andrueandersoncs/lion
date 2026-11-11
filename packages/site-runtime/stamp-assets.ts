// Stamps the script and stylesheet URLs in each page under docs/ with a hash
// of the site's assets. See site.ts for why.
//
//   bun run stamp           update the pages
//   bun run stamp --check   fail when a page is out of date
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assetVersion, DOCS, PAGES, stampPage } from "./site.ts";

const version = assetVersion();
const check = process.argv.includes("--check");

for (const page of Object.keys(PAGES)) {
  const path = join(DOCS, page);
  const current = readFileSync(path, "utf8");
  const stamped = stampPage(page, current, version);
  if (stamped === current) {
    console.log(`docs/${page} asset version is current (v=${version}).`);
  } else if (check) {
    console.error(
      `docs/${page} asset versions are out of date. Run \`bun run --cwd packages/site-runtime stamp\` and commit the result.`
    );
    process.exitCode = 1;
  } else {
    writeFileSync(path, stamped);
    console.log(`Stamped docs/${page} assets with v=${version}.`);
  }
}
