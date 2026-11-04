const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;
const finePointer = window.matchMedia(
  "(hover: hover) and (pointer: fine)"
).matches;

// Navigation
const nav = document.querySelector(".nav");
const menuButton = document.querySelector(".mobile-menu-btn");

const setMenuOpen = (open) => {
  nav?.classList.toggle("is-open", open);
  menuButton?.setAttribute("aria-expanded", String(open));
};

menuButton?.addEventListener("click", () => {
  setMenuOpen(!nav?.classList.contains("is-open"));
});

for (const link of document.querySelectorAll(".mobile-menu a")) {
  link.addEventListener("click", () => setMenuOpen(false));
}

const updateNav = () => {
  nav?.classList.toggle("is-scrolled", window.scrollY > 24);
};
window.addEventListener("scroll", updateNav, { passive: true });
updateNav();

// Syntax highlighting for Lion JSON and the TypeScript snippets
const KEYWORDS = new Set([
  "import",
  "from",
  "const",
  "await",
  "true",
  "false",
  "null",
]);
const SPECIAL_FORMS = new Set([
  "begin",
  "cond",
  "define",
  "eval",
  "function",
  "lambda",
  "match",
  "quote",
]);
const TOKEN_PATTERN =
  /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"?)|(-?\d+(?:\.\d+)?)|([A-Za-z_$][\w$]*)|([[\]{}])|(\s+)|(.)/g;

const KEY_FOLLOWS = /^\s*:/;
const escapeHtml = (text) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const span = (className, text) =>
  `<span class="${className}">${escapeHtml(text)}</span>`;

const stringClass = (text, token, end, isHead) => {
  if (KEY_FOLLOWS.test(text.slice(end))) {
    return "code-key";
  }
  const name = token.slice(1, -1);
  if (isHead && (SPECIAL_FORMS.has(name) || name.includes("/"))) {
    return "code-fn";
  }
  return "code-string";
};

const highlight = (text) => {
  let html = "";
  let isHead = false;
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const [token, comment, string, number, word, bracket, space] = match;
    if (space) {
      html += token;
      continue;
    }
    if (comment) {
      html += span("code-comment", token);
    } else if (string) {
      const end = match.index + token.length;
      html += span(stringClass(text, token, end, isHead), token);
    } else if (number) {
      html += span("code-number", token);
    } else if (word && KEYWORDS.has(word)) {
      html += span("code-keyword", token);
    } else if (bracket) {
      html += span("code-bracket", token);
    } else {
      html += escapeHtml(token);
    }
    isHead = bracket === "[";
  }
  return html;
};

for (const code of document.querySelectorAll("code[data-highlight]")) {
  code.innerHTML = highlight(code.textContent);
}

// Copy buttons
const COPY_ICON =
  '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const CHECK_ICON =
  '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

for (const block of document.querySelectorAll(".code-block")) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy-btn";
  button.setAttribute("aria-label", "Copy code");
  button.innerHTML = COPY_ICON;
  block.append(button);

  button.addEventListener("click", async () => {
    const code = block.querySelector("code")?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      return;
    }
    button.innerHTML = CHECK_ICON;
    button.classList.add("is-copied");
    button.setAttribute("aria-label", "Copied");
    setTimeout(() => {
      button.innerHTML = COPY_ICON;
      button.classList.remove("is-copied");
      button.setAttribute("aria-label", "Copy code");
    }, 1600);
  });
}

// Scroll reveal with a stagger inside each group
const revealables = [...document.querySelectorAll(".reveal")];
for (const element of revealables) {
  const siblings = [...(element.parentElement?.children ?? [])].filter(
    (sibling) => sibling.classList.contains("reveal")
  );
  const index = Math.min(siblings.indexOf(element), 5);
  element.style.setProperty("--reveal-delay", `${index * 70}ms`);
}

if (prefersReducedMotion || !("IntersectionObserver" in window)) {
  for (const element of revealables) {
    element.classList.add("is-visible");
  }
} else {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  for (const element of revealables) {
    revealObserver.observe(element);
  }
}

