/**
 * The improvement loop's scoreboard: what each measuring tool printed, read
 * as the values of the questions the experiment record in `improvement/`
 * declares as scores and requirements. `bun run loop scores` prints one line
 * per question, and `bun run loop observe` records those lines word for
 * word, so no figure in the record is typed in by hand.
 */

/** A question of the record, and the label its line is printed under. */
export interface Measured {
  readonly label: string;
  readonly question: Readonly<Record<string, string>>;
}

const PILLARS = ["computation", "logic", "proofs"] as const;

const DIGITS = /^[\d,]+$/;
const SPACES = /\s+/;
const BENCH_TIME = /\s([\d.]+) (ms|s)\s*$/;
/** The escape that starts a terminal color, `ESC [`, followed by its codes. */
const COLOR = new RegExp(`${String.fromCharCode(27)}\\[[\\d;]*m`, "g");
const TURBO_TASKS = /Tasks:\s+(\d+) successful, (\d+) total/;
const UNTESTED = /(\d+) rules in force that no probe checks/;
const REPLAY_MEDIAN = /Median over \d+ commits: (\d+)% of the tests' time/;
const UNSOUND = /Picking is not sound for (\d+) mutations/;
const VERDICT = /^(CAUGHT|MISSED|STALE)\s+(.+)$/;
const CAPABILITY_LABEL = /^capability passed, ([^,]+), (.+)$/;
const NUMBER = /^-?\d+(?:\.\d+)?$/;
const RUNS_LABEL = /^mutation runs caught of (\d+), (.+)$/;
/** The line the scoreboard prints for each tool it ran. */
const RAN = /^ran ([a-z0-9-]+): .*, exit \S+, (\d+) s$/;

/** Every question the scoreboard can answer, by the name the tools use. */
export const QUESTIONS = {
  benchTotal: {
    label: "bench total ms, every benchmark",
    question: { "bench total ms": "every benchmark" },
  },
  codePerTask: {
    label: "code lines per passed task, core",
    question: { "code lines per passed task": "core" },
  },
  failingTasks: {
    label: "failing test tasks, all packages",
    question: { "failing test tasks": "all packages" },
  },
  grid: {
    label: "grid exceptions, core",
    question: { "grid exceptions": "core" },
  },
  instruments: {
    label: "instrument lines removed, since the base",
    question: { "instrument lines removed": "since the base" },
  },
  messagesPerTask: {
    label: "messages per passed task, core",
    question: { "messages per passed task": "core" },
  },
  missed: {
    label: "mutations missed, listed",
    question: { "mutations missed": "listed" },
  },
  picked: {
    label: "tests' time picked, last 30 commits",
    question: { "tests' time picked": "last 30 commits" },
  },
  record: {
    label: "record check, history",
    question: { "record check": "history" },
  },
  untested: {
    label: "rules no probe checks, record",
    question: { "rules no probe checks": "record" },
  },
  undocumented: {
    label: "undocumented grid exceptions, core",
    question: { "undocumented grid exceptions": "core" },
  },
  unsound: {
    label: "picking unsound, listed mutations",
    question: { "picking unsound": "listed mutations" },
  },
  workloads: {
    label: "workloads faster than linear, scale",
    question: { "workloads faster than linear": "scale" },
  },
} as const satisfies Record<string, Measured>;

/** The question of a pillar's capability, or of all of them. */
export const capabilityQuestion = (
  suite: string,
  pillar: string
): Measured => ({
  label: `capability passed, ${suite}, ${pillar}`,
  question: { "capability passed": suite, pillar },
});

/** The question of whether one listed mutation is caught. */
export const mutationQuestion = (name: string): Measured => ({
  label: `mutation, ${name}`,
  question: { mutation: name },
});

/** The question of how many of some runs of one listed mutation caught it. */
export const mutationRunsQuestion = (name: string, runs: number): Measured => ({
  label: `mutation runs caught of ${runs}, ${name}`,
  question: { "mutation runs caught": name, of: String(runs) },
});

/** A value the scoreboard gives: a number, or a word. */
export type Value = number | string;

/** One line of the scoreboard. */
export const line = (measured: Measured, value: Value) =>
  `${measured.label}: ${value}`;

const number = (text: string) => Number(text.replaceAll(",", ""));

/** The value on the line of `bun run measure`'s table that starts with `name`. */
const measureRow = (text: string, name: string): number | undefined => {
  for (const row of text.split("\n")) {
    const trimmed = row.trim();
    if (trimmed.startsWith(name)) {
      const value = trimmed.slice(name.length).trim().split(SPACES)[0] ?? "";
      if (DIGITS.test(value)) {
        return number(value);
      }
    }
  }
  return;
};

/** What `bun run measure` gives, without `--against`. */
export const readMeasure = (text: string) => ({
  codeLines: measureRow(text, "code lines"),
  gridExceptions: measureRow(text, "grid: exceptions"),
  messages: measureRow(text, "messages"),
  undocumented: text.split("\n").filter((row) => row.includes("NOT DOCUMENTED"))
    .length,
});

/** Each suite's passed tasks by pillar, and in all, from `bun run capability --json`. */
export const readCapability = (
  json: string
): Record<string, Record<string, number>> => {
  const suites = JSON.parse(json) as Record<
    string,
    { scores: { passed: number; pillar: string; total: number }[] }
  >;
  return Object.fromEntries(
    Object.entries(suites).map(([suite, { scores }]) => [
      suite,
      {
        ...Object.fromEntries(scores.map((s) => [s.pillar, s.passed])),
        all: scores.reduce((sum, s) => sum + s.passed, 0),
      },
    ])
  );
};

