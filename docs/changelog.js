// Filters and search for the changelog timeline. The page is complete
// without this script; it only hides what a reader filtered out.

const filters = [...document.querySelectorAll(".filter[data-kind]")];
const search = document.querySelector(".changelog-search input");
const expand = document.querySelector(".changelog-expand");
const status = document.querySelector(".changelog-status");
const releases = [...document.querySelectorAll(".timeline-item")];
const gaps = [...document.querySelectorAll(".timeline-gap")];

/** Sections the reader turned off. */
const off = new Set();

const matches = (element, query) =>
  query === "" || element.textContent.toLowerCase().includes(query);

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/** Shows a section's items that pass, and says how many. */
const filterSection = (section, query) => {
  const on = !off.has(section.dataset.kind);
  let shown = 0;
  for (const item of section.querySelectorAll(".change")) {
    const visible = on && matches(item, query);
    item.hidden = !visible;
    shown += visible ? 1 : 0;
  }
  section.hidden = shown === 0;
  return shown;
};

/** Filters one release, and says what of it is left. */
const filterRelease = (release, query, narrowed) => {
  let shown = 0;
  for (const section of release.querySelectorAll(".kind-section")) {
    shown += filterSection(section, query);
  }
  const list = release.querySelector(".release-changes");
  if (list && narrowed && shown > 0) {
    list.open = true;
  }
  const visible = !narrowed || shown > 0;
  release.hidden = !visible;
  return { shown, visible };
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
  status.textContent = narrowed
    ? `Showing ${plural(total("shown"), "item", "items")} in ${plural(total("visible"), "release", "releases")}.`
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

/** Opens what a link leads to, and everything around it. */
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
