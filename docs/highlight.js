// Syntax highlighting for Lion JSON and the TypeScript snippets.
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
  "relation",
  "rule",
  "fact",
  "retract",
  "query",
  "find",
  "why",
  "not",
  "and",
  "or",
  "=",
  "in",
  "snapshot",
  "invariant",
]);
const LOGIC_VARIABLE = /^\?[A-Za-z_][\w-]*$/;
const TOKEN_PATTERN =
  /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"?)|(-?\d+(?:\.\d+)?)|([A-Za-z_$][\w$]*)|([[\]{}])|(\s+)|(.)/g;
const KEY_FOLLOWS = /^\s*:/;

export const escapeHtml = (text) =>
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
  if (LOGIC_VARIABLE.test(name)) {
    return "code-var";
  }
  return "code-string";
};

export const highlight = (text) => {
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
