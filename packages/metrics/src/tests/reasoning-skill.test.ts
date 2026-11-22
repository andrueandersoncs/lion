/**
 * The lion-reasoning skill ships a Lion program, `assets/core.json`, whose
 * rules say which observations speak for each version of a project and what
 * follows for beliefs and problems, and scripts that record notes, keep
 * versions of a project by content hash, and run commands as evidence. These
 * properties check the rules against a plain model of what they define, the
 * recorder by a round trip through Lion, the versions against the files they
 * were taken from, and the whole chain on real files that change.
 */
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { canonical, evaluate, load } from "../lion.ts";
import { CORE, REPOSITORY } from "../sources.ts";
import { between, element, oneOf, text, word } from "./generators.ts";

const SKILL = join(REPOSITORY, "skills/lion-reasoning");
// Each property runs a whole skill model 200 times, which takes seconds
// alone, and longer beside the grid when every package's tests run at once.
const OPTIONS = { timeout: 60_000, arbitrary: { runs: 200 } };

const core = JSON.parse(
  readFileSync(join(SKILL, "assets/core.json"), "utf8")
) as unknown;
const lion = Effect.runPromise(load(join(REPOSITORY, CORE)));

const answerOf = (program: unknown) =>
  Effect.flatMap(
    Effect.promise(() => lion),
    (evaluator) => evaluate(evaluator, program)
  );

const scripts = <A>(name: string) =>
  import(join(SKILL, "scripts", name)) as Promise<A>;

const quoted = (value: unknown) => ["quote", value];

/** A cell of a row, with every list in it taken as a set. */
const cell = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => canonical(cell(item))))].sort();
  }
  return typeof value === "object" && value !== null
    ? Object.fromEntries(
        Object.entries(value).map(([key, part]) => [key, cell(part)])
      )
    : value;
};

/** Each answer as a set of rows: the rules say which rows there are. */
const asSets = (answers: Record<string, readonly unknown[]>) =>
  Object.fromEntries(
    Object.entries(answers).map(([name, rows]) => [
      name,
      [
        ...new Set(
          rows.map((row) =>
            canonical(Array.isArray(row) ? row.map(cell) : cell(row))
          )
        ),
      ].sort(),
    ])
  );

const unique = <A>(items: readonly A[]) => [
  ...new Map(items.map((item) => [canonical(item), item])).values(),
];

// ------------------------------------------------------------ the core rules

const KINDS = ["ran", "read", "told", "recalled"] as const;
const HEARD = new Set(["told", "recalled"]);
const PATHS = ["p0", "p1"];
const NOW = "now";

interface Observation {
  readonly id: string;
  readonly question: string;
  readonly source: string;
  readonly value: number;
}

interface Belief {
  readonly explains: boolean;
  readonly id: string;
  readonly predicts: readonly (readonly [string, number])[];
  /** The number of the version it was formed in, or 0 when none is given. */
  readonly since: number;
}

interface World {
  /** Questions only one source may settle, and that source's id. */
  readonly asked: readonly (readonly [string, string])[];
  readonly beliefs: readonly Belief[];
  readonly needed: readonly string[];
  readonly observations: readonly Observation[];
  readonly problem: readonly [string, number] | undefined;
  readonly sources: readonly {
    readonly about: Readonly<Record<string, string>>;
    readonly id: string;
    readonly kind: (typeof KINDS)[number];
  }[];
  /**
   * What each path holds in each version, numbered from 1, `now` last. A
   * version that holds the same as an earlier one may share its name.
   */
  readonly versions: readonly {
    readonly at: Readonly<Record<string, string>>;
    readonly name: string;
    readonly number: number;
  }[];
}

const hash = between(0, 1);
const question = Arbitrary.map(between(0, 1), (at) => `q${at}`);
/** Beliefs sometimes predict a third question, which no observation answers. */
const predicted = Arbitrary.map(between(0, 5), (at) =>
  at === 5 ? "q2" : `q${at % 2}`
);

/**
 * A few sources of every kind, depending on two paths, with few enough
 * hashes, questions, and values that versions often agree, observations often
 * disagree, and what was heard is often contradicted by what was seen.
 */
const world: Arbitrary.Arbitrary<World> = Arbitrary.map(
  Arbitrary.all({
    beliefs: Arbitrary.array(
      Arbitrary.all({
        explains: between(0, 3),
        predicts: Arbitrary.array(Arbitrary.all([predicted, between(0, 1)]), {
          maxLength: 2,
        }),
        since: between(0, 3),
      }),
      { maxLength: 3 }
    ),
    needed: Arbitrary.array(question, { maxLength: 2 }),
    asked: Arbitrary.array(Arbitrary.all([question, between(0, 4)]), {
      maxLength: 2,
    }),
    observations: Arbitrary.array(
      Arbitrary.all({
        question,
        source: between(0, 3),
        value: between(0, 1),
      }),
      { maxLength: 7 }
    ),
    problem: Arbitrary.all([between(0, 3), question, between(0, 1)]),
    sources: Arbitrary.array(
      Arbitrary.all({
        about: Arbitrary.array(Arbitrary.all([between(0, 1), hash]), {
          maxLength: 2,
        }),
        kind: element([...KINDS]),
      }),
      { minLength: 1, maxLength: 4 }
    ),
    versions: Arbitrary.array(Arbitrary.all([hash, hash, between(0, 2)]), {
      minLength: 1,
      maxLength: 4,
    }),
  }),
  ({ asked, beliefs, needed, observations, problem, sources, versions }) => {
    const named = sources.map((source, at) => ({
      about: Object.fromEntries(
        source.about.map(([path, held]) => [PATHS[path] as string, `h${held}`])
      ),
      id: `s${at}`,
      kind: source.kind,
    }));
    return {
      // Of the user, who has said nothing, or of one of the sources.
      asked: unique(
        asked.map(
          ([q, of]) => [q, of === 4 ? "user" : `s${of % named.length}`] as const
        )
      ),
      beliefs: beliefs.map((belief, at) => ({
        explains: belief.explains > 0 && problem[0] > 0,
        id: `b${at}`,
        predicts: unique(belief.predicts),
        since: Math.min(belief.since, versions.length),
      })),
      needed: [...new Set(needed)],
      observations: observations.map((seen, at) => ({
        id: `o${at}`,
        question: seen.question,
        source: `s${seen.source % named.length}`,
        value: seen.value,
      })),
      problem: problem[0] > 0 ? [problem[1], problem[2]] : undefined,
      sources: named,
      versions: numbered(versions),
    };
  }
);

/**
 * Versions numbered from 1, `now` last. A version the same as the one before
 * is often kept as one, under that one's name.
 */
function numbered(
  versions: readonly (readonly [number, number, number])[]
): World["versions"] {
  const kept: World["versions"][number][] = [];
  for (const [at, [first, second, alias]] of versions.entries()) {
    const last = at === versions.length - 1;
    const earlier = kept.at(-1);
    kept.push(
      !last && alias === 0 && earlier !== undefined
        ? { ...earlier, number: at + 1 }
        : {
            at: { p0: `h${first}`, p1: `h${second}` },
            name: last ? NOW : `v${at}`,
            number: at + 1,
          }
    );
  }
  return kept;
}

const ask = (columns: readonly string[], goal: readonly unknown[]) => [
  "find",
  ["array/make", ...columns],
  goal,
];

const record = (q: string) => ({ topic: q });

const programOf = (given: World) => [
  "begin",
  core,
  [
    "fact",
    ...given.sources.flatMap((source) => [
      ["source", quoted(source.id), quoted(source.kind), quoted("w")],
      ...Object.entries(source.about).map(([path, held]) => [
        "about",
        quoted(source.id),
        quoted(path),
        quoted(held),
      ]),
    ]),
    ...given.observations.map((seen) => [
      "observed",
      quoted(seen.id),
      quoted(seen.source),
      quoted("q"),
      quoted(record(seen.question)),
      seen.value,
    ]),
    ...(given.problem === undefined
      ? []
      : [
          [
            "problem",
            "p",
            quoted("s"),
            quoted(record(given.problem[0])),
            given.problem[1],
          ],
        ]),
    ...given.beliefs.flatMap((belief) => [
      ["belief", quoted(belief.id), quoted("s")],
      ...(belief.since === 0
        ? []
        : [["since", quoted(belief.id), belief.since]]),
      ...belief.predicts.map(([q, value]) => [
        "predicts",
        quoted(belief.id),
        quoted(record(q)),
        value,
      ]),
      ...(belief.explains ? [["explains", quoted(belief.id), "p"]] : []),
    ]),
    ...given.needed.map((q) => ["needed", quoted(record(q))]),
    ...given.asked.map(([q, of]) => ["ask", quoted(record(q)), quoted(of)]),
    ...given.versions.map((version) => [
      "version",
      quoted(version.name),
      version.number,
    ]),
    ...unique(given.versions.map(({ at, name }) => ({ at, name }))).flatMap(
      (version) =>
        Object.entries(version.at).map(([path, held]) => [
          "at",
          quoted(version.name),
          quoted(path),
          quoted(held),
        ])
    ),
  ],
  {
    answer: ask(["?q", "?v", "?o"], ["answer", "?q", "?v", "?o"]),
    borne: ask(["?b", "?q", "?v", "?o"], ["borne_out", "?b", "?q", "?v", "?o"]),
    changed: ask(["?q", "?b", "?a"], ["changed", "?q", "?b", "?a"]),
    contradicted: ask(
      ["?b", "?q", "?p", "?f", "?o"],
      ["contradicted", "?b", "?q", "?p", "?f", "?o"]
    ),
    decisive: ask(["?p", "?q", "?d"], ["decisive", "?p", "?q", "?d"]),
    disputed: ask(["?q", "?vs"], ["disputed", "?q", "?vs"]),
    hearsay: ask(["?q", "?v"], ["hearsay", "?q", "?v"]),
    holds: ["find", "?b", ["holds", "?b"]],
    open: ["find", "?q", ["open", "?q"]],
    presumed: ask(["?q", "?v", "?o"], ["presumed", "?q", "?v", "?o"]),
    undecided: ask(["?q", "?of"], ["undecided", "?q", "?of"]),
    overruled: ask(["?o", "?by"], ["overruled", "?o", "?by"]),
    remaining: ask(["?p", "?bs"], ["remaining", "?p", "?bs"]),
    settled: ask(["?p", "?b"], ["settled", "?p", "?b"]),
    stale: ask(["?s", "?path"], ["stale", "?s", "?path"]),
    unexplained: ["find", "?p", ["unexplained", "?p"]],
    untested: ask(["?b", "?q", "?v"], ["untested", "?b", "?q", "?v"]),
  },
];

