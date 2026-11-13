// The docs page (docs.html, built by packages/site-runtime/build-docs.ts).
// Every document is in the page, so it reads in full without JavaScript. With
// it, the page shows one document at a time, chosen by the URL's #fragment: a
// document's id, or the id of anything inside one. The sidebar search reads
// the index the build embeds in #docs-index.
// docs.html loads this module as docs.js?v=<hash of the site's assets>, and
// passing the same version on keeps pure.js from another release away.
const VERSION = new URL(import.meta.url).search;
const { sectionBeingRead } = await import(`./pure.js${VERSION}`);

const docs = [...document.querySelectorAll("[data-doc]")];
const shell = document.querySelector(".docs-shell");
const menuButton = document.querySelector(".docs-menu-btn");
const docLinks = [...document.querySelectorAll("[data-doc-link]")];
const baseTitle = document.title;

let active = null;
/** How far the page was scrolled when the URL's #fragment was last followed. */
let leftAt = 0;

const setMenuOpen = (open) => {
  shell?.classList.toggle("is-menu-open", open);
  menuButton?.setAttribute("aria-expanded", String(open));
};

menuButton?.addEventListener("click", () => {
  setMenuOpen(!shell?.classList.contains("is-menu-open"));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && shell?.classList.contains("is-menu-open")) {
    setMenuOpen(false);
    menuButton?.focus();
  }
});

/** Shows a document, and reports whether it was a different one. */
const sidebar = document.querySelector(".docs-sidebar");

/** Scrolls the sidebar, not the page, so the current link is in view. */
const revealLink = (link) => {
  if (!sidebar) {
    return;
  }
  const top = link.offsetTop;
  const visible =
    top >= sidebar.scrollTop &&
    top + link.offsetHeight <= sidebar.scrollTop + sidebar.clientHeight;
  if (!visible) {
    sidebar.scrollTop = top - sidebar.clientHeight / 3;
  }
};

const show = (doc) => {
  if (doc === active) {
    return false;
  }
  active?.classList.remove("is-active");
  doc.classList.add("is-active");
  active = doc;
  for (const link of docLinks) {
    const current = link.dataset.docLink === doc.id;
    link.classList.toggle("is-current", current);
    if (current) {
      link.setAttribute("aria-current", "page");
      revealLink(link);
    } else {
      link.removeAttribute("aria-current");
    }
  }
  document.title =
    doc.id === "overview" ? baseTitle : `${doc.dataset.title} — Lion docs`;
  return true;
};

const route = () => {
  const id = decodeURIComponent(window.location.hash.slice(1));
  const target = id ? document.getElementById(id) : null;
  const doc =
    target?.closest("[data-doc]") ??
    document.getElementById("overview") ??
    docs[0];
  if (!doc) {
    return;
  }
  const changed = show(doc);
  setMenuOpen(false);
  if (target && target !== doc) {
    target.scrollIntoView({ behavior: "instant", block: "start" });
  } else if (changed) {
    window.scrollTo({ top: 0, behavior: "instant" });
    doc.querySelector("h1")?.focus({ preventScroll: true });
  }
  leftAt = window.scrollY;
  updateToc();
};

// Contents: mark the section being read. The page measures, and pure.js
// decides.
const pixels = (length) => Number.parseFloat(length) || 0;

let tocFrame = 0;
const updateToc = () => {
  cancelAnimationFrame(tocFrame);
  tocFrame = requestAnimationFrame(() => {
    if (!active) {
      return;
    }
    const page = document.documentElement;
    const links = [...active.querySelectorAll(".doc-toc a")];
    const headings = links.map((link) =>
      document.getElementById(link.hash.slice(1))
    );
    const current = sectionBeingRead({
      tops: headings.map((heading) => heading.getBoundingClientRect().top),
      margins: headings.map((heading) =>
        pixels(getComputedStyle(heading).scrollMarginTop)
      ),
      padding: pixels(getComputedStyle(page).scrollPaddingTop),
      scrolled: window.scrollY,
      end: page.scrollHeight - window.innerHeight,
      named: links.findIndex((link) => link.hash === window.location.hash),
      leftAt,
    });
    for (const [at, link] of links.entries()) {
      link.classList.toggle("is-current", at === current);
    }
  });
};

