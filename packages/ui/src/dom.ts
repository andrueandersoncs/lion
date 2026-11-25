/**
 * Zero-dependency, XSS-safe DOM renderer and in-place patcher for Lion UI
 * trees (`@lionlang/ui/dom`).
 *
 * Every string is inserted via `textContent` (never `innerHTML`). Interactive
 * controls (`input`, `number`, `slider`, `select`, `toggle`, `button`) keep
 * their DOM elements and focus across re-renders by matching on `data-ui-kind`
 * and `data-ui-key`.
 */
import { isUiNode, type UiChild, type UiKind, type UiNode } from "./types.ts";

export interface RenderUiOptions {
  /** Called when the user interacts with a control that carries an action. */
  readonly onAction?: (action: unknown, value?: unknown) => void;
}

interface RenderContext {
  readonly doc: Document;
  readonly onAction: ((action: unknown, value?: unknown) => void) | undefined;
}

type ElementRenderer = (
  node: UiNode,
  ctx: RenderContext,
  existing?: HTMLElement
) => HTMLElement;

const ACTION_MAP = new WeakMap<HTMLElement, unknown>();
const WIRED = new WeakSet<HTMLElement>();

const str = (value: unknown, fallback = ""): string => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
};

const num = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const bool = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : fallback;

const keyOf = (node: UiNode): string => {
  const key = node.props.key ?? node.props.id ?? node.props.label;
  return typeof key === "string" || typeof key === "number" ? String(key) : "";
};

const TONES = new Set(["ok", "warn", "error", "muted", "accent"]);

const toneClass = (tone: unknown): string => {
  const value = str(tone);
  return TONES.has(value) ? `is-${value}` : "";
};

const matchesExisting = (
  existing: HTMLElement | undefined,
  kind: UiKind,
  key: string
): existing is HTMLElement =>
  existing !== undefined &&
  existing.dataset.uiKind === kind &&
  (existing.dataset.uiKey ?? "") === key;

const makeEl = (
  doc: Document,
  tag: string,
  className?: string
): HTMLElement => {
  const el = doc.createElement(tag);
  if (className) {
    el.className = className;
  }
  return el;
};

const appendText = (
  doc: Document,
  parent: HTMLElement,
  tag: string,
  text: string,
  className?: string
) => {
  const el = makeEl(doc, tag, className);
  el.textContent = text;
  parent.append(el);
  return el;
};

const formatAtom = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
  }
  return typeof value === "string" ? value : JSON.stringify(value);
};

const renderWhyHeader = (
  doc: Document,
  rec: Readonly<Record<string, unknown>>
): HTMLElement => {
  const header = makeEl(doc, "div", "lion-ui-why-head");
  if ("fact" in rec) {
    const tag = rec.given === true ? "given" : "derived";
    const tone = tag === "given" ? "is-ok" : "is-accent";
    appendText(doc, header, "span", tag, `lion-ui-why-tag ${tone}`);
    appendText(doc, header, "code", formatAtom(rec.fact), "lion-ui-why-atom");
  } else if ("absent" in rec) {
    appendText(doc, header, "span", "absent", "lion-ui-why-tag is-error");
    appendText(doc, header, "code", formatAtom(rec.absent), "lion-ui-why-atom");
  } else if ("check" in rec) {
    appendText(doc, header, "span", "check", "lion-ui-why-tag is-ok");
    appendText(doc, header, "code", formatAtom(rec.check), "lion-ui-why-atom");
  } else if ("rule" in rec) {
    appendText(doc, header, "span", "rule", "lion-ui-why-tag is-muted");
    appendText(doc, header, "code", formatAtom(rec.rule), "lion-ui-why-atom");
  } else {
    appendText(doc, header, "code", JSON.stringify(rec), "lion-ui-why-atom");
  }
  return header;
};

