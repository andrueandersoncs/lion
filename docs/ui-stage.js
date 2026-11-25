// Multi-stage interactive and streaming Lion UI showcase for lionlang.dev.
// Each `[data-ui-demo="<key>"]` card runs its own stateful LogicDatabase
// session inside one shared Web Worker (`lion-worker.js`) and patches its DOM
// in place via `@lionlang/ui/dom` (`lion-ui.js`).
const VERSION = new URL(import.meta.url).search;
const { renderUi } = await import(`./lion-ui.js${VERSION}`);
const { highlight } = await import(`./highlight.js${VERSION}`);
const { timeLabel } = await import(`./pure.js${VERSION}`);

const WORKER_URL = new URL(`./lion-worker.js${VERSION}`, import.meta.url);
const TIMEOUT_MS = 2000;
const DEBOUNCE_MS = 320;
const STREAM_INTERVAL_MS = 650;

const DEMOS = {
  stream: {
    program: `["begin",
  ["relation", "claim", ["source", "metric", "value", "quote"]],
  ["relation", "depends", ["service", "on"]],
  ["relation", "range", ["metric", "lo", "hi"], {"key": ["metric"]}],
  ["relation", "disputed", ["metric", "values"]],
  ["rule", ["disputed", "?m", ["aggregate/unique", "?v"]],
    ["claim", "?s1", "?m", "?v", "?_"],
    ["claim", "?s2", "?m", "?v2", "?_"],
    ["not", ["=", "?v", "?v2"]]],
  ["define", "view", ["lambda", [],
    ["begin",
      ["define", "claims", ["find",
        ["array/make", "?s", "?m", ["string/concat", ["number/toString", "?v"], "%"], "?q"],
        ["claim", "?s", "?m", "?v", "?q"]]],
      ["define", "has-dispute", ["disputed", "uptime", "?_"]],
      ["define", "spofs", ["find", "?d",
        ["and",
          ["graph/dominators", "depends", "checkout", "db", "?d"],
          ["not", ["=", "?d", "checkout"]]]]],
      ["define", "has-ranges", ["and", ["range", "revenue", "?_", "?_"], ["range", "cost", "?_", "?_"]]],
      ["ui/stack", {"gap": "md"},
        ["ui/row", {"gap": "md"},
          ["ui/metric", {"label": "Sources ingested", "value": ["array/length", "claims"]}],
          ["ui/metric", {"label": "Disputes",
            "value": ["cond", ["has-dispute", "1"], ["else", "0"]],
            "tone": ["cond", ["has-dispute", "warn"], ["else", "ok"]]}],
          ["ui/metric", {"label": "Single point of failure",
            "value": ["cond", [["number/greaterThan", ["array/length", "spofs"], 0], ["array/head", "spofs"]], ["else", "—"]],
            "tone": ["cond", [["number/greaterThan", ["array/length", "spofs"], 0], "warn"], ["else", "muted"]]}]],
        ["cond",
          ["has-dispute",
            ["ui/alert", {"tone": "warn", "title": "Source contradiction detected"},
              "q4-filing reports 99.4% uptime while blog-post claims 99.9%."]],
          [["number/greaterThan", ["array/length", "claims"], 0],
            ["ui/alert", {"tone": "ok", "title": "All ingested claims agree"},
              "No conflicting figures found."]]],
        ["cond",
          [["claim", "blog-post", "?_", "?_", "?_"],
            ["ui/button", {"label": "Retract unverified blog-post claim", "tone": "secondary",
              "onClick": ["quote", ["retract", ["claim", "blog-post", "uptime", 99.9, "Nearly 99.9% uptime all quarter"]]]}]]],
        ["cond",
          [["number/greaterThan", ["array/length", "claims"], 0],
            ["ui/table", {"columns": ["quote", ["Source", "Metric", "Value", "Verbatim quote"]], "rows": "claims"}]]],
        ["cond",
          ["has-ranges",
            ["begin",
              ["define", "rlo", ["array/head", ["find", "?lo", ["range", "revenue", "?lo", "?_"]]]],
              ["define", "rhi", ["array/head", ["find", "?hi", ["range", "revenue", "?_", "?hi"]]]],
              ["define", "clo", ["array/head", ["find", "?lo", ["range", "cost", "?lo", "?_"]]]],
              ["define", "chi", ["array/head", ["find", "?hi", ["range", "cost", "?_", "?hi"]]]],
              ["define", "bounds", ["proof/bounds", "?m", ["and",
                ["schema/fits?", "?rev", "value/number?"],
                ["schema/fits?", "?cost", "value/number?"],
                ["number/greaterThanOrEqualTo", "?rev", "rlo"],
                ["number/lessThanOrEqualTo", "?rev", "rhi"],
                ["number/greaterThanOrEqualTo", "?cost", "clo"],
                ["number/lessThanOrEqualTo", "?cost", "chi"],
                ["=", "?m", ["number/divide", ["number/subtract", "?rev", "?cost"], "?rev"]]]]],
              ["ui/proof", {"title": "Streamed financial margin bounds (≥ 10% check)",
                "valid": ["proof/valid?", "bounds", {"atLeast": 0.1}]}, "bounds"]]]]]]],
    {"persist": true}],
  ["view"]]`,
    chunks: [
      {
        label: "Chunk 1 · Primary Q4 filing",
        source: `["fact", ["claim", "q4-filing", "uptime", 99.4, "Q4 availability was 99.4%"]]`,
      },
      {
        label: "Chunk 2 · Conflicting blog post",
        source: `["fact", ["claim", "blog-post", "uptime", 99.9, "Nearly 99.9% uptime all quarter"]]`,
      },
      {
        label: "Chunk 3 · Service dependency edges",
        source: `["fact", ["depends", "checkout", "auth"], ["depends", "billing", "auth"], ["depends", "auth", "db"], ["depends", "checkout", "cache"]]`,
      },
      {
        label: "Chunk 4 · Financial interval ranges",
        source: `["fact", ["range", "revenue", 120, 150], ["range", "cost", 90, 105]]`,
      },
    ],
  },

  form: {
    program: `["begin",
  ["relation", "field", ["k", "v"], {"key": ["k"]}],
  ["fact",
    ["field", "guests", 2],
    ["field", "nights", 3],
    ["field", "promo", "WEEKEND"]],
  ["define", "get-field",
    ["lambda", ["k"], ["array/head", ["find", "?v", ["field", "k", "?v"]]]],
    {"persist": true}],
  ["define", "view", ["lambda", [],
    ["begin",
      ["define", "g", ["get-field", "guests"]],
      ["define", "n", ["get-field", "nights"]],
      ["define", "raw-promo", ["get-field", "promo"]],
      ["define", "code", ["string/toUpperCase", ["string/trim", "raw-promo"]]],
      ["define", "is-weekend", ["string/equals?", "code", "WEEKEND"]],
      ["define", "weekend-err", ["and", "is-weekend", ["number/lessThan", "n", 2]]],
      ["define", "base", ["number/multiply", "n", 120]],
      ["define", "extra", ["number/multiply",
        ["number/max", 0, ["number/subtract", "g", 2]],
        ["number/multiply", "n", 25]]],
      ["define", "subtotal", ["number/add", "base", "extra"]],
      ["define", "discount", ["cond",
        [["and", "is-weekend", ["not", "weekend-err"]], ["number/multiply", "subtotal", 0.15]],
        ["else", 0]]],
      ["define", "total", ["number/subtract", "subtotal", "discount"]],
      ["ui/grid", {"columns": 2, "gap": "lg"},
        ["ui/card", {"title": "Booking inputs", "subtitle": "Stored as keyed facts in Lion"},
          ["ui/stack", {"gap": "md"},
            ["ui/slider", {"id": "nights", "label": "Nights", "min": 1, "max": 7, "value": "n",
              "onChange": ["quote", ["fact", ["field", "nights", "value"]]]}],
            ["ui/slider", {"id": "guests", "label": "Guests", "min": 1, "max": 6, "value": "g",
              "onChange": ["quote", ["fact", ["field", "guests", "value"]]]}],
            ["ui/input", {"id": "promo", "label": "Promo code", "value": "raw-promo", "placeholder": "Try WEEKEND",
              "onChange": ["quote", ["fact", ["field", "promo", "value"]]]}]]],
        ["ui/card", {"title": "Live validation & receipt", "subtitle": "Computed by Lion lambdas"},
          ["ui/stack", {"gap": "md"},
            ["ui/row", {"gap": "md"},
              ["ui/metric", {"label": "Total",
                "value": ["cond", ["weekend-err", "—"], ["else", ["string/concat", "$", ["number/toString", "total"]]]],
                "tone": ["cond", ["weekend-err", "error"], ["else", "ok"]]}],
              ["ui/metric", {"label": "Discount",
                "value": ["string/concat", "-$", ["number/toString", "discount"]],
                "delta": ["cond", [["and", "is-weekend", ["not", "weekend-err"]], "15% WEEKEND"], ["else", "none"]]}]],
            ["cond",
              ["weekend-err", ["ui/alert", {"tone": "error", "title": "Rule rejected"},
                "Promo code WEEKEND requires at least 2 nights."]],
              ["else", ["ui/alert", {"tone": "ok", "title": "Booking valid"},
                ["string/concat", ["number/toString", "g"], " guests · ", ["number/toString", "n"], " nights"]]]],
            ["ui/table", {"columns": ["quote", ["Line item", "Amount"]],
              "rows": ["array/make",
                ["array/make", "Base stay ($120/night)", ["string/concat", "$", ["number/toString", "base"]]],
                ["array/make", "Extra guests ($25/night)", ["string/concat", "$", ["number/toString", "extra"]]],
                ["array/make", "Promo discount", ["string/concat", "-$", ["number/toString", "discount"]]]]}]]]]]],
    {"persist": true}],
  ["view"]]`,
  },

  policy: {
    program: `["begin",
  ["relation", "member", ["user", "role"], {"key": ["user"]}],
  ["relation", "inherits", ["role", "parent"]],
  ["relation", "grants", ["role", "action"]],
  ["relation", "suspended", ["user"]],
  ["relation", "setting", ["k", "v"], {"key": ["k"]}],
  ["relation", "has-role", ["user", "role"]],
  ["relation", "can", ["user", "action"]],
  ["fact",
    ["member", "bo", "lead"],
    ["inherits", "lead", "editor"],
    ["inherits", "editor", "viewer"],
    ["grants", "editor", "deploy"],
    ["suspended", "bo"],
    ["setting", "limit", 450]],
  ["rule", ["has-role", "?u", "?r"], ["member", "?u", "?r"]],
  ["rule", ["has-role", "?u", "?p"], ["has-role", "?u", "?r"], ["inherits", "?r", "?p"]],
  ["rule", ["can", "?u", "?a"], ["has-role", "?u", "?r"], ["grants", "?r", "?a"], ["not", ["suspended", "?u"]]],
  ["define", "view", ["lambda", [],
    ["begin",
      ["define", "bo-role", ["array/head", ["find", "?r", ["member", "bo", "?r"]]]],
      ["define", "lim", ["array/head", ["find", "?v", ["setting", "limit", "?v"]]]],
      ["define", "allowed", ["can", "bo", "deploy"]],
      ["define", "cap", ["proof/prove",
        ["not", ["exists", ["?spend"],
          ["and",
            ["schema/fits?", "?spend", "value/number?"],
            ["number/greaterThanOrEqualTo", "?spend", 0],
            ["number/lessThanOrEqualTo", "?spend", "lim"],
            ["number/greaterThan", "?spend", 500]]]]]],
      ["ui/grid", {"columns": 2, "gap": "lg"},
        ["ui/card", {"title": "Policy controls", "subtitle": "Mutate facts & test invariants live"},
          ["ui/stack", {"gap": "md"},
            ["ui/toggle", {"id": "suspend", "label": "Suspend Bo", "checked": ["suspended", "bo"],
              "onChange": ["quote", ["cond", ["value", ["fact", ["suspended", "bo"]]], ["else", ["retract", ["suspended", "bo"]]]]]}],
            ["ui/select", {"id": "role", "label": "Bo role", "value": "bo-role",
              "options": ["quote", ["viewer", "editor", "lead"]],
              "onChange": ["quote", ["fact", ["member", "bo", "value"]]]}],
            ["ui/slider", {"id": "limit", "label": "Account spend limit", "prefix": "$", "min": 200, "max": 700, "step": 50, "value": "lim",
              "onChange": ["quote", ["fact", ["setting", "limit", "value"]]]}],
            ["ui/text", {"tone": "muted"}, "Drag spend limit above $500 to watch the symbolic solver refute the invariant with a counterexample."]]],
        ["ui/stack", {"gap": "md"},
          ["ui/card", {"title": "Deploy decision", "subtitle": "Datalog + why provenance"},
            ["ui/stack", {"gap": "sm"},
              ["ui/row", {"gap": "sm", "align": "center"},
                ["ui/badge", {"tone": ["cond", ["allowed", "ok"], ["else", "error"]]},
                  ["cond", ["allowed", "Allowed"], ["else", "Denied"]]],
                ["ui/text", {"tone": "muted"}, ["string/concat", "bo (", "bo-role", ") → deploy"]]],
              ["ui/why", {"title": "Exact trace"}, ["why", ["can", "bo", "deploy"]]]]],
          ["ui/proof", {"title": "Invariant: spend never exceeds $500",
            "valid": ["proof/valid?", "cap"],
            "summary": "Proved for all spend in [0, limit]."}, "cap"]]]]],
    {"persist": true}],
  ["view"]]`,
  },

  graph: {
    program: `["begin",
  ["relation", "edge", ["from", "to", "weight"]],
  ["relation", "reaches", ["from", "to"]],
  ["fact",
    ["edge", "checkout", "auth", 0.9],
    ["edge", "billing", "auth", 0.8],
    ["edge", "auth", "db", 0.85],
    ["edge", "checkout", "cache", 0.25]],
  ["rule", ["reaches", "?a", "?b"], ["edge", "?a", "?b", "?_"]],
  ["rule", ["reaches", "?a", "?c"], ["reaches", "?a", "?b"], ["edge", "?b", "?c", "?_"]],
  ["define", "view", ["lambda", [],
    ["begin",
      ["define", "has-failover", ["edge", "checkout", "auth-backup", 0.5]],
      ["define", "spofs", ["find", "?d",
        ["and",
          ["graph/dominators", "edge", "checkout", "db", "?d"],
          ["not", ["=", "?d", "checkout"]]]]],
      ["define", "ranked", ["query",
        ["graph/influence", "edge", "checkout", "?svc", "?score"],
        {"order": "-score"}]],
      ["define", "rows", ["array/map", "ranked", ["lambda", ["r"],
        ["array/make",
          ["object/get", "r", "svc"],
          ["string/concat",
            ["number/toString", ["number/round", ["number/multiply", ["object/get", "r", "score"], 100], 1]],
            "%"],
          ["cond",
            [["array/includes?", "spofs", ["object/get", "r", "svc"]],
             ["ui/badge", {"tone": "warn"}, "bottleneck"]],
            ["else", ["ui/badge", {"tone": "ok"}, "redundant"]]]]]]],
      ["ui/grid", {"columns": 2, "gap": "lg"},
        ["ui/card", {"title": "Service topology", "subtitle": "Toggle edges & re-run graph algorithms live"},
          ["ui/stack", {"gap": "md"},
            ["ui/toggle", {"id": "failover", "label": "Add auth-backup failover route to db", "checked": "has-failover",
              "onChange": ["quote", ["cond",
                ["value", ["fact", ["edge", "checkout", "auth-backup", 0.5], ["edge", "auth-backup", "db", 0.85]]],
                ["else", ["retract", ["edge", "checkout", "auth-backup", 0.5], ["edge", "auth-backup", "db", 0.85]]]]]}],
            ["ui/row", {"gap": "md"},
              ["ui/metric", {"label": "Reachable services",
                "value": ["array/length", ["find", "?t", ["reaches", "checkout", "?t"]]]}],
              ["ui/metric", {"label": "Checkout → DB bottlenecks",
                "value": ["cond", [["number/greaterThan", ["array/length", "spofs"], 0], ["string/join", "spofs", ", "]], ["else", "none"]],
                "tone": ["cond", [["number/greaterThan", ["array/length", "spofs"], 0], "warn"], ["else", "ok"]]}]],
            ["cond",
              [["number/greaterThan", ["array/length", "spofs"], 0],
               ["ui/alert", {"tone": "warn", "title": "Single point of failure"},
                 "Every path from checkout to db passes through auth. Toggle failover to remove the bottleneck."]],
              ["else",
               ["ui/alert", {"tone": "ok", "title": "Redundant path verified"},
                 "Checkout can still reach db even if auth goes down."]]]]],
        ["ui/card", {"title": "Weighted influence from checkout", "subtitle": "Derived by graph/influence & graph/dominators"},
          ["ui/table", {"columns": ["quote", ["Service", "Influence", "Resilience"]], "rows": "rows"}]]]]],
    {"persist": true}],
  ["view"]]`,
  },
};

