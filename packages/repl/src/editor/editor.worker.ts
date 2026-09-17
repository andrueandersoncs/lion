/// <reference lib="webworker" />

import type { WorkerRequest, WorkerResponse } from "./types";
import { handleWorkerRequest } from "./worker-protocol";

const worker = self as DedicatedWorkerGlobalScope;

worker.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  handleWorkerRequest(event.data)
    .then((response: WorkerResponse) => {
      worker.postMessage(response);
    })
    .catch((error: unknown) => {
      worker.postMessage({
        type: "failure",
        requestId: event.data.requestId,
        revision: event.data.revision,
        message: error instanceof Error ? error.message : String(error),
      } satisfies WorkerResponse);
    });
});