const renderWhyTree = (
  doc: Document,
  data: unknown,
  depth = 0
): HTMLElement => {
  const root = makeEl(
    doc,
    "div",
    `lion-ui-why-node depth-${Math.min(depth, 4)}`
  );
  if (typeof data !== "object" || data === null) {
    appendText(
      doc,
      root,
      "span",
      str(data, "No explanation"),
      "lion-ui-why-empty"
    );
    return root;
  }
  const rec = data as Record<string, unknown>;
  root.append(renderWhyHeader(doc, rec));

  if ("but" in rec && rec.but !== undefined) {
    const blocked = makeEl(doc, "div", "lion-ui-why-but");
    appendText(doc, blocked, "span", "blocked by", "lion-ui-why-label");
    blocked.append(renderWhyTree(doc, rec.but, depth + 1));
    root.append(blocked);
  }

  if (Array.isArray(rec.because) && rec.because.length > 0) {
    const list = makeEl(doc, "div", "lion-ui-why-children");
    for (const item of rec.because) {
      list.append(renderWhyTree(doc, item, depth + 1));
    }
    root.append(list);
  }

  return root;
};

const proofBadge = (
  props: Readonly<Record<string, unknown>>,
  data: Record<string, unknown> | null
): readonly [label: string, tone: string] => {
  if (props.valid === true) {
    return ["kernel verified", "is-ok"];
  }
  if (data?.proved === true) {
    return ["proved", "is-ok"];
  }
  if (data?.proved === false) {
    return ["refuted", "is-error"];
  }
  if (data && "min" in data && "max" in data) {
    return props.valid === false
      ? ["bound failed", "is-error"]
      : ["exact bounds", "is-ok"];
  }
  return ["unchecked", "is-muted"];
};

const renderProofBody = (
  doc: Document,
  card: HTMLElement,
  props: Readonly<Record<string, unknown>>,
  data: Record<string, unknown> | null
) => {
  if (data && "min" in data && "max" in data) {
    const row = makeEl(doc, "div", "lion-ui-proof-bounds");
    appendText(doc, row, "span", `min ${str(data.min)}`, "lion-ui-proof-stat");
    appendText(doc, row, "span", `max ${str(data.max)}`, "lion-ui-proof-stat");
    card.append(row);
    if (typeof data.witnessMin === "object" && data.witnessMin !== null) {
      appendText(
        doc,
        card,
        "p",
        `Worst-case witness: ${JSON.stringify(data.witnessMin)}`,
        "lion-ui-proof-note"
      );
    }
    return;
  }
  if (data && "counterexample" in data && data.counterexample !== null) {
    appendText(
      doc,
      card,
      "p",
      `Counterexample: ${JSON.stringify(data.counterexample)}`,
      "lion-ui-proof-note is-error"
    );
    return;
  }
  if (props.summary) {
    appendText(doc, card, "p", str(props.summary), "lion-ui-proof-note");
  }
};

const renderProof: ElementRenderer = (node, { doc }) => {
  const card = makeEl(doc, "div", "lion-ui-proof");
  card.dataset.uiKind = node.$ui;
  card.dataset.uiKey = keyOf(node);
  const data =
    typeof node.props.data === "object" && node.props.data !== null
      ? (node.props.data as Record<string, unknown>)
      : null;

  const head = makeEl(doc, "div", "lion-ui-proof-head");
  appendText(
    doc,
    head,
    "span",
    str(node.props.title, "Formal proof"),
    "lion-ui-proof-title"
  );
  const [badgeText, badgeTone] = proofBadge(node.props, data);
  appendText(doc, head, "span", badgeText, `lion-ui-badge ${badgeTone}`);
  card.append(head);
  renderProofBody(doc, card, node.props, data);
  return card;
};

const renderButton: ElementRenderer = (node, { doc, onAction }, existing) => {
  const key = keyOf(node);
  const button = (
    matchesExisting(existing, "button", key)
      ? existing
      : makeEl(doc, "button", "lion-ui-button")
  ) as HTMLButtonElement;
  button.type = "button";
  button.dataset.uiKind = "button";
  button.dataset.uiKey = key;
  button.className = `lion-ui-button ${toneClass(node.props.tone)}`.trim();
  button.disabled = bool(node.props.disabled, false);
  button.textContent =
    str(node.props.label) ||
    node.children.map((child) => str(child)).join(" ") ||
    "Run";
  ACTION_MAP.set(button, node.props.onClick ?? node.props.action);
  if (!WIRED.has(button)) {
    WIRED.add(button);
    button.addEventListener("click", () => {
      const action = ACTION_MAP.get(button);
      if (action !== undefined) {
        onAction?.(action);
      }
    });
  }
  return button;
};

