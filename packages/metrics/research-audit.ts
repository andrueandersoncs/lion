// Audits finished lion-research eval runs across four dimensions:
// 1. Substantive accuracy (frozen grade.mjs checks passed / total)
// 2. Formal proof rigor (proof/bounds, proof/prove, proof/valid?, proof/rules,
//    obligation/closed_obligation, assuming, time/, graph/, and 0 vertex cheats)
// 3. Live counterfactual reactivity (for coupled-ledger models: injects a newer
//    restatement changing GridScale cap 290 -> 260 and checks whether the model
//    automatically recomputes the exact new min gross margin 28.58%)
// 4. Efficiency (cost USD, turns, minutes, frame size in bytes)
//
// Usage:
//   bun run research-audit [run-folder ...]
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { gradeOf, spentOf } from "./src/skill-eval.ts";
import { REPOSITORY } from "./src/sources.ts";

const CASES = [
  "verifies-company-figures",
  "audits-merger-bounds",
  "investigates-incident-sla",
  "reconciles-coupled-ledger",
  "audits-orbital-portfolio",
] as const;

const LION_CLI =
  process.env.LION_CLI ??
  `bun ${join(REPOSITORY, "packages/cli/dist/bin.mjs")}`;

const SPACES = /\s+/;
const NEW_MIN_MARGIN_RE = /28\.58|343\/1200|137\.2\/480/;
const NEW_SOLSTICE_MAX_REV_RE = /\b128(\.00?)?\b/;

interface AuditRow {
  readonly assuming: number;
  readonly bounds: number;
  readonly caseName: string;
  readonly closed: number;
  readonly costUsd: number | undefined;
  readonly failures: readonly string[];
  readonly folder: string;
  readonly frameBytes: number;
  readonly graph: number;
  readonly influence: number;
  readonly liveReactive: "pass" | "fail" | "n/a";
  readonly minutes: number | undefined;
  readonly oblig: number;
  readonly passed: number;
  readonly persist: number;
  readonly prove: number;
  readonly retractWhere: number;
  readonly rules: number;
  readonly sensitivity: number;
  readonly time: number;
  readonly total: number;
  readonly turns: number | undefined;
  readonly valid: number;
  readonly vertexCheat: number;
}

const caseOf = (folderName: string): string | undefined =>
  CASES.find((name) => folderName.includes(name));

const researchFolderOf = (run: string): string => {
  const root = join(run, "research");
  if (!existsSync(root)) {
    return run;
  }
  const found = readdirSync(root)
    .map((entry) => join(root, entry))
    .find((folder) => existsSync(join(folder, "model.json")));
  return found ?? run;
};

const runLion = (program: unknown, modelPath: string): unknown => {
  const scratch = mkdtempSync(join(tmpdir(), "lion-audit-"));
  try {
    const db = join(scratch, "model.json");
    copyFileSync(modelPath, db);
    const prog = join(scratch, "program.json");
    writeFileSync(prog, JSON.stringify(program));
    const [cmd, ...rest] = LION_CLI.trim().split(SPACES);
    const res = spawnSync(cmd ?? "bun", [...rest, prog, "--database", db], {
      encoding: "utf8",
    });
    if (res.status !== 0) {
      return undefined;
    }
    return JSON.parse(res.stdout);
  } catch {
    return undefined;
  } finally {
    rmSync(scratch, { force: true, recursive: true });
  }
};

const replaceValue = (
  value: unknown,
  from: number,
  to: number
): { changed: boolean; next: unknown } => {
  if (value === from) {
    return { changed: true, next: to };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const r = replaceValue(item, from, to);
      if (r.changed) {
        changed = true;
      }
      return r.next;
    });
    return { changed, next };
  }
  if (typeof value === "object" && value !== null) {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const r = replaceValue(v, from, to);
      if (r.changed) {
        changed = true;
      }
      out[k] = r.next;
    }
    return { changed, next: out };
  }
  return { changed: false, next: value };
};