/**
 * What the skill says its core derives, computed the plain way. An
 * observation speaks for a version when every path its source depends on
 * holds there what it held when the source was seen. What was told or
 * recalled gives way, in each version, to what was run or read that answers
 * the question otherwise. A belief that explains a problem is judged in the
 * versions where the problem shows, and any other belief in the version it
 * was formed in and every later one.
 */
const expected = (given: World) => {
  const sourceOf = (id: string) =>
    given.sources.find((source) => source.id === id);
  const kindOf = (seen: Observation) => sourceOf(seen.source)?.kind ?? "ran";
  const valid = (seen: Observation, at: Readonly<Record<string, string>>) =>
    Object.entries(sourceOf(seen.source)?.about ?? {}).every(
      ([path, held]) => at[path] === held
    );
  const answersIn = (version: (typeof given.versions)[number]) => {
    const seen = given.observations.filter((o) => valid(o, version.at));
    const overruled = seen.flatMap((o) =>
      HEARD.has(kindOf(o))
        ? seen
            .filter(
              (by) =>
                !HEARD.has(kindOf(by)) &&
                by.question === o.question &&
                by.value !== o.value
            )
            .map((by) => [o.id, by.id] as const)
        : []
    );
    const out = new Set(overruled.map(([id]) => id));
    return {
      answers: seen.filter((o) => !out.has(o.id)),
      overruled,
      seen,
    };
  };
  const now = given.versions.find((version) => version.name === NOW);
  const present = now === undefined ? undefined : answersIn(now);
  const answers = present?.answers ?? [];
  const byVersion = given.versions.map((version) => ({
    name: version.name,
    ...answersIn(version),
  }));
  const occurs =
    given.problem === undefined
      ? []
      : byVersion
          .filter((version) =>
            version.answers.some(
              (o) =>
                o.question === given.problem?.[0] &&
                o.value === given.problem?.[1]
            )
          )
          .map((version) => version.name);
  const judgedIn = (belief: Belief) =>
    belief.explains && occurs.length > 0
      ? occurs
      : given.versions
          .filter((version) => version.number >= belief.since)
          .map((version) => version.name);
  const answersFor = (belief: Belief) =>
    byVersion
      .filter((version) => judgedIn(belief).includes(version.name))
      .flatMap((version) => version.answers);
  const contradicted = given.beliefs.flatMap((belief) =>
    belief.predicts.flatMap(([q, predicted]) =>
      answersFor(belief)
        .filter((o) => o.question === q && o.value !== predicted)
        .map((o) => [belief.id, record(q), predicted, o.value, o.id])
    )
  );
  const holds = given.beliefs.filter(
    (belief) => !contradicted.some(([id]) => id === belief.id)
  );
  const untested = holds.flatMap((belief) =>
    belief.predicts
      .filter(([q]) => !answersFor(belief).some((o) => o.question === q))
      .map(([q, value]) => [belief.id, record(q), value])
  );
  const borne = given.beliefs.flatMap((belief) =>
    belief.predicts.flatMap(([q, value]) =>
      answersFor(belief)
        .filter((o) => o.question === q && o.value === value)
        .map((o) => [belief.id, record(q), value, o.id])
    )
  );
  const rivals = holds.filter((belief) => belief.explains);
  const splits = unique(
    rivals.flatMap((first) =>
      first.predicts.flatMap(([q, value]) =>
        rivals.some((second) =>
          second.predicts.some(([q2, v2]) => q2 === q && v2 !== value)
        )
          ? [q]
          : []
      )
    )
  );
  const remaining = rivals.map((belief) => belief.id);
  const valuesOf = (q: string) =>
    unique(answers.filter((o) => o.question === q).map((o) => o.value)).sort();
  const questions = unique(answers.map((o) => o.question));
  return {
    answer: answers.map((o) => [record(o.question), o.value, o.id]),
    borne,
    changed: unique(
      byVersion
        .filter((version) => version.name !== NOW)
        .flatMap((version) =>
          version.answers.flatMap((before) =>
            answers
              .filter(
                (after) =>
                  after.question === before.question &&
                  after.value !== before.value
              )
              .map((after) => [
                record(before.question),
                before.value,
                after.value,
              ])
          )
        )
    ),
    contradicted,
    decisive: splits.map((q) => [
      "p",
      record(q),
      unique(
        rivals.flatMap((belief) =>
          belief.predicts
            .filter(([q2]) => q2 === q)
            .map(([, value]) => ({ belief: belief.id, predicts: value }))
        )
      ),
    ]),
    disputed: questions
      .filter((q) => valuesOf(q).length > 1)
      .map((q) => [record(q), valuesOf(q)]),
    hearsay: unique(
      answers
        .filter(
          (o) =>
            !(present?.seen ?? []).some(
              (seen) =>
                !HEARD.has(kindOf(seen)) &&
                seen.question === o.question &&
                seen.value === o.value
            )
        )
        .map((o) => [record(o.question), o.value])
    ),
    holds: holds.map((belief) => belief.id),
    open: given.needed
      .filter((q) => !answers.some((o) => o.question === q))
      .map(record),
    // A decision is the asked source's word in any version: files do not age it.
    presumed: unique(
      given.asked.flatMap(([q, of]) =>
        given.observations
          .filter((o) => o.question === q && o.source !== of)
          .map((o) => [record(q), o.value, o.id])
      )
    ),
    undecided: given.asked
      .filter(
        ([q, of]) =>
          !given.observations.some((o) => o.question === q && o.source === of)
      )
      .map(([q, of]) => [record(q), of]),
    overruled: present?.overruled ?? [],
    remaining:
      given.problem !== undefined && remaining.length > 0
        ? [["p", remaining]]
        : [],
    settled:
      remaining.length === 1 &&
      borne.some(([id]) => id === remaining[0]) &&
      !untested.some(([id]) => id === remaining[0])
        ? [["p", remaining[0]]]
        : [],
    stale: given.sources.flatMap((source) =>
      Object.entries(source.about)
        .filter(([path, held]) => now !== undefined && now.at[path] !== held)
        .map(([path]) => [source.id, path])
    ),
    unexplained:
      given.problem !== undefined &&
      given.beliefs.some((belief) => belief.explains) &&
      remaining.length === 0
        ? ["p"]
        : [],
    untested,
  };
};

describe("the reasoning skill's core rules", () => {
  it.effect.prop(
    "derive what a plain model of versions, evidence, and beliefs derives",
    { given: world },
    ({ given }) =>
      Effect.gen(function* () {
        const outcome = yield* answerOf(programOf(given));
        expect(outcome.ok ? asSets(outcome.value as never) : outcome).toEqual(
          asSets(expected(given) as never)
        );
      }),
    OPTIONS
  );
});

/** Rival explanations of one problem, each predicting the same questions. */
const rivals = Arbitrary.all({
  answers: Arbitrary.array(between(0, 1), { minLength: 3, maxLength: 3 }),
  predictions: Arbitrary.array(
    Arbitrary.array(between(0, 1), { minLength: 3, maxLength: 3 }),
    { minLength: 2, maxLength: 4 }
  ),
});

