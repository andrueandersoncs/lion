import type { SpecialFormName } from "@lionlang/core/analysis/analyze";
import {
  Background,
  type Connection,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FoldHorizontalIcon,
  KeyboardIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  WrapTextIcon,
  XIcon,
} from "lucide-react";
import {
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  DocumentProjection,
  EditIntent,
  IndexedSemanticNode,
} from "./types";

interface GraphNodeData extends Record<string, unknown> {
  readonly expanded: boolean;
  readonly literalDraft?: string;
  readonly onDelete: (id: string) => void;
  readonly onEdit: (id: string) => void;
  readonly onInsert: (id: string) => void;
  readonly onIntent: (intent: EditIntent) => void;
  readonly onLiteralDraftChange: (id: string, value?: string) => void;
  readonly onReorder: (id: string, direction: -1 | 1) => void;
  readonly onToggle: (id: string) => void;
  readonly onUnfold: (id: string) => void;
  readonly onWrap: (id: string) => void;
  readonly presentation?: GraphNodePresentation;
  readonly semantic: IndexedSemanticNode;
  readonly siblingCount: number;
  readonly stale: boolean;
  readonly unfolded: boolean;
  readonly visibleChildCount: number;
}

type GraphNodeMark =
  | SpecialFormName
  | "array"
  | "boolean"
  | "null"
  | "number"
  | "record"
  | "reference"
  | "string"
  | "syntax";

interface GraphNodePresentation {
  readonly description: string;
  readonly detail: string;
  readonly mark: GraphNodeMark;
}

type SemanticGraphNodeType =
  | "semantic"
  | "boolean-literal"
  | "number-literal"
  | "string-literal";
type SemanticFlowNode = Node<GraphNodeData, SemanticGraphNodeType>;
type GraphFlowNode = SemanticFlowNode;
const GRAPH_NODE_HEIGHT = 138;
const GRAPH_NODE_WIDTH = 240;
const getMiniMapNodeColor = ({ selected }: GraphFlowNode) =>
  selected
    ? "var(--vermilion)"
    : "color-mix(in oklab, var(--sumi) 70%, var(--sheet))";
const pluralize = (count: number, noun: string, plural = `${noun}s`) =>
  `${count} ${count === 1 ? noun : plural}`;
const describeChildCount = (count: number) =>
  count === 0 ? "Leaf" : pluralize(count, "child", "children");
const CHILD_CONTAINER_KINDS: Readonly<
  Partial<Record<IndexedSemanticNode["kind"], true>>
> = {
  call: true,
  "empty-array": true,
  record: true,
  "special-form": true,
};
const ORDERED_CHILD_CONTAINER_KINDS: Readonly<
  Partial<Record<IndexedSemanticNode["kind"], true>>
> = {
  call: true,
  "empty-array": true,
  "special-form": true,
};

const describeSpecialForm = (
  semantic: IndexedSemanticNode,
  byId: ReadonlyMap<string, IndexedSemanticNode>
): GraphNodePresentation | undefined => {
  const form = semantic.specialForm;
  if (!form) {
    return undefined;
  }
  if (semantic.kind === "invalid-call") {
    return {
      mark: form,
      description: "invalid Lion form",
      detail: "structure needs repair",
    };
  }

  const children = semantic.children.flatMap((id) => {
    const child = byId.get(id);
    return child ? [child] : [];
  });
  const roleCount = (role: string) =>
    children.filter((child) => child.role === role).length;

  switch (form) {
    case "begin": {
      const stepCount = roleCount("sequence-item");
      return {
        mark: form,
        description: "ordered sequence",
        detail:
          stepCount === 0
            ? "0 steps → []"
            : `${pluralize(stepCount, "step")} → last`,
      };
    }
    case "cond": {
      const branchCount = roleCount("branch");
      return {
        mark: form,
        description: "first truthy wins",
        detail: pluralize(branchCount, "branch", "branches"),
      };
    }
    case "define": {
      const binding = semantic.relationships.find(
        ({ kind }) => kind === "definition"
      )?.name;
      return {
        mark: form,
        description: "global binding",
        detail: binding ? `${binding} ← value` : "binding ← value",
      };
    }
    case "eval":
      return {
        mark: form,
        description: "evaluate data",
        detail: "code → value",
      };
    case "lambda": {
      const parameters = children.find(({ role }) => role === "parameters");
      const parameterCount = parameters?.children.length ?? 0;
      return {
        mark: form,
        description: "function value",
        detail: `${pluralize(parameterCount, "param")} → body`,
      };
    }
    case "match": {
      const patternCount = roleCount("pattern");
      return {
        mark: form,
        description: "pattern dispatch",
        detail: `${patternCount} + fallback`,
      };
    }
    case "quote":
      return {
        mark: form,
        description: "literal syntax",
        detail: "not evaluated",
      };
    default:
      return form satisfies never;
  }
};

