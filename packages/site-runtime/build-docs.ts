// Builds docs/docs.html, the documentation page of lionlang.dev, from the
// fragments in content/. The docs follow the Diátaxis framework: tutorials,
// how-to guides, reference, and explanation, each kept apart from the others.
//
// A fragment is one <article> with an id, a data-title, and a data-summary.
// Inside it:
//
//   <lion-example name="...">program</lion-example>
//     A live, editable example. The build runs it with the evaluator the page
//     uses and writes its result, so every published result is real.
//     expect="error" marks an example that must fail; any other failure, or
//     an example too slow for the browser, stops the build.
//   <code-block lang="ts|json|shell">code</code-block>
//     A static snippet.
//   <docs-map></docs-map>
//     A map of every document, grouped by kind.
//   data-entry="name" on any element
//     A reference entry: it gets an id and appears in search.
//
// Headings get ids, every link must point at an id on the page, and the
// sidebar, contents, pager, and search index are generated.
//
//   bun run docs            write docs/docs.html
//   bun run docs --check    fail when docs/docs.html is out of date
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assetVersion, DOCS, stampPage } from "./site.ts";
import { evaluateSource } from "./src/evaluate.ts";

const CONTENT = join(import.meta.dirname, "content");
const PAGE = join(DOCS, "docs.html");

/** Examples slower than this in Bun risk the page's 1.5 s browser timeout. */
const SLOW_EXAMPLE_MS = 400;

interface Kind {
  readonly docs: readonly string[];
  readonly id: string;
  readonly label: string;
  readonly purpose: string;
  readonly serves: string;
  readonly title: string;
}

/** The four kinds of documentation, and their documents in reading order. */
const KINDS: readonly Kind[] = [
  {
    id: "tutorials",
    title: "Tutorials",
    label: "Tutorial",
    purpose: "Learning-oriented",
    serves: "Lessons that build something real, one working step at a time.",
    docs: ["first-program", "family-tree", "order-desk", "sort-an-inbox"],
  },
  {
    id: "how-to",
    title: "How-to guides",
    label: "How-to guide",
    purpose: "Task-oriented",
    serves: "Directions for getting a specific job done.",
    docs: [
      "run-from-typescript",
      "use-the-cli",
      "branch-on-shape",
      "transform-lists",
      "code-as-data",
      "query-with-conditions",
      "ask-questions",
      "sort-and-page",
      "recursive-relations",
      "find-missing",
      "summarize-groups",
      "graph-questions",
      "enforce-rules",
      "check-data",
      "take-data-apart",
      "explain-results",
      "save-and-load",
      "extend-with-host-code",
      "call-host-objects",
      "ask-ai-models",
    ],
  },
  {
    id: "reference",
    title: "Reference",
    label: "Reference",
    purpose: "Information-oriented",
    serves: "Exact descriptions of every form, function, and command.",
    docs: [
      "evaluation-rules",
      "special-forms",
      "logic-forms",
      "query-options",
      "standard-library",
      "logic-guarantees",
      "errors",
      "cli",
      "typescript-api",
    ],
  },
  {
    id: "explanation",
    title: "Explanation",
    label: "Explanation",
    purpose: "Understanding-oriented",
    serves: "Background, reasoning, and the design choices behind Lion.",
    docs: [
      "why-json",
      "names-and-scope",
      "logic-programming",
      "goal-directed-evaluation",
      "consistent-semantics",
    ],
  },
];

interface Doc {
  body: string;
  headings: Heading[];
  readonly id: string;
  readonly kind: Kind | undefined;
  readonly summary: string;
  readonly title: string;
}

interface Heading {
  readonly id: string;
  readonly level: number;
  readonly text: string;
}

interface SearchEntry {
  /** The document it belongs to. */
  readonly d: string;
  readonly h: string;
  /** The document's kind. */
  readonly k: string;
  /** What matched: a document title, heading, or reference entry. */
  readonly t: string;
}

const fail = (message: string): never => {
  throw new Error(message);
};

const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const escapeAttribute = (text: string) =>
  escapeHtml(text).replaceAll('"', "&quot;");

const decodeEntities = (text: string) =>
  text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");

const stripTags = (html: string) =>
  decodeEntities(html.replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const ATTRIBUTE = /([\w-]+)="([^"]*)"/g;

