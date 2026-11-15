// Filters and search for the changelog timeline. The page is complete
// without this script; it only hides what a reader filtered out.

const filters = [...document.querySelectorAll(".filter")];
const search = document.querySelector(".changelog-search input");
const expand = document.querySelector(".changelog-expand");
const status = document.querySelector(".changelog-status");
const releases = [...document.querySelectorAll(".timeline-item")];
const gaps = [...document.querySelectorAll(".timeline-gap")];

/** Kinds of change the reader turned off. */
const off = new Set();

const matches = (element, query) =>
  query === "" || element.textContent.toLowerCase().includes(query);

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/** Shows a section's changes that pass, and says how many. */
const filterSection = (section, query) => {
  const kindOn = !off.has(section.dataset.kind);
  let shown = 0;
  for (const change of section.querySelectorAll(".change")) {
    const visible = kindOn && matches(change, query);
    change.hidden = !visible;
    shown += visible ? 1 : 0;
  }
  const hasNotes = section.querySelector(".kind-note") !== null;
  section.hidden = !kindOn || (shown === 0 && (query !== "" || !hasNotes));
  return shown;
};

/** Shows a release's decisions that match, opened, and says how many. */
const filterDecisions = (release, query) => {
  let shown = 0;
  for (const decision of release.querySelectorAll(".decision")) {
    const visible = matches(decision, query);
    decision.hidden = !visible;
    decision.open ||= query !== "" && visible;
    shown += visible ? 1 : 0;
  }
  const block = release.querySelector(".release-decisions");
  if (block) {
    block.hidden = shown === 0;
  }
  return shown;
};

/** Filters one release, and says what of it is left. */
const filterRelease = (release, query, narrowed) => {
  let changes = 0;
  for (const section of release.querySelectorAll(".kind-section")) {
    changes += filterSection(section, query);
  }
  const decisions = filterDecisions(release, query);
  const list = release.querySelector(".release-changes");
  if (list && narrowed && changes > 0) {
    list.open = true;
  }
  const visible = !narrowed || changes > 0 || (query !== "" && decisions > 0);
  release.hidden = !visible;
  return { changes, decisions: query === "" ? 0 : decisions, visible };
};

/** Shows what the filters and the search leave, release by release. */
const apply = () => {
  const query = search.value.trim().toLowerCase();
  const narrowed = query !== "" || off.size > 0;
  const left = releases.map((release) =>
    filterRelease(release, query, narrowed)
  );
  for (const gap of gaps) {
    gap.hidden = narrowed;
  }
  const total = (key) => left.reduce((sum, part) => sum + Number(part[key]), 0);
  const decided =
    query === ""
      ? ""
      : ` and ${plural(total("decisions"), "decision", "decisions")}`;
  status.textContent = narrowed
    ? `Showing ${plural(total("changes"), "change", "changes")}${decided} in ${plural(total("visible"), "release", "releases")}.`
    : "";
};

for (const filter of filters) {
  filter.addEventListener("click", () => {
    const pressed = filter.getAttribute("aria-pressed") === "true";
    filter.setAttribute("aria-pressed", String(!pressed));
    if (pressed) {
      off.add(filter.dataset.kind);
    } else {
      off.delete(filter.dataset.kind);
    }
    apply();
  });
}

search?.addEventListener("input", apply);

expand?.addEventListener("click", () => {
  const open = expand.getAttribute("aria-pressed") !== "true";
  for (const list of document.querySelectorAll(".release-changes")) {
    list.open = open;
  }
  expand.setAttribute("aria-pressed", String(open));
  expand.textContent = open ? "Collapse all" : "Expand all";
});

/** Opens a decision or release a link leads to, and everything around it. */
const reveal = () => {
  const id = decodeURIComponent(window.location.hash.slice(1));
  const target = id === "" ? null : document.getElementById(id);
  if (!target) {
    return;
  }
  for (let node = target; node; node = node.parentElement) {
    if (node instanceof HTMLDetailsElement) {
      node.open = true;
    }
  }
  for (const marked of document.querySelectorAll(".is-target")) {
    marked.classList.remove("is-target");
  }
  target.classList.add("is-target");
  target.scrollIntoView({ block: "start" });
};

window.addEventListener("hashchange", reveal);
reveal();