const describeStructuredNode = (
  semantic: IndexedSemanticNode
): GraphNodePresentation | undefined => {
  const itemCount = semantic.children.length;
  if (
    semantic.role === "parameters" &&
    (semantic.kind === "call" || semantic.kind === "empty-array")
  ) {
    return {
      mark: "syntax",
      description: "parameter list",
      detail: pluralize(itemCount, "name"),
    };
  }
  if (semantic.kind === "record") {
    return {
      mark: "record",
      description: semantic.quoted ? "quoted record" : "record literal",
      detail: pluralize(itemCount, "field"),
    };
  }
  if (semantic.kind === "empty-array") {
    return {
      mark: "array",
      description: "array literal",
      detail: "0 items",
    };
  }
  if (
    semantic.quoted &&
    (semantic.kind === "call" ||
      semantic.kind === "invalid-call" ||
      semantic.kind === "special-form")
  ) {
    return {
      mark: "array",
      description: "quoted array",
      detail: pluralize(itemCount, "item"),
    };
  }
  return undefined;
};

const describePrimitiveNode = (
  semantic: IndexedSemanticNode,
  byId: ReadonlyMap<string, IndexedSemanticNode>
): GraphNodePresentation | undefined => {
  if (semantic.kind !== "primitive") {
    return undefined;
  }

  const { value } = semantic;
  if (typeof value === "string") {
    if (semantic.quoted) {
      return {
        mark: "string",
        description: "string literal",
        detail: pluralize(value.length, "char"),
      };
    }
    const parent = semantic.parentId ? byId.get(semantic.parentId) : undefined;
    if (semantic.role === "operator") {
      return {
        mark: "syntax",
        description: "form keyword",
        detail: "syntax marker",
      };
    }
    if (parent?.role === "parameters") {
      return {
        mark: "syntax",
        description: "parameter name",
        detail: "local identifier",
      };
    }
    if (value === "else" && parent?.role === "branch") {
      return {
        mark: "syntax",
        description: "branch keyword",
        detail: "fallback marker",
      };
    }
    if (semantic.role === "binding") {
      return {
        mark: "syntax",
        description: "binding name",
        detail: "global identifier",
      };
    }
    return {
      mark: "reference",
      description: "symbol reference",
      detail: "lookup or text",
    };
  }
  if (typeof value === "number") {
    return {
      mark: "number",
      description: "number literal",
      detail: "numeric value",
    };
  }
  if (typeof value === "boolean") {
    return {
      mark: "boolean",
      description: "boolean literal",
      detail: "truth value",
    };
  }
  if (value === null) {
    return {
      mark: "null",
      description: "null literal",
      detail: "empty value",
    };
  }
  return undefined;
};

function SemanticNodeMark({ mark }: { readonly mark: GraphNodeMark }) {
  return (
    <span aria-hidden className="graph-node-mark">
      <svg fill="none" viewBox="0 0 24 24">
        <title>{`${mark} node`}</title>
        {mark === "begin" && (
          <>
            <path d="M7 5h11M7 12h11M7 19h11" />
            <path d="M4 5h.01M4 12h.01M4 19h.01" />
          </>
        )}
        {mark === "cond" && (
          <>
            <path d="M5 5v14M5 9h5c3 0 3-4 6-4h3M5 15h5c3 0 3 4 6 4h3" />
            <path d="m17 3 2 2-2 2M17 17l2 2-2 2" />
          </>
        )}
        {mark === "define" && (
          <>
            <path d="M4 8h5M4 16h5M13 6v12M17 6v12" />
            <path d="m11 12 2-2 2 2-2 2-2-2Z" />
          </>
        )}
        {mark === "eval" && (
          <>
            <path d="m8 5 10 7-10 7V5Z" />
            <path d="M4 5v14" />
          </>
        )}
        {mark === "lambda" && (
          <path d="M6 19c3.5-1 5.5-5.5 7-13M9 5c2.5 0 3.8 1.5 5 5l3 9" />
        )}
        {mark === "match" && (
          <>
            <path d="m4 12 5-5 5 5-5 5-5-5Z" />
            <path d="M14 12h6M17 9l3 3-3 3" />
          </>
        )}
        {mark === "quote" && (
          <>
            <path d="M5 6h6v6H7c0 3 1 5 3 6" />
            <path d="M14 6h6v6h-4c0 3 1 5 3 6" />
          </>
        )}
        {mark === "record" && (
          <>
            <path d="M9 4H7v5l-3 3 3 3v5h2M15 4h2v5l3 3-3 3v5h-2" />
            <path d="M11 9h2M11 15h2" />
          </>
        )}
        {mark === "array" && (
          <>
            <path d="M9 4H6v16h3M15 4h3v16h-3" />
            <path d="M11 9h2M11 15h2" />
          </>
        )}
        {mark === "string" && (
          <path d="M5 7h6v5H7c0 2.5 1 4 3 5M14 7h5v5h-3c0 2.5 1 4 3 5" />
        )}
        {mark === "number" && <path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16" />}
        {mark === "boolean" && <path d="m4 12 5 5L20 6" />}
        {mark === "null" && (
          <>
            <circle cx="12" cy="12" r="7" />
            <path d="m7 17 10-10" />
          </>
        )}
        {mark === "reference" && (
          <>
            <path d="M5 12h12M13 8l4 4-4 4" />
            <path d="M5 7v10" />
          </>
        )}
        {mark === "syntax" && (
          <>
            <path d="m9 6-5 6 5 6M15 6l5 6-5 6" />
            <path d="m13 4-2 16" />
          </>
        )}
      </svg>
    </span>
  );
}

type EditableLiteralKind = "boolean" | "number" | "string";

const getEditableLiteralKind = (
  presentation: GraphNodePresentation | undefined
): EditableLiteralKind | undefined => {
  if (presentation?.mark === "boolean" || presentation?.mark === "number") {
    return presentation.mark;
  }
  if (presentation?.mark === "string" || presentation?.mark === "reference") {
    return "string";
  }
  return undefined;
};

const getGraphNodeType = (
  literalKind: EditableLiteralKind | undefined
): SemanticGraphNodeType =>
  literalKind ? `${literalKind}-literal` : "semantic";

interface LiteralValueInputProps {
  readonly kind: EditableLiteralKind;
  readonly literalDraft?: string;
  readonly onIntent: (intent: EditIntent) => void;
  readonly onLiteralDraftChange: (id: string, value?: string) => void;
  readonly semantic: IndexedSemanticNode;
  readonly stale: boolean;
}
const getLiteralInputValue = (
  kind: "number" | "string",
  value: IndexedSemanticNode["value"]
) => {
  if (kind === "number" && typeof value === "number") {
    return String(value);
  }
  if (kind === "string" && typeof value === "string") {
    return value;
  }
  return "";
};

function TextLiteralInput({
  kind,
  literalDraft,
  onIntent,
  onLiteralDraftChange,
  semantic,
  stale,
}: Omit<LiteralValueInputProps, "kind"> & {
  readonly kind: "number" | "string";
}) {
  const currentValue = getLiteralInputValue(kind, semantic.value);
  const draft = literalDraft ?? currentValue;

  const commit = () => {
    if (kind === "number") {
      const nextValue = Number(draft);
      if (draft.trim() === "" || !Number.isFinite(nextValue)) {
        onLiteralDraftChange(semantic.id);
        return;
      }
      if (nextValue !== semantic.value) {
        onIntent({ type: "replace", path: semantic.path, value: nextValue });
      }
      return;
    }
    if (draft !== semantic.value) {
      onIntent({ type: "replace", path: semantic.path, value: draft });
    }
  };

  const label = `${kind === "number" ? "Number" : "String"} value at ${
    semantic.pointer || "root"
  }`;

  return (
    <label className="graph-literal-field">
      <span>{kind === "number" ? "Number value" : "String value"}</span>
      <input
        aria-label={label}
        autoComplete="off"
        className="graph-literal-input nodrag nopan nowheel"
        disabled={stale}
        onBlur={commit}
        onChange={(event) =>
          onLiteralDraftChange(semantic.id, event.currentTarget.value)
        }
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            onLiteralDraftChange(semantic.id);
          }
        }}
        required={kind === "number"}
        step={kind === "number" ? "any" : undefined}
        type={kind === "number" ? "number" : "text"}
        value={draft}
      />
    </label>
  );
}

