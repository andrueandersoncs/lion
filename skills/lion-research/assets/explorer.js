// The research explorer. It reads the model this page carries, runs the Lion
// engine in a worker, and shows the research to the person who asked for it:
// their questions and the answers, who stands behind each finding, and the
// sources. A last view lets a reader who knows Lion query the model directly.
// Every element is built from text nodes, never from markup, since a model
// holds text taken from the web.

const TIMEOUT_MS = 20_000;
const WIDTH = 76;
const SHOWN_AT_FIRST = 6;
const FILTER_FROM = 9;
const URL_PATTERN = /^https?:\/\/\S+$/;
const CHANGES = /"(?:fact|retract|rule|relation|schema|invariant)"/;
const SEPARATORS = /[_-]+/g;
const DAY = /^(\d{4})-?(\d{2})-?(\d{2})$/;
const DAY_AT_START = /^\d{4}-\d{2}-\d{2}/;
const VALUE_RANKS = { boolean: 1, number: 2, string: 3 };
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
/** The relations every research model shares, which the pages are built from. */
const CORE = [
  "source",
  "claim",
  "attributed",
  "answer",
  "backing",
  "secondhand",
  "misquoted",
  "disputed",
  "assumption",
  "violated",
  "unread",
];
const KINDS = [
  ["primary", "First-hand sources"],
  ["secondary", "Reporting and analysis"],
  ["tertiary", "Summaries of other sources"],
];
/** What a column of an answer is called, for the names the core uses. */
const LABELS = {
  answers: "Findings",
  assumption: "Assumption",
  claim: "Statement",
  credited: "Credited to",
  publisher: "Publisher",
  publishers: "Who says so first-hand",
  question: "About",
  quote: "In the source's words",
  relayed: "As relayed",
  said: "What that source says",
  says: "Recorded as",
  source: "Source",
  to: "Credited to",
  value: "Answer",
  values: "Answers given",
  witness: "Evidence against it",
};
const CLAIM_COLUMN = /(?:^|_)(?:claims?|statements?|witness)$/;
const SOURCE_COLUMN = /(?:^|_)(?:sources?|credited|origin|to)$/;

const $ = (id) => document.getElementById(id);
const data = JSON.parse($("lion-data").textContent);
const forms = Array.isArray(data.database) ? data.database.slice(1) : [];
/** What the plan calls the model's own ids, so the reader never sees one bare. */
const NAMES =
  data.page !== null &&
  typeof data.page === "object" &&
  data.page.names !== null &&
  typeof data.page.names === "object"
    ? data.page.names
    : {};

const el = (tag, props, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (key.startsWith("on")) {
      node.addEventListener(key.slice(2), value);
    } else if (value !== undefined && value !== false) {
      node.setAttribute(key, value === true ? "" : value);
    }
  }
  for (const child of children.flat(3)) {
    if (child !== null && child !== undefined && child !== false) {
      node.append(child);
    }
  }
  return node;
};

// ---- The model's shape, read from its snapshot

const relations = new Map();
const derived = new Set();
for (const form of forms) {
  if (Array.isArray(form) && form[0] === "relation") {
    relations.set(form[1], { name: form[1], columns: form[2] ?? [] });
  }
  if (Array.isArray(form) && form[0] === "rule" && Array.isArray(form[1])) {
    derived.add(form[1][0]);
  }
}
const variables = (relation) => relation.columns.map((column) => `?${column}`);
const columnOf = (name, column) =>
  relations.get(name)?.columns.indexOf(column) ?? -1;

// ---- The engine: a worker made from the bundle this page carries

const engineUrl = URL.createObjectURL(
  new Blob(
    [
      Uint8Array.from(atob($("lion-engine").textContent.trim()), (character) =>
        character.charCodeAt(0)
      ),
    ],
    { type: "text/javascript" }
  )
);
const waiting = new Map();
let worker;
let nextId = 1;
let loaded;

const startWorker = () => {
  worker = new Worker(engineUrl);
  worker.addEventListener("message", (event) => {
    const settle = waiting.get(event.data.id);
    waiting.delete(event.data.id);
    settle?.(event.data);
  });
};