// Pointer-driven effects: card spotlight, magnetic buttons, tilting panels
const visible = new Set();
const visibilityObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      visible.add(entry.target);
    } else {
      visible.delete(entry.target);
    }
  }
});

const spotlights = [...document.querySelectorAll(".spotlight")];
const magnets = [...document.querySelectorAll(".magnetic")];
const tilts = [...document.querySelectorAll(".tilt")];
const magnetOffsets = new WeakMap();

const updateSpotlight = (element, x, y) => {
  const rect = element.getBoundingClientRect();
  element.style.setProperty("--mx", `${x - rect.left}px`);
  element.style.setProperty("--my", `${y - rect.top}px`);
};

const updateMagnet = (element, x, y) => {
  const rect = element.getBoundingClientRect();
  const [offsetX, offsetY] = magnetOffsets.get(element) ?? [0, 0];
  const dx = x - (rect.left - offsetX + rect.width / 2);
  const dy = y - (rect.top - offsetY + rect.height / 2);
  const near =
    Math.abs(dx) < rect.width / 2 + 36 && Math.abs(dy) < rect.height / 2 + 36;
  const next = near ? [dx * 0.22, dy * 0.32] : [0, 0];
  magnetOffsets.set(element, next);
  element.style.setProperty("--tx", `${next[0]}px`);
  element.style.setProperty("--ty", `${next[1]}px`);
};

const updateTilt = (element, x, y) => {
  const rect = element.getBoundingClientRect();
  const nx = (x - (rect.left + rect.width / 2)) / (window.innerWidth / 2);
  const ny = (y - (rect.top + rect.height / 2)) / (window.innerHeight / 2);
  const clamp = (value) => Math.max(-1, Math.min(1, value));
  const inside =
    x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  element.style.setProperty("--ry", `${clamp(nx) * 7}deg`);
  element.style.setProperty("--rx", `${clamp(ny) * -6}deg`);
  element.style.setProperty("--sx", `${((x - rect.left) / rect.width) * 100}%`);
  element.style.setProperty("--sy", `${((y - rect.top) / rect.height) * 100}%`);
  element.style.setProperty("--sheen", inside ? "1" : "0");
};

const resetPointerEffects = () => {
  for (const element of magnets) {
    magnetOffsets.set(element, [0, 0]);
    element.style.setProperty("--tx", "0px");
    element.style.setProperty("--ty", "0px");
  }
  for (const element of tilts) {
    element.style.setProperty("--rx", "0deg");
    element.style.setProperty("--ry", "0deg");
    element.style.setProperty("--sheen", "0");
  }
};

if (finePointer && !prefersReducedMotion) {
  for (const element of [...spotlights, ...magnets, ...tilts]) {
    visibilityObserver.observe(element);
  }

  let pointerX = 0;
  let pointerY = 0;
  let scheduled = false;

  const applyPointerEffects = () => {
    scheduled = false;
    for (const element of visible) {
      if (element.classList.contains("spotlight")) {
        updateSpotlight(element, pointerX, pointerY);
      }
      if (element.classList.contains("magnetic")) {
        updateMagnet(element, pointerX, pointerY);
      }
      if (element.classList.contains("tilt")) {
        updateTilt(element, pointerX, pointerY);
      }
    }
  };

  window.addEventListener(
    "pointermove",
    (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!scheduled) {
        scheduled = true;
        window.requestAnimationFrame(applyPointerEffects);
      }
    },
    { passive: true }
  );
  document.documentElement.addEventListener(
    "pointerleave",
    resetPointerEffects
  );
}