const createWorkerClient = () => {
  let worker = null;
  let nextId = 0;
  const pending = new Map();

  const settle = (id, response) => {
    const entry = pending.get(id);
    if (!entry) {
      return;
    }
    clearTimeout(entry.timer);
    pending.delete(id);
    entry.resolve(response);
  };

  const spawn = () => {
    worker = new Worker(WORKER_URL, { type: "module" });
    worker.addEventListener("message", (event) => {
      settle(event.data.id, event.data);
    });
    worker.addEventListener("error", (event) => {
      event.preventDefault();
      worker?.terminate();
      worker = null;
      for (const id of [...pending.keys()]) {
        settle(id, { id, ok: false, error: "Worker failed to load.", ms: 0 });
      }
    });
  };

  return (payload) =>
    new Promise((resolve) => {
      if (!worker) {
        spawn();
      }
      nextId += 1;
      const id = nextId;
      const timer = setTimeout(() => {
        worker?.terminate();
        worker = null;
        settle(id, {
          id,
          ok: false,
          error: `Timed out after ${TIMEOUT_MS / 1000} s.`,
          ms: TIMEOUT_MS,
        });
      }, TIMEOUT_MS);
      pending.set(id, { resolve, timer });
      worker.postMessage({ ...payload, id });
    });
};

