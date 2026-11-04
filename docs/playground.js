// Live Lion editors for the example cards. Programs run in a Web Worker
// (docs/lion-worker.js, built by @lionlang/site-runtime) so a runaway program
// can be terminated without freezing the page.
import { escapeHtml, highlight } from "./highlight.js";

const WORKER_URL = new URL("./lion-worker.js", import.meta.url);
const TIMEOUT_MS = 1500;
const DEBOUNCE_MS = 300;
const SHOW_RUNNING_AFTER_MS = 120;
const IS_MAC = /mac|iphone|ipad/i.test(
  navigator.userAgentData?.platform ?? navigator.platform
);

// One shared worker. When a program exceeds the time limit the worker is
// terminated, that request fails, and every other in-flight request is re-sent
// to a fresh worker.
const createEvaluator = () => {
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

  const failAll = (error) => {
    for (const id of [...pending.keys()]) {
      settle(id, { id, ok: false, error, logs: [], ms: 0 });
    }
  };

  const post = (id) => {
    const entry = pending.get(id);
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => restart(id), TIMEOUT_MS);
    worker.postMessage({ id, source: entry.source });
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
      failAll("The evaluator failed to load. Reload the page to try again.");
    });
  };

  const restart = (timedOutId) => {
    worker?.terminate();
    worker = null;
    settle(timedOutId, {
      id: timedOutId,
      ok: false,
      error: `Timed out after ${TIMEOUT_MS / 1000} s, so the evaluator was restarted. Is there unbounded recursion?`,
      logs: [],
      ms: TIMEOUT_MS,
    });
    if (pending.size > 0) {
      spawn();
      for (const id of pending.keys()) {
        post(id);
      }
    }
  };

  return (source) =>
    new Promise((resolve) => {
      if (!worker) {
        spawn();
      }
      nextId += 1;
      pending.set(nextId, { source, resolve, timer: 0 });
      post(nextId);
    });
};

const formatDuration = (ms) => {
  if (ms < 1) {
    return "<1 ms";
  }
  return `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`;
};

const buildEditor = (codeBlock, label, source) => {
  const scroll = document.createElement("div");
  scroll.className = "playground-scroll";
  const layers = document.createElement("div");
  layers.className = "playground-layers";
  const pre = document.createElement("pre");
  pre.setAttribute("aria-hidden", "true");
  const code = document.createElement("code");
  pre.append(code);
  const input = document.createElement("textarea");
  input.className = "playground-input";
  input.value = source;
  input.spellcheck = false;
  input.wrap = "off";
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("aria-label", `Lion program: ${label}`);
  layers.append(pre, input);
  scroll.append(layers);
  codeBlock.querySelector("pre")?.replaceWith(scroll);
  codeBlock.classList.add("is-live");
  return { code, input };
};

const buildOutput = (output, initialResult) => {
  output.innerHTML = `
    <div class="playground-bar">
      <span class="playground-status is-ok" data-status>result</span>
      <span class="playground-time" data-time></span>
      <span class="playground-actions">
        <button type="button" class="playground-btn" data-reset disabled>Reset</button>
        <button type="button" class="playground-btn is-primary" data-run>
          Run <kbd>${IS_MAC ? "⌘" : "Ctrl"} ↵</kbd>
        </button>
      </span>
    </div>
    <div class="playground-logs" data-logs hidden></div>
    <pre class="playground-result"><code data-result>${highlight(initialResult)}</code></pre>`;
  output.setAttribute("aria-live", "polite");
  return {
    status: output.querySelector("[data-status]"),
    time: output.querySelector("[data-time]"),
    reset: output.querySelector("[data-reset]"),
    run: output.querySelector("[data-run]"),
    logs: output.querySelector("[data-logs]"),
    result: output.querySelector(".playground-result"),
    resultCode: output.querySelector("[data-result]"),
  };
};

const setupPlayground = (root, evaluate) => {
  const codeBlock = root.querySelector(".playground-code");
  const output = root.querySelector(".playground-output");
  if (!(codeBlock && output)) {
    return null;
  }
  const original = codeBlock.querySelector("code")?.textContent ?? "";
  const initialResult = output.querySelector("code")?.textContent ?? "";
  const { code, input } = buildEditor(
    codeBlock,
    root.dataset.playground ?? "example",
    original
  );
  const ui = buildOutput(output, initialResult);

  let latest = 0;
  let debounce = 0;
  let runningTimer = 0;

  const render = () => {
    // A trailing newline needs content after it or the <pre> collapses it.
    const text = input.value;
    code.innerHTML = highlight(text.endsWith("\n") ? `${text} ` : text);
    ui.reset.disabled = text === original;
  };

  const setStatus = (kind, text) => {
    ui.status.className = `playground-status is-${kind}`;
    ui.status.textContent = text;
  };

  const show = (response) => {
    setStatus(response.ok ? "ok" : "error", response.ok ? "result" : "error");
    ui.time.textContent = response.ms > 0 ? formatDuration(response.ms) : "";
    ui.logs.hidden = response.logs.length === 0;
    ui.logs.innerHTML = response.logs
      .map((line) => `<div class="playground-log">${escapeHtml(line)}</div>`)
      .join("");
    ui.result.classList.toggle("is-error", !response.ok);
    ui.resultCode.innerHTML = response.ok
      ? highlight(response.value)
      : escapeHtml(response.error);
    ui.result.classList.remove("is-flash");
    // Restart the flash animation.
    ui.result.getBoundingClientRect();
    ui.result.classList.add("is-flash");
  };

  const runNow = async ({ ripple = false } = {}) => {
    clearTimeout(debounce);
    latest += 1;
    const request = latest;
    clearTimeout(runningTimer);
    runningTimer = setTimeout(() => {
      if (request === latest) {
        setStatus("running", "running…");
        ui.time.textContent = "";
      }
    }, SHOW_RUNNING_AFTER_MS);
    const response = await evaluate(input.value);
    if (request !== latest) {
      return;
    }
    clearTimeout(runningTimer);
    show(response);
    if (ripple) {
      const rect = ui.result.getBoundingClientRect();
      window.dispatchEvent(
        new CustomEvent("lion:evaluate", {
          detail: { x: rect.left + 40, y: rect.top + rect.height / 2 },
        })
      );
    }
  };

  input.addEventListener("input", () => {
    render();
    clearTimeout(debounce);
    debounce = setTimeout(runNow, DEBOUNCE_MS);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      runNow({ ripple: true });
    }
  });
  ui.run.addEventListener("click", () => runNow({ ripple: true }));
  ui.reset.addEventListener("click", () => {
    input.value = original;
    render();
    runNow({ ripple: true });
    input.focus();
  });

  render();
  return runNow;
};

const roots = [...document.querySelectorAll("[data-playground]")];

if (roots.length > 0 && "Worker" in window) {
  const evaluate = createEvaluator();
  const runners = new Map();
  for (const root of roots) {
    const run = setupPlayground(root, evaluate);
    if (run) {
      runners.set(root, run);
    }
  }

  // Evaluate each example for real as it approaches the viewport, so the
  // results on screen come from the evaluator rather than the static markup.
  const firstRun = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          firstRun.unobserve(entry.target);
          runners.get(entry.target)?.();
        }
      }
    },
    { rootMargin: "300px 0px" }
  );
  for (const root of runners.keys()) {
    firstRun.observe(root);
  }
}