const renderToggle: ElementRenderer = (node, { doc, onAction }, existing) => {
  const key = keyOf(node);
  const wrapper = matchesExisting(existing, "toggle", key)
    ? existing
    : makeEl(doc, "label", "lion-ui-toggle");
  wrapper.dataset.uiKind = "toggle";
  wrapper.dataset.uiKey = key;
  let input = wrapper.querySelector("input") as HTMLInputElement | null;
  let text = wrapper.querySelector(
    ".lion-ui-toggle-label"
  ) as HTMLElement | null;
  if (!(input && text)) {
    wrapper.textContent = "";
    input = doc.createElement("input");
    input.type = "checkbox";
    input.className = "lion-ui-toggle-input";
    const track = makeEl(doc, "span", "lion-ui-toggle-track");
    text = makeEl(doc, "span", "lion-ui-toggle-label");
    wrapper.append(input, track, text);
  }
  input.checked = bool(node.props.checked ?? node.props.value, false);
  text.textContent = str(node.props.label);
  ACTION_MAP.set(input, node.props.onChange ?? node.props.action);
  if (!WIRED.has(input)) {
    WIRED.add(input);
    input.addEventListener("change", () => {
      const target = input as HTMLInputElement;
      const action = ACTION_MAP.get(target);
      if (action !== undefined) {
        onAction?.(action, target.checked);
      }
    });
  }
  return wrapper;
};

const ensureFieldShell = (
  doc: Document,
  kind: UiKind,
  key: string,
  label: string,
  existing?: HTMLElement
) => {
  const field = matchesExisting(existing, kind, key)
    ? existing
    : makeEl(doc, "label", `lion-ui-field is-${kind}`);
  field.dataset.uiKind = kind;
  field.dataset.uiKey = key;
  let head = field.querySelector(".lion-ui-field-head") as HTMLElement | null;
  let labelEl = field.querySelector(
    ".lion-ui-field-label"
  ) as HTMLElement | null;
  let valueBadge = field.querySelector(
    ".lion-ui-field-value"
  ) as HTMLElement | null;
  if (!(head && labelEl)) {
    field.textContent = "";
    head = makeEl(doc, "span", "lion-ui-field-head");
    labelEl = makeEl(doc, "span", "lion-ui-field-label");
    head.append(labelEl);
    if (kind === "slider") {
      valueBadge = makeEl(doc, "span", "lion-ui-field-value");
      head.append(valueBadge);
    }
    field.append(head);
  }
  labelEl.textContent = label;
  return { field, valueBadge };
};

const normalizeOptions = (raw: unknown) => {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((opt) =>
    typeof opt === "object" && opt !== null
      ? {
          label: str((opt as Record<string, unknown>).label),
          value: str((opt as Record<string, unknown>).value),
        }
      : { label: str(opt), value: str(opt) }
  );
};

const renderSelect: ElementRenderer = (node, { doc, onAction }, existing) => {
  const { field } = ensureFieldShell(
    doc,
    "select",
    keyOf(node),
    str(node.props.label),
    existing
  );
  let select = field.querySelector("select") as HTMLSelectElement | null;
  if (!select) {
    select = doc.createElement("select");
    select.className = "lion-ui-select";
    field.append(select);
  }
  const options = normalizeOptions(node.props.options);
  const signature = JSON.stringify(options);
  if (select.dataset.optionsSig !== signature) {
    select.dataset.optionsSig = signature;
    select.textContent = "";
    for (const opt of options) {
      const optionEl = doc.createElement("option");
      optionEl.value = opt.value;
      optionEl.textContent = opt.label;
      select.append(optionEl);
    }
  }
  const nextVal = str(node.props.value);
  if (select.value !== nextVal) {
    select.value = nextVal;
  }
  ACTION_MAP.set(select, node.props.onChange ?? node.props.action);
  if (!WIRED.has(select)) {
    WIRED.add(select);
    select.addEventListener("change", () => {
      const target = select as HTMLSelectElement;
      const action = ACTION_MAP.get(target);
      if (action !== undefined) {
        onAction?.(action, target.value);
      }
    });
  }
  return field;
};