const attributes = (text: string) =>
  Object.fromEntries(
    [...text.matchAll(ATTRIBUTE)].map(([, name, value]) => [
      name,
      decodeEntities(value ?? ""),
    ])
  ) as Record<string, string | undefined>;

const LEADING_BLANK_LINES = /^\s*\n/;
const TRAILING_SPACE = /\s+$/;
const INDENT = /^ */;

/** Removes blank edges and the indentation every line shares. */
const dedent = (text: string) => {
  const lines = text
    .replace(LEADING_BLANK_LINES, "")
    .replace(TRAILING_SPACE, "")
    .split("\n");
  const indents = lines
    .filter((line) => line.trim() !== "")
    .map((line) => line.match(INDENT)?.[0].length ?? 0);
  const indent = Math.min(...indents);
  return lines.map((line) => line.slice(indent)).join("\n");
};

const ARTICLE = /^\s*<article\s([^>]*)>([\s\S]*)<\/article>\s*$/;

const readDoc = (path: string, kind: Kind | undefined, name: string): Doc => {
  const source = readFileSync(path, "utf8");
  const match = ARTICLE.exec(source);
  if (!match) {
    return fail(`${path} must contain exactly one <article>.`);
  }
  const {
    id,
    "data-title": title,
    "data-summary": summary,
  } = attributes(match[1] ?? "");
  if (id !== name) {
    return fail(`${path} must have id="${name}", but has ${id}.`);
  }
  if (!(title && summary)) {
    return fail(`${path} needs a data-title and a data-summary.`);
  }
  return { id, kind, title, summary, body: match[2] ?? "", headings: [] };
};

const EXAMPLE = /<lion-example([^>]*)>([\s\S]*?)<\/lion-example>/g;

/** Runs one example and fails unless it behaves as its markup says. */
const runExample = async (doc: Doc, attrs: string, code: string) => {
  const { name, expect } = attributes(attrs);
  if (!name) {
    return fail(`An example in "${doc.id}" has no name.`);
  }
  const source = dedent(decodeEntities(code));
  const response = await evaluateSource({ id: 0, source });
  const where = `Example "${name}" in "${doc.id}"`;
  if (expect === "error" && response.ok) {
    return fail(`${where} should fail, but returned ${response.value}.`);
  }
  if (expect !== "error" && !response.ok) {
    return fail(`${where} failed: ${response.error}`);
  }
  const ms = response.ms ?? 0;
  if (ms > SLOW_EXAMPLE_MS) {
    return fail(
      `${where} took ${Math.round(ms)} ms, too slow for the browser.`
    );
  }
  return { name, response, source };
};

/** Writes an example out as a live playground with its real result. */
const renderExample = ({
  name,
  response,
  source,
}: Awaited<ReturnType<typeof runExample>>) => {
  const result = response.ok ? response.value : response.error;
  const status = response.ok ? "ok" : "error";
  return `<div class="playground" data-playground="${escapeAttribute(name)}">
  <div class="code-block playground-code">
    <pre><code data-highlight>${escapeHtml(source)}</code></pre>
  </div>
  <div class="playground-output">
    <span class="playground-status is-${status}">${response.ok ? "result" : "error"}</span>
    <pre class="playground-result${response.ok ? "" : " is-error"}"><code>${escapeHtml(result)}</code></pre>
  </div>
</div>`;
};

/** Runs every example and writes it out as a live playground. */
const expandExamples = async (doc: Doc) => {
  const parts: string[] = [];
  let last = 0;
  for (const match of doc.body.matchAll(EXAMPLE)) {
    const example = await runExample(doc, match[1] ?? "", match[2] ?? "");
    parts.push(doc.body.slice(last, match.index), renderExample(example));
    last = (match.index ?? 0) + match[0].length;
  }
  parts.push(doc.body.slice(last));
  doc.body = parts.join("");
};

const CODE_BLOCK = /<code-block([^>]*)>([\s\S]*?)<\/code-block>/g;

const expandCodeBlocks = (doc: Doc) => {
  doc.body = doc.body.replace(CODE_BLOCK, (_, attrs: string, code: string) => {
    const { lang } = attributes(attrs);
    const text = escapeHtml(dedent(decodeEntities(code)));
    return lang === "shell"
      ? `<div class="code-block terminal"><pre><code>${text}</code></pre></div>`
      : `<div class="code-block"><pre><code data-highlight>${text}</code></pre></div>`;
  });
};