// Hero: type Lion programs, then "evaluate" them into the background graph.
// Each result is what @lionlang/core returns for the program.
const HERO_PROGRAMS = [
  {
    file: "arithmetic.lion.json",
    code: `["number/add",
  ["number/multiply", 3, 4],
  ["number/subtract", 10, 5]]`,
    result: "17",
  },
  {
    file: "squares.lion.json",
    code: `["array/map",
  ["array/make", 1, 2, 3, 4],
  ["lambda", ["x"],
    ["number/multiply", "x", "x"]]]`,
    result: "[1, 4, 9, 16]",
  },
  {
    file: "increment.lion.json",
    code: `["begin",
  ["define", "inc",
    ["lambda", ["x"], ["number/add", "x", 1]]],
  ["inc", 41]]`,
    result: "42",
  },
  {
    file: "match.lion.json",
    code: `["match", "roar",
  ["value/number?",
    ["lambda", ["x"], ["number/add", "x", 1]]],
  ["value/string?",
    ["lambda", ["x"], ["string/concat", "x", "!"]]],
  ["lambda", ["x"], "x"]]`,
    result: '"roar!"',
  },
  {
    file: "record.lion.json",
    code: `{
  "sum": ["number/add", 1, 2],
  "ok": true
}`,
    result: '{ "sum": 3, "ok": true }',
  },
  {
    file: "reduce.lion.json",
    code: `["array/reduce",
  ["array/make", 1, 2, 3, 4],
  0,
  ["lambda", ["acc", "x"],
    ["number/add", "acc", "x"]]]`,
    result: "10",
  },
];

const heroCode = document.querySelector("[data-hero-code]");
const heroFile = document.querySelector("[data-hero-filename]");
const heroResult = document.querySelector("[data-hero-result]");
const heroValue = document.querySelector("[data-hero-value]");
const hero = document.querySelector(".hero");

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

let heroVisible = true;
let resumeHero = null;

const waitForHero = () =>
  heroVisible && !document.hidden
    ? Promise.resolve()
    : new Promise((resolve) => {
        resumeHero = resolve;
      });

const wakeHero = () => {
  if (heroVisible && !document.hidden && resumeHero) {
    resumeHero();
    resumeHero = null;
  }
};

const CARET = '<span class="caret"></span>';

const typeProgram = async (program) => {
  heroFile.textContent = program.file;
  heroResult.classList.add("is-pending");
  heroValue.textContent = "…";
  heroCode.style.opacity = "1";
  const { code } = program;
  for (let index = 1; index <= code.length; index++) {
    const char = code[index - 1];
    const next = code[index];
    // Indentation appears at once; visible characters are typed.
    if (char === " " && next === " ") {
      continue;
    }
    heroCode.innerHTML = highlight(code.slice(0, index)) + CARET;
    await sleep(char === "\n" ? 140 : 16 + Math.random() * 28);
  }
};

const evaluateProgram = (program) => {
  heroValue.textContent = program.result;
  heroResult.classList.remove("is-pending", "is-flash");
  // Restart the flash animation.
  heroResult.getBoundingClientRect();
  heroResult.classList.add("is-flash");
  const rect = heroResult.getBoundingClientRect();
  window.dispatchEvent(
    new CustomEvent("lion:evaluate", {
      detail: { x: rect.left + 60, y: rect.top + rect.height / 2 },
    })
  );
};

const runHero = async () => {
  heroCode.closest("pre")?.setAttribute("aria-hidden", "true");
  heroResult.setAttribute("aria-hidden", "true");
  let index = 0;
  await sleep(2800);
  for (;;) {
    index = (index + 1) % HERO_PROGRAMS.length;
    const program = HERO_PROGRAMS[index];
    heroCode.style.opacity = "0";
    await sleep(320);
    await waitForHero();
    await typeProgram(program);
    await sleep(420);
    await waitForHero();
    heroCode.innerHTML = highlight(program.code);
    evaluateProgram(program);
    await sleep(3400);
  }
};

if (heroCode && heroFile && heroResult && heroValue && !prefersReducedMotion) {
  if (hero) {
    new IntersectionObserver((entries) => {
      heroVisible = entries.some((entry) => entry.isIntersecting);
      wakeHero();
    }).observe(hero);
  }
  document.addEventListener("visibilitychange", wakeHero);
  runHero();
}