const syncInputAttributes = (
  input: HTMLInputElement,
  kind: "input" | "number" | "slider",
  props: Readonly<Record<string, unknown>>,
  doc: Document,
  valueBadge: HTMLElement | null
) => {
  if (kind === "slider") {
    input.type = "range";
    input.min = String(num(props.min, 0));
    input.max = String(num(props.max, 100));
    input.step = String(num(props.step, 1));
    const current = num(props.value, num(props.min, 0));
    if (input.value !== String(current)) {
      input.value = String(current);
    }
    if (valueBadge) {
      valueBadge.textContent = `${str(props.prefix)}${current}${str(props.suffix)}`;
    }
    return;
  }
  input.type = kind === "number" ? "number" : "text";
  if (kind === "number") {
    if (props.min !== undefined) {
      input.min = String(num(props.min, 0));
    }
    if (props.max !== undefined) {
      input.max = String(num(props.max, 100));
    }
    if (props.step !== undefined) {
      input.step = String(num(props.step, 1));
    }
  } else {
    input.placeholder = str(props.placeholder);
  }
  const nextVal = str(props.value);
  if (doc.activeElement !== input && input.value !== nextVal) {
    input.value = nextVal;
  }
};

const renderInputControl =
  (kind: "input" | "number" | "slider"): ElementRenderer =>
  (node, { doc, onAction }, existing) => {
    const { field, valueBadge } = ensureFieldShell(
      doc,
      kind,
      keyOf(node),
      str(node.props.label),
      existing
    );
    let input = field.querySelector("input") as HTMLInputElement | null;
    if (!input) {
      input = doc.createElement("input");
      input.className = kind === "slider" ? "lion-ui-slider" : "lion-ui-input";
      field.append(input);
    }
    syncInputAttributes(input, kind, node.props, doc, valueBadge);
    ACTION_MAP.set(input, node.props.onChange ?? node.props.action);
    if (!WIRED.has(input)) {
      WIRED.add(input);
      input.addEventListener("input", () => {
        const target = input as HTMLInputElement;
        const action = ACTION_MAP.get(target);
        if (action === undefined) {
          return;
        }
        if (kind === "slider" || kind === "number") {
          const parsed = Number(target.value);
          if (Number.isFinite(parsed)) {
            onAction?.(action, parsed);
          }
        } else {
          onAction?.(action, target.value);
        }
      });
    }
    return field;
  };

const renderChild = (
  child: UiChild,
  ctx: RenderContext,
  existing?: ChildNode
): Node => {
  if (!isUiNode(child)) {
    const text = String(child);
    if (existing?.nodeType === 3) {
      if (existing.textContent !== text) {
        existing.textContent = text;
      }
      return existing;
    }
    return ctx.doc.createTextNode(text);
  }
  return renderElement(
    child,
    ctx,
    existing?.nodeType === 1 ? (existing as HTMLElement) : undefined
  );
};

const patchChildren = (
  container: HTMLElement,
  children: readonly UiChild[],
  ctx: RenderContext
) => {
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (child === undefined) {
      continue;
    }
    const existing = container.childNodes[i];
    const next = renderChild(child, ctx, existing);
    if (!existing) {
      container.append(next);
    } else if (next !== existing) {
      container.replaceChild(next, existing);
    }
  }
  while (container.childNodes.length > children.length) {
    container.lastChild?.remove();
  }
};

const renderLayout =
  (kind: "stack" | "row" | "grid"): ElementRenderer =>
  (node, ctx, existing) => {
    const key = keyOf(node);
    const el = matchesExisting(existing, kind, key)
      ? existing
      : makeEl(ctx.doc, "div");
    el.dataset.uiKind = kind;
    el.dataset.uiKey = key;
    const gap = str(node.props.gap, "md");
    const align = str(node.props.align);
    el.className =
      `lion-ui-${kind} gap-${gap} ${align ? `align-${align}` : ""}`.trim();
    if (kind === "grid") {
      el.style.setProperty("--ui-cols", String(num(node.props.columns, 2)));
    }
    patchChildren(el, node.children, ctx);
    return el;
  };