const send = (message) =>
  new Promise((resolve) => {
    const id = nextId;
    nextId += 1;
    // A query that runs too long ends with its worker, and a new one loads
    // the model again.
    const timer = setTimeout(() => {
      worker.terminate();
      waiting.clear();
      startWorker();
      load();
      resolve({
        ok: false,
        error: `Stopped after ${TIMEOUT_MS / 1000} seconds. The model was loaded again.`,
      });
    }, TIMEOUT_MS);
    waiting.set(id, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
    worker.postMessage({ ...message, id });
  });

function load() {
  loaded = send({ type: "load", snapshot: data.database });
  return loaded;
}

const evaluate = async (program) => {
  await loaded;
  const response = await send({ type: "run", program });
  return response.ok
    ? { ...response, value: JSON.parse(response.json) }
    : response;
};

// ---- Values and words

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isUrl = (value) => typeof value === "string" && URL_PATTERN.test(value);
const isQuoted = (value) =>
  Array.isArray(value) && value[0] === "quote" && value.length === 2;
const unquote = (value) => (isQuoted(value) ? value[1] : value);
const link = (url, text) =>
  el("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, text);
const sentence = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const label = (name) =>
  LABELS[name] ?? sentence(name.replaceAll(SEPARATORS, " "));
const counted = (count, one, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** The same text for equal values, whatever order a record lists its keys in. */
const canonical = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (isRecord(value)) {
    const parts = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`);
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(value);
};

/** A value on one line, with spaces where a long one can wrap. */
const compact = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(compact).join(", ")}]`;
  }
  if (isRecord(value)) {
    const parts = Object.entries(value).map(
      ([key, item]) => `${JSON.stringify(key)}: ${compact(item)}`
    );
    return `{${parts.join(", ")}}`;
  }
  return JSON.stringify(value);
};

/** Lion as text, with every part that fits kept on one line. */
const pretty = (value, indent = "") => {
  const flat = JSON.stringify(value);
  if (
    value === null ||
    typeof value !== "object" ||
    indent.length + flat.length <= WIDTH
  ) {
    return flat;
  }
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    const [head, ...rest] = value;
    const lead =
      typeof head === "string"
        ? `[${JSON.stringify(head)}`
        : `[\n${inner}${pretty(head, inner)}`;
    const lines = rest.map((item) => `,\n${inner}${pretty(item, inner)}`);
    return `${lead}${lines.join("")}]`;
  }
  const lines = Object.entries(value).map(
    ([key, item]) => `${inner}${JSON.stringify(key)}: ${pretty(item, inner)}`
  );
  return `{\n${lines.join(",\n")}\n${indent}}`;
};

const rank = (value) => {
  if (value === null) {
    return 0;
  }
  return Array.isArray(value) ? 4 : (VALUE_RANKS[typeof value] ?? 5);
};

/** The order Lion sorts values in: by kind, then by value. */
const compare = (a, b) => {
  if (rank(a) !== rank(b)) {
    return rank(a) - rank(b);
  }
  if (typeof a === "number" || typeof a === "boolean") {
    return a - b;
  }
  const [x, y] =
    typeof a === "string" ? [a, b] : [JSON.stringify(a), JSON.stringify(b)];
  if (x === y) {
    return 0;
  }
  return x < y ? -1 : 1;
};

/** A date written as 20261113 or 2026-11-13, in words. */
const dated = (value) => {
  const match = DAY.exec(String(value ?? ""));
  if (!match) {
    return;
  }
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
};

/** A value in plain words: no braces, no quotes, yes and no for true and false. */
const plain = (value) => {
  if (value === null || value === undefined) {
    return "nothing";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (Array.isArray(value)) {
    return value.map(plain).join(", ");
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${plain(item)}`)
      .join(", ");
  }
  return NAMES[String(value)] ?? String(value);
};

/** Names as a sentence lists them: "A", "A and B", "A, B and C". */
const listed = (names) => {
  if (names.length < 2) {
    return names.join("");
  }
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
};

// ---- What the model holds, read once and indexed

const model = {
  claims: new Map(),
  claimsOf: new Map(),
  credits: new Map(),
  rows: {},
  sources: new Map(),
};
const rowsOf = (name) => model.rows[name] ?? [];
const findingKey = (question, value) => canonical([question, value]);
const pushTo = (map, key, item) =>
  map.set(key, [...(map.get(key) ?? []), item]);

const index = () => {
  model.sources = new Map(rowsOf("source").map((row) => [row.id, row]));
  model.claims = new Map(rowsOf("claim").map((row) => [row.id, row]));
  model.credits = new Map();
  model.claimsOf = new Map();
  for (const row of rowsOf("attributed")) {
    pushTo(model.credits, row.claim, row.to);
  }
  for (const row of rowsOf("answer")) {
    pushTo(model.claimsOf, findingKey(row.question, row.value), row.claim);
  }
};

const loadModel = async () => {
  const present = CORE.filter((name) => relations.has(name));
  const response = await evaluate(
    Object.fromEntries(
      present.map((name) => [
        name,
        ["query", [name, ...variables(relations.get(name))]],
      ])
    )
  );
  model.rows = response.ok ? response.value : {};
  index();
  return response;
};

const sourceOf = (id) => model.sources.get(id) ?? { id, title: String(id) };
const sourceName = (source) =>
  isUrl(source.url)
    ? el(
        "a",
        {
          class: "ref",
          href: source.url,
          target: "_blank",
          rel: "noopener noreferrer",
        },
        source.title || source.url
      )
    : (source.title ?? String(source.id));
/** Who a statement is from, in a few words. */
const sourceShort = (source) =>
  source.publisher ?? source.title ?? String(source.id);
/** The same, as a link to the source when it has one. */
const sourceBrief = (source) =>
  isUrl(source.url)
    ? el(
        "a",
        {
          class: "ref",
          href: source.url,
          target: "_blank",
          rel: "noopener noreferrer",
          title: source.title ?? "",
        },
        sourceShort(source)
      )
    : sourceShort(source);
const claimsFor = (question, value) =>
  (model.claimsOf.get(findingKey(question, value)) ?? [])
    .map((id) => model.claims.get(id))
    .filter(Boolean);

// ---- Pieces every view uses

/** A button that shows more below it, built the first time it is opened. */
const disclosure = (text, build) => {
  const body = el("div", { class: "more", hidden: true });
  const button = el(
    "button",
    {
      type: "button",
      class: "reveal",
      "aria-expanded": "false",
      onclick: async () => {
        const open = button.getAttribute("aria-expanded") === "true";
        if (!open && body.childNodes.length === 0) {
          body.append(...[await build()].flat(3).filter(Boolean));
        }
        button.setAttribute("aria-expanded", String(!open));
        body.hidden = open;
      },
    },
    text
  );
  return { body, button };
};

/** A list that shows its first few items, and the rest when asked. */
const capped = (items, noun) => {
  const list = el("ul", { class: "findings" }, items.slice(0, SHOWN_AT_FIRST));
  if (items.length <= SHOWN_AT_FIRST + 2) {
    return list;
  }
  const rest = el(
    "button",
    {
      type: "button",
      class: "reveal",
      "aria-expanded": "false",
      onclick: () => {
        list.append(...items.slice(SHOWN_AT_FIRST));
        rest.remove();
      },
    },
    `Show all ${counted(items.length, noun)}`
  );
  return [list, rest];
};

const sourceLine = (source, extra = []) =>
  [
    sourceName(source),
    source.publisher,
    dated(source.published),
    ...extra,
  ].filter(Boolean);

/** A line of parts with a dot between them. */
const dotted = (parts) =>
  parts.flatMap((part, at) => (at === 0 ? [part] : [" · ", part]));

/**
 * One statement: the source's words, whose they are, and whom the source
 * credits for them. `inSource` leaves the source out, where it is already
 * the heading, and says how the statement was recorded instead.
 */
const statement = (claim, inSource = false) => {
  const credits = (model.credits.get(claim.id) ?? []).map((to) =>
    sourceName(sourceOf(to))
  );
  const credit =
    credits.length > 0 &&
    el(
      "span",
      { class: "coded" },
      "The source credits this to ",
      credits.flatMap((name, at) => (at === 0 ? [name] : [", ", name])),
      ", so it is not counted as a voice of its own."
    );
  return el(
    "figure",
    { class: "statement" },
    el("blockquote", {}, `“${claim.quote}”`),
    el(
      "figcaption",
      {},
      inSource
        ? el("span", { class: "coded" }, "Recorded as: ", plain(claim.says))
        : dotted(sourceLine(sourceOf(claim.source))),
      credit
    )
  );
};

const statements = (claims, inSource = false) =>
  claims.length === 0
    ? el("p", { class: "empty" }, "No statement is recorded for this.")
    : claims.map((claim) => statement(claim, inSource));

/** A question of the model as words: what it is about, and its qualifiers. */
const phrase = (question) => {
  if (!isRecord(question)) {
    return { main: sentence(plain(question)), rest: "" };
  }
  const [[key, value] = ["", ""], ...others] = Object.entries(question);
  return {
    main: `${sentence(key)}: ${plain(value)}`,
    rest: others.map(([name, item]) => `${name} ${plain(item)}`).join(", "),
  };
};

const what = (question) => {
  const { main, rest } = phrase(question);
  return el(
    "div",
    { class: "what" },
    main,
    rest !== "" && [" ", el("span", { class: "qualifier" }, rest)]
  );
};

/**
 * One finding: what it is about, the lines that say where it stands, any
 * block that follows them, and its statements.
 */
const finding = (question, lines, claims, block) => {
  const more =
    claims.length > 0 &&
    disclosure(`Show the ${counted(claims.length, "statement")}`, () =>
      statements(claims)
    );
  return el(
    "li",
    { class: "finding" },
    what(question),
    lines.map((line) => el("p", { class: "line" }, line)),
    block,
    more && [more.button, more.body]
  );
};

const verdict = (text, tone = "") =>
  el("span", { class: `verdict ${tone}` }, text);

// ---- Answers: a value of the model in plain words

const shownText = (text, column) => {
  if (CLAIM_COLUMN.test(column ?? "") && model.claims.has(text)) {
    const claim = model.claims.get(text);
    return [
      `“${claim.quote}” `,
      el("span", { class: "key" }, `(${sourceShort(sourceOf(claim.source))})`),
    ];
  }
  if (SOURCE_COLUMN.test(column ?? "") && model.sources.has(text)) {
    return sourceName(sourceOf(text));
  }
  return isUrl(text) ? link(text, text) : (NAMES[text] ?? text);
};

function shown(value, column) {
  if (typeof value === "string") {
    return shownText(value, column);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, at) =>
      at === 0 ? [shown(item, column)] : [", ", shown(item, column)]
    );
  }
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, item], at) => [
      at > 0 && " · ",
      el(
        "span",
        { class: "pair" },
        el("span", { class: "key" }, `${key}: `),
        shown(item, key)
      ),
    ]);
  }
  return plain(value);
}

const columnsOf = (rows) => {
  const columns = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columns.add(key);
    }
  }
  return [...columns];
};

/** Rows of an answer as a table a reader can filter and sort. */
const plainTable = (rows) => {
  const columns = columnsOf(rows);
  const body = el("tbody");
  const count = el("span");
  let ordered = rows;
  let sortedBy;
  let descending = false;
  const filter = el("input", {
    type: "search",
    placeholder: "Filter these rows",
    "aria-label": "Filter these rows",
    oninput: () => draw(),
  });
  function draw() {
    const needle = filter.value.trim().toLowerCase();
    const kept = ordered.filter((row) =>
      plain(row).toLowerCase().includes(needle)
    );
    body.replaceChildren(
      ...kept.map((row) =>
        el(
          "tr",
          {},
          columns.map((column) =>
            el(
              "td",
              {},
              row[column] === undefined ? "" : shown(row[column], column)
            )
          )
        )
      )
    );
    count.textContent =
      kept.length === rows.length
        ? counted(rows.length, "row")
        : `${kept.length} of ${counted(rows.length, "row")}`;
  }
  const sortBy = (column) => {
    descending = sortedBy === column ? !descending : false;
    sortedBy = column;
    const sign = descending ? -1 : 1;
    ordered = [...rows].sort(
      (a, b) => sign * compare(a[column] ?? null, b[column] ?? null)
    );
    draw();
  };
  const head = el(
    "tr",
    {},
    columns.map((column) =>
      el(
        "th",
        {
          class: "sorts",
          scope: "col",
          title: "Sort by this column",
          onclick: () => sortBy(column),
        },
        label(column)
      )
    )
  );
  draw();
  return [
    rows.length >= FILTER_FROM &&
      el("div", { class: "rowtools" }, count, filter),
    el(
      "div",
      { class: "scroll" },
      el("table", {}, el("thead", {}, head), body)
    ),
  ];
};

// ---- Explanations

const term = (value) => compact(unquote(value));
const factText = (fact) =>
  Array.isArray(fact)
    ? `${fact[0]}(${fact.slice(1).map(term).join(", ")})`
    : JSON.stringify(fact);
const isExplanation = (value) => isRecord(value) && Array.isArray(value.fact);
const isWhy = (program) => Array.isArray(program) && program[0] === "why";
const reasonsOf = (node) => [
  ...(node.because ?? []),
  ...(node.matches ?? []).flat(),
];

const tagged = (tag, text, kind = "") =>
  el(
    "li",
    {},
    el("span", { class: `tag ${kind}` }, tag),
    el("span", { class: "fact" }, text)
  );

const kindOf = (node) => {
  if (node.given) {
    return "recorded";
  }
  return node.computed ? "computed" : "derived";
};

/** The claim a recorded fact of the `claim` relation stands for. */
const claimOfFact = (fact) =>
  model.claims.get(unquote(fact[1 + columnOf("claim", "id")]));

/** The full tree: every rule and row between a finding and what was recorded. */
const whyNode = (node) => {
  if (!isRecord(node)) {
    return el("li", {}, el("span", { class: "json" }, JSON.stringify(node)));
  }
  if ("check" in node) {
    return tagged("checked", JSON.stringify(node.check));
  }
  if ("absent" in node) {
    return tagged("nothing matches", factText(node.absent));
  }
  const item = tagged(kindOf(node), factText(node.fact), kindOf(node));
  const claim =
    node.given && node.fact[0] === "claim" ? claimOfFact(node.fact) : undefined;
  const reasons = reasonsOf(node);
  item.append(
    ...(claim ? [statement(claim)] : []),
    ...(node.rule
      ? [
          el(
            "details",
            {},
            el("summary", {}, "by the rule"),
            el("pre", { class: "json" }, pretty(node.rule))
          ),
        ]
      : []),
    ...(reasons.length > 0
      ? [el("ul", { class: "why" }, reasons.map(whyNode))]
      : [])
  );
  return item;
};

/** The claims an explanation rests on, each once, in the order it reaches them. */
const claimsUnder = (node, found = new Map()) => {
  if (!isRecord(node)) {
    return found;
  }
  if (node.given && Array.isArray(node.fact) && node.fact[0] === "claim") {
    const claim = claimOfFact(node.fact);
    if (claim) {
      found.set(claim.id, claim);
    }
  }
  for (const reason of reasonsOf(node)) {
    claimsUnder(reason, found);
  }
  return found;
};

/** An explanation for a reader: the statements it rests on, then the full tree on request. */
const reasons = (explanation) => {
  const claims = [...claimsUnder(explanation).values()];
  const sources = new Set(claims.map((claim) => claim.source));
  const tree = disclosure("Show every step of the reasoning", () =>
    el("ul", { class: "why" }, whyNode(explanation))
  );
  return [
    el(
      "p",
      { class: "line" },
      claims.length === 0
        ? "This follows from the model's rules without resting on a recorded statement."
        : `This rests on ${counted(claims.length, "statement")} from ${counted(sources.size, "source")}.`
    ),
    claims.map((claim) => statement(claim)),
    tree.button,
    tree.body,
  ];
};

// ---- One answer of the model, for a reader

const hasParts = (value) =>
  isRecord(value) &&
  Object.values(value).some(
    (item) => item !== null && typeof item === "object"
  );

const presentList = (value) => {
  if (value.length === 0) {
    return el("p", { class: "empty" }, "Nothing was found for this.");
  }
  return value.every(isRecord)
    ? plainTable(value)
    : el(
        "ul",
        { class: "plainlist" },
        value.map((item) => el("li", {}, shown(item)))
      );
};

function present(value, program) {
  if (isExplanation(value)) {
    return reasons(value);
  }
  if (value === null && isWhy(program)) {
    return el(
      "p",
      { class: "empty" },
      "The model does not hold this, so there is nothing to show."
    );
  }
  if (Array.isArray(value)) {
    return presentList(value);
  }
  if (hasParts(value)) {
    return Object.entries(value).map(([key, item]) =>
      el(
        "section",
        { class: "part" },
        el("h3", {}, sentence(key)),
        present(item, isRecord(program) ? program[key] : undefined)
      )
    );
  }
  return el("p", { class: "line" }, shown(value));
}

// ---- Answers

const evidenceOf = (entry) =>
  disclosure(
    entry.answer ? "Show the evidence" : "Show what the research found",
    async () => {
      const response = await evaluate(within(entry.evidence));
      const asQuery = el(
        "button",
        {
          type: "button",
          class: "aside",
          onclick: () => openQuery(entry.evidence),
        },
        "See the query behind this"
      );
      return [
        response.ok
          ? present(response.value, entry.evidence)
          : el(
              "p",
              { class: "empty" },
              `The model could not answer this: ${response.error}`
            ),
        el("p", { class: "line" }, asQuery),
      ];
    }
  );

const qa = (entry) => {
  const evidence = entry.evidence === undefined ? undefined : evidenceOf(entry);
  return el(
    "article",
    {
      class: "qa",
      "data-text": `${entry.question} ${entry.answer ?? ""}`.toLowerCase(),
    },
    el("h2", {}, entry.question),
    typeof entry.answer === "string" &&
      el("p", { class: "answer" }, entry.answer),
    evidence && [evidence.button, evidence.body]
  );
};

/** A search box that hides the items whose text lacks what is typed. */
const searchOver = (placeholder, items, none) => {
  const missing = el("p", { class: "empty", hidden: true }, none);
  const box = el("input", {
    type: "search",
    class: "search",
    placeholder,
    "aria-label": placeholder,
    oninput: () => {
      const needle = box.value.trim().toLowerCase();
      let kept = 0;
      for (const item of items) {
        item.hidden = !item.dataset.text.includes(needle);
        kept += item.hidden ? 0 : 1;
      }
      missing.hidden = kept > 0;
    },
  });
  return [box, missing];
};

// ---- How solid is it

const group = (title, count, note, body) =>
  count > 0 &&
  el(
    "section",
    { class: "group" },
    el("h2", {}, title, " ", el("span", { class: "count" }, `(${count})`)),
    el("p", { class: "note" }, note),
    body
  );

const confirmed = (keep) => {
  const rows = rowsOf("backing")
    .filter(keep)
    .filter((row) => row.publishers.length > 1);
  return group(
    "Confirmed by independent sources",
    rows.length,
    "Two or more publishers say this first-hand. Sources that only repeat another are not counted.",
    capped(
      rows.map((row) =>
        finding(
          row.question,
          [
            [verdict(plain(row.value), "good"), ". "],
            el(
              "span",
              { class: "who" },
              `${listed(row.publishers)} each say so first-hand.`
            ),
          ],
          claimsFor(row.question, row.value)
        )
      ),
      "finding"
    )
  );
};

/** Who stands behind one answer to a disputed question. */
const standing = (question, value) => {
  const backing = rowsOf("backing").find(
    (row) => findingKey(row.question, row.value) === findingKey(question, value)
  );
  if (backing) {
    return `said first-hand by ${listed(backing.publishers)}`;
  }
  const relayed = rowsOf("secondhand").find(
    (row) => findingKey(row.question, row.value) === findingKey(question, value)
  );
  return relayed
    ? "only relayed: no source says it first-hand"
    : "recorded without a source behind it";
};

const disagreed = (keep) => {
  const rows = rowsOf("disputed").filter(keep);
  return group(
    "Sources disagree",
    rows.length,
    "The same question gets different answers. The report says how each was resolved, or that it was not.",
    capped(
      rows.map((row) =>
        finding(
          row.question,
          [
            [
              verdict(counted(row.values.length, "different answer"), "warn"),
              ":",
            ],
          ],
          row.values.flatMap((value) => claimsFor(row.question, value)),
          el(
            "ul",
            { class: "options" },
            row.values.map((value) =>
              el(
                "li",
                {},
                el("b", {}, plain(value)),
                `, ${standing(row.question, value)}`
              )
            )
          )
        )
      ),
      "question"
    )
  );
};

const alone = (keep) => {
  const rows = rowsOf("backing")
    .filter(keep)
    .filter((row) => row.publishers.length === 1);
  const publishers = new Map();
  for (const row of rows) {
    pushTo(publishers, row.publishers[0], row);
  }
  const ranked = [...publishers].sort((a, b) => b[1].length - a[1].length);
  return group(
    "One publisher's word",
    rows.length,
    "Only one publisher says this first-hand, however many sources repeat it. That is often fine, as when a company reports on its own systems, but it is not independent confirmation.",
    el(
      "ul",
      { class: "findings" },
      ranked.map(([publisher, theirs]) => {
        const more = disclosure(
          `Show the ${counted(theirs.length, "finding")}`,
          () =>
            capped(
              theirs.map((row) =>
                finding(
                  row.question,
                  [verdict(plain(row.value))],
                  claimsFor(row.question, row.value)
                )
              ),
              "finding"
            )
        );
        return el(
          "li",
          { class: "finding" },
          el("div", { class: "what" }, `${publisher} alone`),
          el(
            "p",
            { class: "line who" },
            `${counted(theirs.length, "finding")} rest on ${publisher} and nobody else.`
          ),
          more.button,
          more.body
        );
      })
    )
  );
};

const relayedOnly = (keep) => {
  const rows = rowsOf("secondhand").filter(keep);
  const unread = new Set(rowsOf("unread").map((row) => row.source));
  return group(
    "Reported second-hand only",
    rows.length,
    "No source says this first-hand: every source that states it credits someone else. Treat it as unconfirmed.",
    capped(
      rows.map((row) =>
        finding(
          row.question,
          [
            [verdict(plain(row.value)), ". "],
            el(
              "span",
              { class: "who" },
              "Credited to ",
              row.credited.flatMap((id, at) => [
                at > 0 && ", ",
                sourceName(sourceOf(id)),
                unread.has(id) && " (not read)",
              ]),
              "."
            ),
          ],
          claimsFor(row.question, row.value)
        )
      ),
      "finding"
    )
  );
};

const misquotes = (keep) => {
  const rows = rowsOf("misquoted").filter(keep);
  return group(
    "Credited to a source that says something else",
    rows.length,
    "A source gave another as its authority, and that other source, which was read, answers the same question differently.",
    capped(
      rows.map((row) => {
        const claim = model.claims.get(row.claim);
        const relay = sourceOf(claim?.source);
        const theirs = claimsFor(row.question, row.said).filter(
          (other) => other.source === row.to
        );
        return finding(
          row.question,
          [
            [
              sourceBrief(relay),
              " reports ",
              verdict(plain(row.relayed), "bad"),
              " and credits ",
              sourceBrief(sourceOf(row.to)),
              ", which says ",
              verdict(plain(row.said)),
              ".",
            ],
          ],
          [claim, ...theirs].filter(Boolean)
        );
      }),
      "misquote"
    )
  );
};

/** What contradicts an assumption: a statement, or whatever else the model recorded. */
const witnesses = (rows) => {
  const claims = rows
    .map((row) => model.claims.get(row.witness))
    .filter(Boolean);
  const others = rows.filter((row) => !model.claims.has(row.witness));
  return [
    others.map((row) =>
      el("p", { class: "line" }, shown(row.witness, "witness"))
    ),
    claims.map((claim) => statement(claim)),
  ];
};

const assumptions = () => {
  const rows = rowsOf("assumption");
  const against = new Map();
  for (const row of rowsOf("violated")) {
    pushTo(against, row.assumption, row);
  }
  return group(
    "Assumptions that were tested",
    rows.length,
    `What the research took for granted at the start, checked against what it found. ${counted(rows.length - against.size, "held", "held")} up and ${against.size} ${against.size === 1 ? "was" : "were"} contradicted.`,
    el(
      "ul",
      { class: "findings" },
      rows.map((row) => {
        const found = against.get(row.id);
        const more =
          found &&
          disclosure(`Show what contradicts it (${found.length})`, () =>
            witnesses(found)
          );
        return el(
          "li",
          { class: "finding" },
          el("div", { class: "what" }, row.statement),
          el(
            "p",
            { class: "line" },
            found
              ? verdict("Contradicted by the evidence", "bad")
              : verdict("Held up", "good")
          ),
          more && [more.button, more.body]
        );
      })
    )
  );
};

const notRead = () => {
  const rows = rowsOf("unread");
  return group(
    "Cited but not read",
    rows.length,
    "Other sources give these as their authority, and they were not read for this research, so what they are said to say is second-hand.",
    el(
      "ul",
      { class: "findings" },
      rows.map((row) =>
        el(
          "li",
          { class: "finding" },
          el("div", { class: "what" }, sourceName(sourceOf(row.source))),
          sourceOf(row.source).publisher &&
            el("p", { class: "line who" }, sourceOf(row.source).publisher)
        )
      )
    )
  );
};

// ---- Sources

const sourceItem = (source) => {
  const claims = rowsOf("claim").filter((claim) => claim.source === source.id);
  const more =
    claims.length > 0 &&
    disclosure(`Show its ${counted(claims.length, "statement")}`, () =>
      statements(claims, true)
    );
  return el(
    "li",
    {
      class: "source",
      "data-text":
        `${source.title ?? ""} ${source.publisher ?? ""}`.toLowerCase(),
    },
    el("div", { class: "title" }, sourceName(source)),
    el(
      "p",
      { class: "about" },
      dotted(
        [
          source.publisher,
          dated(source.published),
          claims.length > 0
            ? counted(claims.length, "statement")
            : "cited by others, not read",
        ].filter(Boolean)
      )
    ),
    more && [more.button, more.body]
  );
};

const sourcesView = () => {
  const all = rowsOf("source");
  if (all.length === 0) {
    return el("p", { class: "empty" }, "This model records no sources.");
  }
  const count = (source) =>
    rowsOf("claim").filter((claim) => claim.source === source.id).length;
  const known = new Set(KINDS.map(([kind]) => kind));
  const kinds = [...KINDS, [undefined, "Other sources"]];
  const items = [];
  const groups = kinds.map(([kind, title]) => {
    const members = all
      .filter((source) =>
        kind ? source.kind === kind : !known.has(source.kind)
      )
      .sort((a, b) => count(b) - count(a));
    const built = members.map(sourceItem);
    items.push(...built);
    return (
      members.length > 0 &&
      el(
        "section",
        { class: "group" },
        el(
          "h2",
          {},
          title,
          " ",
          el("span", { class: "count" }, `(${members.length})`)
        ),
        el("ul", { class: "findings" }, built)
      )
    );
  });
  return [
    all.length >= FILTER_FROM &&
      searchOver("Search the sources", items, "No source matches that."),
    groups,
  ];
};

// ---- Query the model: the model as it is, for a reader who knows Lion

/**
 * The fact a row of `["query", [relation, ...]]` stands for, when the query
 * names every column, so the row can be explained with `why`.
 */
const factOfRow = (program) => {
  if (
    !(
      Array.isArray(program) &&
      program[0] === "query" &&
      Array.isArray(program[1])
    )
  ) {
    return;
  }
  const [name, ...args] = program[1];
  const relation = relations.get(name);
  const simple = (arg) =>
    arg !== "?_" && (arg === null || typeof arg !== "object");
  if (
    !(relation && args.length === relation.columns.length && args.every(simple))
  ) {
    return;
  }
  return (row) => [
    name,
    ...args.map((arg) =>
      typeof arg === "string" && arg.startsWith("?")
        ? ["quote", row[arg.slice(1)]]
        : arg
    ),
  ];
};

const rawCell = (value) => {
  if (value === undefined) {
    return "";
  }
  if (isUrl(value)) {
    return link(value, value);
  }
  return typeof value === "string"
    ? value
    : el("span", { class: "json" }, compact(value));
};

const rawTable = (rows, program) => {
  const columns = columnsOf(rows);
  const toFact = factOfRow(program);
  return el(
    "div",
    { class: "scroll" },
    el(
      "table",
      {},
      el(
        "thead",
        {},
        el(
          "tr",
          {},
          columns.map((column) => el("th", { scope: "col" }, column)),
          toFact && el("th", {})
        )
      ),
      el(
        "tbody",
        {},
        rows.map((row) =>
          el(
            "tr",
            {},
            columns.map((column) => el("td", {}, rawCell(row[column]))),
            toFact &&
              el(
                "td",
                { class: "act" },
                el(
                  "button",
                  {
                    type: "button",
                    class: "button small",
                    onclick: () => showQuery(["why", toFact(row)]),
                  },
                  "why"
                )
              )
          )
        )
      )
    )
  );
};

function raw(value, program) {
  if (isExplanation(value)) {
    return el("ul", { class: "why" }, whyNode(value));
  }
  if (Array.isArray(value) && value.length > 0) {
    return value.every(isRecord)
      ? rawTable(value, program)
      : rawTable(value.map((item) => ({ value: item })));
  }
  if (hasParts(value)) {
    return Object.entries(value).map(([key, item]) =>
      el(
        "section",
        { class: "part" },
        el("h3", {}, key),
        raw(item, isRecord(program) ? program[key] : undefined)
      )
    );
  }
  return el("pre", { class: "json" }, pretty(value));
}

const history = [];
const fail = (title, message, note = "") => {
  $("status").replaceChildren(
    el("span", { class: "label" }, title),
    el("span", {}, note)
  );
  $("result").replaceChildren(el("div", { class: "error" }, message));
};
const duration = (ms) => {
  if (ms === undefined) {
    return "";
  }
  return `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`;
};

const run = async () => {
  const source = $("source").value;
  let program;
  try {
    program = JSON.parse(source);
  } catch (error) {
    fail("Not valid JSON", error.message);
    return;
  }
  $("run").disabled = true;
  $("status").replaceChildren("Running…");
  const response = await evaluate(program);
  $("run").disabled = false;
  if (!response.ok) {
    fail("Failed", response.error, duration(response.ms));
    return;
  }
  const rows = Array.isArray(response.value)
    ? counted(response.value.length, "row")
    : "";
  $("status").replaceChildren(
    el("span", { class: "label" }, "Result"),
    el("span", {}, rows),
    el("span", {}, duration(response.ms))
  );
  $("result").replaceChildren(...[raw(response.value, program)].flat());
  if (CHANGES.test(source)) {
    await refresh();
  }
};

function showQuery(program, marked) {
  const source = pretty(program);
  const current = $("source").value;
  if (current.trim() !== "" && current !== source) {
    history.push(current);
  }
  $("back").disabled = history.length === 0;
  $("source").value = source;
  for (const item of document.querySelectorAll("#tables .item")) {
    item.classList.toggle("active", item.dataset.label === marked);
  }
  return run();
}

function openQuery(program) {
  go("query");
  return showQuery(program);
}

const tableItem = (relation, count) =>
  el(
    "button",
    {
      type: "button",
      class: "item",
      "data-label": relation.name,
      onclick: () =>
        showQuery(
          ["query", [relation.name, ...variables(relation)]],
          relation.name
        ),
    },
    el("span", { class: "rows" }, count ?? ""),
    el("span", { class: "name" }, relation.name),
    el("span", { class: "columns" }, relation.columns.join(", "))
  );

const tablesView = async () => {
  const all = [...relations.values()];
  const counts = await evaluate(
    Object.fromEntries(
      all.map((relation) => [
        relation.name,
        [
          "aggregate/count",
          ["find", 1, [relation.name, ...relation.columns.map(() => "?_")]],
        ],
      ])
    )
  );
  const listOf = (title, wanted) => {
    const members = all.filter(
      (relation) => derived.has(relation.name) === wanted
    );
    return (
      members.length > 0 && [
        el("h2", {}, title),
        members.map((relation) =>
          tableItem(
            relation,
            counts.ok ? counts.value[relation.name] : undefined
          )
        ),
      ]
    );
  };
  return [listOf("Recorded", false), listOf("Worked out by rules", true)];
};

// ---- The page plan: views made of blocks, chosen for this reader's goal

const TRUST = {
  alone,
  assumptions,
  confirmed,
  disputed: disagreed,
  misquoted: misquotes,
  secondhand: relayedOnly,
  unread: notRead,
};
const TRUST_ORDER = [
  "confirmed",
  "disputed",
  "alone",
  "secondhand",
  "misquoted",
  "assumptions",
  "unread",
];
const DEFAULT_PLAN = {
  views: [
    { name: "How solid is it", blocks: [{ type: "trust" }] },
    { name: "Sources", blocks: [{ type: "sources" }] },
  ],
};
const plan = isRecord(data.page) ? data.page : DEFAULT_PLAN;
const views = Array.isArray(plan.views) ? plan.views : DEFAULT_PLAN.views;

const heading = (block) =>
  typeof block.title === "string" &&
  el("h2", { class: "blocktitle" }, block.title);
const noted = (block) =>
  typeof block.note === "string" && el("p", { class: "note" }, block.note);
const failed = (response) =>
  el(
    "p",
    { class: "empty" },
    `The model could not answer this: ${response.error}`
  );
const nothing = () =>
  el("p", { class: "empty" }, "Nothing was found for this.");

/** The one value an answer holds, when it holds one. */
const single = (value) => {
  const first = Array.isArray(value) && value.length === 1 ? value[0] : value;
  const fields = isRecord(first) ? Object.values(first) : [];
  return fields.length === 1 ? fields[0] : first;
};

/** Rows in time order, a day at a time: each with its time, what happened, and the rest. */
const timeline = (rows, block) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return nothing();
  }
  const whenKey = block.when ?? "when";
  const whatKey = block.what ?? "what";
  const days = new Map();
  for (const row of rows) {
    const day = DAY_AT_START.exec(String(row[whenKey] ?? ""))?.[0] ?? "";
    pushTo(days, day, row);
  }
  const moment = (row, day) =>
    el(
      "li",
      {},
      el(
        "span",
        { class: "time" },
        String(row[whenKey] ?? "")
          .slice(day.length)
          .trim()
      ),
      el(
        "div",
        {},
        el("div", { class: "what" }, shown(row[whatKey], whatKey)),
        Object.entries(row)
          .filter(([key]) => key !== whenKey && key !== whatKey)
          .map(([key, value]) =>
            el(
              "p",
              { class: "line who" },
              !CLAIM_COLUMN.test(key) && `${label(key)}: `,
              shown(value, key)
            )
          )
      )
    );
  return [...days].map(([day, items]) =>
    el(
      "section",
      { class: "day" },
      el("h3", {}, dated(day) ?? "No date given"),
      el(
        "ol",
        { class: "moments" },
        items.map((row) => moment(row, day))
      )
    )
  );
};

/** Rows as a grid: one row for each value of one column, one column for each value of another. */
const comparison = (rows, block) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return nothing();
  }
  const names = (key) => [...new Set(rows.map((row) => plain(row[key])))];
  const across = names(block.columns);
  const cellOf = (down, over) =>
    rows
      .filter(
        (row) =>
          plain(row[block.rows]) === down && plain(row[block.columns]) === over
      )
      .flatMap((row, at) => [
        at > 0 && ", ",
        shown(row[block.cell], block.cell),
      ]);
  return el(
    "div",
    { class: "scroll" },
    el(
      "table",
      {},
      el(
        "thead",
        {},
        el(
          "tr",
          {},
          el("th", { scope: "col" }, label(String(block.rows))),
          across.map((name) => el("th", { scope: "col" }, name))
        )
      ),
      el(
        "tbody",
        {},
        names(block.rows).map((down) =>
          el(
            "tr",
            {},
            el("th", { scope: "row" }, down),
            across.map((over) => el("td", {}, cellOf(down, over)))
          )
        )
      )
    )
  );
};

/** An answer in the form its block asks for. */
const shaped = (block, value, query) => {
  if (block.as === "timeline") {
    return timeline(value, block);
  }
  return block.as === "comparison"
    ? comparison(value, block)
    : present(value, query);
};

/**
 * What a plan binds before any of its expressions run: the wording helpers
 * this page carries, then the plan's own definitions.
 */
const DEFINITIONS = Object.entries({
  ...(isRecord(data.words) ? data.words : {}),
  ...(isRecord(plan.define) ? plan.define : {}),
}).map(([name, value]) => ["define", name, value]);
const within = (expression) => ["begin", ...DEFINITIONS, expression];

/**
 * Text of the page. A string in the plan is the text itself. Anything else
 * is a Lion expression, and the text is what the model gives for it now.
 */
const worded = async (text) => {
  if (text === undefined || text === null || typeof text === "string") {
    return text ?? undefined;
  }
  const response = await evaluate(within(text));
  return response.ok
    ? plain(response.value)
    : `This could not be worked out from the model: ${response.error}`;
};

const queried = async (block, render) => {
  const response = await evaluate(within(block.query));
  return [
    heading(block),
    noted({ note: await worded(block.note) }),
    response.ok ? render(response.value) : failed(response),
  ];
};

const BLOCKS = {
  answer: async (block) => qa({ ...block, answer: await worded(block.answer) }),
  comparison: (block) => queried(block, (rows) => comparison(rows, block)),
  custom: async (block) => {
    const root = el("div", {});
    try {
      await new Function("root", "kit", String(block.script ?? ""))(root, {
        claims: model.claims,
        comparison,
        el,
        plain,
        query: evaluate,
        shown,
        sources: model.sources,
        statement,
        table: plainTable,
        timeline,
      });
    } catch (error) {
      root.replaceChildren(
        el(
          "p",
          { class: "empty" },
          `This part of the page failed: ${error.message}`
        )
      );
    }
    return [heading(block), noted(block), root];
  },
  figures: async (block) => {
    const items = Array.isArray(block.items) ? block.items : [];
    // A figure's value is an expression the model works out. Text typed in
    // its place is shown as text, and the build has already refused it.
    const response = await evaluate(
      within(
        Object.fromEntries(
          items.map((item, at) => [
            String(at),
            typeof item.value === "string" ? ["quote", item.value] : item.value,
          ])
        )
      )
    );
    const notes = await Promise.all(items.map((item) => worded(item.note)));
    return [
      heading(block),
      noted({ note: await worded(block.note) }),
      response.ok
        ? el(
            "dl",
            { class: "figures" },
            items.map((item, at) =>
              el(
                "div",
                {},
                el("dt", {}, item.label),
                el("dd", {}, shown(single(response.value[at]))),
                notes[at] && el("dd", { class: "aside-note" }, notes[at])
              )
            )
          )
        : failed(response),
    ];
  },
  lookup: async (block) => {
    const choices = Object.entries(block.choose ?? {});
    const options = await evaluate(
      within(
        Object.fromEntries(
          choices.map(([name, choice]) => [name, choice.options])
        )
      )
    );
    if (!options.ok) {
      return [heading(block), failed(options)];
    }
    const result = el("div", { class: "more" });
    const pickers = choices.map(([name, choice]) => ({
      choice,
      name,
      select: el(
        "select",
        { onchange: () => answer() },
        [options.value[name]].flat().map((value) => {
          const item = single(value);
          return el(
            "option",
            {
              value: JSON.stringify(item),
              selected: canonical(item) === canonical(block.example?.[name]),
            },
            choice.labels?.[plain(item)] ?? plain(item)
          );
        })
      ),
    }));
    async function answer() {
      if (pickers.some(({ select }) => select.value === "")) {
        result.replaceChildren(nothing());
        return;
      }
      // The block's query is a function of what the reader chose, and each
      // choice is passed to it as data.
      const query = [
        block.query,
        ...pickers.map(({ select }) => ["quote", JSON.parse(select.value)]),
      ];
      const response = await evaluate(within(query));
      result.replaceChildren(
        ...[
          response.ok ? shaped(block, response.value, query) : failed(response),
        ]
          .flat(3)
          .filter(Boolean)
      );
    }
    await answer();
    return [
      heading(block),
      noted({ note: await worded(block.note) }),
      el(
        "div",
        { class: "choose" },
        pickers.map(({ choice, name, select }) =>
          el(
            "label",
            {},
            el("span", {}, choice.label ?? sentence(name)),
            select
          )
        )
      ),
      result,
    ];
  },
  sources: (block) => [heading(block), noted(block), sourcesView()],
  table: (block) => queried(block, (value) => present(value, block.query)),
  text: async (block) => [
    heading(block),
    String((await worded(block.text)) ?? "")
      .split("\n\n")
      .map((paragraph) => el("p", { class: "prose" }, paragraph)),
  ],
  timeline: (block) => queried(block, (rows) => timeline(rows, block)),
  trust: (block) => {
    const wanted = [block.about ?? []].flat();
    const keep = (row) =>
      wanted.length === 0 ||
      (isRecord(row.question) && wanted.some((key) => key in row.question));
    const groups = (Array.isArray(block.show) ? block.show : TRUST_ORDER)
      .map((name) => TRUST[name]?.(keep))
      .filter(Boolean);
    return [
      heading(block),
      el(
        "p",
        { class: "lead" },
        block.note ??
          "Every finding is traced to who said it. It counts as confirmed only when two or more independent publishers say it first-hand, in their own voice; sources that repeat one another count once."
      ),
      groups.length > 0
        ? groups
        : el("p", { class: "empty" }, "The model holds nothing of this kind."),
    ];
  },
};

const blockOf = async (block) => {
  const build = BLOCKS[block?.type];
  const content = build
    ? await build(block)
    : el(
        "p",
        { class: "empty" },
        `This page asks for a part called "${block?.type}", which this version of the page does not have.`
      );
  return el("div", { class: `block is-${block?.type ?? "unknown"}` }, content);
};

/** A view's blocks, with a search box over its questions when it has many. */
const viewOf = async (view) => {
  const blocks = await Promise.all(
    (Array.isArray(view.blocks) ? view.blocks : []).map(blockOf)
  );
  const questions = blocks.flatMap((block) => [
    ...block.querySelectorAll(".qa"),
  ]);
  return [
    questions.length >= FILTER_FROM &&
      searchOver(
        "Search the questions",
        questions,
        "No question here matches that."
      ),
    blocks,
  ];
};

// ---- The page

const pageId = (at) => `view-${at}`;
const pageIds = () => [...views.map((_view, at) => pageId(at)), "query"];

function go(id) {
  for (const name of pageIds()) {
    $(name).hidden = name !== id;
  }
  for (const button of document.querySelectorAll(".views button")) {
    if (button.dataset.view === id) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  }
  const top = document.querySelector(".top").offsetHeight;
  if (window.scrollY > top) {
    window.scrollTo(0, top);
  }
}

const fill = (id, content) =>
  $(id).replaceChildren(...[content].flat(4).filter(Boolean));

/** Builds every view from the model as it now is. */
async function refresh() {
  const response = await loadModel();
  if (!response.ok) {
    $("meta").textContent =
      `This file's model could not be opened: ${response.error}`;
    fill(
      pageId(0),
      el(
        "p",
        { class: "empty" },
        "Nothing can be shown until the model opens. The file may be damaged; build it again from the research folder."
      )
    );
    return;
  }
  $("meta").textContent = [
    relations.has("source") && counted(rowsOf("source").length, "source"),
    relations.has("claim") && counted(rowsOf("claim").length, "statement"),
    dated(data.generated) && `as of ${dated(data.generated)}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const summary = await worded(plan.summary);
  $("summary").textContent = summary ?? "";
  $("summary").hidden = !summary;
  const built = await Promise.all(views.map(viewOf));
  for (const [at, content] of built.entries()) {
    fill(pageId(at), content);
  }
  fill("tables", await tablesView());
}

const tab = (id, name, quiet = false) =>
  el(
    "button",
    {
      type: "button",
      class: quiet ? "quiet" : "",
      "data-view": id,
      onclick: () => go(id),
    },
    name
  );

$("title").textContent = plan.title || data.title || "Research model";
$("views").replaceChildren(
  ...views.map((view, at) => tab(pageId(at), view.name ?? `Part ${at + 1}`)),
  tab("query", "Query the model", true)
);
$("pages").replaceChildren(
  ...views.map((view, at) =>
    el("section", {
      id: pageId(at),
      "aria-label": view.name ?? "",
      hidden: true,
    })
  )
);
$("run").addEventListener("click", run);
$("back").addEventListener("click", () => {
  const source = history.pop();
  $("back").disabled = history.length === 0;
  if (source !== undefined) {
    $("source").value = source;
    run();
  }
});
$("reset").addEventListener("click", async () => {
  await load();
  await refresh();
  if ($("source").value.trim() !== "") {
    await run();
  }
});
$("source").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    run();
  }
});
go(pageId(0));
startWorker();
load().then(refresh);