const HEADING = /<h([23])([^>]*)>([\s\S]*?)<\/h\1>/g;
const ENTRY = /<([a-z][\w-]*)((?:\s[^>]*)?\sdata-entry="([^"]*)"[^>]*)>/g;

/** Gives headings and entries ids, and lists them for contents and search. */
const identify = (doc: Doc, used: Set<string>, search: SearchEntry[]) => {
  const unique = (wanted: string) => {
    let id = wanted;
    for (let n = 2; used.has(id); n += 1) {
      id = `${wanted}-${n}`;
    }
    used.add(id);
    return id;
  };
  const kind = doc.kind?.id ?? "overview";
  doc.body = doc.body.replace(
    HEADING,
    (_, level: string, attrs: string, inner: string) => {
      const text = stripTags(inner);
      const given = attributes(attrs).id;
      const id = given ? unique(given) : unique(`${doc.id}-${slug(text)}`);
      if (given && id !== given) {
        fail(`The id "${given}" is used twice.`);
      }
      doc.headings.push({ level: Number(level), id, text });
      search.push({ t: text, d: doc.title, k: kind, h: id });
      const rest = given ? attrs : `${attrs} id="${id}"`;
      return `<h${level}${rest}>${inner}</h${level}>`;
    }
  );
  doc.body = doc.body.replace(
    ENTRY,
    (whole, tag: string, attrs: string, name: string) => {
      const given = attributes(attrs).id;
      const id = given ?? unique(`${doc.id}-${slug(name)}`);
      search.push({ t: decodeEntities(name), d: doc.title, k: kind, h: id });
      return given ? whole : `<${tag}${attrs} id="${id}">`;
    }
  );
};

const kindLabel = (kind: Kind | undefined) =>
  kind ? `${kind.label} · ${kind.purpose.toLowerCase()}` : "Start here";

/** Where each kind sits on the Diátaxis compass, read left to right. */
const MAP_ORDER = ["tutorials", "how-to", "explanation", "reference"];

const renderMapCard = (kind: Kind, docs: readonly Doc[]) => {
  const items = docs
    .filter((doc) => doc.kind === kind)
    .map((doc) => `<li><a href="#${doc.id}">${escapeHtml(doc.title)}</a></li>`)
    .join("\n        ");
  return `<section class="docs-map-card docs-kind-${kind.id}" aria-labelledby="map-${kind.id}">
      <p class="docs-map-purpose">${kind.purpose}</p>
      <h2 id="map-${kind.id}">${kind.title}</h2>
      <p>${kind.serves}</p>
      <ul>
        ${items}
      </ul>
    </section>`;
};

/**
 * The Diátaxis compass: tutorials and how-to guides help you act,
 * explanation and reference inform your thinking. Tutorials and explanation
 * serve study, how-to guides and reference serve work.
 */
const renderMap = (docs: readonly Doc[]) => {
  const cards = MAP_ORDER.map((id) => KINDS.find((kind) => kind.id === id))
    .filter((kind): kind is Kind => kind !== undefined)
    .map((kind) => renderMapCard(kind, docs));
  return `<div class="docs-map" role="group" aria-label="The four kinds of documentation">
    <span class="docs-map-axis is-top" aria-hidden="true">Practical · what to do</span>
    <span class="docs-map-axis is-bottom" aria-hidden="true">Theoretical · what to know</span>
    <span class="docs-map-axis is-left" aria-hidden="true">When you study</span>
    <span class="docs-map-axis is-right" aria-hidden="true">When you work</span>
    ${cards.join("\n    ")}
  </div>`;
};

/** Lets wide tables scroll sideways on narrow screens. */
const wrapTables = (doc: Doc) => {
  doc.body = doc.body
    .replaceAll("<table", '<div class="doc-table"><table')
    .replaceAll("</table>", "</table></div>");
};

const renderToc = (doc: Doc) => {
  if (doc.headings.length < 2) {
    return "";
  }
  const items = doc.headings
    .map(
      (heading) =>
        `<li class="doc-toc-level-${heading.level}"><a href="#${heading.id}">${escapeHtml(heading.text)}</a></li>`
    )
    .join("\n      ");
  return `<nav class="doc-toc" aria-label="On this page">
    <p class="doc-toc-title">On this page</p>
    <ul>
      ${items}
    </ul>
  </nav>`;
};

