import type { WorkerRequest, WorkerResponse } from "./types";
import { handleWorkerRequest } from "./worker-protocol";

export interface EditorWorkerClient {
  dispose(): void;
  request(request: WorkerRequest): Promise<WorkerResponse>;
  restart(): void;
}

interface PendingRequest {
  readonly reject: (error: Error) => void;
  readonly resolve: (response: WorkerResponse) => void;
}

export const createEditorWorkerClient = (): EditorWorkerClient => {
  let worker: Worker | null = null;
  const pending = new Map<number, PendingRequest>();

  const createWorker = () => {
    if (typeof Worker === "undefined") {
      return null;
    }
    const next = new Worker(new URL("./editor.worker.ts", import.meta.url), {
      type: "module",
    });
    next.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const entry = pending.get(event.data.requestId);
      if (!entry) {
        return;
      }
      pending.delete(event.data.requestId);
      entry.resolve(event.data);
    });
    next.addEventListener("error", () => {
      for (const entry of pending.values()) {
        entry.reject(new Error("Analysis worker stopped unexpectedly."));
      }
      pending.clear();
    });
    return next;
  };

  worker = createWorker();

  return {
    request(request) {
      if (!worker) {
        return handleWorkerRequest(request);
      }
      return new Promise<WorkerResponse>((resolve, reject) => {
        pending.set(request.requestId, { resolve, reject });
        worker?.postMessage(request);
      });
    },
    restart() {
      worker?.terminate();
      worker = createWorker();
    },
    dispose() {
      worker?.terminate();
      worker = null;
      for (const entry of pending.values()) {
        entry.reject(new Error("Analysis worker was disposed."));
      }
      pending.clear();
    },
  };
};