describe("the reasoning skill's rival explanations", () => {
  it.effect.prop(
    "name the questions that split them, and keep the ones whose prediction an answer bears out",
    { given: rivals },
    ({ given: { answers, predictions } }) =>
      Effect.gen(function* () {
        const questions = ["qa", "qb", "qc"];
        const setup = [
          core,
          [
            "fact",
            ["source", "run", "ran", quoted("the run")],
            ["observed", "o", "run", quoted("bad"), quoted({ shows: "p" }), 1],
            ["problem", "p", quoted("it is bad"), quoted({ shows: "p" }), 1],
            ["version", "now", 1],
            ...predictions.flatMap((predicted, at) => [
              ["belief", `b${at}`, quoted("a cause")],
              ["explains", `b${at}`, "p"],
              ...questions.map((q, which) => [
                "predicts",
                `b${at}`,
                quoted({ asks: q }),
                predicted[which],
              ]),
            ]),
          ],
        ];
        const before = yield* answerOf([
          "begin",
          ...setup,
          ["find", "?q", ["decisive", "p", { asks: "?q" }, "?_"]],
        ]);
        const splitting = questions.filter(
          (_, which) =>
            new Set(predictions.map((predicted) => predicted[which])).size > 1
        );
        expect(before).toEqual({ ok: true, value: splitting.sort() });
        const asked = splitting[0];
        if (asked === undefined) {
          return;
        }
        const which = questions.indexOf(asked);
        const found = answers[which] as number;
        const after = yield* answerOf([
          "begin",
          ...setup,
          [
            "fact",
            ["source", "test", "ran", quoted("the experiment")],
            [
              "observed",
              "o2",
              "test",
              quoted("x"),
              quoted({ asks: asked }),
              found,
            ],
          ],
          {
            holds: ["find", "?b", ["holds", "?b"]],
            settled: ["find", "?b", ["settled", "p", "?b"]],
          },
        ]);
        const standing = predictions.flatMap((predicted, at) =>
          predicted[which] === found ? [`b${at}`] : []
        );
        expect(after).toEqual({
          ok: true,
          value: { holds: standing.sort(), settled: [] },
        });
      }),
    OPTIONS
  );
});

// ----------------------------------------------------- scores and directions

type Better = "lower" | "higher";

interface Run {
  /** The hash its source depended on, or null when it depends on nothing. */
  readonly hash: number | null;
  readonly kind: (typeof KINDS)[number];
  readonly question: string;
  readonly source: string;
  readonly tries: string | undefined;
  readonly value: number | boolean;
}

interface Trial {
  readonly asked: readonly string[];
  readonly better: Readonly<Record<string, Better>>;
  readonly directions: readonly {
    /** The problems it says it addresses. */
    readonly addresses: readonly string[];
    readonly id: string;
    readonly needs: readonly [string, boolean] | undefined;
    readonly patience: number;
  }[];
  /**
   * Beliefs formed in a version, numbered from 1, or in none when 0. One
   * that `tries` a direction is what an experiment of it was expected to do.
   */
  readonly expectations: readonly {
    readonly id: string;
    readonly predicts: readonly (readonly [string, number | boolean])[];
    readonly since: number;
    readonly tries: string | undefined;
  }[];
  /** Whether the first score counts only where the check is 0. */
  readonly guarded: boolean;
  /** What the watched path holds in each version, numbered from 1. */
  readonly hashes: readonly number[];
  /** Things wrong, each the question and the value that show it. */
  readonly problems: readonly {
    readonly id: string;
    readonly question: string;
    readonly value: number | boolean;
  }[];
  readonly runs: readonly Run[];
}

const SCORES = ["q0", "q1"];
const CHECK = "g";
const NEEDS = ["n0", "n1"];
/** What a problem can be about: the check, or a question with a yes or no. */
const TROUBLES = [CHECK, "n0"];
/** The value a question of a run takes for a number from a generator. */
const answerFor = (q: string, value: number) =>
  q.startsWith("n") ? value % 2 === 1 : value % 2;
const questionOf = (q: string) =>
  q.startsWith("n") ? { need: q } : { topic: q };

/**
 * A few versions of one watched path, scores of both kinds run in them,
 * a check the first score may require, and directions whose experiments
 * are some of those runs, some needing a question the user may answer.
 * Values are few, so versions often tie, improve, and fall back. Problems
 * show on the check and on a yes-or-no question; directions say which they
 * address, and beliefs formed in a version predict answers, some of them as
 * what an experiment of a direction was expected to do.
 */
const trial: Arbitrary.Arbitrary<Trial> = Arbitrary.map(
  Arbitrary.all({
    asked: Arbitrary.array(between(0, 1), { maxLength: 2 }),
    better: Arbitrary.array(between(0, 1), { minLength: 2, maxLength: 2 }),
    directions: Arbitrary.array(
      Arbitrary.all({
        addresses: between(0, 3),
        needs: between(0, 3),
        patience: between(1, 2),
        value: between(0, 1),
      }),
      { minLength: 1, maxLength: 3 }
    ),
    expectations: Arbitrary.array(
      Arbitrary.all({
        predicts: Arbitrary.array(
          Arbitrary.all([between(0, 4), between(0, 1)]),
          { minLength: 1, maxLength: 3 }
        ),
        since: between(0, 5),
        tries: between(0, 2),
      }),
      { maxLength: 4 }
    ),
    guarded: between(0, 1),
    hashes: Arbitrary.array(between(0, 3), { minLength: 2, maxLength: 5 }),
    problems: Arbitrary.array(Arbitrary.all([between(0, 1), between(0, 1)]), {
      minLength: 1,
      maxLength: 3,
    }),
    runs: Arbitrary.array(
      Arbitrary.all({
        at: between(0, 9),
        kind: element([...KINDS]),
        question: between(0, 9),
        tries: between(0, 4),
        user: between(0, 1),
        value: between(0, 9),
      }),
      { maxLength: 14 }
    ),
  }),
  ({
    asked,
    better,
    directions,
    expectations,
    guarded,
    hashes,
    problems,
    runs,
  }) => {
    const ids = directions.map((_, at) => `d${at}`);
    const troubles = problems.map(([q, value], at) => ({
      id: `p${at}`,
      question: TROUBLES[q] as string,
      value: answerFor(TROUBLES[q] as string, value),
    }));
    return {
      asked: [...new Set(asked.map((at) => NEEDS[at] as string))],
      better: Object.fromEntries(
        SCORES.map((q, at) => [q, better[at] === 0 ? "lower" : "higher"])
      ),
      directions: directions.map((direction, at) => ({
        addresses: troubles
          .filter(
            (_, which) => Math.floor(direction.addresses / 2 ** which) % 2
          )
          .map((problem) => problem.id),
        id: ids[at] as string,
        needs:
          direction.needs < 2
            ? [NEEDS[direction.needs] as string, direction.value === 1]
            : undefined,
        patience: direction.patience,
      })),
      expectations: expectations.map((expectation, at) => ({
        id: `e${at}`,
        predicts: unique(
          expectation.predicts.map(([q, value]) => {
            const question = [...TROUBLES, "q1", ...TROUBLES][q] as string;
            return [
              question,
              question === "q1" ? value : answerFor(question, value),
            ] as const;
          })
        ),
        since: Math.min(expectation.since, hashes.length),
        tries: ids[expectation.tries],
      })),
      guarded: guarded === 1,
      hashes,
      problems: troubles,
      runs: runs.map((run, at) => {
        const question = [
          "q0",
          "q1",
          CHECK,
          "n0",
          "n1",
          "q0",
          "q1",
          CHECK,
          "n0",
          CHECK,
        ][run.question] as string;
        const needed = question.startsWith("n");
        const byUser = needed && run.user === 1;
        let value: number | boolean = run.value;
        if (needed) {
          value = run.value % 2 === 1;
        } else if (question === CHECK) {
          value = run.value % 2;
        }
        return {
          hash:
            byUser || run.at === 9
              ? null
              : (hashes[run.at % hashes.length] as number),
          kind: byUser ? "told" : run.kind,
          question,
          source: byUser ? "user" : `s${at}`,
          tries: needed ? undefined : ids[run.tries],
          value,
        };
      }),
    };
  }
);

/** Version names as the skill gives them: one per state, `now` its own. */
const namesOf = (hashes: readonly number[]) =>
  hashes.map((hash, at) => {
    if (at === hashes.length - 1) {
      return NOW;
    }
    const earlier = hashes.indexOf(hash);
    return `v${earlier}`;
  });

