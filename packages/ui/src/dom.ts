/**
 * Zero-dependency, XSS-safe DOM renderer and in-place patcher for Lion UI
 * trees (`@lionlang/ui/dom`).
 *
 * Every string is inserted via `textContent` (never `innerHTML`). Interactive
 * controls (`input`, `number`, `slider`, `select`, `toggle`, `button`) keep
 * their DOM elements and focus across re-renders by matching on `data-ui-kind`
 * and `data-ui-key`.
 *
 * Styling is fully configurable:
 * - Import `@lionlang/ui/styles.css` and override `--lion-ui-*` CSS variables
 *   (or set `theme: "light" | "dark"`), OR
 * - Omit the default stylesheet and pass `classes: { card: "...", ... }` for
 *   Tailwind / CSS Modules / custom design systems.
 */
import { isUiNode, type UiChild, type UiKind, type UiNode } from "./types.ts";

export interface RenderUiOptions {
  /** Extra or replacement class names keyed by slot (e.g. `"card"`, `"selectTrigger"`, `"selectMenu"`). */
  readonly classes?: Readonly<Partial<Record<string, string>>>;
  /** Called when the user interacts with a control that carries an action. */
  readonly onAction?: (action: unknown, value?: unknown) => void;
  /** Optional theme preset applied as `data-lion-theme` on the container. */
  readonly theme?: "dark" | "light";
  /** Omit default `lion-ui-*` class names when using custom `classes` only. */
  readonly unstyled?: boolean;
}

interface RenderContext {
  readonly classes: Readonly<Partial<Record<string, string>>> | undefined;
  readonly doc: Document;
  readonly onAction: ((action: unknown, value?: unknown) => void) | undefined;
  readonly unstyled: boolean;
}

type ElementRenderer = (
  node: UiNode,
  ctx: RenderContext,
  existing?: HTMLElement
) => HTMLElement;

const ACTION_MAP = new WeakMap<HTMLElement, unknown>();
const WIRED = new WeakSet<HTMLElement>();
const OPEN_SELECTS = new Set<HTMLElement>();
const OUTSIDE_WIRED = new WeakSet<Document>();

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

const cx = (
  ctx: RenderContext,
  slot: string,
  base: string,
  extra?: string
): string => {
  const parts: string[] = [];
  if (!ctx.unstyled && base) {
    parts.push(base);
  }
  const custom = ctx.classes?.[slot];
  if (custom) {
    parts.push(custom);
  }
  if (extra) {
    parts.push(extra);
  }
  return parts.join(" ").trim();
};

const nodeClass = (
  ctx: RenderContext,
  slot: string,
  base: string,
  node: UiNode,
  extra?: string
): string => {
  const propClass = str(node.props.className);
  const combinedExtra = [extra, propClass].filter(Boolean).join(" ");
  return cx(ctx, slot, base, combinedExtra);
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

const closeSelect = (root: HTMLElement) => {
  root.classList.remove("is-open");
  const trigger = root.querySelector<HTMLButtonElement>(
    "[data-select-trigger]"
  );
  const menu = root.querySelector<HTMLElement>("[data-select-menu]");
  trigger?.setAttribute("aria-expanded", "false");
  if (menu) {
    menu.hidden = true;
  }
  OPEN_SELECTS.delete(root);
};

const ensureOutsideDismiss = (doc: Document) => {
  if (OUTSIDE_WIRED.has(doc)) {
    return;
  }
  OUTSIDE_WIRED.add(doc);
  doc.addEventListener("pointerdown", (event) => {
    const target = event.target as Node | null;
    for (const root of [...OPEN_SELECTS]) {
      if (!(target && root.contains(target))) {
        closeSelect(root);
      }
    }
  });
  doc.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      for (const root of [...OPEN_SELECTS]) {
        closeSelect(root);
      }
    }
  });
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

const renderProof: ElementRenderer = (node, ctx) => {
  const { doc } = ctx;
  const card = makeEl(
    doc,
    "div",
    nodeClass(ctx, "proof", "lion-ui-proof", node)
  );
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
  appendText(
    doc,
    head,
    "span",
    badgeText,
    cx(ctx, "badge", "lion-ui-badge", badgeTone)
  );
  card.append(head);
  renderProofBody(doc, card, node.props, data);
  return card;
};