const renderPagerLink = (doc: Doc | undefined, direction: string) =>
  doc
    ? `<a class="doc-pager-link is-${direction}" href="#${doc.id}">
        <span class="doc-pager-label">${direction === "next" ? "Next" : "Previous"} · ${escapeHtml(doc.kind?.label ?? "Overview")}</span>
        <span class="doc-pager-title">${escapeHtml(doc.title)}</span>
      </a>`
    : "<span></span>";

const renderDoc = (doc: Doc, previous?: Doc, next?: Doc) => {
  const kind = doc.kind?.id ?? "overview";
  return `<article class="doc docs-kind-${kind}" id="${doc.id}" data-doc data-title="${escapeAttribute(doc.title)}" aria-labelledby="${doc.id}-title">
  <div class="doc-main">
    <header class="doc-header">
      <p class="doc-kind">${kindLabel(doc.kind)}</p>
      <h1 id="${doc.id}-title" tabindex="-1">${escapeHtml(doc.title)}</h1>
      <p class="doc-summary">${escapeHtml(doc.summary)}</p>
    </header>
    <div class="doc-body">
${doc.body.trim()}
    </div>
    <nav class="doc-pager" aria-label="More documents">
      ${renderPagerLink(previous, "previous")}
      ${renderPagerLink(next, "next")}
    </nav>
  </div>
  ${renderToc(doc)}
</article>`;
};

const renderSidebar = (
  docs: readonly Doc[]
) => `<aside class="docs-sidebar" id="docs-sidebar" aria-label="Documentation">
      <div class="docs-search" role="search">
        <label class="docs-search-label" for="docs-search-input">Search the docs</label>
        <input
          id="docs-search-input"
          class="docs-search-input"
          type="search"
          placeholder="Search docs"
          autocomplete="off"
          spellcheck="false"
          role="combobox"
          aria-expanded="false"
          aria-controls="docs-search-results"
          aria-autocomplete="list"
        >
        <kbd class="docs-search-key" aria-hidden="true">/</kbd>
        <ul class="docs-search-results" id="docs-search-results" role="listbox" aria-label="Search results" hidden></ul>
      </div>
      <nav class="docs-nav" aria-label="Documents">
        <a class="docs-nav-overview" href="#overview" data-doc-link="overview">Overview</a>
${KINDS.map(
  (kind) => `        <div class="docs-nav-group docs-kind-${kind.id}">
          <p class="docs-nav-title"><span class="docs-kind-dot" aria-hidden="true"></span>${kind.title}</p>
          <ul>
${docs
  .filter((doc) => doc.kind === kind)
  .map(
    (doc) =>
      `            <li><a href="#${doc.id}" data-doc-link="${doc.id}">${escapeHtml(doc.title)}</a></li>`
  )
  .join("\n")}
          </ul>
        </div>`
).join("\n")}
      </nav>
    </aside>`;

const GITHUB_ICON = `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>`;

const NAV_LINKS = [
  ["index.html#features", "Features"],
  ["index.html#examples", "Examples"],
  ["index.html#logic", "Logic"],
  ["index.html#editor", "Editor"],
  ["index.html#packages", "Packages"],
] as const;