window.addEventListener("scroll", updateToc, { passive: true });
window.addEventListener("hashchange", route);
if (docs.length > 0) {
  route();
}

// Search
const input = document.getElementById("docs-search-input");
const results = document.getElementById("docs-search-results");
const indexElement = document.getElementById("docs-index");
const entries = indexElement ? JSON.parse(indexElement.textContent) : [];
const KIND_NAMES = {
  overview: "Overview",
  tutorials: "Tutorial",
  "how-to": "How-to",
  reference: "Reference",
  explanation: "Explanation",
};
const MAX_RESULTS = 12;

let matches = [];
let selected = 0;

const escapeHtml = (text) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** Earlier and whole-word matches rank first, then titles over sections. */
const rank = (entry, query) => {
  const text = entry.t.toLowerCase();
  const at = text.indexOf(query);
  if (at === -1) {
    return entry.d.toLowerCase().includes(query) ? 3 : -1;
  }
  if (text === query) {
    return 0;
  }
  return at === 0 ? 1 : 2;
};

const search = (text) => {
  const query = text.trim().toLowerCase();
  if (query === "") {
    return [];
  }
  return entries
    .map((entry, order) => ({ entry, order, score: rank(entry, query) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .slice(0, MAX_RESULTS)
    .map(({ entry }) => entry);
};

const renderResults = () => {
  const open = matches.length > 0 || input.value.trim() !== "";
  results.hidden = !open;
  input.setAttribute("aria-expanded", String(open));
  if (matches.length === 0) {
    results.innerHTML = open
      ? '<li class="docs-search-empty">No matches. Try a form or function name, such as lambda or number/add.</li>'
      : "";
    input.removeAttribute("aria-activedescendant");
    return;
  }
  results.innerHTML = matches
    .map(
      (
        entry,
        at
      ) => `<li role="option" id="docs-result-${at}" aria-selected="${at === selected}">
        <a href="#${entry.h}" tabindex="-1">
          <span class="docs-result-title">${escapeHtml(entry.t)}</span>
          <span class="docs-result-where docs-kind-${entry.k}">${KIND_NAMES[entry.k] ?? ""}${entry.t === entry.d ? "" : ` · ${escapeHtml(entry.d)}`}</span>
        </a>
      </li>`
    )
    .join("");
  input.setAttribute("aria-activedescendant", `docs-result-${selected}`);
};

const go = (entry) => {
  input.value = "";
  matches = [];
  renderResults();
  input.blur();
  if (window.location.hash === `#${entry.h}`) {
    route();
  } else {
    window.location.hash = entry.h;
  }
};

if (input && results) {
  input.addEventListener("input", () => {
    matches = search(input.value);
    selected = 0;
    renderResults();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (matches.length > 0) {
        const step = event.key === "ArrowDown" ? 1 : -1;
        selected = (selected + step + matches.length) % matches.length;
        renderResults();
        document
          .getElementById(`docs-result-${selected}`)
          ?.scrollIntoView({ block: "nearest" });
      }
    } else if (event.key === "Enter") {
      const entry = matches[selected];
      if (entry) {
        event.preventDefault();
        go(entry);
      }
    } else if (event.key === "Escape") {
      input.value = "";
      matches = [];
      renderResults();
    }
  });
  results.addEventListener("mousedown", (event) => {
    // Keep focus in the input until the click lands.
    event.preventDefault();
  });
  results.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    const at = [...results.querySelectorAll("a")].indexOf(link);
    if (link && matches[at]) {
      event.preventDefault();
      go(matches[at]);
    }
  });
  input.addEventListener("blur", () => {
    setTimeout(() => {
      results.hidden = true;
      input.setAttribute("aria-expanded", "false");
    }, 120);
  });
  input.addEventListener("focus", () => {
    if (input.value.trim() !== "") {
      renderResults();
    }
  });
  document.addEventListener("keydown", (event) => {
    const typing = event.target.closest?.("input, textarea, [contenteditable]");
    if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      setMenuOpen(true);
      input.focus();
    }
  });
}
