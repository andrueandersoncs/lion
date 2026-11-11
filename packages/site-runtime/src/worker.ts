// Web Worker that evaluates Lion programs for the live examples on
// lionlang.dev. The page owns timeouts: it terminates this worker when a
// program runs too long, so nothing here needs to guard against runaway code.
import {
  describeError,
  type EvaluateRequest,
  type EvaluateResponse,
  evaluateSource,
} from "./evaluate.ts";

self.addEventListener("message", (event: MessageEvent<EvaluateRequest>) => {
  evaluateSource(event.data).then(
    (response) => self.postMessage(response),
    (error: unknown) =>
      self.postMessage({
        id: event.data.id,
        ok: false,
        error: describeError(error),
        logs: [],
        ms: 0,
      } satisfies EvaluateResponse)
  );
});