const renderPage = (docs: readonly Doc[], search: readonly SearchEntry[]) => {
  const ordered = docs;
  const articles = ordered
    .map((doc, at) => renderDoc(doc, ordered[at - 1], ordered[at + 1]))
    .join("\n");
  const index = JSON.stringify(search).replaceAll("<", "\\u003c");
  const links = NAV_LINKS.map(
    ([href, text]) => `<a href="${href}">${text}</a>`
  );
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Docs — Lion</title>
    <meta
      name="description"
      content="Lion documentation: tutorials, how-to guides, reference, and explanation, with live examples you can edit and run."
    >
    <meta name="theme-color" content="#09090b">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://lionlang.dev/docs.html">
    <meta property="og:title" content="Docs — Lion">
    <meta
      property="og:description"
      content="Learn Lion, the JSON-based Lisp, with tutorials, how-to guides, a complete reference, and explanations. Every example runs in your browser."
    >
    <meta property="og:image" content="https://lionlang.dev/assets/fold-map.webp">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
      rel="stylesheet"
    >
    <link rel="stylesheet" href="styles.css">
    <link
      rel="icon"
      href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦁</text></svg>"
    >
    <script>
    "use strict";
    document.documentElement.classList.add("js");
    </script>
    <script type="module" src="script.js"></script>
    <script type="module" src="playground.js"></script>
    <script type="module" src="docs.js"></script>
  </head>
  <body class="docs-page">
    <!-- Generated by packages/site-runtime/build-docs.ts from packages/site-runtime/content. Edit those, then run: bun run --cwd packages/site-runtime docs -->
    <nav class="nav is-scrolled">
      <div class="nav-content">
        <a href="index.html" class="logo" aria-label="Lion home">
          <span class="logo-mark" aria-hidden="true">[ ]</span>
          <span class="logo-icon">Lion</span>
        </a>
        <div class="nav-links">
          ${links.join("\n          ")}
          <a href="docs.html" aria-current="page">Docs</a>
          <a href="https://github.com/andrueandersoncs/lion" target="_blank" rel="noopener" class="nav-github">${GITHUB_ICON}GitHub</a>
        </div>
        <button type="button" class="mobile-menu-btn" aria-label="Toggle menu" aria-expanded="false" aria-controls="mobile-menu">
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
      <div class="mobile-menu" id="mobile-menu">
        ${links.join("\n        ")}
        <a href="docs.html" aria-current="page">Docs</a>
        <a href="https://github.com/andrueandersoncs/lion" target="_blank" rel="noopener">GitHub</a>
      </div>
    </nav>

    <div class="docs-shell">
      <button type="button" class="docs-menu-btn" aria-expanded="false" aria-controls="docs-sidebar">
        <span class="docs-menu-icon" aria-hidden="true"></span>
        <span>Browse docs</span>
      </button>
      ${renderSidebar(ordered)}
      <main class="docs-main" id="top">
${articles}
      </main>
    </div>

    <footer class="footer">
      <div class="footer-bottom">
        <p>Lion is released under the MIT License. These docs are generated from <a href="https://github.com/andrueandersoncs/lion/tree/main/packages/site-runtime/content" target="_blank" rel="noopener">packages/site-runtime/content</a>, and every example result comes from the evaluator.</p>
      </div>
    </footer>
    <script type="application/json" id="docs-index">${index}</script>
  </body>
</html>
`;
};

const ID = /\sid="([^"]+)"/g;
const LINK = /\shref="#([^"]*)"/g;

/** Fails when a link on the page points at an id the page does not have. */
const checkLinks = (html: string) => {
  const ids = new Set([...html.matchAll(ID)].map(([, id]) => id));
  const broken = [
    ...new Set(
      [...html.matchAll(LINK)]
        .map(([, id]) => decodeEntities(id ?? ""))
        .filter((id) => !ids.has(id))
    ),
  ];
  if (broken.length > 0) {
    fail(
      `Links point at missing ids: ${broken.map((id) => `#${id}`).join(", ")}`
    );
  }
};

const build = async () => {
  const docs: Doc[] = [
    readDoc(join(CONTENT, "overview.html"), undefined, "overview"),
  ];
  for (const kind of KINDS) {
    for (const name of kind.docs) {
      docs.push(readDoc(join(CONTENT, kind.id, `${name}.html`), kind, name));
    }
  }
  const used = new Set(docs.flatMap((doc) => [doc.id, `${doc.id}-title`]));
  const search: SearchEntry[] = [];
  for (const doc of docs) {
    search.push({
      t: doc.title,
      d: doc.title,
      k: doc.kind?.id ?? "overview",
      h: doc.id,
    });
    expandCodeBlocks(doc);
    await expandExamples(doc);
    wrapTables(doc);
    doc.body = doc.body.replace("<docs-map></docs-map>", renderMap(docs));
    identify(doc, used, search);
  }
  const html = stampPage("docs.html", renderPage(docs, search), assetVersion());
  checkLinks(html);
  return html;
};

const html = await build();
const current = (() => {
  try {
    return readFileSync(PAGE, "utf8");
  } catch {
    return "";
  }
})();

if (process.argv.includes("--check")) {
  if (html === current) {
    console.log("docs/docs.html is current.");
  } else {
    console.error(
      "docs/docs.html is out of date. Run `bun run --cwd packages/site-runtime docs` and commit the result."
    );
    process.exitCode = 1;
  }
} else if (html === current) {
  console.log("docs/docs.html is already current.");
} else {
  writeFileSync(PAGE, html);
  console.log("Wrote docs/docs.html.");
}
