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
import { Arbitrary, Effect } from "effect";
import { canonical, evaluate, load } from "../lion.ts";
import { CORE, REPOSITORY } from "../sources.ts";
import { between, element, oneOf, text, word } from "./generators.ts";

const SKILL = join(REPOSITORY, "skills/lion-reasoning");
const OPTIONS = { arbitrary: { runs: 200 } };

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
  ({ beliefs, needed, observations, problem, sources, versions }) => {
    const named = sources.map((source, at) => ({
      about: Object.fromEntries(
        source.about.map(([path, held]) => [PATHS[path] as string, `h${held}`])
      ),
      id: `s${at}`,
      kind: source.kind,
    }));
    return {
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
 * versions where the problem shows, and any other belief in the present.
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

// --------------------------------------------------------------- the recorder

interface Notes {
  readonly beliefs: readonly {
    readonly explains: readonly string[];
    readonly id: string;
    readonly predicts: readonly {
      readonly question: unknown;
      readonly value: unknown;
    }[];
    readonly statement: string;
  }[];
  readonly needed: readonly unknown[];
  readonly observations: readonly {
    readonly id: string;
    readonly question: unknown;
    readonly quote: string;
    readonly source: string;
    readonly value: unknown;
  }[];
  readonly problems: readonly {
    readonly id: string;
    readonly question: unknown;
    readonly statement: string;
    readonly value: unknown;
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
    "hash a path git ignores from the disk, as it is now, in every version",
    { after: between(0, 2), before: between(1, 2) },
    ({ after, before }) =>
      Effect.gen(function* () {
        const { hasherFor } = yield* Effect.promise(() => ignoring);
        const root = join(scratch, "ignoring");
        rmSync(root, { force: true, recursive: true });
        mkdirSync(join(root, "dist"), { recursive: true });
        spawnSync("git", ["init", "-q"], { cwd: root });
        writeFileSync(join(root, ".gitignore"), "dist/\n");
        writeFileSync(join(root, "dist/out.js"), `built ${before}`);
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