const trialProgram = (given: Trial) => {
  const names = namesOf(given.hashes);
  const states = unique(
    names.map((name, at) => [name, given.hashes[at] as number] as const)
  );
  const sources = unique(
    given.runs.map((run) => [run.source, run.kind, run.hash] as const)
  );
  return [
    "begin",
    core,
    [
      "fact",
      ...sources.flatMap(([id, kind, hash]) => [
        ["source", quoted(id), quoted(kind), quoted("w")],
        ...(hash === null
          ? []
          : [["about", quoted(id), quoted("p"), quoted(`h${hash}`)]]),
      ]),
      ...given.runs.flatMap((run, at) => [
        [
          "observed",
          quoted(`o${at}`),
          quoted(run.source),
          quoted("q"),
          quoted(questionOf(run.question)),
          run.value,
        ],
        ...(run.tries === undefined
          ? []
          : [["tries", quoted(`o${at}`), quoted(run.tries)]]),
      ]),
      ...SCORES.map((q) => [
        "scored",
        quoted(questionOf(q)),
        quoted(given.better[q]),
      ]),
      ...(given.guarded
        ? [["requires", quoted(questionOf("q0")), quoted(questionOf(CHECK)), 0]]
        : []),
      ...given.problems.map((problem) => [
        "problem",
        quoted(problem.id),
        quoted("s"),
        quoted(questionOf(problem.question)),
        problem.value,
      ]),
      ...given.expectations.flatMap((expectation) => [
        ["belief", quoted(expectation.id), quoted("s")],
        ...(expectation.since === 0
          ? []
          : [["since", quoted(expectation.id), expectation.since]]),
        ...expectation.predicts.map(([q, value]) => [
          "predicts",
          quoted(expectation.id),
          quoted(questionOf(q)),
          value,
        ]),
        ...(expectation.tries === undefined
          ? []
          : [["expects", quoted(expectation.tries), quoted(expectation.id)]]),
      ]),
      ...given.directions.flatMap((direction) => [
        ["direction", quoted(direction.id), quoted("s"), direction.patience],
        ...direction.addresses.map((problem) => [
          "addresses",
          quoted(direction.id),
          quoted(problem),
        ]),
        ...(direction.needs === undefined
          ? []
          : [
              [
                "needs",
                quoted(direction.id),
                quoted(questionOf(direction.needs[0])),
                direction.needs[1],
              ],
            ]),
      ]),
      ...given.asked.map((q) => ["ask", quoted(questionOf(q)), "user"]),
      ...names.map((name, at) => ["version", quoted(name), at + 1]),
      ...states.map(([name, hash]) => [
        "at",
        quoted(name),
        quoted("p"),
        quoted(`h${hash}`),
      ]),
    ],
    {
      addresses: ask(["?d", "?p"], ["addresses", "?d", "?p"]),
      best: ask(["?q", "?v"], ["best", "?q", "?v"]),
      blocked: ask(["?d", "?q"], ["blocked", "?d", "?q"]),
      borne: ask(
        ["?b", "?q", "?v", "?o"],
        ["borne_out", "?b", "?q", "?v", "?o"]
      ),
      carried: ask(["?d", "?q"], ["carried", "?d", "?q"]),
      contradicted: ask(
        ["?b", "?q", "?p", "?f", "?o"],
        ["contradicted", "?b", "?q", "?p", "?f", "?o"]
      ),
      disputed: ask(["?q", "?vs"], ["disputed", "?q", "?vs"]),
      exhausted: ["find", "?d", ["exhausted", "?d"]],
      experiment: ask(["?d", "?v"], ["experiment", "?d", "?v"]),
      fixed: ask(["?d", "?v", "?p", "?o"], ["fixed", "?d", "?v", "?p", "?o"]),
      improved: ask(
        ["?q", "?v", "?b", "?a"],
        ["improved", "?q", "?v", "?b", "?a"]
      ),
      live: ["find", "?d", ["live", "?d"]],
      unfixed: ask(
        ["?d", "?v", "?p", "?f", "?o"],
        ["unfixed", "?d", "?v", "?p", "?f", "?o"]
      ),
      paid: ask(["?d", "?v", "?q"], ["paid_off", "?d", "?v", "?q"]),
      progress: ask(
        ["?d", "?t", "?p", "?m"],
        ["progress", "?d", "?t", "?p", "?m"]
      ),
      regressed: ask(["?q", "?n", "?b"], ["regressed", "?q", "?n", "?b"]),
      ruled: ask(
        ["?d", "?q", "?n", "?f"],
        ["ruled_out", "?d", "?q", "?n", "?f"]
      ),
      score: ask(
        ["?v", "?q", "?b", "?w"],
        ["score_in", "?v", "?q", "?b", "?w"]
      ),
      targets: ask(
        ["?d", "?v", "?p", "?b"],
        ["targets", "?d", "?v", "?p", "?b"]
      ),
      unmet: ask(["?v", "?s", "?q", "?n"], ["unmet", "?v", "?s", "?q", "?n"]),
    },
  ];
};

/**
 * What the skill says scores and directions derive, the plain way. A
 * version's runs of a score are its range, unless a run of what the score
 * requires there says otherwise; a version improves a score when its worst
 * run beats the best that every version before it was sure to give. A direction's
 * experiment is the first version its run speaks for; it pays off when it
 * improves a score or fixes a problem it targets, and misses otherwise, and a
 * direction is set aside after as many misses in a
 * row as its patience, when the user has not decided what it needs, or when
 * what it needs is answered otherwise. Its experiments say nothing about a
 * score that none of them ran with an earlier version to beat. A belief that
 * tries a direction is judged in the version it was formed in and no other;
 * where it predicts a problem's question otherwise than the problem shows,
 * that experiment targets the problem, and fixed it or not by what the
 * version answers.
 */