const renderCard: ElementRenderer = (node, ctx, existing) => {
  const { doc } = ctx;
  const key = keyOf(node);
  const el = matchesExisting(existing, "card", key)
    ? existing
    : makeEl(doc, "section");
  el.dataset.uiKind = "card";
  el.dataset.uiKey = key;
  el.className = `lion-ui-card ${toneClass(node.props.tone)}`.trim();

  const title = str(node.props.title);
  const subtitle = str(node.props.subtitle);
  let body = el.querySelector(
    ":scope > .lion-ui-card-body"
  ) as HTMLElement | null;
  if (body) {
    const titleEl = el.querySelector(
      ":scope > .lion-ui-card-head .lion-ui-card-title"
    );
    if (titleEl && titleEl.textContent !== title) {
      titleEl.textContent = title;
    }
    const subEl = el.querySelector(
      ":scope > .lion-ui-card-head .lion-ui-card-subtitle"
    );
    if (subEl && subEl.textContent !== subtitle) {
      subEl.textContent = subtitle;
    }
  } else {
    el.textContent = "";
    if (title || subtitle) {
      const header = makeEl(doc, "header", "lion-ui-card-head");
      if (title) {
        appendText(doc, header, "h4", title, "lion-ui-card-title");
      }
      if (subtitle) {
        appendText(doc, header, "p", subtitle, "lion-ui-card-subtitle");
      }
      el.append(header);
    }
    body = makeEl(doc, "div", "lion-ui-card-body");
    el.append(body);
  }
  patchChildren(body, node.children, ctx);
  return el;
};

const renderMetric: ElementRenderer = (node, { doc }) => {
  const el = makeEl(
    doc,
    "div",
    `lion-ui-metric ${toneClass(node.props.tone)}`.trim()
  );
  el.dataset.uiKind = "metric";
  el.dataset.uiKey = keyOf(node);
  appendText(doc, el, "span", str(node.props.label), "lion-ui-metric-label");
  appendText(doc, el, "strong", str(node.props.value), "lion-ui-metric-value");
  if (
    node.props.delta !== undefined &&
    node.props.delta !== null &&
    node.props.delta !== ""
  ) {
    appendText(doc, el, "span", str(node.props.delta), "lion-ui-metric-delta");
  }
  return el;
};

const renderAlert: ElementRenderer = (node, ctx) => {
  const el = makeEl(
    ctx.doc,
    "div",
    `lion-ui-alert ${toneClass(node.props.tone)}`.trim()
  );
  el.dataset.uiKind = "alert";
  el.dataset.uiKey = keyOf(node);
  if (node.props.title) {
    appendText(
      ctx.doc,
      el,
      "strong",
      str(node.props.title),
      "lion-ui-alert-title"
    );
  }
  if (node.children.length > 0) {
    const body = makeEl(ctx.doc, "div", "lion-ui-alert-body");
    patchChildren(body, node.children, ctx);
    el.append(body);
  }
  return el;
};

const renderProgress: ElementRenderer = (node, { doc }) => {
  const el = makeEl(
    doc,
    "div",
    `lion-ui-progress ${toneClass(node.props.tone)}`.trim()
  );
  el.dataset.uiKind = "progress";
  el.dataset.uiKey = keyOf(node);
  const value = num(node.props.value, 0);
  const max = Math.max(1, num(node.props.max, 100));
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const head = makeEl(doc, "div", "lion-ui-progress-head");
  appendText(
    doc,
    head,
    "span",
    str(node.props.label),
    "lion-ui-progress-label"
  );
  appendText(
    doc,
    head,
    "span",
    str(node.props.display, `${Math.round(pct)}%`),
    "lion-ui-progress-value"
  );
  const track = makeEl(doc, "div", "lion-ui-progress-track");
  const fill = makeEl(doc, "div", "lion-ui-progress-fill");
  fill.style.width = `${pct}%`;
  track.append(fill);
  el.append(head, track);
  return el;
};

