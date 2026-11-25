// Web Worker that evaluates Lion programs for lionlang.dev.
// Handles both stateless playground evaluations (`{ id, source }`) and stateful
// interactive / streaming `@lionlang/ui` sessions (`ui:load`, `ui:step`,
// `ui:dispatch`). The page owns timeouts and restarts the worker on runaway code.
import { createUiSession, type UiSession } from "@lionlang/ui";
import { isUiNode } from "@lionlang/ui/types";
import { Cause, Effect, Exit, Scheduler } from "effect";
import {
  describeError,
  type EvaluateRequest,
  type EvaluateResponse,
  evaluateSource,
  formatValue,
} from "./evaluate.ts";

type UiWorkerRequest =
  | {
      readonly id: number;
      readonly session: string;
      readonly source: string;
      readonly type: "ui:load";
    }
  | {
      readonly id: number;
      readonly session: string;
      readonly source: string;
      readonly type: "ui:step";
    }
  | {
      readonly action: unknown;
      readonly id: number;
      readonly session: string;
      readonly type: "ui:dispatch";
      readonly value?: unknown;
    };

type WorkerRequest = EvaluateRequest | UiWorkerRequest;

type UiWorkerResponse =
  | {
      readonly id: number;
      readonly ms: number;
      readonly ok: true;
      readonly ui?: unknown;
      readonly value: string;
    }
  | {
      readonly error: string;
      readonly id: number;
      readonly ms: number;
      readonly ok: false;
    };

const sessions = new Map<string, UiSession>();

const getSession = (name: string) => {
  let session = sessions.get(name);
  if (!session) {
    session = createUiSession();
    sessions.set(name, session);
  }
  return session;
};

const runUiRequest = async (
  request: UiWorkerRequest
): Promise<UiWorkerResponse> => {
  const started = performance.now();
  const session =
    request.type === "ui:load"
      ? (() => {
          const fresh = createUiSession();
          sessions.set(request.session, fresh);
          return fresh;
        })()
      : getSession(request.session);

  let effect: Effect.Effect<unknown, unknown>;
  if (request.type === "ui:load") {
    effect = session.load(request.source);
  } else if (request.type === "ui:step") {
    effect = session.step(request.source);
  } else {
    effect = session.dispatch(request.action, request.value);
  }

  const exit = await Effect.runPromiseExit(
    effect.pipe(Effect.provideService(Scheduler.PreventSchedulerYield, true))
  );
  const ms = performance.now() - started;

  if (Exit.isSuccess(exit)) {
    const value = exit.value;
    return {
      id: request.id,
      ms,
      ok: true,
      ui: isUiNode(value) ? value : undefined,
      value: formatValue(value),
    };
  }
  return {
    error: describeError(Cause.squash(exit.cause)),
    id: request.id,
    ms,
    ok: false,
  };
};

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const data = event.data;
  if ("type" in data) {
    runUiRequest(data).then(
      (response) => self.postMessage(response),
      (error: unknown) =>
        self.postMessage({
          error: describeError(error),
          id: data.id,
          ms: 0,
          ok: false,
        } satisfies UiWorkerResponse)
    );
    return;
  }

  evaluateSource(data).then(
    (response) => self.postMessage(response),
    (error: unknown) =>
      self.postMessage({
        id: data.id,
        ok: false,
        error: describeError(error),
        logs: [],
      } satisfies EvaluateResponse)
  );
});