const trialExpected = (given: Trial) => {
  const names = namesOf(given.hashes);
  const hashOf = (name: string) => given.hashes[names.indexOf(name)];
  const first = (name: string) => names.indexOf(name) + 1;
  const versions = [...new Set(names)];
  const runs = given.runs.map((run, at) => ({ ...run, id: `o${at}` }));
  const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
  const answersIn = (name: string) => {
    const valid = runs.filter(
      (run) => run.hash === null || run.hash === hashOf(name)
    );
    return valid.filter(
      (run) =>
        !(
          HEARD.has(run.kind) &&
          valid.some(
            (by) =>
              !HEARD.has(by.kind) &&
              by.question === run.question &&
              !same(by.value, run.value)
          )
        )
    );
  };
  const valuesIn = (name: string, q: string) =>
    answersIn(name)
      .filter((run) => run.question === q)
      .map((run) => run.value);
  const unmet = (name: string, q: string) =>
    given.guarded &&
    q === "q0" &&
    valuesIn(name, q).length > 0 &&
    (!valuesIn(name, CHECK).some((value) => same(value, 0)) ||
      valuesIn(name, CHECK).some((value) => !same(value, 0)));
  const rangeIn = (name: string, q: string) => {
    const values = valuesIn(name, q) as number[];
    return values.length === 0 || unmet(name, q)
      ? undefined
      : ([Math.min(...values), Math.max(...values)] as const);
  };
  const lower = (q: string) => given.better[q] === "lower";
  const ranges = (q: string, keep: (name: string) => boolean) =>
    versions.filter(keep).flatMap((name) => {
      const range = rangeIn(name, q);
      return range === undefined ? [] : [range];
    });
  // The best a score is sure to give: the best of the versions' worst runs.
  const bestOf = (q: string) => {
    const all = ranges(q, () => true);
    if (all.length === 0) {
      return undefined;
    }
    return lower(q)
      ? Math.min(...all.map(([, high]) => high))
      : Math.max(...all.map(([low]) => low));
  };
  // A version improves a score when its worst run beats the best that every
  // version before it was sure to give: the best of their worst runs.
  const improved = SCORES.flatMap((q) =>
    versions.flatMap((name) => {
      const range = rangeIn(name, q);
      const before = ranges(q, (u) => first(u) < first(name));
      if (range === undefined || before.length === 0) {
        return [];
      }
      if (lower(q)) {
        const sure = Math.min(...before.map(([, h]) => h));
        return range[1] < sure ? [[questionOf(q), name, sure, range[1]]] : [];
      }
      const sure = Math.max(...before.map(([l]) => l));
      return range[0] > sure ? [[questionOf(q), name, sure, range[0]]] : [];
    })
  );
  const experimentsOf = (id: string) =>
    unique(
      runs.flatMap((run) => {
        if (run.tries !== id) {
          return [];
        }
        const valid = versions.filter(
          (name) => run.hash === null || run.hash === hashOf(name)
        );
        if (valid.length === 0) {
          return [];
        }
        const n = Math.min(...valid.map(first));
        return [names[n - 1] as string];
      })
    );
  const formedIn = (since: number) =>
    since === 0 ? [] : [names[since - 1] as string];
  const targets = given.expectations.flatMap((expectation) =>
    expectation.tries === undefined
      ? []
      : expectation.predicts.flatMap(([q, predicted]) =>
          given.problems
            .filter(
              (problem) =>
                problem.question === q && !same(problem.value, predicted)
            )
            .flatMap((problem) =>
              formedIn(expectation.since).map((name) => ({
                direction: expectation.tries as string,
                expectation,
                name,
                predicted,
                problem,
              }))
            )
        )
  );
  const outcomes = targets.flatMap((target) =>
    answersIn(target.name)
      .filter((run) => run.question === target.problem.question)
      .map((run) => ({ ...target, run }))
  );
  const paidOf = (id: string) =>
    unique(
      experimentsOf(id).flatMap((name) => [
        ...improved
          .filter(([, v]) => v === name)
          .map(([q]) => [id, name, q] as const),
        ...outcomes
          .filter(
            (outcome) =>
              outcome.direction === id &&
              outcome.name === name &&
              same(outcome.run.value, outcome.predicted)
          )
          .map(
            (outcome) =>
              [id, name, questionOf(outcome.problem.question)] as const
          ),
      ])
    );
  const missesOf = (id: string) => {
    const paid = paidOf(id).map(([, name]) => first(name));
    const last = paid.length === 0 ? undefined : Math.max(...paid);
    return experimentsOf(id).filter(
      (name) =>
        !paid.includes(first(name)) &&
        (last === undefined || first(name) > last)
    );
  };
  const undecided = (q: string) =>
    given.asked.includes(q) &&
    !runs.some((run) => run.source === "user" && run.question === q);
  const answersNow = (q: string) => valuesIn(NOW, q);
  const blockedOf = (direction: Trial["directions"][number]) =>
    direction.needs !== undefined &&
    (undecided(direction.needs[0]) ||
      answersNow(direction.needs[0]).length === 0)
      ? [[direction.id, questionOf(direction.needs[0])]]
      : [];
  const ruledOf = (direction: Trial["directions"][number]) => {
    const needs = direction.needs;
    if (needs === undefined || undecided(needs[0])) {
      return [];
    }
    return unique(answersNow(needs[0]))
      .filter((found) => !same(found, needs[1]))
      .map((found) => [direction.id, questionOf(needs[0]), needs[1], found]);
  };
  const exhausted = given.directions
    .filter((direction) => missesOf(direction.id).length >= direction.patience)
    .map((direction) => direction.id);
  const now = (q: string) => rangeIn(NOW, q);
  const judgedIn = (expectation: Trial["expectations"][number]) =>
    expectation.tries === undefined
      ? unique(names.filter((_, at) => at + 1 >= expectation.since))
      : formedIn(expectation.since);
  const judged = given.expectations.flatMap((expectation) =>
    expectation.predicts.flatMap(([q, predicted]) =>
      judgedIn(expectation).flatMap((name) =>
        answersIn(name)
          .filter((run) => run.question === q)
          .map((run) => ({ expectation, name, predicted, q, run }))
      )
    )
  );
  return {
    addresses: unique([
      ...given.directions.flatMap((direction) =>
        direction.addresses.map((problem) => [direction.id, problem])
      ),
      ...targets.map((target) => [target.direction, target.problem.id]),
    ]),
    best: SCORES.flatMap((q) => {
      const best = bestOf(q);
      return best === undefined ? [] : [[questionOf(q), best]];
    }),
    blocked: given.directions.flatMap(blockedOf),
    borne: judged
      .filter(({ predicted, run }) => same(run.value, predicted))
      .map(({ expectation, predicted, q, run }) => [
        expectation.id,
        questionOf(q),
        predicted,
        run.id,
      ]),
    // A direction's experiments speak for a score when one of them ran it in
    // a version that an earlier version's runs can be compared with.
    carried: given.directions.flatMap((direction) =>
      experimentsOf(direction.id).length === 0
        ? []
        : SCORES.filter(
            (q) =>
              !experimentsOf(direction.id).some(
                (name) =>
                  valuesIn(name, q).length > 0 &&
                  ranges(q, (u) => first(u) < first(name)).length > 0
              )
          ).map((q) => [direction.id, questionOf(q)])
    ),
    contradicted: judged
      .filter(({ predicted, run }) => !same(run.value, predicted))
      .map(({ expectation, predicted, q, run }) => [
        expectation.id,
        questionOf(q),
        predicted,
        run.value,
        run.id,
      ]),
    // The runs of a score differ by nature; only other questions are disputed.
    disputed: [CHECK, ...NEEDS].flatMap((q) => {
      const values = unique(answersNow(q));
      return values.length > 1 ? [[questionOf(q), values]] : [];
    }),
    exhausted,
    experiment: given.directions.flatMap((direction) =>
      experimentsOf(direction.id).map((name) => [direction.id, name])
    ),
    fixed: outcomes
      .filter(({ predicted, run }) => same(run.value, predicted))
      .map(({ direction, name, problem, run }) => [
        direction,
        name,
        problem.id,
        run.id,
      ]),
    improved,
    live: given.directions
      .filter(
        (direction) =>
          !exhausted.includes(direction.id) &&
          blockedOf(direction).length === 0 &&
          ruledOf(direction).length === 0
      )
      .map((direction) => direction.id),
    unfixed: outcomes
      .filter(({ predicted, run }) => !same(run.value, predicted))
      .map(({ direction, name, problem, run }) => [
        direction,
        name,
        problem.id,
        run.value,
        run.id,
      ]),
    paid: given.directions.flatMap((direction) => paidOf(direction.id)),
    progress: given.directions.map((direction) => [
      direction.id,
      experimentsOf(direction.id).length,
      unique(paidOf(direction.id).map(([, name]) => name)).length,
      missesOf(direction.id).length,
    ]),
    regressed: SCORES.flatMap((q) => {
      const range = now(q);
      const best = bestOf(q);
      if (range === undefined || best === undefined) {
        return [];
      }
      if (lower(q)) {
        return range[0] > best ? [[questionOf(q), range[0], best]] : [];
      }
      return range[1] < best ? [[questionOf(q), range[1], best]] : [];
    }),
    ruled: given.directions.flatMap(ruledOf),
    score: SCORES.flatMap((q) =>
      versions.flatMap((name) => {
        const range = rangeIn(name, q);
        if (range === undefined) {
          return [];
        }
        return [
          lower(q)
            ? [name, questionOf(q), range[0], range[1]]
            : [name, questionOf(q), range[1], range[0]],
        ];
      })
    ),
    targets: unique(
      targets.map((target) => [
        target.direction,
        target.name,
        target.problem.id,
        target.expectation.id,
      ])
    ),
    unmet: versions.flatMap((name) =>
      unmet(name, "q0") ? [[name, questionOf("q0"), questionOf(CHECK), 0]] : []
    ),
  };
};

describe("the reasoning skill's scores and directions", () => {
  it.effect.prop(
    "count a version's runs only when every answer to what the score requires there is the one it needs",
    {
      checks: Arbitrary.array(between(0, 2), { maxLength: 4 }),
      runs: Arbitrary.array(between(0, 9), { minLength: 1, maxLength: 3 }),
    },
    ({ checks, runs }) =>
      Effect.gen(function* () {
        const outcome = yield* answerOf([
          "begin",
          core,
          [
            "fact",
            ["version", "now", 1],
            ...[...runs, ...checks].map((_, at) => [
              "source",
              quoted(`s${at}`),
              "ran",
              quoted("w"),
            ]),
            ...runs.map((value, at) => [
              "observed",
              quoted(`r${at}`),
              quoted(`s${at}`),
              quoted("q"),
              quoted({ topic: "speed" }),
              value,
            ]),
            ...checks.map((value, at) => [
              "observed",
              quoted(`c${at}`),
              quoted(`s${runs.length + at}`),
              quoted("q"),
              quoted({ topic: "check" }),
              value,
            ]),
            ["scored", quoted({ topic: "speed" }), "lower"],
            [
              "requires",
              quoted({ topic: "speed" }),
              quoted({ topic: "check" }),
              0,
            ],
          ],
          {
            score: ask(["?b", "?w"], ["score_in", "now", "?_", "?b", "?w"]),
            unmet: ["find", "?n", ["unmet", "now", "?_", "?_", "?n"]],
          },
        ]);
        const met = checks.length > 0 && checks.every((value) => value === 0);
        expect(outcome).toEqual({
          ok: true,
          value: {
            score: met ? [[Math.min(...runs), Math.max(...runs)]] : [],
            unmet: met ? [] : [0],
          },
        });
      }),
    OPTIONS
  );

  it.effect.prop(
    "derive what a plain model of ranges, improvements, patience, and what each experiment was expected to fix derives",
    { given: trial },
    ({ given }) =>
      Effect.gen(function* () {
        const outcome = yield* answerOf(trialProgram(given));
        expect(outcome.ok ? asSets(outcome.value as never) : outcome).toEqual(
          asSets(trialExpected(given) as never)
        );
      }),
    { ...OPTIONS, arbitrary: { runs: 300 } }
  );
});

// --------------------------------------------------------------- the recorder

interface Notes {
  readonly ask?: readonly {
    readonly of: string;
    readonly question: unknown;
  }[];
  readonly beliefs: readonly {
    readonly explains: readonly string[];
    readonly id: string;
    readonly predicts: readonly {
      readonly question: unknown;
      readonly value: unknown;
    }[];
    readonly statement: string;
    readonly tries?: string;
  }[];
  readonly directions?: readonly {
    readonly addresses?: readonly string[];
    readonly id: string;
    readonly needs?: readonly {
      readonly question: unknown;
      readonly value: unknown;
    }[];
    readonly patience?: number;
    readonly statement: string;
  }[];
  readonly needed: readonly unknown[];
  readonly observations: readonly {
    readonly id: string;
    readonly question: unknown;
    readonly quote: string;
    readonly source: string;
    readonly tries?: string;
    readonly value: unknown;
  }[];
  readonly problems: readonly {
    readonly id: string;
    readonly question: unknown;
    readonly statement: string;
    readonly value: unknown;
  }[];
  readonly scores?: readonly {
    readonly better: string;
    readonly question: unknown;
    readonly requires?: readonly {
      readonly question: unknown;
      readonly value: unknown;
    }[];
  }[];
  readonly sources: readonly {
    readonly about?: readonly string[];
    readonly id: string;
    readonly kind: string;
    readonly what: string;
  }[];
}