const renderButton: ElementRenderer = (node, ctx, existing) => {
  const { doc, onAction } = ctx;
  const key = keyOf(node);
  const button = (
    matchesExisting(existing, "button", key) ? existing : makeEl(doc, "button")
  ) as HTMLButtonElement;
  button.type = "button";
  button.dataset.uiKind = "button";
  button.dataset.uiKey = key;
  button.className = nodeClass(
    ctx,
    "button",
    "lion-ui-button",
    node,
    toneClass(node.props.tone)
  );
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

const renderToggle: ElementRenderer = (node, ctx, existing) => {
  const { doc, onAction } = ctx;
  const key = keyOf(node);
  const wrapper = matchesExisting(existing, "toggle", key)
    ? existing
    : makeEl(doc, "label");
  wrapper.dataset.uiKind = "toggle";
  wrapper.dataset.uiKey = key;
  wrapper.className = nodeClass(ctx, "toggle", "lion-ui-toggle", node);
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
  ctx: RenderContext,
  kind: UiKind,
  key: string,
  label: string,
  node: UiNode,
  tag: "label" | "div",
  existing?: HTMLElement
) => {
  const { doc } = ctx;
  const field = matchesExisting(existing, kind, key)
    ? existing
    : makeEl(doc, tag);
  field.dataset.uiKind = kind;
  field.dataset.uiKey = key;
  field.className = nodeClass(ctx, "field", `lion-ui-field is-${kind}`, node);
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

const makeChevronSvg = (doc: Document): SVGSVGElement => {
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", "lion-ui-select-chevron");
  const path = doc.createElementNS("http://www.w3.org/2000/svg", "polyline");
  path.setAttribute("points", "6 9 12 15 18 9");
  svg.append(path);
  return svg;
};

const populateSelectMenu = (
  menu: HTMLElement,
  root: HTMLElement,
  options: readonly { readonly label: string; readonly value: string }[],
  currentValue: string,
  ctx: RenderContext
) => {
  const { doc, onAction } = ctx;
  menu.textContent = "";
  for (const opt of options) {
    const selected = opt.value === currentValue;
    const item = makeEl(
      doc,
      "button",
      cx(
        ctx,
        "selectOption",
        "lion-ui-select-option",
        selected ? "is-selected" : ""
      )
    ) as HTMLButtonElement;
    item.type = "button";
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(selected));
    const check = makeEl(doc, "span", "lion-ui-select-check");
    check.textContent = selected ? "✓" : "";
    const text = makeEl(doc, "span", "lion-ui-select-option-label");
    text.textContent = opt.label;
    item.append(text, check);
    item.addEventListener("click", () => {
      closeSelect(root);
      const action = ACTION_MAP.get(root);
      if (action !== undefined) {
        onAction?.(action, opt.value);
      }
    });
    menu.append(item);
  }
};

const renderSelect: ElementRenderer = (node, ctx, existing) => {
  const { doc } = ctx;
  ensureOutsideDismiss(doc);
  const { field } = ensureFieldShell(
    ctx,
    "select",
    keyOf(node),
    str(node.props.label),
    node,
    "div",
    existing
  );

  let root = field.querySelector<HTMLElement>("[data-select-root]");
  let trigger = field.querySelector<HTMLButtonElement>("[data-select-trigger]");
  let triggerLabel = field.querySelector<HTMLElement>("[data-select-value]");
  let menu = field.querySelector<HTMLElement>("[data-select-menu]");

  if (!(root && trigger && triggerLabel && menu)) {
    root = makeEl(doc, "div", cx(ctx, "select", "lion-ui-select-root"));
    root.dataset.selectRoot = "";
    trigger = makeEl(
      doc,
      "button",
      cx(ctx, "selectTrigger", "lion-ui-select-trigger")
    ) as HTMLButtonElement;
    trigger.type = "button";
    trigger.dataset.selectTrigger = "";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    triggerLabel = makeEl(doc, "span", "lion-ui-select-value");
    triggerLabel.dataset.selectValue = "";
    trigger.append(triggerLabel, makeChevronSvg(doc));
    menu = makeEl(doc, "div", cx(ctx, "selectMenu", "lion-ui-select-menu"));
    menu.dataset.selectMenu = "";
    menu.setAttribute("role", "listbox");
    menu.hidden = true;
    root.append(trigger, menu);
    field.append(root);
  }

  const options = normalizeOptions(node.props.options);
  const currentValue = str(node.props.value);
  const currentOption = options.find((opt) => opt.value === currentValue);
  triggerLabel.textContent = currentOption?.label ?? currentValue;

  ACTION_MAP.set(root, node.props.onChange ?? node.props.action);
  populateSelectMenu(menu, root, options, currentValue, ctx);

  if (!WIRED.has(trigger)) {
    WIRED.add(trigger);
    const selectRoot = root;
    const selectTrigger = trigger;
    const selectMenu = menu;
    selectTrigger.addEventListener("click", () => {
      const opening = selectMenu.hidden;
      for (const other of [...OPEN_SELECTS]) {
        if (other !== selectRoot) {
          closeSelect(other);
        }
      }
      selectMenu.hidden = !opening;
      selectRoot.classList.toggle("is-open", opening);
      selectTrigger.setAttribute("aria-expanded", String(opening));
      if (opening) {
        OPEN_SELECTS.add(selectRoot);
      } else {
        OPEN_SELECTS.delete(selectRoot);
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
  (node, ctx, existing) => {
    const { doc, onAction } = ctx;
    const { field, valueBadge } = ensureFieldShell(
      ctx,
      kind,
      keyOf(node),
      str(node.props.label),
      node,
      "label",
      existing
    );
    let input = field.querySelector("input") as HTMLInputElement | null;
    if (!input) {
      input = doc.createElement("input");
      input.className = cx(
        ctx,
        kind,
        kind === "slider" ? "lion-ui-slider" : "lion-ui-input"
      );
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
    el.className = nodeClass(
      ctx,
      kind,
      `lion-ui-${kind}`,
      node,
      [`gap-${gap}`, align ? `align-${align}` : ""].filter(Boolean).join(" ")
    );
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
  el.className = nodeClass(
    ctx,
    "card",
    "lion-ui-card",
    node,
    toneClass(node.props.tone)
  );

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

const renderMetric: ElementRenderer = (node, ctx) => {
  const { doc } = ctx;
  const el = makeEl(
    doc,
    "div",
    nodeClass(ctx, "metric", "lion-ui-metric", node, toneClass(node.props.tone))
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
    nodeClass(ctx, "alert", "lion-ui-alert", node, toneClass(node.props.tone))
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

const renderProgress: ElementRenderer = (node, ctx) => {
  const { doc } = ctx;
  const el = makeEl(
    doc,
    "div",
    nodeClass(
      ctx,
      "progress",
      "lion-ui-progress",
      node,
      toneClass(node.props.tone)
    )
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
  const wrap = makeEl(
    doc,
    "div",
    nodeClass(ctx, "tableWrap", "lion-ui-table-wrap", node)
  );
  wrap.dataset.uiKind = "table";
  wrap.dataset.uiKey = keyOf(node);
  const table = makeEl(doc, "table", cx(ctx, "table", "lion-ui-table"));
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

const renderWhy: ElementRenderer = (node, ctx) => {
  const { doc } = ctx;
  const el = makeEl(doc, "div", nodeClass(ctx, "why", "lion-ui-why", node));
  el.dataset.uiKind = "why";
  el.dataset.uiKey = keyOf(node);
  if (node.props.title) {
    appendText(doc, el, "div", str(node.props.title), "lion-ui-why-title");
  }
  el.append(renderWhyTree(doc, node.props.data));
  return el;
};

const renderSimple =
  (tag: string, slot: string, baseClass: string): ElementRenderer =>
  (node, ctx) => {
    const el = makeEl(
      ctx.doc,
      tag,
      nodeClass(ctx, slot, baseClass, node, toneClass(node.props.tone))
    );
    el.dataset.uiKind = node.$ui;
    el.dataset.uiKey = keyOf(node);
    patchChildren(el, node.children, ctx);
    return el;
  };

const renderHeading: ElementRenderer = (node, ctx) => {
  const level = Math.min(4, Math.max(1, num(node.props.level, 3)));
  const el = makeEl(
    ctx.doc,
    `h${level}`,
    nodeClass(ctx, "heading", "lion-ui-heading", node, `level-${level}`)
  );
  el.dataset.uiKind = "heading";
  el.dataset.uiKey = keyOf(node);
  patchChildren(el, node.children, ctx);
  return el;
};

const renderCode: ElementRenderer = (node, ctx) => {
  const { doc } = ctx;
  const pre = makeEl(doc, "pre", nodeClass(ctx, "code", "lion-ui-code", node));
  pre.dataset.uiKind = "code";
  const code = doc.createElement("code");
  code.textContent = node.children.map((child) => str(child)).join("");
  pre.append(code);
  return pre;
};

const renderDivider: ElementRenderer = (node, ctx) => {
  const hr = makeEl(
    ctx.doc,
    "hr",
    nodeClass(ctx, "divider", "lion-ui-divider", node)
  );
  hr.dataset.uiKind = "divider";
  return hr;
};

const RENDERERS: Readonly<Record<UiKind, ElementRenderer>> = {
  alert: renderAlert,
  badge: renderSimple("span", "badge", "lion-ui-badge"),
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
  text: renderSimple("p", "text", "lion-ui-text"),
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
  if (options.theme) {
    container.dataset.lionTheme = options.theme;
  }
  const ctx: RenderContext = {
    classes: options.classes,
    doc: container.ownerDocument,
    onAction: options.onAction,
    unstyled: options.unstyled ?? false,
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
