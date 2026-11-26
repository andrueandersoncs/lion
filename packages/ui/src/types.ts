/**
 * Pure JSON-serializable UI node types returned by `ui/*` Lion functions.
 * Every UI tree is ordinary Lion data — evaluable in memory with zero DOM
 * dependency, diffable as JSON, and safe to stream across Web Workers or HTTP.
 */

export const UI_KINDS = [
  "stack",
  "row",
  "grid",
  "card",
  "divider",
  "heading",
  "text",
  "badge",
  "metric",
  "alert",
  "table",
  "progress",
  "code",
  "chart",
  "timeline",
  "diff",
  "source",
  "input",
  "number",
  "slider",
  "select",
  "toggle",
  "button",
  "why",
  "proof",
] as const;

export type UiKind = (typeof UI_KINDS)[number];

export type UiChild = UiNode | string | number | boolean;

export type UiProps = Readonly<Record<string, unknown>>;

export interface UiNode {
  readonly $ui: UiKind;
  readonly children: readonly UiChild[];
  readonly props: UiProps;
}

const UI_KIND_SET: ReadonlySet<string> = new Set(UI_KINDS);

/** Returns true when a value is a well-formed Lion UI node. */
export const isUiNode = (value: unknown): value is UiNode => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.$ui === "string" &&
    UI_KIND_SET.has(record.$ui) &&
    typeof record.props === "object" &&
    record.props !== null &&
    !Array.isArray(record.props) &&
    Array.isArray(record.children)
  );
};

/** Returns true when an argument is a plain props record (not a UI node). */
export const isPropsRecord = (value: unknown): value is UiProps =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !("$ui" in value);

/**
 * Flattens nested child arrays (such as results of `array/map` or `find`) and
 * skips `null`, `undefined`, and `false` (so `cond` branches that return nothing
 * compose cleanly).
 */
export const normalizeChildren = (
  items: readonly unknown[]
): readonly UiChild[] => {
  const out: UiChild[] = [];
  const visit = (item: unknown) => {
    if (item === null || item === undefined || item === false) {
      return;
    }
    if (Array.isArray(item)) {
      for (const nested of item) {
        visit(nested);
      }
      return;
    }
    if (
      isUiNode(item) ||
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean"
    ) {
      out.push(item);
      return;
    }
    out.push(String(item));
  };
  for (const item of items) {
    visit(item);
  }
  return out;
};