interface Source {
  readonly hashes: Readonly<Record<string, string | null>>;
  readonly id: string;
  readonly kind: string;
  readonly what: string;
}

const recorder = scripts<{
  readonly problemsOf: (
    notes: Notes,
    textOf: (source: string) => string | undefined
  ) => readonly string[];
  readonly sourcesOf: (
    notes: Notes,
    options: {
      readonly hash: (path: string) => string | null;
      readonly known: readonly string[];
      readonly ran: (id: string) => Omit<Source, "id"> | undefined;
      readonly root: string;
    }
  ) => readonly Source[];
  readonly stepOf: (
    notes: Notes,
    sources: readonly Source[],
    version: number
  ) => unknown;
}>("record.mjs");

/** Text a note can hold that Lion would read as something else if left bare. */
const risky = oneOf(
  text(/^[a-z ?/$<>"'-]{0,10}$/),
  element([
    "answer",
    "source",
    "belief",
    "?x",
    "?_",
    "number/add",
    "value/any?",
    "now",
    "quote",
    "",
  ])
);

describe("the reasoning skill's recorder", () => {
  it.effect.prop(
    "records notes as the data they are, and refuses a quote its source does not hold",
    {
      names: Arbitrary.array(word, { minLength: 1, maxLength: 3 }),
      say: risky,
    },
    ({ names, say }) =>
      Effect.gen(function* () {
        const { problemsOf, sourcesOf, stepOf } = yield* Effect.promise(
          () => recorder
        );
        const ids = [...new Set(names)];
        const notes: Notes = {
          beliefs: ids.map((id) => ({
            explains: [`p-${id}`],
            id: `b-${id}`,
            predicts: [{ question: { [say]: id }, value: [say, null] }],
            statement: say,
          })),
          ask: ids.map((id) => ({ of: say, question: { [say]: id } })),
          needed: [{ [say]: say }],
          observations: ids.map((id, at) => ({
            id: `o-${id}`,
            question: { [say]: [say, at] },
            quote: say,
            source: `s-${id}`,
            value: { [say]: say },
          })),
          problems: ids.map((id) => ({
            id: `p-${id}`,
            question: { [say]: id },
            statement: say,
            value: say,
          })),
          sources: ids.map((id) => ({
            about: [say === "" ? "." : `dir/${id}`],
            id: `s-${id}`,
            kind: "told",
            what: say,
          })),
        };
        const sources = sourcesOf(notes, {
          hash: (path) => `hash of ${path}`,
          known: [],
          ran: () => undefined,
          root: "/project",
        });
        const outcome = yield* answerOf([
          "begin",
          core,
          stepOf(notes, sources, ids.length),
          {
            about: ask(["?s", "?p", "?h"], ["about", "?s", "?p", "?h"]),
            since: ask(["?b", "?n"], ["since", "?b", "?n"]),
            beliefs: ask(["?b", "?s"], ["belief", "?b", "?s"]),
            explains: ask(["?b", "?p"], ["explains", "?b", "?p"]),
            needed: ["find", "?q", ["needed", "?q"]],
            asked: ask(["?q", "?of"], ["ask", "?q", "?of"]),
            observed: ask(
              ["?o", "?s", "?quote", "?q", "?v"],
              ["observed", "?o", "?s", "?quote", "?q", "?v"]
            ),
            predicts: ask(["?b", "?q", "?v"], ["predicts", "?b", "?q", "?v"]),
            problems: ask(
              ["?p", "?s", "?q", "?v"],
              ["problem", "?p", "?s", "?q", "?v"]
            ),
            sources: ask(["?s", "?k", "?w"], ["source", "?s", "?k", "?w"]),
          },
        ]);
        const got = outcome.ok
          ? (outcome.value as Record<string, readonly unknown[]>)
          : {};
        const sets = (rows: Record<string, readonly unknown[]>) =>
          Object.fromEntries(
            Object.entries(rows).map(([name, list]) => [
              name,
              list.map(canonical).sort(),
            ])
          );
        expect({
          ...sets(got),
          failed: outcome.ok ? undefined : outcome,
        }).toEqual({
          ...sets({
            about: notes.sources.map((source) => [
              source.id,
              source.about?.[0],
              `hash of ${source.about?.[0]}`,
            ]),
            beliefs: notes.beliefs.map((belief) => [
              belief.id,
              belief.statement,
            ]),
            explains: notes.beliefs.flatMap((belief) =>
              belief.explains.map((problem) => [belief.id, problem])
            ),
            needed: notes.needed,
            asked: (notes.ask ?? []).map((item) => [item.question, item.of]),
            observed: notes.observations.map((seen) => [
              seen.id,
              seen.source,
              seen.quote,
              seen.question,
              seen.value,
            ]),
            predicts: notes.beliefs.flatMap((belief) =>
              belief.predicts.map((p) => [belief.id, p.question, p.value])
            ),
            since: notes.beliefs.map((belief) => [belief.id, ids.length]),
            problems: notes.problems.map((problem) => [
              problem.id,
              problem.statement,
              problem.question,
              problem.value,
            ]),
            sources: notes.sources.map((source) => [
              source.id,
              source.kind,
              source.what,
            ]),
          }),
          failed: undefined,
        });
        const holding = (held: string) => (source: string) =>
          source === notes.observations[0]?.source ? held : undefined;
        expect(problemsOf(notes, holding(`before ${say} after`))).toHaveLength(
          say.trim() === "" ? ids.length : ids.length - 1
        );
        expect(problemsOf(notes, holding(""))).toHaveLength(ids.length);
      }),
    OPTIONS
  );

  it.effect.prop(
    "records scores, what they require, directions, what they need and address, and experiments with what they were expected to do as data, with a patience of 3 unless a direction says",
    {
      names: Arbitrary.array(word, { minLength: 1, maxLength: 3 }),
      patience: Arbitrary.array(between(0, 4), { minLength: 3, maxLength: 3 }),
      say: risky,
    },
    ({ names, patience, say }) =>
      Effect.gen(function* () {
        const { sourcesOf, stepOf } = yield* Effect.promise(() => recorder);
        const ids = [...new Set(names)];
        const notes: Notes = {
          beliefs: ids.map((id) => ({
            explains: [],
            id: `b-${id}`,
            predicts: [],
            statement: say,
            tries: `d-${id}`,
          })),
          directions: ids.map((id, at) => ({
            addresses: [`p-${id}`],
            id: `d-${id}`,
            needs: [{ question: { [say]: id }, value: [say] }],
            statement: say,
            ...((patience[at] ?? 0) > 0 ? { patience: patience[at] } : {}),
          })),
          needed: [],
          observations: ids.map((id, at) => ({
            id: `o-${id}`,
            question: { [say]: [say, at] },
            quote: say,
            source: "s",
            tries: `d-${id}`,
            value: at,
          })),
          problems: ids.map((id) => ({
            id: `p-${id}`,
            question: { [say]: id },
            statement: say,
            value: say,
          })),
          scores: ids.map((id, at) => ({
            better: at % 2 === 0 ? "lower" : "higher",
            question: { [say]: [say, at] },
            requires: [{ question: { [say]: id }, value: say }],
          })),
          sources: [{ id: "s", kind: "ran", what: say }],
        };
        const sources = sourcesOf(notes, {
          hash: (path) => `hash of ${path}`,
          known: [],
          ran: () => undefined,
          root: "/project",
        });
        const outcome = yield* answerOf([
          "begin",
          core,
          stepOf(notes, sources, 1),
          {
            addresses: ask(["?d", "?p"], ["addresses", "?d", "?p"]),
            directions: ask(
              ["?d", "?s", "?p"],
              ["direction", "?d", "?s", "?p"]
            ),
            expects: ask(["?d", "?b"], ["expects", "?d", "?b"]),
            needs: ask(["?d", "?q", "?v"], ["needs", "?d", "?q", "?v"]),
            requires: ask(["?s", "?q", "?v"], ["requires", "?s", "?q", "?v"]),
            scored: ask(["?q", "?b"], ["scored", "?q", "?b"]),
            tries: ask(["?o", "?d"], ["tries", "?o", "?d"]),
          },
        ]);
        expect(outcome.ok ? asSets(outcome.value as never) : outcome).toEqual(
          asSets({
            addresses: notes.directions?.flatMap((direction) =>
              (direction.addresses ?? []).map((problem) => [
                direction.id,
                problem,
              ])
            ),
            directions: notes.directions?.map((direction) => [
              direction.id,
              direction.statement,
              direction.patience ?? 3,
            ]),
            expects: notes.beliefs.map((belief) => [belief.tries, belief.id]),
            needs: notes.directions?.flatMap((direction) =>
              (direction.needs ?? []).map((need) => [
                direction.id,
                need.question,
                need.value,
              ])
            ),
            requires: notes.scores?.flatMap((score) =>
              (score.requires ?? []).map((need) => [
                score.question,
                need.question,
                need.value,
              ])
            ),
            scored: notes.scores?.map((score) => [
              score.question,
              score.better,
            ]),
            tries: notes.observations.map((seen) => [seen.id, seen.tries]),
          } as never)
        );
      }),
    OPTIONS
  );

  it.effect.prop(
    "refuses each part of a quote that its source's text does not hold",
    {
      parts: Arbitrary.array(Arbitrary.all([word, between(0, 1)]), {
        minLength: 1,
        maxLength: 4,
      }),
    },
    ({ parts }) =>
      Effect.gen(function* () {
        const { problemsOf } = yield* Effect.promise(() => recorder);
        const notes: Notes = {
          beliefs: [],
          needed: [],
          observations: [
            {
              id: "o",
              question: {},
              quote: parts.map(([part]) => `<${part}>`) as never,
              source: "t",
              value: 1,
            },
          ],
          problems: [],
          sources: [],
        };
        const held = parts
          .filter(([, kept]) => kept === 1)
          .map(([part]) => `<${part}>`);
        const missing = parts
          .map(([part]) => `<${part}>`)
          .filter((part) => !held.includes(part));
        expect(
          problemsOf(notes, () => `start\n${held.join("\n")}\nend`).length
        ).toBe(missing.length);
      }),
    { arbitrary: { runs: 100 } }
  );

  it.effect.prop(
    "takes a source run with see.mjs from what the run saved, unless the notes list it",
    {
      listed: between(0, 1),
      known: between(0, 1),
      saved: Arbitrary.all([word, word]),
    },
    ({ known, listed, saved: [what, held] }) =>
      Effect.gen(function* () {
        const { sourcesOf } = yield* Effect.promise(() => recorder);
        const notes: Notes = {
          beliefs: [],
          needed: [],
          observations: [
            { id: "o", question: {}, quote: "q", source: "t", value: 1 },
          ],
          problems: [],
          sources:
            listed === 1 ? [{ id: "t", kind: "read", what: "listed.txt" }] : [],
        };
        const sources = sourcesOf(notes, {
          hash: (path) => `now ${path}`,
          known: known === 1 ? ["t"] : [],
          ran: (id) =>
            id === "t"
              ? { hashes: { ".": held }, kind: "ran", what }
              : undefined,
          root: "/nowhere",
        });
        const fromRun = { hashes: { ".": held }, id: "t" };
        let expected: readonly unknown[] = [{ ...fromRun, kind: "ran", what }];
        if (listed === 1) {
          expected = [{ ...fromRun, kind: "read", what: "listed.txt" }];
        } else if (known === 1) {
          expected = [];
        }
        expect(sources).toEqual(expected);
      }),
    { arbitrary: { runs: 50 } }
  );
});

// --------------------------------------------------------------- the versions

interface Versions {
  readonly changesBetween: (
    before: Record<string, string>,
    after: Record<string, string>
  ) => Record<string, string | null>;
  readonly hashIn: (
    manifest: Record<string, string>,
    path: string
  ) => string | null;
  readonly manifestNow: (
    root: string,
    cache?: string
  ) => Record<string, string>;
  readonly snapshot: (folder: string, root: string) => Record<string, string>;
  readonly versionForms: (
    versions: readonly {
      readonly manifest: Record<string, string>;
      readonly name: string;
    }[],
    watched: readonly string[]
  ) => readonly unknown[];
  readonly versionsOf: (folder: string) => readonly {
    readonly manifest: Record<string, string>;
    readonly name: string;
  }[];
}

const library = scripts<Versions>("lib.mjs");
const ignoring = scripts<{
  readonly ownEnvironment: () => NodeJS.ProcessEnv;
  readonly hasherFor: (
    root: string,
    paths: readonly string[]
  ) => (manifest: Record<string, string>, path: string) => string | null;
}>("lib.mjs");

const FILES = ["a", "b", "d/c", "d/e/f", "g/h"];
const PROBES = [".", "a", "d", "d/c", "d/e", "d/e/f", "g", "x", "d/x"];

/** A project's files, each holding one of a few contents or missing. */
const project = Arbitrary.map(
  Arbitrary.array(between(0, 2), {
    minLength: FILES.length,
    maxLength: FILES.length,
  }),
  (held) =>
    Object.fromEntries(
      FILES.flatMap((file, at) =>
        held[at] === 0 ? [] : [[file, `content ${held[at]}`] as const]
      )
    ) as Record<string, string>
);

const under = (files: Record<string, string>, path: string) =>
  Object.entries(files)
    .filter(
      ([file]) => path === "." || file === path || file.startsWith(`${path}/`)
    )
    .sort(([a], [b]) => a.localeCompare(b));

const writeProject = (root: string, files: Record<string, string>) => {
  rmSync(root, { force: true, recursive: true });
  mkdirSync(root, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), content);
  }
};

