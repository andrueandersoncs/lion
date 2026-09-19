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
  ChevronDownIcon,
  ChevronRightIcon,
  FoldHorizontalIcon,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
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
  readonly onToggle: (id: string) => void;
  readonly onUnfold: (id: string) => void;
  readonly presentation?: GraphNodePresentation;
  readonly semantic: IndexedSemanticNode;
  readonly stale: boolean;
  readonly unfolded: boolean;
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

type GraphFlowNode = Node<GraphNodeData, "semantic">;
const getMiniMapNodeColor = ({ selected }: GraphFlowNode) =>
  selected
    ? "var(--vermilion)"
    : "color-mix(in oklab, var(--sumi) 70%, var(--sheet))";
const pluralize = (count: number, noun: string, plural = `${noun}s`) =>
  `${count} ${count === 1 ? noun : plural}`;

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
        <title>{mark} node</title>
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

const SemanticGraphNode = memo(function SemanticGraphNode({
  data,
  selected,
}: NodeProps<GraphFlowNode>) {
  const {
    semantic,
    expanded,
    unfolded,
    stale,
    onToggle,
    onUnfold,
    presentation,
  } = data;
  const hasChildren = semantic.children.length > 0;
  const foldControl = (
    <Button
      aria-label={
        unfolded ? "Refold semantic node" : "Unfold exact JSON structure"
      }
      className="nodrag"
      onClick={() => onUnfold(semantic.id)}
      size="icon-sm"
      variant="ghost"
    >
      <FoldHorizontalIcon />
    </Button>
  );
  const presentationLabel = presentation
    ? `${presentation.mark}: ${presentation.description}; ${presentation.detail}`
    : undefined;

  return (
    <article
      aria-label={`${semantic.kind}: ${semantic.label}`}
      className={cn(
        "graph-node relative w-52 rounded-xl bg-card text-card-foreground",
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
      <Handle aria-hidden position={Position.Left} type="target" />
      <header className="flex items-center gap-2 border-crease border-b px-3 py-2">
        {hasChildren ? (
          <Button
            aria-label={expanded ? "Collapse branch" : "Expand branch"}
            className="nodrag"
            onClick={() => onToggle(semantic.id)}
            size="icon-sm"
            variant="ghost"
          >
            {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </Button>
        ) : (
          <span aria-hidden className="inline-block size-8" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-sm">{semantic.label}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {semantic.pointer || "/"}
          </p>
        </div>
        <Badge variant="outline">{semantic.role}</Badge>
      </header>
      {presentation ? (
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
      ) : (
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="text-muted-foreground text-xs">
            {semantic.quoted ? "Quoted · " : ""}
            {semantic.kind}
          </span>
          {foldControl}
        </div>
      )}
      <Handle aria-hidden position={Position.Right} type="source" />
    </article>
  );
});

const nodeTypes = { semantic: SemanticGraphNode };

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

interface SemanticGraphProps {
  readonly layout: (
    nodes: readonly { readonly id: string; readonly parentId: string | null }[]
  ) => Promise<
    Readonly<Record<string, { readonly x: number; readonly y: number }>>
  >;
  readonly onConstraint: (message: string) => void;
  readonly onIntent: (intent: EditIntent) => void;
  readonly onSelect: (id: string) => void;
  readonly projection: DocumentProjection;
  readonly selectedId: string | null;
  readonly stale: boolean;
}

export function SemanticGraph({
  projection,
  selectedId,
  stale,
  onSelect,
  onIntent,
  onConstraint,
  layout,
}: SemanticGraphProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [positions, setPositions] = useState<
    Readonly<Record<string, { readonly x: number; readonly y: number }>>
  >({});
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<
    GraphFlowNode,
    Edge
  > | null>(null);
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

  useEffect(() => {
    let active = true;
    layout(visibleSemanticNodes.map(({ id, parentId }) => ({ id, parentId })))
      .then((next) => {
        if (active) {
          setPositions(next);
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
  }, [layout, onConstraint, visibleSemanticNodes]);
  useEffect(() => {
    if (!flowInstance || Object.keys(positions).length === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      flowInstance
        .fitView({
          duration: 180,
          padding: 0.18,
          minZoom: 0.5,
          maxZoom: 1.1,
        })
        .catch(() => undefined);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [flowInstance, positions]);

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
  const maxVisibleDepth = useMemo(
    () => Math.max(...visibleSemanticNodes.map(({ path }) => path.length), 0),
    [visibleSemanticNodes]
  );

  const nodes = useMemo<GraphFlowNode[]>(
    () =>
      visibleSemanticNodes.map((semantic, index) => ({
        initialHeight: 112,
        initialWidth: 208,
        id: semantic.id,
        type: "semantic",
        position: positions[semantic.id] ?? {
          x: (maxVisibleDepth - semantic.path.length) * 260,
          y: index * 104,
        },
        selected: semantic.id === selectedId,
        data: {
          semantic,
          expanded: !collapsed.has(semantic.id),
          unfolded: unfolded.has(semantic.id),
          presentation:
            describeStructuredNode(semantic) ??
            describePrimitiveNode(semantic, byId) ??
            describeSpecialForm(semantic, byId),
          stale,
          onToggle: toggleCollapsed,
          onUnfold: toggleUnfolded,
        },
      })),
    [
      byId,
      collapsed,
      maxVisibleDepth,
      positions,
      selectedId,
      stale,
      toggleCollapsed,
      toggleUnfolded,
      unfolded,
      visibleSemanticNodes,
    ]
  );

  const visibleIds = useMemo(() => new Set(nodes.map(({ id }) => id)), [nodes]);
  const edges = useMemo<Edge[]>(
    () =>
      visibleSemanticNodes.flatMap((node) =>
        node.parentId && visibleIds.has(node.parentId)
          ? [
              {
                id: `${node.id}->${node.parentId}`,
                source: node.id,
                target: node.parentId,
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
        onConstraint("Reconnect is unavailable while the graph is stale.");
        return;
      }
      const source = byId.get(connection.source);
      const target = byId.get(connection.target);
      if (!(source && target)) {
        onConstraint("The dragged node or target no longer exists.");
        return;
      }
      if (!source.parentId) {
        onConstraint(
          "Replace the root instead of moving it into a child role."
        );
        return;
      }
      if (source.parentId === target.parentId) {
        const parent = byId.get(source.parentId);
        if (!parent || typeof source.path.at(-1) !== "number") {
          onConstraint(
            "Object values keep their keys and cannot be reordered here."
          );
          return;
        }
        onIntent({
          type: "reorder",
          parentPath: parent.path,
          from: source.order,
          to: target.order,
        });
        return;
      }
      if (
        target.kind !== "call" &&
        target.kind !== "special-form" &&
        target.kind !== "empty-array"
      ) {
        onConstraint(
          "This role cannot accept an ordered child. Select an array expression."
        );
        return;
      }
      onIntent({
        type: "move",
        path: source.path,
        targetParentPath: target.path,
        index: target.children.length,
      });
    },
    [byId, onConstraint, onIntent, stale]
  );

  return (
    <div className="relative h-full min-h-0" data-testid="semantic-graph">
      <div className="pointer-events-none absolute top-3 left-3 z-10 rounded-md bg-background/90 px-2 py-1 font-mono text-[11px] text-muted-foreground shadow-sm">
        {projection.nodes.length} total · {nodes.length} mounted
      </div>
      <ReactFlow
        className="semantic-flow"
        colorMode="light"
        edges={edges}
        minZoom={0.12}
        nodes={nodes}
        nodesConnectable={!stale}
        nodesDraggable={false}
        nodeTypes={nodeTypes}
        onConnect={reconnect}
        onInit={setFlowInstance}
        onNodeClick={(_event, node) => onSelect(node.id)}
        onNodeDoubleClick={(_event, node) => toggleUnfolded(node.id)}
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