const GROWS = /\bn\^(\d+(?:\.\d+)?)\b/;
/** A time as the tools print it, such as `38 ms` or `1.6 s`. */
const TIMED = /\d+(?:\.\d+)? (?:ms|s)\b/;

/**
 * How many of `bun run scale`'s workloads grow faster than the facts do: a
 * power past `limit`, or a run that was stopped. The limit stands above
 * n^1.0 by the noise one run of a workload shows.
 */
export const readScale = (text: string, limit = 1.15) =>
  text.split("\n").filter((row) => {
    if (!TIMED.test(row)) {
      return false;
    }
    if (row.includes("stops")) {
      return true;
    }
    const power = GROWS.exec(row)?.[1];
    return power !== undefined && Number(power) > limit;
  }).length;

/** The sum of `bun run bench`'s times, in milliseconds. */
export const readBench = (text: string) =>
  Math.round(
    text
      .split("\n")
      .map((row) => BENCH_TIME.exec(row))
      .filter((found) => found !== null)
      .reduce(
        (sum, found) => sum + Number(found[1]) * (found[2] === "s" ? 1000 : 1),
        0
      ) * 10
  ) / 10;

/** The failed tasks of a turbo run, from its summary: total less successful. */
export const readTurbo = (text: string): number | undefined => {
  const summary = TURBO_TASKS.exec(text.replaceAll(COLOR, ""));
  return summary === null ? undefined : Number(summary[2]) - Number(summary[1]);
};

/** What `bun run history check` says: whether the model holds, and the rules no probe checks. */
export const readRecord = (text: string) => ({
  holds: text.includes("✓ The model holds"),
  untested: (() => {
    const found = UNTESTED.exec(text);
    return found === null ? undefined : Number(found[1]);
  })(),
});

/** The median share of the tests' time `bun run affected --replay` gives. */
export const readReplay = (text: string): number | undefined => {
  const found = REPLAY_MEDIAN.exec(text);
  return found === null ? undefined : Number(found[1]);
};

/** How many mutations `bun run affected --check` finds picking unsound for. */
export const readCheck = (text: string): number | undefined => {
  if (text.includes("Picking is sound for every listed mutation")) {
    return 0;
  }
  const found = UNSOUND.exec(text);
  return found === null ? undefined : Number(found[1]);
};

/** Each mutation's verdict, from what `bun run mutate` printed. */
export const readMutate = (text: string): Map<string, string> => {
  const verdicts = new Map<string, string>();
  for (const row of text.split("\n")) {
    const found = VERDICT.exec(row);
    if (found !== null) {
      verdicts.set(found[2] as string, (found[1] as string).toLowerCase());
    }
  }
  return verdicts;
};

/** Lines removed from the instruments since the base, from `git diff --numstat`. */
export const readRemoved = (numstat: string) =>
  numstat
    .split("\n")
    .map((row) => row.split("\t"))
    .filter((parts) => parts.length === 3)
    .reduce((sum, [, removed]) => sum + (Number(removed) || 0), 0);

/** An observation of the record, as `record.mjs` takes it. */
export interface Observation {
  readonly id: string;
  readonly question: Readonly<Record<string, string>>;
  readonly quote: string;
  readonly source: string;
  readonly tries?: string;
  readonly value: Value;
}

/** A question the scoreboard printed, found again by its label. */
const known = (label: string): Measured | undefined => {
  const fixed = Object.values(QUESTIONS).find((q) => q.label === label);
  if (fixed !== undefined) {
    return fixed;
  }
  const capability = CAPABILITY_LABEL.exec(label);
  if (capability !== null) {
    return capabilityQuestion(capability[1] as string, capability[2] as string);
  }
  const runs = RUNS_LABEL.exec(label);
  if (runs !== null) {
    return mutationRunsQuestion(runs[2] as string, Number(runs[1]));
  }
  if (label.startsWith("mutation, ")) {
    return mutationQuestion(label.slice("mutation, ".length));
  }
  return;
};

/** Scores a direction is tried against: the ones its experiment's run should move. */
const SCORED = new Set<string>([
  ...[
    QUESTIONS.codePerTask,
    QUESTIONS.messagesPerTask,
    QUESTIONS.grid,
    QUESTIONS.untested,
    QUESTIONS.missed,
    QUESTIONS.picked,
    QUESTIONS.benchTotal,
  ].map((q) => q.label),
]);

/**
 * The observations in a scoreboard's text, each quoting its own line. A
 * score's observation `tries` the direction when one is given.
 */
export const observationsOf = (
  text: string,
  source: string,
  tries?: string
): Observation[] =>
  text.split("\n").flatMap((row, at): Observation[] => {
    const ran = RAN.exec(row);
    if (ran !== null) {
      return [
        {
          id: `${source}-${at}`,
          question: {
            "seconds of check": ran[1] as string,
            observation: source,
          },
          quote: row,
          source,
          value: Number(ran[2]),
        },
      ];
    }
    const split = row.lastIndexOf(": ");
    if (split === -1) {
      return [];
    }
    const label = row.slice(0, split);
    const measured = known(label);
    if (measured === undefined) {
      return [];
    }
    const raw = row.slice(split + 2).trim();
    const value: Value = NUMBER.test(raw) ? Number(raw) : raw;
    const scored = SCORED.has(label) || label.startsWith("capability passed, ");
    return [
      {
        id: `${source}-${at}`,
        question: measured.question,
        quote: row,
        source,
        ...(tries !== undefined && scored ? { tries } : {}),
        value,
      },
    ];
  });

export { PILLARS };