const scratch = mkdtempSync(join(tmpdir(), "lion-reasoning-test-"));

describe("the reasoning skill's versions", () => {
  it.effect.prop(
    "give a path the same hash in two versions exactly when it holds the same files",
    { first: project, second: project },
    ({ first, second }) =>
      Effect.gen(function* () {
        const { hashIn, manifestNow } = yield* Effect.promise(() => library);
        const left = join(scratch, "left");
        const right = join(scratch, "right");
        writeProject(left, first);
        writeProject(right, second);
        const before = manifestNow(left);
        const after = manifestNow(right);
        for (const path of PROBES) {
          const same =
            canonical(under(first, path)) === canonical(under(second, path));
          expect({
            path,
            same: hashIn(before, path) === hashIn(after, path),
          }).toEqual({ path, same });
          expect({ path, missing: hashIn(before, path) === null }).toEqual({
            missing: path !== "." && under(first, path).length === 0,
            path,
          });
        }
      }),
    { arbitrary: { runs: 60 } }
  );

  it.effect.prop(
    "leave out the task folder's own files, wherever the folder is, so recording never makes a version",
    {
      files: project,
      notes: Arbitrary.array(between(0, 2), { maxLength: 3, minLength: 1 }),
      relativeTo: Arbitrary.map(between(0, 1), (n) => n === 1),
      where: element(["record", "deep/record", ".lion/record"]),
    },
    ({ files, notes, relativeTo, where }) =>
      Effect.gen(function* () {
        const { manifestNow, snapshot, versionsOf } = yield* Effect.promise(
          () => library
        );
        const root = join(scratch, "own");
        const folder = join(root, where);
        writeProject(root, files);
        mkdirSync(folder, { recursive: true });
        const outside = manifestNow(root);
        for (const [at, note] of notes.entries()) {
          writeFileSync(join(folder, `note-${at}.json`), `note ${note}`);
          // The scripts run in the task folder and name it ".".
          const back = process.cwd();
          try {
            if (relativeTo) {
              process.chdir(folder);
            }
            snapshot(relativeTo ? "." : folder, root);
          } finally {
            process.chdir(back);
          }
        }
        const kept = versionsOf(folder);
        expect(kept.length).toBe(1);
        expect(kept[0]?.manifest).toEqual(
          Object.fromEntries(
            Object.entries(outside).filter(
              ([path]) => !path.startsWith(`${where}/`)
            )
          )
        );
      }),
    { arbitrary: { runs: 40 } }
  );

  it.effect.prop(
    "are kept as changes and read back as the projects they were taken from",
    { states: Arbitrary.array(project, { minLength: 1, maxLength: 4 }) },
    ({ states }) =>
      Effect.gen(function* () {
        const { manifestNow, snapshot, versionsOf } = yield* Effect.promise(
          () => library
        );
        const root = join(scratch, "kept");
        const folder = join(scratch, "kept-task");
        rmSync(folder, { force: true, recursive: true });
        mkdirSync(folder, { recursive: true });
        const taken = states.map((files) => {
          writeProject(root, files);
          snapshot(folder, root);
          return manifestNow(root);
        });
        const distinct = taken.filter(
          (manifest, at) =>
            at === 0 || canonical(manifest) !== canonical(taken[at - 1])
        );
        expect(versionsOf(folder).map((version) => version.manifest)).toEqual(
          distinct
        );
      }),
    { arbitrary: { runs: 40 } }
  );

  it.effect.prop(
    "number every version, name the present, and give one name to each state of the watched paths",
    {
      states: Arbitrary.array(project, { minLength: 1, maxLength: 5 }),
      watched: Arbitrary.array(element(PROBES), { maxLength: 3 }),
    },
    ({ states, watched }) =>
      Effect.gen(function* () {
        const { hashIn, versionForms } = yield* Effect.promise(() => library);
        const paths = [...new Set(watched)];
        const versions = states.map((manifest, at) => ({
          manifest,
          name: at === states.length - 1 ? NOW : `v${at}`,
        }));
        const facts = (versionForms(versions, paths) as unknown[][]).slice(1);
        const plain = (part: unknown) =>
          Array.isArray(part) && part[0] === "quote" ? part[1] : part;
        const numbered = facts
          .filter((fact) => fact[0] === "version")
          .map(
            (fact) => [plain(fact[1]) as string, fact[2] as number] as const
          );
        const state = (name: string) =>
          canonical(
            paths.map((path) => {
              const row = facts.find(
                (fact) =>
                  fact[0] === "at" &&
                  plain(fact[1]) === name &&
                  plain(fact[2]) === path
              );
              return row === undefined ? "absent" : plain(row[3]);
            })
          );
        const truth = (manifest: Record<string, string>) =>
          canonical(paths.map((path) => hashIn(manifest, path)));
        expect(numbered.map(([, number]) => number)).toEqual(
          versions.map((_, at) => at + 1)
        );
        versions.forEach((version, at) => {
          const name = numbered[at]?.[0] as string;
          expect(state(name)).toBe(truth(version.manifest));
          if (version.name === NOW) {
            expect(name).toBe(NOW);
          }
        });
        const old = [
          ...new Set(numbered.map(([name]) => name).filter((n) => n !== NOW)),
        ];
        expect(new Set(old.map(state)).size).toBe(old.length);
      }),
    { arbitrary: { runs: 60 } }
  );

  it.effect.prop(
    "hash a path git ignores from the disk, as it is now, in every version, whatever repository the environment names",
    {
      after: between(0, 2),
      before: between(1, 2),
      named: Arbitrary.array(
        Arbitrary.schema(
          Schema.Literals(["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"])
        ),
        { maxLength: 3 }
      ),
    },
    ({ after, before, named }) =>
      Effect.gen(function* () {
        const { hasherFor, ownEnvironment } = yield* Effect.promise(
          () => ignoring
        );
        const root = join(scratch, "ignoring");
        rmSync(root, { force: true, recursive: true });
        mkdirSync(join(root, "dist"), { recursive: true });
        spawnSync("git", ["init", "-q"], { cwd: root, env: ownEnvironment() });
        writeFileSync(join(root, ".gitignore"), "dist/\n");
        writeFileSync(join(root, "dist/out.js"), `built ${before}`);
        // A repository that ignores nothing, which a git hook would name.
        const decoy = join(scratch, "decoy");
        rmSync(decoy, { force: true, recursive: true });
        mkdirSync(decoy, { recursive: true });
        spawnSync("git", ["init", "-q"], { cwd: decoy, env: ownEnvironment() });
        const decoyConfig = readFileSync(join(decoy, ".git", "config"), "utf8");
        const values: Record<string, string> = {
          GIT_DIR: join(decoy, ".git"),
          GIT_INDEX_FILE: join(decoy, ".git", "index"),
          GIT_WORK_TREE: decoy,
        };
        const saved = new Map(named.map((n) => [n, process.env[n]]));
        for (const n of named) {
          process.env[n] = values[n];
        }
        try {
          const then = hasherFor(root, ["dist"])({}, "dist");
          if (after === 0) {
            rmSync(join(root, "dist"), { force: true, recursive: true });
          } else {
            writeFileSync(join(root, "dist/out.js"), `built ${after}`);
          }
          const hash = hasherFor(root, ["dist"]);
          expect({
            inAnyVersion:
              hash({ "dist/out.js": "x" }, "dist") === hash({}, "dist"),
            same: hash({}, "dist") === then,
            gone: hash({}, "dist") === null,
          }).toEqual({
            gone: after === 0,
            inAnyVersion: true,
            same: after === before,
          });
        } finally {
          for (const [n, value] of saved) {
            if (value === undefined) {
              delete process.env[n];
            } else {
              process.env[n] = value;
            }
          }
        }
        expect(readFileSync(join(decoy, ".git", "config"), "utf8")).toBe(
          decoyConfig
        );
      }),
    { arbitrary: { runs: 30 } }
  );
});

