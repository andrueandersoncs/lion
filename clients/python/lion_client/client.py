"""HTTP + SSE client for `lion serve`."""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Iterator

from .wire import decode_wire, encode_wire


class LionClientError(RuntimeError):
    """Base error returned by a Lion HTTP server."""

    def __init__(self, status: int, tag: str, message: str) -> None:
        super().__init__(f"[{status}] {tag}: {message}")
        self.status = status
        self.tag = tag
        self.error_message = message


class LionConflictError(LionClientError):
    """HTTP 409 optimistic-concurrency conflict."""


class LionPermissionError(LionClientError):
    """HTTP 403 database permission violation."""


class LionLimitError(LionClientError):
    """HTTP 429 execution limit exceeded."""


class LionClient:
    """Thin zero-dependency Python client for a running `lion serve` instance."""

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:4100",
        *,
        api_key: str | None = None,
        timeout: float = 30.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _request(self, method: str, path: str, payload: Any | None = None) -> Any:
        data = None if payload is None else json.dumps(encode_wire(payload)).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}{path}",
            data=data,
            headers=self._headers(),
            method=method,
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read().decode("utf-8")
                return decode_wire(json.loads(raw)) if raw else None
        except urllib.error.HTTPError as exc:
            body_text = exc.read().decode("utf-8", errors="replace")
            try:
                parsed = json.loads(body_text)
                tag = str(parsed.get("tag", "Error"))
                msg = str(parsed.get("error", body_text))
            except Exception:
                tag = "HTTPError"
                msg = body_text
            if exc.code == 409:
                raise LionConflictError(exc.code, tag, msg) from exc
            if exc.code == 403:
                raise LionPermissionError(exc.code, tag, msg) from exc
            if exc.code == 429:
                raise LionLimitError(exc.code, tag, msg) from exc
            raise LionClientError(exc.code, tag, msg) from exc

    def health(self) -> dict[str, Any]:
        return self._request("GET", "/health")

    def inspect(self, *, branch: str | None = None) -> dict[str, Any]:
        qs = f"?branch={urllib.parse.quote(branch)}" if branch else ""
        return self._request("GET", f"/v1/inspect{qs}")

    def check(self, program: Any, *, apply_fixes: bool = False) -> dict[str, Any]:
        return self._request("POST", "/v1/check", {"program": program, "applyFixes": apply_fixes})

    def eval(self, program: Any, *, branch: str | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {"program": program}
        if branch is not None:
            body["branch"] = branch
        return self._request("POST", "/v1/eval", body)

    def commit(
        self,
        program: Any,
        *,
        branch: str | None = None,
        expected_revision: int | None = None,
        meta: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"program": program}
        if branch is not None:
            body["branch"] = branch
        if expected_revision is not None:
            body["expectedRevision"] = expected_revision
        if meta is not None:
            body["meta"] = meta
        return self._request("POST", "/v1/commit", body)

    def fork(self, name: str | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {"action": "fork"}
        if name is not None:
            body["name"] = name
        return self._request("POST", "/v1/branches", body)

    def merge(self, name: str, *, require_base_revision: bool = True) -> dict[str, Any]:
        return self._request(
            "POST",
            "/v1/branches",
            {"action": "merge", "name": name, "requireBaseRevision": require_base_revision},
        )

    def watch(self, query: Any, *, branch: str | None = None) -> Iterator[dict[str, Any]]:
        """Streams `initial` and `delta` events from `/v1/watch` over SSE."""
        body: dict[str, Any] = {"query": query}
        if branch is not None:
            body["branch"] = branch
        data = json.dumps(encode_wire(body)).encode("utf-8")
        headers = self._headers()
        headers["Accept"] = "text/event-stream"
        req = urllib.request.Request(
            f"{self.base_url}/v1/watch",
            data=data,
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            event_name = "message"
            for raw_line in resp:
                line = raw_line.decode("utf-8").rstrip("\r\n")
                if line.startswith("event: "):
                    event_name = line[7:]
                elif line.startswith("data: "):
                    payload = decode_wire(json.loads(line[6:]))
                    yield {"event": event_name, "data": payload}