/**
 * Tests whether a coupled-ledger or orbital-portfolio model is genuinely
 * live-reactive by injecting a newer restatement from the same publisher:
 * - reconciles-coupled-ledger: GridScale cap 290 -> 260, checks 28.58%
 * - audits-orbital-portfolio: Rebate cap 36 -> 32, checks $128M max revenue
 */
const REACTIVITY_SPECS: Readonly<
  Record<
    string,
    {
      readonly from: number;
      readonly to: number;
      readonly expectRe: RegExp;
      readonly url: string;
      readonly fallbackQuote: string;
    }
  >
> = {
  "audits-orbital-portfolio": {
    expectRe: NEW_SOLSTICE_MAX_REV_RE,
    fallbackQuote: "Amended rebate schedule satisfies P + 2N <= 32.0 ($M).",
    from: 36,
    to: 32,
    url: "https://sec.example/solstice/8k-amend",
  },
  "reconciles-coupled-ledger": {
    expectRe: NEW_MIN_MARGIN_RE,
    fallbackQuote: "Amended GridScale cap is no more than $260.0 million.",
    from: 290,
    to: 260,
    url: "https://sec.example/vespera/8k-amend",
  },
};

const testLiveReactivity = (
  caseName: string,
  researchDir: string
): "pass" | "fail" | "n/a" => {
  const spec = REACTIVITY_SPECS[caseName];
  if (spec === undefined) {
    return "n/a";
  }
  const modelPath = join(researchDir, "model.json");
  if (!existsSync(modelPath)) {
    return "fail";
  }
  const claims = runLion(
    [
      "query",
      [
        "and",
        ["claim", "?id", "?src", "?quote", "?says"],
        ["source", "?src", "?_", "?_", "?pub", "?kind", "?pubdate"],
      ],
    ],
    modelPath
  ) as
    | {
        id: string;
        kind: string;
        pub: string;
        pubdate: number;
        quote: string;
        says: unknown;
        src: string;
      }[]
    | undefined;
  if (!Array.isArray(claims)) {
    return "fail";
  }
  const target = claims.find(
    (c) => replaceValue(c.says, spec.from, spec.to).changed
  );
  if (target === undefined) {
    return "fail";
  }
  const updatedSays = replaceValue(target.says, spec.from, spec.to).next;
  const updatedQuote = target.quote.includes(String(spec.from))
    ? target.quote.replaceAll(String(spec.from), String(spec.to))
    : spec.fallbackQuote;

  const scratch = mkdtempSync(join(tmpdir(), "lion-counterfactual-"));
  try {
    const db = join(scratch, "model.json");
    copyFileSync(modelPath, db);
    const stepFile = join(scratch, "amend.json");
    const amend = [
      "fact",
      [
        "source",
        "audit-amend-8k",
        ["quote", spec.url],
        ["quote", "Form 8-K Amended Cap"],
        ["quote", target.pub],
        target.kind,
        20_260_901,
      ],
      [
        "claim",
        "audit-c-amend",
        "audit-amend-8k",
        ["quote", updatedQuote],
        ["quote", updatedSays],
      ],
    ];
    writeFileSync(stepFile, JSON.stringify(amend));
    const [cmd, ...rest] = LION_CLI.trim().split(SPACES);
    const apply = spawnSync(
      cmd ?? "bun",
      [...rest, stepFile, "--database", db],
      {
        encoding: "utf8",
      }
    );
    if (apply.status !== 0) {
      return "fail";
    }
    const outputs: unknown[] = [];
    const pageCheckPath = join(researchDir, "page-check.json");
    if (existsSync(pageCheckPath)) {
      const pageProg = JSON.parse(readFileSync(pageCheckPath, "utf8"));
      outputs.push(runLion(pageProg, db));
    }
    outputs.push(
      runLion(["query", ["closed_obligation", "?ob", "?status", "?detail"]], db)
    );
    const text = JSON.stringify(outputs);
    return spec.expectRe.test(text) ? "pass" : "fail";
  } catch {
    return "fail";
  } finally {
    rmSync(scratch, { force: true, recursive: true });
  }
};

