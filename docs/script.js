// Shared page behavior for lionlang.dev (navigation, syntax highlighting,
// copy buttons). Intentionally calm — no cursor-chasing tilt or animations.
const { highlight } = await import(
  `./highlight.js${new URL(import.meta.url).search}`
);

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

// Syntax highlighting for static snippets (live editors highlight themselves)
for (const code of document.querySelectorAll("code[data-highlight]")) {
  code.innerHTML = highlight(code.textContent);
}

// Copy buttons for static code blocks
const COPY_ICON =
  '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const CHECK_ICON =
  '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

for (const block of document.querySelectorAll(".code-block:not(.is-live)")) {
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

// Prompt copy buttons
const wirePromptCopy = (button, getText) => {
  const originalLabel = button.textContent?.trim() ?? "Copy prompt";
  let timer = 0;
  button.addEventListener("click", async () => {
    const text = getText();
    if (!text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    clearTimeout(timer);
    button.textContent = "Copied ✓";
    button.classList.add("is-copied");
    timer = setTimeout(() => {
      button.textContent = originalLabel;
      button.classList.remove("is-copied");
    }, 1800);
  });
};

for (const button of document.querySelectorAll("[data-copy-from]")) {
  const selector = button.dataset.copyFrom;
  wirePromptCopy(
    button,
    () =>
      document
        .querySelector(selector)
        ?.textContent?.replace(/\s+/g, " ")
        .trim() ?? ""
  );
}

for (const button of document.querySelectorAll("[data-copy-text]")) {
  wirePromptCopy(button, () => button.dataset.copyText ?? "");
}
