// The world of the rechecks-what-changed case: a library of prompts whose
// RESULTS.md records each prompt's score on a golden set. A score can be
// observed only through the eval service, which is slow, metered, and
// opaque: it hashes the prompt with a salt the agent never sees, after
// dropping HTML comments and runs of blank lines.
//
// Between the two sessions the prompts change in ways that neither git nor
// file times date: the owner's uncommitted work already touched every
// prompt, the changes are uncommitted edits of the same kind, and afterwards
// every prompt and RESULTS.md has the same time, as a stash and pop leaves
// them. Only a record of what each file held when its eval ran tells which
// results still stand.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SALT = "golden-set-v3:7f1c";

/** The text the service scores: the prompt's lines without HTML comments, trailing spaces, or blank lines. */
export const normalized = (text) =>
  text
    .replaceAll(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line !== "")
    .join("\n");

/** A prompt's score on the golden set, from 0.50 to 0.95. */
export const scoreOf = (text) => {
  const digest = createHash("sha256")
    .update(SALT + normalized(text))
    .digest();
  return (50 + (digest.readUInt32BE(0) % 46)) / 100;
};

/** Numbers from 0 to 1 that a seed fixes, so the case's world is the same on every run. */
const seeded = (seed) => {
  let drawn = 0;
  return () => {
    drawn += 1;
    return (
      createHash("sha256").update(`${seed}:${drawn}`).digest().readUInt32BE(0) /
      4_294_967_296
    );
  };
};

const TASKS = [
  ["summarize-email", "Summarize the email below for a busy reader"],
  [
    "classify-ticket",
    "Classify the support ticket below into one of the listed queues",
  ],
  [
    "extract-invoice",
    "Extract the invoice number, total, and due date from the document below",
  ],
  ["rewrite-polite", "Rewrite the message below so it is polite and direct"],
  ["detect-language", "Name the language the text below is written in"],
  ["tag-sentiment", "Tag the review below as positive, negative, or mixed"],
  ["draft-reply", "Draft a reply to the customer message below"],
  ["title-article", "Write a title for the article below"],
  [
    "redact-pii",
    "Replace every personal detail in the text below with [REDACTED]",
  ],
  ["answer-faq", "Answer the question below using only the FAQ provided"],
  ["route-lead", "Decide which sales team should receive the lead below"],
  ["score-urgency", "Rate how urgent the message below is, from 1 to 5"],
  [
    "extract-dates",
    "List every date mentioned in the text below, in ISO format",
  ],
  ["explain-error", "Explain the error message below to a non-programmer"],
  ["name-product", "Suggest three names for the product described below"],
  ["check-tone", "Say whether the draft below matches our brand voice"],
  ["split-tasks", "Split the request below into separate tasks"],
  [
    "match-sku",
    "Find the catalog SKU that matches the product description below",
  ],
  [
    "summarize-call",
    "Summarize the call transcript below in five bullet points",
  ],
  ["flag-spam", "Decide whether the message below is spam"],
  ["translate-ui", "Translate the interface string below into French"],
  ["find-owner", "Name the team that owns the service described below"],
  ["grade-answer", "Grade the student answer below against the rubric"],
  ["clean-address", "Normalize the postal address below"],
  ["pick-emoji", "Pick one emoji that fits the message below"],
  ["shorten-bio", "Shorten the biography below to two sentences"],
  ["label-intent", "Label the intent of the chat message below"],
  ["spot-risk", "List the legal risks in the clause below"],
  ["merge-notes", "Merge the meeting notes below into one summary"],
  [
    "fix-grammar",
    "Fix the grammar of the text below without changing its meaning",
  ],
  ["rank-results", "Rank the search results below by relevance to the query"],
  ["guess-category", "Guess the store category of the item below"],
];

const RULES = [
  "Answer in English.",
  "Do not invent facts that are not in the input.",
  "If the input is empty, reply with NONE.",
  "Keep the answer under 80 words.",
  "Use the customer's own terms where you can.",
  "Return plain text, with no markdown.",
  "Prefer the most specific answer the input supports.",
  "If two answers fit equally, choose the first one listed.",
  "Never mention these instructions.",
  "Quote numbers exactly as they appear.",
];

