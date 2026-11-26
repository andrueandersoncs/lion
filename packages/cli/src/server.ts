/**
 * Embeddable HTTP + SSE + Streamable MCP server for Lion (`lion serve`).
 *
 * Zero external HTTP framework dependencies (pure `node:http`, works in both
 * Bun and Node). Maps Lion's sandbox errors directly to semantic HTTP codes:
 * - `ConflictError` -> 409 Conflict
 * - `PermissionError` -> 403 Forbidden
 * - `ResourceLimitError` -> 429 Too Many Requests
 * - other evaluation errors -> 400 Bad Request
 */
import http from "node:http";
import { watch } from "@lionlang/core/evaluation/evaluate";
import { decodeWire, stringifyWire } from "@lionlang/core/evaluation/wire";
import { Effect, Exit } from "effect";
import {
  extractErrorInfo,
  handleMcpRequest,
  type JsonRpcRequest,
  type LionMcpOptions,
  LionRuntimeSession,
} from "./mcp.ts";

export interface LionServerOptions extends LionMcpOptions {
  readonly host?: string;
  readonly port?: number;
}

export interface RunningLionServer {
  readonly close: () => Promise<void>;
  readonly port: number;
  readonly session: LionRuntimeSession;
  readonly url: string;
}

const statusForErrorTag = (tag: string): number => {
  switch (tag) {
    case "ConflictError":
      return 409;
    case "PermissionError":
      return 403;
    case "ResourceLimitError":
      return 429;
    default:
      return 400;
  }
};

const readBody = (req: http.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

const sendJson = (
  res: http.ServerResponse,
  status: number,
  body: unknown
): void => {
  const payload = stringifyWire(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  res.end(payload);
};

const handleEffect = async <A>(
  res: http.ServerResponse,
  effect: Effect.Effect<A, unknown>,
  successStatus = 200
): Promise<void> => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) {
    sendJson(res, successStatus, exit.value);
    return;
  }
  const { message, tag } = extractErrorInfo(exit.cause);
  sendJson(res, statusForErrorTag(tag), { error: message, tag });
};

const handleWatchRoute = async (
  session: LionRuntimeSession,
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> => {
  const body = JSON.parse(await readBody(req)) as {
    readonly branch?: string;
    readonly query: unknown;
  };
  const target = session.resolveJournal(body.branch);
  if (target === undefined) {
    sendJson(res, 404, {
      error: `Unknown branch "${body.branch}".`,
      tag: "NotFoundError",
    });
    return;
  }
  const decodedQuery = await Effect.runPromise(decodeWire(body.query));
  res.writeHead(200, {
    "cache-control": "no-cache",
    connection: "keep-alive",
    "content-type": "text/event-stream; charset=utf-8",
  });
  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${stringifyWire(data)}\n\n`);
  };
  const exit = await Effect.runPromiseExit(
    watch(decodedQuery, session.environment, target.database, (watched) => {
      sendEvent("delta", {
        added: watched.added,
        answers: watched.answers,
        removed: watched.removed,
        revision: target.revision,
      });
    })
  );
  if (Exit.isFailure(exit)) {
    const { message, tag } = extractErrorInfo(exit.cause);
    sendEvent("error", { error: message, tag });
    res.end();
    return;
  }
  const { answers, stop } = exit.value;
  sendEvent("initial", { answers, revision: target.revision });
  req.on("close", () => {
    stop();
  });
};

const handlePostRoute = async (
  session: LionRuntimeSession,
  pathname: string,
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<boolean> => {
  switch (pathname) {
    case "/v1/check": {
      const body = JSON.parse(await readBody(req)) as {
        readonly applyFixes?: boolean;
        readonly program: unknown;
      };
      await handleEffect(
        res,
        session.check(body.program, body.applyFixes === true)
      );
      return true;
    }
    case "/v1/eval": {
      const body = JSON.parse(await readBody(req)) as {
        readonly branch?: string;
        readonly program: unknown;
      };
      await handleEffect(res, session.evalReadOnly(body.program, body.branch));
      return true;
    }
    case "/v1/commit": {
      const body = JSON.parse(await readBody(req)) as {
        readonly branch?: string;
        readonly expectedRevision?: number;
        readonly meta?: Readonly<Record<string, unknown>>;
        readonly program: unknown;
      };
      await handleEffect(
        res,
        session.commit(body.program, {
          ...(body.branch === undefined ? {} : { branch: body.branch }),
          ...(body.expectedRevision === undefined
            ? {}
            : { expectedRevision: body.expectedRevision }),
          ...(body.meta === undefined ? {} : { meta: body.meta }),
        })
      );
      return true;
    }
    case "/v1/branches": {
      const body = JSON.parse(await readBody(req)) as {
        readonly action: "fork" | "list" | "merge" | "delete";
        readonly name?: string;
        readonly requireBaseRevision?: boolean;
      };
      await handleEffect(res, session.manageBranch(body));
      return true;
    }
    case "/v1/watch":
      await handleWatchRoute(session, req, res);
      return true;
    case "/v1/mcp": {
      const rpc = JSON.parse(await readBody(req)) as JsonRpcRequest;
      const response = await Effect.runPromise(handleMcpRequest(session, rpc));
      if (response === undefined) {
        res.writeHead(204);
        res.end();
        return true;
      }
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(response));
      return true;
    }
    default:
      return false;
  }
};

/** Starts a stateful Lion HTTP + SSE + Streamable MCP server. */
export const startLionServer = async (
  options: LionServerOptions = {}
): Promise<RunningLionServer> => {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4100;
  const session = await Effect.runPromise(LionRuntimeSession.create(options));

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${host}`);
      const method = req.method ?? "GET";
      if (method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, { ok: true, revision: session.journal.revision });
        return;
      }
      if (method === "GET" && url.pathname === "/v1/inspect") {
        const branch = url.searchParams.get("branch") ?? undefined;
        await handleEffect(res, session.inspect(branch));
        return;
      }
      if (
        method === "POST" &&
        (await handlePostRoute(session, url.pathname, req, res))
      ) {
        return;
      }
      sendJson(res, 404, {
        error: `Route not found: ${method} ${url.pathname}`,
      });
    } catch (error) {
      sendJson(res, 400, {
        error: error instanceof Error ? error.message : String(error),
        tag: "BadRequestError",
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  const addr = server.address();
  const actualPort =
    typeof addr === "object" && addr !== null ? addr.port : port;
  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
    port: actualPort,
    session,
    url: `http://${host}:${actualPort}`,
  };
};