function LiteralValueInput({
  kind,
  literalDraft,
  onIntent,
  onLiteralDraftChange,
  semantic,
  stale,
}: LiteralValueInputProps) {
  if (kind !== "boolean") {
    return (
      <TextLiteralInput
        kind={kind}
        literalDraft={literalDraft}
        onIntent={onIntent}
        onLiteralDraftChange={onLiteralDraftChange}
        semantic={semantic}
        stale={stale}
      />
    );
  }

  const checked = semantic.value === true;
  return (
    <label className="graph-literal-field">
      <span>Boolean value</span>
      <span className="graph-boolean-input">
        <input
          aria-label={`Boolean value at ${semantic.pointer || "root"}`}
          checked={checked}
          className="nodrag nopan"
          disabled={stale}
          onChange={(event) =>
            onIntent({
              type: "replace",
              path: semantic.path,
              value: event.currentTarget.checked,
            })
          }
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          type="checkbox"
        />
        <span aria-hidden>{checked ? "True" : "False"}</span>
      </span>
    </label>
  );
}

interface GraphNodeBodyProps {
  readonly foldControl: ReactNode;
  readonly literalDraft?: string;
  readonly literalKind?: EditableLiteralKind;
  readonly onIntent: (intent: EditIntent) => void;
  readonly onLiteralDraftChange: (id: string, value?: string) => void;
  readonly presentation?: GraphNodePresentation;
  readonly semantic: IndexedSemanticNode;
  readonly stale: boolean;
}