const renderTable: ElementRenderer = (node, ctx) => {
  const { doc } = ctx;
  const wrap = makeEl(doc, "div", "lion-ui-table-wrap");
  wrap.dataset.uiKind = "table";
  wrap.dataset.uiKey = keyOf(node);
  const table = makeEl(doc, "table", "lion-ui-table");
  const columns = Array.isArray(node.props.columns) ? node.props.columns : [];
  const rows = Array.isArray(node.props.rows) ? node.props.rows : [];
  if (columns.length > 0) {
    const thead = doc.createElement("thead");
    const tr = doc.createElement("tr");
    for (const col of columns) {
      appendText(doc, tr, "th", str(col));
    }
    thead.append(tr);
    table.append(thead);
  }
  const tbody = doc.createElement("tbody");
  for (const row of rows) {
    const tr = doc.createElement("tr");
    const cells = Array.isArray(row) ? row : [row];
    for (const cell of cells) {
      const td = doc.createElement("td");
      if (isUiNode(cell)) {
        td.append(renderElement(cell, ctx));
      } else {
        td.textContent = str(cell);
      }
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  wrap.append(table);
  return wrap;
};

const renderWhy: ElementRenderer = (node, { doc }) => {
  const el = makeEl(doc, "div", "lion-ui-why");
  el.dataset.uiKind = "why";
  el.dataset.uiKey = keyOf(node);
  if (node.props.title) {
    appendText(doc, el, "div", str(node.props.title), "lion-ui-why-title");
  }
  el.append(renderWhyTree(doc, node.props.data));
  return el;
};

const renderSimple =
  (tag: string, baseClass: string): ElementRenderer =>
  (node, ctx) => {
    const el = makeEl(
      ctx.doc,
      tag,
      `${baseClass} ${toneClass(node.props.tone)}`.trim()
    );
    el.dataset.uiKind = node.$ui;
    el.dataset.uiKey = keyOf(node);
    patchChildren(el, node.children, ctx);
    return el;
  };

const renderHeading: ElementRenderer = (node, ctx) => {
  const level = Math.min(4, Math.max(1, num(node.props.level, 3)));
  const el = makeEl(ctx.doc, `h${level}`, `lion-ui-heading level-${level}`);
  el.dataset.uiKind = "heading";
  el.dataset.uiKey = keyOf(node);
  patchChildren(el, node.children, ctx);
  return el;
};

const renderCode: ElementRenderer = (node, { doc }) => {
  const pre = makeEl(doc, "pre", "lion-ui-code");
  pre.dataset.uiKind = "code";
  const code = doc.createElement("code");
  code.textContent = node.children.map((child) => str(child)).join("");
  pre.append(code);
  return pre;
};

const renderDivider: ElementRenderer = (_node, { doc }) => {
  const hr = makeEl(doc, "hr", "lion-ui-divider");
  hr.dataset.uiKind = "divider";
  return hr;
};

const RENDERERS: Readonly<Record<UiKind, ElementRenderer>> = {
  alert: renderAlert,
  badge: renderSimple("span", "lion-ui-badge"),
  button: renderButton,
  card: renderCard,
  code: renderCode,
  divider: renderDivider,
  grid: renderLayout("grid"),
  heading: renderHeading,
  input: renderInputControl("input"),
  metric: renderMetric,
  number: renderInputControl("number"),
  progress: renderProgress,
  proof: renderProof,
  row: renderLayout("row"),
  select: renderSelect,
  slider: renderInputControl("slider"),
  stack: renderLayout("stack"),
  table: renderTable,
  text: renderSimple("p", "lion-ui-text"),
  toggle: renderToggle,
  why: renderWhy,
};

const renderElement = (
  node: UiNode,
  ctx: RenderContext,
  existing?: HTMLElement
): HTMLElement => RENDERERS[node.$ui](node, ctx, existing);

/**
 * Renders (or patches in place) a Lion UI node into `container`.
 */
export const renderUi = (
  node: UiNode,
  container: HTMLElement,
  options: RenderUiOptions = {}
): void => {
  const ctx: RenderContext = {
    doc: container.ownerDocument,
    onAction: options.onAction,
  };
  const existing = container.firstElementChild as HTMLElement | null;
  const next = renderElement(node, ctx, existing ?? undefined);
  if (!existing) {
    container.append(next);
  } else if (next !== existing) {
    container.replaceChild(next, existing);
  }
  while (container.children.length > 1) {
    container.lastElementChild?.remove();
  }
};
