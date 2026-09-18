import { defineHandler } from "nitro";

const TYPESAFE_API = "https://api.typesafe.ai";
const LEADING_SLASHES = /^\/+/;
const allowedRoutes = new Map([
  ["v1/models", "GET"],
  ["v1/systemone", "POST"],
]);

const jsonResponse = (status: number, message: string) =>
  Response.json({ error: message }, { status });

export default defineHandler(async (event) => {
  const path = event.context.params?.path?.replace(LEADING_SLASHES, "");
  const method = path ? allowedRoutes.get(path) : undefined;
  if (!(path && method)) {
    return jsonResponse(404, "Unknown TypeSafe API route.");
  }
  if (event.req.method !== method) {
    return jsonResponse(405, `Expected ${method} for this TypeSafe API route.`);
  }

  const authorization = event.req.headers.get("authorization");
  if (!authorization) {
    return jsonResponse(401, "A TypeSafe API key is required.");
  }

  const headers = new Headers({
    Accept: "application/json",
    Authorization: authorization,
  });
  const contentType = event.req.headers.get("content-type");
  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  try {
    const upstream = await fetch(`${TYPESAFE_API}/${path}`, {
      method,
      headers,
      body: method === "POST" ? await event.req.text() : undefined,
      signal: event.req.signal,
    });
    const responseHeaders = new Headers({
      "Cache-Control": "no-store",
    });
    for (const name of [
      "content-type",
      "retry-after",
      "x-typesafe-request-id",
    ]) {
      const value = upstream.headers.get(name);
      if (value) {
        responseHeaders.set(name, value);
      }
    }
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch {
    return jsonResponse(502, "The TypeSafe API could not be reached.");
  }
});