function GraphNodeBody({
  foldControl,
  literalDraft,
  literalKind,
  onIntent,
  onLiteralDraftChange,
  presentation,
  semantic,
  stale,
}: GraphNodeBodyProps) {
  const presentationLabel = presentation
    ? `${presentation.mark}: ${presentation.description}; ${presentation.detail}`
    : undefined;

  if (literalKind) {
    return (
      <section
        aria-label={presentationLabel}
        className="graph-node-summary graph-literal-summary"
      >
        <SemanticNodeMark mark={literalKind} />
        <LiteralValueInput
          kind={literalKind}
          literalDraft={literalDraft}
          onIntent={onIntent}
          onLiteralDraftChange={onLiteralDraftChange}
          semantic={semantic}
          stale={stale}
        />
      </section>
    );
  }

  if (presentation) {
    return (
      <section
        aria-label={presentationLabel}
        className="graph-node-summary"
        title={presentationLabel}
      >
        <SemanticNodeMark mark={presentation.mark} />
        <div className="min-w-0">
          <p className="graph-node-description">{presentation.description}</p>
          <p className="graph-node-detail">{presentation.detail}</p>
        </div>
        {foldControl}
      </section>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-muted-foreground text-xs">
        {semantic.quoted ? "Quoted · " : ""}
        {semantic.kind}
      </span>
      {foldControl}
    </div>
  );
}

type SemanticGraphNodeProps = NodeProps<SemanticFlowNode> & {
  readonly literalKind?: EditableLiteralKind;
};

function GraphNodeCommandBar({ data }: { readonly data: GraphNodeData }) {
  const {
    onDelete,
    onEdit,
    onInsert,
    onReorder,
    onWrap,
    semantic,
    siblingCount,
    stale,
  } = data;
  const acceptsChildren = CHILD_CONTAINER_KINDS[semantic.kind] === true;
  return (
    <div
      aria-label={`Actions for ${semantic.label}`}
      className="graph-node-command-bar nodrag"
      role="toolbar"
    >
      <Button
        aria-label={`Replace ${semantic.label}`}
        disabled={stale}
        onClick={() => onEdit(semantic.id)}
        size="icon-sm"
        title="Replace (Enter)"
        variant="ghost"
      >
        <PencilIcon />
      </Button>
      {acceptsChildren ? (
        <Button
          aria-label={`Add child to ${semantic.label}`}
          disabled={stale}
          onClick={() => onInsert(semantic.id)}
          size="icon-sm"
          title="Add child (A)"
          variant="ghost"
        >
          <PlusIcon />
        </Button>
      ) : null}
      <Button
        aria-label={`Move ${semantic.label} earlier`}
        disabled={stale || !semantic.parentId || semantic.order <= 0}
        onClick={() => onReorder(semantic.id, -1)}
        size="icon-sm"
        title="Move earlier (Shift+↑)"
        variant="ghost"
      >
        <ArrowUpIcon />
      </Button>
      <Button
        aria-label={`Move ${semantic.label} later`}
        disabled={
          stale || !semantic.parentId || semantic.order >= siblingCount - 1
        }
        onClick={() => onReorder(semantic.id, 1)}
        size="icon-sm"
        title="Move later (Shift+↓)"
        variant="ghost"
      >
        <ArrowDownIcon />
      </Button>
      <Button
        aria-label={`Wrap ${semantic.label} in quote`}
        disabled={stale}
        onClick={() => onWrap(semantic.id)}
        size="icon-sm"
        title="Wrap in quote (Q)"
        variant="ghost"
      >
        <WrapTextIcon />
      </Button>
      <Button
        aria-label={`Delete ${semantic.label}`}
        disabled={stale || !semantic.parentId}
        onClick={() => onDelete(semantic.id)}
        size="icon-sm"
        title="Delete subtree (Delete)"
        variant="ghost"
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}

const SemanticGraphNode = memo(function SemanticGraphNode({
  data,
  selected,
  literalKind,
}: SemanticGraphNodeProps) {
  const {
    semantic,
    expanded,
    literalDraft,
    unfolded,
    stale,
    onEdit,
    onInsert,
    onIntent,
    onLiteralDraftChange,
    onToggle,
    onUnfold,
    presentation,
    visibleChildCount,
  } = data;
  const hasChildren = semantic.children.length > 0;
  const acceptsChildren = CHILD_CONTAINER_KINDS[semantic.kind] === true;
  const acceptsConnections =
    ORDERED_CHILD_CONTAINER_KINDS[semantic.kind] === true;
  const foldControl = (
    <Button
      aria-label={
        unfolded ? "Refold semantic node" : "Unfold exact JSON structure"
      }
      className="nodrag"
      onClick={() => onUnfold(semantic.id)}
      size="icon-sm"
      title={unfolded ? "Refold exact JSON (F)" : "Unfold exact JSON (F)"}
      variant="ghost"
    >
      <FoldHorizontalIcon />
    </Button>
  );

  return (
    <article
      aria-label={`${semantic.kind}: ${semantic.label}`}
      className={cn(
        "graph-node relative w-60 rounded-xl bg-card text-card-foreground",
        presentation && "graph-node-presented",
        selected && "graph-node-selected",
        semantic.kind === "invalid-call" &&
          !semantic.quoted &&
          "graph-node-invalid",
        stale && "graph-node-stale",
        unfolded && "graph-node-unfolded"
      )}
      data-kind={semantic.kind}
      data-mark={presentation?.mark}
    >
      {semantic.parentId ? (
        <Handle aria-hidden position={Position.Left} type="target" />
      ) : null}
      <header className="flex items-center gap-1 border-crease border-b px-2 py-2">
        {hasChildren ? (
          <Button
            aria-label={expanded ? "Collapse branch" : "Expand branch"}
            className="nodrag"
            onClick={() => onToggle(semantic.id)}
            size="icon-sm"
            title={
              expanded ? "Collapse branch (Space)" : "Expand branch (Space)"
            }
            variant="ghost"
          >
            {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </Button>
        ) : (
          <span aria-hidden className="inline-block size-8" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-sm">{semantic.label}</p>
          <p className="truncate font-mono text-muted-foreground text-xs">
            {semantic.pointer || "/"}
          </p>
        </div>
        <div className="graph-node-actions nodrag">
          <Button
            aria-label={`Replace ${semantic.label}`}
            disabled={stale}
            onClick={() => onEdit(semantic.id)}
            size="icon-sm"
            title="Replace expression (Enter)"
            variant="ghost"
          >
            <PencilIcon />
          </Button>
          {acceptsChildren ? (
            <Button
              aria-label={`Add child to ${semantic.label}`}
              disabled={stale}
              onClick={() => onInsert(semantic.id)}
              size="icon-sm"
              title="Add child (A)"
              variant="ghost"
            >
              <PlusIcon />
            </Button>
          ) : null}
        </div>
      </header>
      <GraphNodeBody
        foldControl={foldControl}
        literalDraft={literalDraft}
        literalKind={literalKind}
        onIntent={onIntent}
        onLiteralDraftChange={onLiteralDraftChange}
        presentation={presentation}
        semantic={semantic}
        stale={stale}
      />
      <footer className="graph-node-footer">
        <Badge variant="outline">{semantic.role}</Badge>
        <span className="graph-node-range">
          {semantic.parentId ? `#${semantic.order + 1} · ` : ""}
          {semantic.range.from}–{semantic.range.to}
        </span>
        <span>{describeChildCount(visibleChildCount)}</span>
      </footer>
      {selected ? <GraphNodeCommandBar data={data} /> : null}
      {acceptsConnections ? (
        <Handle aria-hidden position={Position.Right} type="source" />
      ) : null}
    </article>
  );
});

const BooleanLiteralGraphNode = memo(function BooleanLiteralGraphNode(
  props: NodeProps<SemanticFlowNode>
) {
  return <SemanticGraphNode {...props} literalKind="boolean" />;
});

const NumberLiteralGraphNode = memo(function NumberLiteralGraphNode(
  props: NodeProps<SemanticFlowNode>
) {
  return <SemanticGraphNode {...props} literalKind="number" />;
});

const StringLiteralGraphNode = memo(function StringLiteralGraphNode(
  props: NodeProps<SemanticFlowNode>
) {
  return <SemanticGraphNode {...props} literalKind="string" />;
});

const nodeTypes = {
  "boolean-literal": BooleanLiteralGraphNode,
  "number-literal": NumberLiteralGraphNode,
  semantic: SemanticGraphNode,
  "string-literal": StringLiteralGraphNode,
};

const getAncestors = (
  node: IndexedSemanticNode,
  byId: ReadonlyMap<string, IndexedSemanticNode>
) => {
  const ancestors: string[] = [];
  let parentId = node.parentId;
  while (parentId) {
    ancestors.push(parentId);
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return ancestors;
};

type GraphKeyboardCommand =
  | "add"
  | "delete"
  | "edit"
  | "earlier"
  | "later"
  | "quote"
  | "toggle"
  | "unfold";

const GRAPH_KEY_COMMANDS: Readonly<
  Partial<Record<string, GraphKeyboardCommand>>
> = {
  " ": "toggle",
  a: "add",
  backspace: "delete",
  delete: "delete",
  enter: "edit",
  f: "unfold",
  q: "quote",
};

const GRAPH_SHIFT_COMMANDS: Readonly<
  Partial<Record<string, GraphKeyboardCommand>>
> = {
  arrowdown: "later",
  arrowup: "earlier",
};

const MUTATING_GRAPH_COMMANDS = new Set<GraphKeyboardCommand>([
  "add",
  "delete",
  "edit",
  "earlier",
  "later",
  "quote",
]);

const blocksGraphShortcut = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    Boolean(
      target.closest("input, textarea, select, button, [role='dialog']")
    ));

const handleGraphUtilityShortcut = (
  event: KeyboardEvent,
  toggleShortcuts: () => void
) => {
  const handlers: Readonly<Partial<Record<string, () => void>>> = {
    "/": () => document.getElementById("graph-search-input")?.focus(),
    "?": toggleShortcuts,
  };
  const handler = handlers[event.key];
  if (!handler) {
    return false;
  }
  event.preventDefault();
  handler();
  return true;
};

const getGraphNavigationTarget = (
  event: KeyboardEvent,
  selected: IndexedSemanticNode,
  nodes: readonly IndexedSemanticNode[]
) => {
  if (event.shiftKey) {
    return undefined;
  }
  const selectedIndex = nodes.findIndex(({ id }) => id === selected.id);
  const visibleIds = new Set(nodes.map(({ id }) => id));
  const targets: Readonly<Record<string, string | undefined>> = {
    ArrowDown: nodes[selectedIndex + 1]?.id,
    ArrowLeft: selected.parentId ?? undefined,
    ArrowUp: nodes[selectedIndex - 1]?.id,
    ArrowRight: selected.children.find((id) => visibleIds.has(id)),
    End: nodes.at(-1)?.id,
    Home: nodes[0]?.id,
  };
  return targets[event.key];
};

const getGraphKeyboardCommand = (
  event: KeyboardEvent,
  selected: IndexedSemanticNode,
  stale: boolean
): GraphKeyboardCommand | undefined => {
  if (event.repeat) {
    return undefined;
  }
  const key = event.key.toLowerCase();
  const command = event.shiftKey
    ? GRAPH_SHIFT_COMMANDS[key]
    : GRAPH_KEY_COMMANDS[key];
  if (!command || (stale && MUTATING_GRAPH_COMMANDS.has(command))) {
    return undefined;
  }
  if (command === "add" && CHILD_CONTAINER_KINDS[selected.kind] !== true) {
    return undefined;
  }
  if (command === "delete" && !selected.parentId) {
    return undefined;
  }
  if (command === "toggle" && selected.children.length === 0) {
    return undefined;
  }
  return command;
};

interface SemanticGraphProps {
  readonly layout: (
    nodes: readonly { readonly id: string; readonly parentId: string | null }[]
  ) => Promise<
    Readonly<Record<string, { readonly x: number; readonly y: number }>>
  >;
  readonly narrow: boolean;
  readonly onConstraint: (message: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onEdit: (id: string) => void;
  readonly onInsert: (id: string) => void;
  readonly onIntent: (intent: EditIntent) => void;
  readonly onReorder: (id: string, direction: -1 | 1) => void;
  readonly onSelect: (id: string) => void;
  readonly onWrap: (id: string) => void;
  readonly projection: DocumentProjection;
  readonly selectedId: string | null;
  readonly stale: boolean;
}

export function SemanticGraph({
  projection,
  narrow,
  selectedId,
  stale,
  onSelect,
  onDelete,
  onEdit,
  onInsert,
  onIntent,
  onReorder,
  onWrap,
  onConstraint,
  layout,
}: SemanticGraphProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [literalDrafts, setLiteralDrafts] = useState<
    Readonly<Record<string, string>>
  >({});
  const [positions, setPositions] = useState<
    Readonly<Record<string, { readonly x: number; readonly y: number }>>
  >({});
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<
    GraphFlowNode,
    Edge
  > | null>(null);
  const focusedSelectionRef = useRef(selectedId);
  const byId = useMemo(
    () => new Map(projection.nodes.map((node) => [node.id, node])),
    [projection.nodes]
  );
  const defaultCollapsedIds = useMemo(
    () =>
      projection.nodes
        .filter((node) => node.path.length >= 2 && node.children.length > 0)
        .map(({ id }) => id),
    [projection.nodes]
  );

  useEffect(() => {
    setCollapsed(new Set(defaultCollapsedIds));
    setUnfolded(new Set());
    setLiteralDrafts({});
  }, [defaultCollapsedIds]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    const selected = byId.get(selectedId);
    if (!selected) {
      return;
    }
    const ancestors = getAncestors(selected, byId);
    setCollapsed((current) => {
      const next = new Set(current);
      for (const id of ancestors) {
        next.delete(id);
      }
      return next;
    });
  }, [byId, selectedId]);

  const visibleSemanticNodes = useMemo(() => {
    const visible = projection.nodes.filter((node) => {
      const ancestors = getAncestors(node, byId);
      if (ancestors.some((id) => collapsed.has(id))) {
        return false;
      }
      if (
        (node.role === "operator" || node.role === "callee") &&
        node.parentId &&
        !unfolded.has(node.parentId)
      ) {
        return false;
      }
      return true;
    });
    return visible.slice(0, 300);
  }, [byId, collapsed, projection.nodes, unfolded]);
  const layoutNodes = useMemo(
    () => visibleSemanticNodes.map(({ id, parentId }) => ({ id, parentId })),
    [visibleSemanticNodes]
  );

  useEffect(() => {
    let active = true;
    layout(layoutNodes)
      .then((next) => {
        if (active) {
          setPositions(next);
          setLayoutRevision((revision) => revision + 1);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          onConstraint(
            error instanceof Error ? error.message : "Graph layout failed."
          );
        }
      });
    return () => {
      active = false;
    };
  }, [layout, layoutNodes, onConstraint]);
  useEffect(() => {
    if (!(flowInstance && layoutRevision > 0)) {
      return;
    }
    const focusId =
      narrow || visibleSemanticNodes.length > 40
        ? (selectedId ?? projection.rootId ?? visibleSemanticNodes[0]?.id)
        : undefined;
    const focusPosition = focusId ? positions[focusId] : undefined;
    const timer = window.setTimeout(() => {
      if (narrow && focusPosition) {
        flowInstance
          .setCenter(
            focusPosition.x + GRAPH_NODE_WIDTH / 2,
            focusPosition.y + GRAPH_NODE_HEIGHT / 2,
            { duration: 180, zoom: 0.95 }
          )
          .catch(() => undefined);
        return;
      }
      flowInstance
        .fitView({
          duration: 180,
          nodes: focusId ? [{ id: focusId }] : undefined,
          padding: focusId ? 1.4 : 0.18,
          minZoom: 0.5,
          maxZoom: 1.05,
        })
        .catch(() => undefined);
    }, 160);
    return () => window.clearTimeout(timer);
  }, [
    flowInstance,
    layoutRevision,
    narrow,
    projection.rootId,
    selectedId,
    positions,
    visibleSemanticNodes,
  ]);

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleUnfolded = useCallback(
    (id: string) => {
      const node = byId.get(id);
      if (!node || node.kind === "invalid-call") {
        onConstraint(
          "This subtree cannot refold until its Lion structure is valid."
        );
        return;
      }
      setUnfolded((current) => {
        const next = new Set(current);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [byId, onConstraint]
  );

  const updateLiteralDraft = useCallback((id: string, value?: string) => {
    setLiteralDrafts((current) => {
      if (value !== undefined) {
        return current[id] === value ? current : { ...current, [id]: value };
      }
      if (!(id in current)) {
        return current;
      }
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (blocksGraphShortcut(event.target)) {
        return;
      }
      if (
        handleGraphUtilityShortcut(event, () =>
          setShortcutsOpen((open) => !open)
        )
      ) {
        return;
      }
      const selected = selectedId ? byId.get(selectedId) : undefined;
      if (!selected) {
        return;
      }
      const targetId = getGraphNavigationTarget(
        event,
        selected,
        visibleSemanticNodes
      );
      if (targetId) {
        event.preventDefault();
        onSelect(targetId);
        return;
      }
      const command = getGraphKeyboardCommand(event, selected, stale);
      if (!command) {
        return;
      }
      const handlers: Readonly<Record<GraphKeyboardCommand, () => void>> = {
        add: () => onInsert(selected.id),
        delete: () => onDelete(selected.id),
        earlier: () => onReorder(selected.id, -1),
        edit: () => onEdit(selected.id),
        later: () => onReorder(selected.id, 1),
        quote: () => onWrap(selected.id),
        toggle: () => toggleCollapsed(selected.id),
        unfold: () => toggleUnfolded(selected.id),
      };
      event.preventDefault();
      handlers[command]();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    byId,
    onDelete,
    onEdit,
    onInsert,
    onReorder,
    onSelect,
    onWrap,
    visibleSemanticNodes,
    selectedId,
    stale,
    toggleCollapsed,
    toggleUnfolded,
  ]);

  const nodes = useMemo<GraphFlowNode[]>(
    () =>
      visibleSemanticNodes.map((semantic, index) => {
        const presentation =
          describeStructuredNode(semantic) ??
          describePrimitiveNode(semantic, byId) ??
          describeSpecialForm(semantic, byId);
        const literalKind = getEditableLiteralKind(presentation);
        return {
          initialHeight: GRAPH_NODE_HEIGHT,
          initialWidth: GRAPH_NODE_WIDTH,
          id: semantic.id,
          type: getGraphNodeType(literalKind),
          position: positions[semantic.id] ?? {
            x: semantic.path.length * 312,
            y: index * GRAPH_NODE_HEIGHT,
          },
          selected: semantic.id === selectedId,
          data: {
            semantic,
            expanded: !collapsed.has(semantic.id),
            unfolded: unfolded.has(semantic.id),
            literalDraft: literalDrafts[semantic.id],
            presentation,
            siblingCount: semantic.parentId
              ? (byId.get(semantic.parentId)?.children.length ?? 1)
              : 1,
            stale,
            onDelete,
            onEdit,
            onInsert,
            onIntent,
            onLiteralDraftChange: updateLiteralDraft,
            onReorder,
            onToggle: toggleCollapsed,
            visibleChildCount: semantic.children.filter((childId) => {
              const child = byId.get(childId);
              return (
                unfolded.has(semantic.id) ||
                (child?.role !== "operator" && child?.role !== "callee")
              );
            }).length,
            onUnfold: toggleUnfolded,
            onWrap,
          },
        };
      }),
    [
      byId,
      collapsed,
      literalDrafts,
      onDelete,
      onEdit,
      onInsert,
      onIntent,
      onReorder,
      onWrap,
      positions,
      selectedId,
      stale,
      toggleCollapsed,
      toggleUnfolded,
      updateLiteralDraft,
      unfolded,
      visibleSemanticNodes,
    ]
  );
  useEffect(() => {
    if (
      !(flowInstance && selectedId) ||
      focusedSelectionRef.current === selectedId ||
      !positions[selectedId]
    ) {
      return;
    }
    const selectedPosition = positions[selectedId];
    focusedSelectionRef.current = selectedId;
    const timer = window.setTimeout(() => {
      if (narrow) {
        flowInstance
          .setCenter(
            selectedPosition.x + GRAPH_NODE_WIDTH / 2,
            selectedPosition.y + GRAPH_NODE_HEIGHT / 2,
            { duration: 180, zoom: 0.95 }
          )
          .catch(() => undefined);
        return;
      }
      flowInstance
        .fitView({
          duration: 180,
          nodes: [{ id: selectedId }],
          padding: 1.25,
          minZoom: 0.65,
          maxZoom: 1.05,
        })
        .catch(() => undefined);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [flowInstance, narrow, positions, selectedId]);

  const visibleIds = useMemo(() => new Set(nodes.map(({ id }) => id)), [nodes]);
  const edges = useMemo<Edge[]>(
    () =>
      visibleSemanticNodes.flatMap((node) =>
        node.parentId && visibleIds.has(node.parentId)
          ? [
              {
                id: `${node.parentId}->${node.id}`,
                source: node.parentId,
                target: node.id,
                label: node.role,
                markerEnd: { type: MarkerType.ArrowClosed },
                className: node.quoted ? "graph-edge-quoted" : "graph-edge",
              },
            ]
          : []
      ),
    [visibleIds, visibleSemanticNodes]
  );

  const reconnect = useCallback(
    (connection: Connection) => {
      if (stale || !connection.source || !connection.target) {
        onConstraint("Connections are unavailable while the graph is stale.");
        return;
      }
      const parent = byId.get(connection.source);
      const child = byId.get(connection.target);
      if (!(parent && child)) {
        onConstraint("The dragged node or target no longer exists.");
        return;
      }
      if (!child.parentId) {
        onConstraint("The root expression cannot become a child.");
        return;
      }
      if (
        parent.id === child.id ||
        getAncestors(parent, byId).includes(child.id)
      ) {
        onConstraint("A node cannot contain itself or one of its ancestors.");
        return;
      }
      if (ORDERED_CHILD_CONTAINER_KINDS[parent.kind] !== true) {
        onConstraint(
          "This expression cannot accept an ordered child. Select an array expression."
        );
        return;
      }
      if (child.parentId === parent.id) {
        onConstraint("This node is already a child of that expression.");
        return;
      }
      onIntent({
        type: "move",
        path: child.path,
        targetParentPath: parent.path,
        index: parent.children.length,
      });
    },
    [byId, onConstraint, onIntent, stale]
  );
  const shouldFocusInitialNode = narrow || visibleSemanticNodes.length > 40;
  const initialFitNodeId =
    selectedId ?? projection.rootId ?? visibleSemanticNodes[0]?.id;
  const initialFitNodes =
    shouldFocusInitialNode && initialFitNodeId
      ? [{ id: initialFitNodeId }]
      : undefined;
  let initialFitPadding = 0.18;
  if (narrow) {
    initialFitPadding = 0.2;
  } else if (visibleSemanticNodes.length > 40) {
    initialFitPadding = 1.4;
  }

  return (
    <div className="relative h-full min-h-0" data-testid="semantic-graph">
      <div className="graph-count">
        {projection.nodes.length} total · {visibleSemanticNodes.length} shown
      </div>
      <div className="graph-hint">
        Arrows navigate · Enter edits · A adds · ? for keys
      </div>
      <Button
        aria-expanded={shortcutsOpen}
        aria-label="Show graph keyboard shortcuts"
        className="graph-shortcut-trigger"
        onClick={() => setShortcutsOpen((open) => !open)}
        size="sm"
        variant="outline"
      >
        <KeyboardIcon data-icon="inline-start" />
        Keys
      </Button>
      {shortcutsOpen ? (
        <aside
          aria-label="Graph keyboard shortcuts"
          className="graph-shortcuts"
        >
          <header>
            <strong>Move at thought speed</strong>
            <Button
              aria-label="Close graph keyboard shortcuts"
              onClick={() => setShortcutsOpen(false)}
              size="icon-sm"
              variant="ghost"
            >
              <XIcon />
            </Button>
          </header>
          <dl>
            <div>
              <dt>
                <kbd>↑</kbd>
                <kbd>↓</kbd>
              </dt>
              <dd>Previous / next expression</dd>
            </div>
            <div>
              <dt>
                <kbd>←</kbd>
                <kbd>→</kbd>
              </dt>
              <dd>Parent / first child</dd>
            </div>
            <div>
              <dt>
                <kbd>Enter</kbd>
              </dt>
              <dd>Replace selection</dd>
            </div>
            <div>
              <dt>
                <kbd>A</kbd>
                <kbd>Q</kbd>
              </dt>
              <dd>Add child / quote</dd>
            </div>
            <div>
              <dt>
                <kbd>F</kbd>
                <kbd>Space</kbd>
              </dt>
              <dd>Exact JSON / branch</dd>
            </div>
            <div>
              <dt>
                <kbd>⇧↑</kbd>
                <kbd>⇧↓</kbd>
              </dt>
              <dd>Reorder sibling</dd>
            </div>
            <div>
              <dt>
                <kbd>/</kbd>
                <kbd>⌫</kbd>
              </dt>
              <dd>Search / delete</dd>
            </div>
          </dl>
        </aside>
      ) : null}
      <ReactFlow
        className="semantic-flow"
        colorMode="light"
        edges={edges}
        fitView
        fitViewOptions={{
          nodes: initialFitNodes,
          padding: initialFitPadding,
          minZoom: narrow ? 0.95 : 0.5,
          maxZoom: 1.05,
        }}
        key={layoutRevision}
        minZoom={0.12}
        nodes={nodes}
        nodesConnectable={!stale}
        nodesDraggable={false}
        nodeTypes={nodeTypes}
        onConnect={reconnect}
        onInit={setFlowInstance}
        onNodeClick={(_event, node) => onSelect(node.id)}
        onNodeDoubleClick={(_event, node) => {
          onSelect(node.id);
          onEdit(node.id);
        }}
        proOptions={{ hideAttribution: true }}
        zoomOnDoubleClick={false}
      >
        <Controls position="bottom-left" showInteractive={false} />
        {nodes.length > 12 ? (
          <MiniMap
            ariaLabel="Document overview"
            className="graph-minimap"
            maskColor="color-mix(in oklab, var(--background) 72%, transparent)"
            maskStrokeColor="var(--vermilion)"
            nodeBorderRadius={8}
            nodeColor={getMiniMapNodeColor}
            pannable
            zoomable
          />
        ) : null}
        <Background color="var(--crease)" gap={32} size={1} />
      </ReactFlow>
    </div>
  );
}
