import BundledELK from "elkjs/lib/elk.bundled.js";
import ELK from "elkjs/lib/elk-api.js";
import ElkWorker from "elkjs/lib/elk-worker.min.js?worker";
import { analyzeSource } from "./parse";
import type { WorkerRequest, WorkerResponse } from "./types";

const elk =
  typeof Worker === "undefined"
    ? new BundledELK()
    : new ELK({
        workerFactory: () => new ElkWorker(),
      });

const layout = async (
  request: Extract<WorkerRequest, { readonly type: "layout" }>
): Promise<WorkerResponse> => {
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "32",
      "elk.layered.spacing.nodeNodeBetweenLayers": "72",
    },
    children: request.nodes.map(({ id }) => ({ id, width: 240, height: 138 })),
    edges: request.nodes.flatMap(({ id, parentId }) =>
      parentId
        ? [
            {
              id: `${id}->${parentId}`,
              sources: [id],
              targets: [parentId],
            },
          ]
        : []
    ),
  };
  const result = await elk.layout(graph);
  const positions: Record<string, { readonly x: number; readonly y: number }> =
    {};
  for (const child of result.children ?? []) {
    positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 };
  }
  return {
    type: "layout",
    requestId: request.requestId,
    revision: request.revision,
    positions,
  };
};

export const handleWorkerRequest = async (
  request: WorkerRequest
): Promise<WorkerResponse> => {
  try {
    if (request.type === "analyze") {
      return {
        type: "analysis",
        requestId: request.requestId,
        projection: analyzeSource(request.sourceText, request.revision),
      };
    }
    return await layout(request);
  } catch (error) {
    return {
      type: "failure",
      requestId: request.requestId,
      revision: request.revision,
      message: error instanceof Error ? error.message : "Editor worker failed.",
    };
  }
};