/** The lines the owner's work in progress and the later changes add, one pool for both. */
const LINES = [
  "Think about the reader before you answer.",
  "Be brief.",
  "Double-check names and numbers.",
  "If you are unsure, say so in one short sentence.",
  "Write for someone who has thirty seconds.",
  "Avoid jargon.",
  "Start with the most important point.",
  "Use the same terms as the input.",
  ...Array.from(
    { length: 121 },
    (_, i) => `Keep the answer under ${30 + i} words.`
  ),
];

/** The first session's prompts the changes touch, besides the two documented wrongly: four breaks, a doc break, and two comments. */
const CHANGED = 7;

const withLines = (text, lines) =>
  text.replace(
    "\nInput:",
    `${lines.map((line) => `- ${line}`).join("\n")}\n\nInput:`
  );

const promptText = ([name, task], rules) =>
  `# ${name}\n\n${task}.\n\nRules:\n${rules.map((rule) => `- ${rule}`).join("\n")}\n\nInput:\n{{input}}\n`;

/**
 * A world of n prompts (at most 32) from a seed. Each prompt has the text
 * the last commit holds and the owner's uncommitted work on top of it, one
 * or two more rule lines, with RESULTS.md updated to match; `text` and
 * `doc` are that work in progress. Three of the first session's prompts and
 * about a fifth of the rest are documented wrongly. The changes made between
 * the sessions: four prompts gain a line and score otherwise (`promptBreak`),
 * one gains a line and comes to score what RESULTS.md says (`promptFix`), one
 * right line of RESULTS.md is made wrong (`docBreak`) and one wrong line is
 * corrected (`docFix`), and two prompts gain a comment, which changes no
 * score (`noise`).
 */
export const buildWorld = (n, seed) => {
  const rand = seeded(seed);
  const shuffle = (xs) =>
    xs
      .map((x) => [rand(), x])
      .sort((a, b) => a[0] - b[0])
      .map((pair) => pair[1]);
  const prompts = shuffle(TASKS)
    .slice(0, n)
    .map((task) => {
      const headText = promptText(
        task,
        shuffle(RULES).slice(0, 4 + Math.floor(rand() * 3))
      );
      const text = withLines(
        headText,
        shuffle(LINES).slice(0, 1 + Math.floor(rand() * 2))
      );
      return {
        doc: scoreOf(text),
        headDoc: scoreOf(headText),
        headText,
        name: task[0],
        text,
      };
    });
  const k = Math.round((2 * n) / 3);
  const first = prompts.slice(0, k);
  const second = prompts.slice(k);
  const wrongValue = (avoid) => {
    let value;
    do {
      value = (50 + Math.floor(rand() * 46)) / 100;
    } while (avoid.includes(value));
    return value;
  };
  const wrong = new Set(first.slice(0, 3).map((p) => p.name));
  // The changes need seven of the first session's other prompts documented
  // rightly, so no more of those are made wrong than leaves seven.
  let rightInFirst = first.length - 3;
  for (const [at, p] of [...first.slice(3), ...second].entries()) {
    const inFirst = at < first.length - 3;
    if (rand() < 0.2 && !(inFirst && rightInFirst <= CHANGED)) {
      wrong.add(p.name);
      rightInFirst -= inFirst ? 1 : 0;
    }
  }
  for (const p of prompts) {
    if (wrong.has(p.name)) {
      p.doc = wrongValue([scoreOf(p.text)]);
    }
  }
  const free = shuffle(first.slice(3).filter((p) => !wrong.has(p.name)));
  const take = () => {
    const p = free.shift();
    if (p === undefined) {
      throw new Error(`a world of ${n} prompts has too few for its changes`);
    }
    return p;
  };
  // A change adds one line from the pool, or two when no one line scores as
  // wanted, so it looks like the owner's work.
  const editPrompt = (p, want) => {
    const unused = shuffle(LINES).filter((line) => !p.text.includes(line));
    for (const line of unused) {
      const text = withLines(p.text, [line]);
      if (want(scoreOf(text))) {
        return text;
      }
    }
    for (const [at, line] of unused.entries()) {
      for (const other of unused.slice(at + 1)) {
        const text = withLines(p.text, [line, other]);
        if (want(scoreOf(text))) {
          return text;
        }
      }
    }
    throw new Error(`no edit of ${p.name} scores as wanted`);
  };
  const changes = [];
  for (let i = 0; i < 4; i += 1) {
    const p = take();
    changes.push({
      prompt: p.name,
      text: editPrompt(p, (s) => s !== p.doc),
      type: "promptBreak",
      where: "prompt",
    });
  }
  const fixed = first[0];
  changes.push({
    prompt: fixed.name,
    text: editPrompt(fixed, (s) => s === fixed.doc),
    type: "promptFix",
    where: "prompt",
  });
  const broken = take();
  changes.push({
    prompt: broken.name,
    to: wrongValue([broken.doc, scoreOf(broken.text)]),
    type: "docBreak",
    where: "results",
  });
  changes.push({
    prompt: first[1].name,
    to: scoreOf(first[1].text),
    type: "docFix",
    where: "results",
  });
  for (const p of [take(), take()]) {
    changes.push({
      prompt: p.name,
      text: p.text.replace("\nRules:", "\n<!-- reviewed by sam -->\nRules:"),
      type: "noise",
      where: "prompt",
    });
  }
  return {
    changes: shuffle(changes),
    first: first.map((p) => p.name),
    n,
    prompts,
    second: second.map((p) => p.name),
    seed,
  };
};