// ------------------------------------------------- the whole chain, on files

describe("the reasoning skill, on files that change", () => {
  it.effect.prop(
    "counts an observation as the present exactly while its file holds what it held",
    {
      after: between(0, 2),
      before: between(1, 2),
      other: between(0, 2),
    },
    ({ after, before, other }) =>
      Effect.gen(function* () {
        const { hashIn, snapshot, versionsOf, versionForms, manifestNow } =
          yield* Effect.promise(() => library);
        const { stepOf } = yield* Effect.promise(() => recorder);
        const root = join(scratch, "chain");
        const folder = join(scratch, "chain-task");
        rmSync(folder, { force: true, recursive: true });
        mkdirSync(folder, { recursive: true });
        const files = (watched: number, beside: number) =>
          Object.fromEntries([
            ...(watched === 0 ? [] : [["src/a", `a ${watched}`]]),
            ["src/b", `b ${beside}`],
          ]) as Record<string, string>;
        writeProject(root, files(before, 0));
        const manifest = snapshot(folder, root);
        const notes: Notes = {
          beliefs: [],
          needed: [],
          observations: [
            {
              id: "o",
              question: { holds: "a" },
              quote: "a",
              source: "r",
              value: before,
            },
          ],
          problems: [],
          sources: [{ about: ["src/a"], id: "r", kind: "read", what: "src/a" }],
        };
        const step = stepOf(
          notes,
          [
            {
              hashes: { "src/a": hashIn(manifest, "src/a") },
              id: "r",
              kind: "read",
              what: "src/a",
            },
          ],
          1
        );
        writeProject(root, files(after, other));
        const versions = versionForms(
          [...versionsOf(folder), { manifest: manifestNow(root), name: NOW }],
          ["src/a"]
        );
        const outcome = yield* answerOf([
          "begin",
          core,
          step,
          versions,
          {
            answer: ["find", "?v", ["answer", { holds: "a" }, "?v", "?_"]],
            stale: ["find", "?s", ["stale", "?s", "?_"]],
          },
        ]);
        expect(outcome).toEqual({
          ok: true,
          value:
            after === before
              ? { answer: [before], stale: [] }
              : { answer: [], stale: ["r"] },
        });
      }),
    { arbitrary: { runs: 40 } }
  );
});

// ------------------------------------------------------------------ see.mjs

const seer = scripts<{
  readonly parse: (args: readonly string[]) =>
    | {
        readonly about: readonly string[];
        readonly command: string;
        readonly id: string;
      }
    | undefined;
  readonly transcript: (
    command: string,
    output: string,
    status: number
  ) => string;
}>("see.mjs");

const PATH_TEXT = /^[a-z./]{1,8}$/;
const COMMAND_TEXT = /^[a-z"' |-]{1,6}$/;
const ID_TEXT = /^[a-z0-9][a-z0-9._-]{0,6}$/;
const OUTPUT_TEXT = /^[a-z \n]{0,20}$/;

describe("the reasoning skill's runner", () => {
  it.effect.prop(
    "reads back the id, paths, and command it was given, and keeps the exit status",
    {
      about: Arbitrary.array(text(PATH_TEXT), { maxLength: 3 }),
      command: Arbitrary.array(text(COMMAND_TEXT), {
        minLength: 1,
        maxLength: 3,
      }),
      id: text(ID_TEXT),
      output: text(OUTPUT_TEXT),
      status: between(0, 3),
    },
    ({ about, command, id, output, status }) =>
      Effect.gen(function* () {
        const { parse, transcript } = yield* Effect.promise(() => seer);
        const args = [
          id,
          ...about.flatMap((p) => ["--about", p]),
          "--",
          ...command,
        ];
        expect(parse(args)).toEqual({ about, command: command.join(" "), id });
        const kept = transcript(command.join(" "), output, status);
        expect(kept.startsWith(`$ ${command.join(" ")}\n${output}`)).toBe(true);
        expect(kept.endsWith(`[exit status ${status}]\n`)).toBe(true);
        expect(parse([id, "--about"])).toBeUndefined();
        expect(parse(["--", ...command])).toBeUndefined();
      }),
    { arbitrary: { runs: 100 } }
  );
});

// ------------------------------------------------------------- the scripts

/** The skill is installed as a link, so its scripts are started through one. */
const linked = mkdtempSync(join(tmpdir(), "lion-reasoning-"));
symlinkSync(SKILL, join(linked, "skill"));
for (const name of [
  "ask.mjs",
  "record.mjs",
  "replay.mjs",
  "see.mjs",
  "start.mjs",
]) {
  symlinkSync(join(SKILL, "scripts", name), join(linked, name));
}

const started = element([
  (name: string) => join(SKILL, "scripts", name),
  (name: string) => join(linked, "skill", "scripts", name),
  (name: string) => join(linked, name),
]);

/** Each script, started with nothing it can work on, and what it then says. */
const idle = element([
  { args: [], name: "ask.mjs", says: "There is no steps folder" },
  { args: [], name: "record.mjs", says: "Usage:" },
  { args: [], name: "replay.mjs", says: "There is no steps folder" },
  { args: [], name: "see.mjs", says: "Usage:" },
  { args: ["Not A Name"], name: "start.mjs", says: "Usage:" },
]);

describe("the reasoning skill's scripts", () => {
  it.prop(
    "run by whatever path they are started, also through a link",
    { idle, started },
    ({ idle: { args, name, says }, started: path }) => {
      const run = spawnSync(process.execPath, [path(name), ...args], {
        cwd: linked,
        encoding: "utf8",
      });
      expect({ said: run.stderr.includes(says), status: run.status }).toEqual({
        said: true,
        status: 1,
      });
    },
    { arbitrary: { runs: 30 } }
  );
});
