import {
  Background,
  type Connection,
  Controls,
  type Edge,
  Handle,
  MarkerType,
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
  readonly semantic: IndexedSemanticNode;
  readonly stale: boolean;
  readonly unfolded: boolean;
}

type GraphFlowNode = Node<GraphNodeData, "semantic">;

const SemanticGraphNode = memo(function SemanticGraphNode({
  data,
  selected,
}: NodeProps<GraphFlowNode>) {
  const { semantic, expanded, unfolded, stale, onToggle, onUnfold } = data;
  const hasChildren = semantic.children.length > 0;
  return (
    <article
      aria-label={`${semantic.kind}: ${semantic.label}`}
      className={cn(
        "graph-node min-w-48 overflow-hidden rounded-xl bg-card text-card-foreground",
        selected && "graph-node-selected",
        semantic.kind === "invalid-call" && "graph-node-invalid",
        stale && "graph-node-stale",
        unfolded && "graph-node-unfolded"
      )}
      data-kind={semantic.kind}
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
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <span className="text-muted-foreground text-xs">
          {semantic.quoted ? "Quoted · " : ""}
          {semantic.kind}
        </span>
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
      </div>
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
        .fitView({ padding: 0.18, minZoom: 0.5, maxZoom: 1.1 })
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

  const nodes = useMemo<GraphFlowNode[]>(
    () =>
      visibleSemanticNodes.map((semantic, index) => ({
        id: semantic.id,
        type: "semantic",
        position: positions[semantic.id] ?? {
          x: semantic.path.length * 260,
          y: index * 104,
        },
        selected: semantic.id === selectedId,
        data: {
          semantic,
          expanded: !collapsed.has(semantic.id),
          unfolded: unfolded.has(semantic.id),
          stale,
          onToggle: toggleCollapsed,
          onUnfold: toggleUnfolded,
        },
      })),
    [
      collapsed,
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
  const overview = useMemo(() => {
    const minX = Math.min(...nodes.map(({ position }) => position.x), 0);
    const minY = Math.min(...nodes.map(({ position }) => position.y), 0);
    const maxX = Math.max(
      ...nodes.map(({ position }) => position.x + 210),
      210
    );
    const maxY = Math.max(...nodes.map(({ position }) => position.y + 78), 78);
    const padding = 24;
    return {
      minX: minX - padding,
      minY: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    };
  }, [nodes]);

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
        colorMode="light"
        edges={edges}
        fitView
        minZoom={0.12}
        nodes={nodes}
        nodesConnectable={!stale}
        nodeTypes={nodeTypes}
        onConnect={reconnect}
        onInit={setFlowInstance}
        onNodeClick={(_event, node) => onSelect(node.id)}
        onNodeDoubleClick={(_event, node) => toggleUnfolded(node.id)}
        proOptions={{ hideAttribution: true }}
      >
        <Controls position="bottom-left" showInteractive={false} />
        <Background color="var(--crease)" gap={32} size={1} />
      </ReactFlow>
      <button
        aria-label="Navigate document overview"
        className="graph-minimap"
        onClick={(event) => {
          if (!flowInstance) {
            return;
          }
          const bounds = event.currentTarget.getBoundingClientRect();
          const x =
            overview.minX +
            ((event.clientX - bounds.left) / bounds.width) * overview.width;
          const y =
            overview.minY +
            ((event.clientY - bounds.top) / bounds.height) * overview.height;
          flowInstance.setCenter(x, y, { duration: 180, zoom: 0.9 });
        }}
        type="button"
      >
        <svg
          aria-hidden
          preserveAspectRatio="xMidYMid meet"
          viewBox={`${overview.minX} ${overview.minY} ${overview.width} ${overview.height}`}
        >
          <title>Document density map</title>
          {nodes.map(({ id, position, selected }) => (
            <rect
              className={selected ? "overview-node-selected" : "overview-node"}
              height="78"
              key={id}
              rx="8"
              width="210"
              x={position.x}
              y={position.y}
            />
          ))}
        </svg>
      </button>
    </div>
  );
}