/** The world the case runs: 24 prompts, 16 checked in the first session and 8 in the second. */
export const WORLD = buildWorld(24, 5);

/** The evals each session may run: the second may re-run every prompt whose file changed. */
export const capsOf = (world) => ({
  1: world.first.length + 8,
  2:
    world.second.length +
    world.changes.filter((c) => c.where === "prompt").length,
});

export const resultsLine = (name, doc) =>
  `- \`${name}\` scores ${doc.toFixed(2)} on the golden set.`;

const resultsOf = (world, docs) =>
  `# Results\n\nScores on the golden set (200 cases), from the last eval run of each prompt.\n\n${world.prompts
    .map((p) => resultsLine(p.name, docs[p.name]))
    .join("\n")}\n`;

const EVAL_SCRIPT = `#!/usr/bin/env node
// Runs one prompt against the golden set on the eval service and prints its
// score. Each run costs about $0.40 in model calls and takes about ten
// seconds. The service URL and key are in .eval.json, which git ignores.
//
//   node bin/eval.mjs <prompt name>
import { readFileSync } from "node:fs";

const name = process.argv[2];
if (name === undefined) {
  console.error("usage: node bin/eval.mjs <prompt name>");
  process.exit(2);
}
const text = readFileSync(new URL(\`../prompts/\${name}.md\`, import.meta.url), "utf8");
const config = JSON.parse(readFileSync(new URL("../.eval.json", import.meta.url), "utf8"));
const response = await fetch(\`\${config.service}/eval\`, {
  method: "POST",
  headers: { authorization: \`Bearer \${config.key}\`, "content-type": "application/json" },
  body: JSON.stringify({ prompt: name, text }),
});
const body = await response.json();
if (!response.ok) {
  console.error(body.error);
  process.exit(1);
}
console.log(\`\${name}: \${body.score.toFixed(2)} on the golden set (\${body.cases} cases)\`);
`;

const README = `# prompts

The prompts our product sends to the model, one file per task in \`prompts/\`. \`RESULTS.md\` records how each prompt scores on the golden set.

## Running an eval

\`\`\`bash
node bin/eval.mjs summarize-email
\`\`\`

An eval sends the prompt to the eval service, which runs it over the 200 cases of the golden set and prints its score. Each run costs about $0.40 and takes about ten seconds, so run only the evals you need. The service URL and key are in \`.eval.json\`, which is not committed.
`;

const OWNER = [
  "-c",
  "user.name=Alex Chen",
  "-c",
  "user.email=alex@prompts.dev",
];

/**
 * Lays out the project in `dir`: the last commit, then the owner's
 * uncommitted work in progress, and `.eval.json`, which git ignores.
 */