const auditRun = (runPath: string): AuditRow | undefined => {
  const name = basename(runPath);
  const caseName = caseOf(name);
  if (caseName === undefined) {
    return undefined;
  }
  const researchDir = researchFolderOf(runPath);
  const grader = join(
    REPOSITORY,
    "skills",
    "lion-research",
    "evals",
    caseName,
    "grade.mjs"
  );
  const graded = spawnSync("node", [grader, researchDir], {
    encoding: "utf8",
    env: { ...process.env, LION_CLI },
  });
  const grades = gradeOf(graded.stdout ?? "");
  const agentPath = join(runPath, "agent.json");
  const spent = spentOf(
    existsSync(agentPath) ? readFileSync(agentPath, "utf8") : ""
  );

  const stepsDir = join(researchDir, "steps");
  let stepsText = "";
  let frameBytes = 0;
  if (existsSync(stepsDir)) {
    for (const file of readdirSync(stepsDir).sort()) {
      const full = join(stepsDir, file);
      if (file.startsWith("01-frame")) {
        frameBytes += statSync(full).size;
      }
      if (!file.startsWith("00-core")) {
        stepsText += `\n${readFileSync(full, "utf8")}`;
      }
    }
  }
  const count = (re: RegExp) => (stepsText.match(re) ?? []).length;

  return {
    assuming: count(/"assuming"/g),
    bounds: count(/"proof\/bounds"/g),
    caseName,
    closed: count(/"closed_obligation"/g),
    costUsd: spent.costUsd,
    failures: grades.failures,
    folder: relative(REPOSITORY, runPath),
    frameBytes,
    graph: count(/"graph\/(cycles|dominators)"/g),
    influence: count(/"graph\/influence"/g),
    liveReactive: testLiveReactivity(caseName, researchDir),
    minutes: spent.minutes,
    oblig: count(/"obligation"/g),
    passed: grades.passed,
    persist: count(/"persist"\s*:\s*true/g),
    prove: count(/"proof\/prove"/g),
    retractWhere: count(/"where"\s*:/g),
    rules: count(/"proof\/rules"/g),
    sensitivity: count(/"proof\/sensitivity"/g),
    time: count(/"time\/(parse|diff|add|format)"/g),
    total: grades.total,
    turns: spent.turns,
    valid: count(/"proof\/valid\?"/g),
    vertexCheat: count(/"vertex"/g),
  };
};

const targets =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2).map((p) => resolve(REPOSITORY, p))
    : readdirSync(join(REPOSITORY, "out", "skill-eval"))
        .sort()
        .map((entry) => join(REPOSITORY, "out", "skill-eval", entry))
        .filter((p) => statSync(p).isDirectory());

const rows = targets
  .map(auditRun)
  .filter((row): row is AuditRow => row !== undefined);

const header = [
  "run",
  "score",
  "cost",
  "min",
  "turns",
  "frameKB",
  "bounds",
  "prove",
  "valid?",
  "sens/inf/rw",
  "oblig",
  "time/g",
  "cheat",
  "live?",
];
console.log(header.join("\t"));
for (const r of rows) {
  const shortRun = basename(r.folder).replace("lion-research-", "");
  console.log(
    [
      shortRun,
      `${r.passed}/${r.total}`,
      r.costUsd === undefined ? "-" : `$${r.costUsd.toFixed(2)}`,
      r.minutes === undefined ? "-" : r.minutes.toFixed(1),
      r.turns ?? "-",
      (r.frameBytes / 1024).toFixed(1),
      r.bounds,
      r.prove,
      r.valid,
      `${r.sensitivity}/${r.influence}/${r.retractWhere}`,
      `${r.closed}/${r.oblig}`,
      `${r.time}/${r.graph}`,
      r.vertexCheat,
      r.liveReactive,
    ].join("\t")
  );
  for (const f of r.failures) {
    console.log(`    FAIL: ${f}`);
  }
}