const setupStage = (stage, key, send) => {
  const demo = DEMOS[key];
  if (!demo) {
    return null;
  }
  const timeEl = stage.querySelector("[data-stage-time]");
  const errorEl = stage.querySelector("[data-stage-error]");
  const canvasEl = stage.querySelector("[data-stage-canvas]");
  const sourceWrap = stage.querySelector("[data-stage-source]");
  const toggleBtn = stage.querySelector("[data-stage-toggle-source]");
  const streamBtn = stage.querySelector("[data-stage-stream]");
  const resetBtn = stage.querySelector("[data-stage-reset]");
  const streamLogEl = stage.querySelector("[data-stage-stream-log]");
  const editorCode = stage.querySelector("[data-stage-code]");
  const editorInput = stage.querySelector("[data-stage-input]");

  const isStream = Array.isArray(demo.chunks);
  let streamRunId = 0;
  let editTimer = 0;

  const syncEditorHighlight = () => {
    if (!(editorInput && editorCode)) {
      return;
    }
    const text = editorInput.value;
    editorCode.innerHTML = highlight(text.endsWith("\n") ? `${text} ` : text);
  };

  const renderResponse = (response) => {
    if (timeEl) {
      timeEl.textContent =
        response.ms === undefined ? "" : timeLabel(response.ms);
    }
    if (!response.ok) {
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = response.error;
      }
      return;
    }
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }
    if (response.ui && canvasEl) {
      renderUi(response.ui, canvasEl, {
        onAction: async (action, value) => {
          const next = await send({
            type: "ui:dispatch",
            session: key,
            action,
            value,
          });
          renderResponse(next);
          if (resetBtn) {
            resetBtn.hidden = false;
          }
        },
      });
    }
  };

  const appendStreamLog = (label, source) => {
    if (!streamLogEl) {
      return;
    }
    const item = document.createElement("div");
    item.className = "stream-log-item";
    const head = document.createElement("span");
    head.className = "stream-log-label";
    head.textContent = label;
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.innerHTML = highlight(source);
    pre.append(code);
    item.append(head, pre);
    streamLogEl.append(item);
  };

  const runStream = async () => {
    streamRunId += 1;
    const runId = streamRunId;
    if (streamLogEl) {
      streamLogEl.hidden = false;
      streamLogEl.textContent = "";
    }
    const loaded = await send({
      type: "ui:load",
      session: key,
      source: editorInput?.value ?? demo.program,
    });
    if (runId !== streamRunId) {
      return;
    }
    renderResponse(loaded);
    if (!loaded.ok) {
      return;
    }
    for (const chunk of demo.chunks ?? []) {
      await new Promise((resolve) => setTimeout(resolve, STREAM_INTERVAL_MS));
      if (runId !== streamRunId) {
        return;
      }
      appendStreamLog(chunk.label, chunk.source);
      const stepped = await send({
        type: "ui:step",
        session: key,
        source: chunk.source,
      });
      if (runId !== streamRunId) {
        return;
      }
      renderResponse(stepped);
    }
  };

  const start = async () => {
    streamRunId += 1;
    if (editorInput) {
      editorInput.value = demo.program;
      syncEditorHighlight();
    }
    if (streamBtn) {
      streamBtn.hidden = !isStream;
    }
    if (resetBtn) {
      resetBtn.hidden = true;
    }
    if (isStream) {
      await runStream();
    } else {
      const response = await send({
        type: "ui:load",
        session: key,
        source: demo.program,
      });
      renderResponse(response);
    }
  };

  toggleBtn?.addEventListener("click", () => {
    if (!sourceWrap) {
      return;
    }
    const opening = sourceWrap.hidden;
    sourceWrap.hidden = !opening;
    stage.classList.toggle("is-showing-source", opening);
    toggleBtn.setAttribute("aria-expanded", String(opening));
    toggleBtn.textContent = opening
      ? "Hide Lion JSON"
      : "View / edit Lion JSON";
  });

  streamBtn?.addEventListener("click", () => {
    if (isStream) {
      runStream();
    }
  });

  resetBtn?.addEventListener("click", () => {
    start();
  });

  editorInput?.addEventListener("input", () => {
    syncEditorHighlight();
    if (resetBtn) {
      resetBtn.hidden = false;
    }
    clearTimeout(editTimer);
    editTimer = setTimeout(async () => {
      if (isStream) {
        await runStream();
      } else {
        const response = await send({
          type: "ui:load",
          session: key,
          source: editorInput.value,
        });
        renderResponse(response);
      }
    }, DEBOUNCE_MS);
  });

  return start;
};

const stages = [...document.querySelectorAll("[data-ui-demo]")];
if (stages.length > 0 && "Worker" in window) {
  const send = createWorkerClient();
  const starters = new Map();
  for (const stage of stages) {
    const start = setupStage(stage, stage.dataset.uiDemo, send);
    if (start) {
      starters.set(stage, start);
    }
  }

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            observer.unobserve(entry.target);
            starters.get(entry.target)?.();
          }
        }
      },
      { rootMargin: "240px 0px" }
    );
    for (const stage of starters.keys()) {
      observer.observe(stage);
    }
  } else {
    for (const start of starters.values()) {
      start();
    }
  }
}