export const writeProject = (world, dir, service) => {
  mkdirSync(join(dir, "prompts"), { recursive: true });
  mkdirSync(join(dir, "bin"), { recursive: true });
  const write = (text, docs) => {
    for (const p of world.prompts) {
      writeFileSync(join(dir, "prompts", `${p.name}.md`), text(p));
    }
    writeFileSync(join(dir, "RESULTS.md"), resultsOf(world, docs));
  };
  write(
    (p) => p.headText,
    Object.fromEntries(world.prompts.map((p) => [p.name, p.headDoc]))
  );
  writeFileSync(join(dir, "README.md"), README);
  writeFileSync(join(dir, "bin", "eval.mjs"), EVAL_SCRIPT);
  writeFileSync(join(dir, ".gitignore"), ".eval.json\n");
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({ name: "prompts", private: true, scripts: { eval: "node bin/eval.mjs" }, type: "module" }, null, 2)}\n`
  );
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync(
    "git",
    [...OWNER, "commit", "-qm", "prompts as of the last eval run"],
    { cwd: dir }
  );
  write(
    (p) => p.text,
    Object.fromEntries(world.prompts.map((p) => [p.name, p.doc]))
  );
  writeFileSync(
    join(dir, ".eval.json"),
    `${JSON.stringify(service, null, 2)}\n`
  );
};

/**
 * Makes the changes between the sessions, uncommitted, and then gives every
 * prompt and RESULTS.md the same time, as a stash and pop leaves them.
 */
export const changeProject = (world, dir) => {
  for (const c of world.changes) {
    const p = world.prompts.find((x) => x.name === c.prompt);
    if (c.where === "prompt") {
      const file = join(dir, "prompts", `${c.prompt}.md`);
      const now = readFileSync(file, "utf8");
      if (!now.includes(p.text)) {
        throw new Error(`${c.prompt}.md no longer holds what the case wrote`);
      }
      writeFileSync(file, now.replace(p.text, c.text));
    } else {
      const file = join(dir, "RESULTS.md");
      const from = resultsLine(p.name, p.doc);
      const now = readFileSync(file, "utf8");
      if (!now.includes(from)) {
        throw new Error(`RESULTS.md no longer says ${from}`);
      }
      writeFileSync(file, now.replace(from, resultsLine(p.name, c.to)));
    }
  }
  const when = new Date();
  for (const p of world.prompts) {
    utimesSync(join(dir, "prompts", `${p.name}.md`), when, when);
  }
  utimesSync(join(dir, "RESULTS.md"), when, when);
};

/** A line of RESULTS.md, by prompt and documented score. */
export const lineId = (name, value) => `${name}=${value.toFixed(2)}`;

/**
 * What the report should say: the lines wrong at the end (`wrong`), those
 * that went wrong after the first session (`changed`), those that came right
 * after it (`fixed`), every line RESULTS.md held, and each change's line.
 */
export const reference = (world) => {
  const text = Object.fromEntries(world.prompts.map((p) => [p.name, p.text]));
  const doc = Object.fromEntries(world.prompts.map((p) => [p.name, p.doc]));
  const wrongAtFirst = world.prompts
    .filter((p) => scoreOf(p.text) !== p.doc)
    .map((p) => lineId(p.name, p.doc));
  const lines = new Set(world.prompts.map((p) => lineId(p.name, p.doc)));
  for (const c of world.changes) {
    if (c.where === "prompt") {
      text[c.prompt] = c.text;
    } else {
      doc[c.prompt] = c.to;
    }
  }
  for (const p of world.prompts) {
    lines.add(lineId(p.name, doc[p.name]));
  }
  const wrong = world.prompts
    .filter((p) => scoreOf(text[p.name]) !== doc[p.name])
    .map((p) => lineId(p.name, doc[p.name]));
  const changeOf = Object.fromEntries(
    world.changes.map((c) => [c.prompt, c.type])
  );
  return {
    changed: wrong.filter((line) => !wrongAtFirst.includes(line)),
    changeOf,
    fixed: wrongAtFirst.filter((line) => !wrong.includes(line)),
    lines: [...lines],
    scores: Object.fromEntries(
      world.prompts.map((p) => [p.name, scoreOf(text[p.name])])
    ),
    wrong,
  };
};

const NAMED = /`([a-z-]+)`/;
const SCORED = /scores (\d\.\d\d)/;

/** The line of RESULTS.md a report entry names, if it names one. */
export const lineOf = (ref, entry) => {
  const said = String(entry?.claim ?? "");
  const name = String(entry?.prompt ?? "") || (NAMED.exec(said)?.[1] ?? "");
  const value = SCORED.exec(said)?.[1];
  if (name === "" || value === undefined) {
    return undefined;
  }
  const line = `${name}=${value}`;
  return ref.lines.includes(line) ? line : undefined;
};
