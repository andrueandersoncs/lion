/**
 * The research frame's rules, checked on generated claims against a plain
 * model. The frame turns what Lion's commits, its docs, and runs of Lion say
 * into questions with one right answer, keeps each publisher's latest word,
 * and derives the inconsistencies a sound project would not have: rules in
 * force that predict different behavior, behavior a rule in force does not
 * predict, removals and breaking changes with no decision, measurements that
 * do not chain, commits nothing was recorded from, and drift between what the
 * repository says and what Lion does.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { run } from "@lionlang/core/evaluation/evaluate";
import { LogicDatabase } from "@lionlang/core/logic/database";
import { stdlib } from "@lionlang/core/modules";
import { Arbitrary, Effect, Schema } from "effect";
import { formsOf, REPOSITORY } from "../record.ts";

const SKILL_CORE = join(REPOSITORY, "skills/lion-research/assets/core.json");
const FRAME = join(REPOSITORY, "history/research/steps/01-frame.src.json");
const read = (path: string) => formsOf(JSON.parse(readFileSync(path, "utf8")));

const REPO = "Lion repository";
const HEAD = "Lion at HEAD";

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));
const pick = <A>(items: readonly A[]) =>
  Arbitrary.map(int(0, items.length - 1), (at) => items[at] as A);
const boolean = Arbitrary.schema(Schema.Boolean);

interface Source {
  readonly commit: boolean;
  readonly id: string;
  readonly published: number;
  readonly publisher: string;
}

interface Claim {
  readonly id: string;
  readonly says: Record<string, unknown>;
  readonly source: string;
}

const CASES = ["c0", "c1", "c2"];
const VALUES = ["v0", "v1"];
const RULES = ["r0", "r1", "r2"];
const FEATURES = ["f0", "f1"];
const TOPICS = ["t0", "t1"];
const METRICS = ["m0"];

/** One statement, of any kind the frame knows. */
const says: Arbitrary.Arbitrary<Record<string, unknown>> = Arbitrary.flatMap(
  // Rules and figures twice as often as the rest, so a rule said twice and a
  // chain of three figures are common.
  int(0, 6),
  (kind): Arbitrary.Arbitrary<Record<string, unknown>> => {
    if (kind === 0) {
      return Arbitrary.map(
        Arbitrary.all([pick(FEATURES), boolean]),
        ([feature, present]) => ({ feature, kind: "function", present })
      );
    }
    if (kind === 1) {
      return Arbitrary.map(
        Arbitrary.all([
          pick(CASES),
          pick(VALUES),
          int(0, 3),
          boolean,
          pick(["library", "evaluation"]),
        ]),
        ([behavior, is, follows, breaking, area]) => ({
          area,
          behavior,
          is,
          ...(follows === 0 ? { follows: "javascript" } : {}),
          ...(follows === 1 ? { follows: "scheme" } : {}),
          ...(breaking ? { breaking: true } : {}),
        })
      );
    }
    if (kind === 2 || kind === 3) {
      return Arbitrary.map(
        Arbitrary.all([
          pick(RULES),
          // Most statements of a rule hold and predict something, so a rule
          // restated with another prediction for a case is common.
          Arbitrary.map(int(0, 3), (n) => n > 0),
          Arbitrary.array(Arbitrary.all([pick(CASES), pick(VALUES)]), {
            minLength: 1,
            maxLength: 2,
          }),
          Arbitrary.array(pick(CASES), { maxLength: 1 }),
        ]),
        ([rule, holds, predicts, except]) => ({
          area: "logic",
          holds,
          rule,
          statement: `rule ${rule}`,
          ...(predicts.length === 0
            ? {}
            : {
                predicts: predicts.map(([behavior, is]) => ({ behavior, is })),
              }),
          ...(except.length === 0 ? {} : { except }),
        })
      );
    }
    if (kind === 4) {
      return Arbitrary.map(
        Arbitrary.all([pick(TOPICS), pick(VALUES)]),
        ([decision, chose]) => ({ area: "process", chose, decision })
      );
    }
    return Arbitrary.map(
      Arbitrary.all([
        pick(METRICS),
        int(0, 3),
        Arbitrary.flatMap(boolean, (some) =>
          some
            ? Arbitrary.map(int(0, 3), (n): number | null => n)
            : Arbitrary.Constant<number | null>(null)
        ),
      ]),
      ([measured, after, before]) => ({
        after,
        area: "metrics",
        measured,
        ...(before === null ? {} : { before }),
      })
    );
  }
);

interface World {
  readonly claims: readonly Claim[];
  readonly sources: readonly Source[];
}

/** Commits, a document, and runs of Lion, with what each says. */
const world: Arbitrary.Arbitrary<World> = Arbitrary.flatMap(
  int(1, 6),
  (count) =>
    Arbitrary.map(
      Arbitrary.all([
        Arbitrary.array(Arbitrary.all([int(0, count + 1), says]), {
          maxLength: 18,
        }),
        Arbitrary.array(int(0, 4), { maxLength: count, minLength: count }),
        // What the document and a run say of a feature, so a run often sees
        // gone what the repository's latest word says is gone.
        Arbitrary.array(Arbitrary.all([boolean, pick(FEATURES), boolean]), {
          maxLength: 4,
        }),
      ]),
      ([said, gaps, seen]) => {
        // Commits at rising times, some at the same time; then a document and
        // a run, both dated by the last commit.
        let time = 20_260_101_000_000;
        const sources: Source[] = gaps.map((gap, at) => {
          time += gap === 0 ? 0 : gap * 100;
          return {
            commit: true,
            id: `s${at}`,
            published: time,
            publisher: REPO,
          };
        });
        sources.push({
          commit: false,
          id: "doc",
          published: time,
          publisher: REPO,
        });
        sources.push({
          commit: false,
          id: "run",
          published: time,
          publisher: HEAD,
        });
        const claims = said.map(([at, s], n): Claim => {
          // Runs observe behavior, and whether a feature is there; everything
          // else comes from commits or the doc.
          const source = sources[Math.min(at, sources.length - 1)] as Source;
          const fromRun =
            source.publisher === HEAD && !("behavior" in s || "feature" in s);
          return {
            id: `k${n}`,
            says: s,
            source: fromRun ? (sources[0] as Source).id : source.id,
          };
        });
        const observed = seen.map(
          ([byRun, feature, present], n): Claim => ({
            id: `o${n}`,
            says: { feature, kind: "function", present },
            source: byRun ? "run" : "doc",
          })
        );
        return { claims: [...claims, ...observed], sources };
      }
    )
);

/** The record's rules and the links, where what is decided is worked out. */
const RECORD_CORE = join(REPOSITORY, "history/core.json");
const LINKS = join(REPOSITORY, "history/research/steps/05-links.src.json");

const programOf = (w: World, question: unknown) => [
  "begin",
  ...read(SKILL_CORE),
  ...read(FRAME),
  ...read(RECORD_CORE),
  ...read(LINKS),
  [
    "fact",
    ...w.sources.map((s) => [
      "source",
      ["quote", s.id],
      [
        "quote",
        s.commit
          ? `https://example.com/commit/${s.id}`
          : `https://example.com/${s.id}`,
      ],
      ["quote", s.id],
      ["quote", s.publisher],
      ["quote", "primary"],
      s.published,
    ]),
    ...w.claims.map((c) => [
      "claim",
      ["quote", c.id],
      ["quote", c.source],
      ["quote", "words"],
      ["quote", c.says],
    ]),
  ],
  question,
];

// ------------------------------------------------------------------ the model

const questionOf = (s: Record<string, unknown>, source: string) => {
  if ("feature" in s) {
    return [`feature ${s.feature}`, String(s.present)];
  }
  if ("behavior" in s) {
    return [`behavior ${s.behavior}`, String(s.is)];
  }
  if ("rule" in s) {
    return [`rule ${s.rule}`, String(s.holds)];
  }
  if ("decision" in s) {
    return [`decision ${s.decision}`, String(s.chose)];
  }
  return [`measured ${s.measured} ${source}`, String(s.after)];
};

const model = (w: World) => {
  const sourceOf = new Map(w.sources.map((s) => [s.id, s]));
  const said = w.claims.map((c) => {
    const [q, v] = questionOf(c.says, c.source);
    const s = sourceOf.get(c.source) as Source;
    return {
      c,
      p: s.publisher,
      q: q as string,
      t: s.published,
      v: v as string,
    };
  });
  /** A publisher's latest word on a question: what it said at its last date. */
  const firsthand = (q: string, p: string) => {
    const mine = said.filter((x) => x.q === q && x.p === p);
    const last = Math.max(...mine.map((x) => x.t));
    return new Set(mine.filter((x) => x.t === last).map((x) => x.v));
  };
  const rules = w.claims.filter((c) => "rule" in c.says);
  const inForce = new Set(
    RULES.filter((r) => firsthand(`rule ${r}`, REPO).has("true"))
  );
  const predictionsOf = (c: Claim) =>
    c.says.holds === true
      ? ((c.says.predicts as { behavior: string; is: string }[] | undefined) ??
        [])
      : [];
  const timeOf = (c: Claim) => (sourceOf.get(c.source) as Source).published;
  // A rule's prediction for a case stands until a later statement of the
  // rule predicts something else for it.
  const predicted = rules.flatMap((c) =>
    inForce.has(c.says.rule as string)
      ? predictionsOf(c)
          .filter(
            (p) =>
              !rules.some(
                (later) =>
                  later.says.rule === c.says.rule &&
                  timeOf(c) < timeOf(later) &&
                  predictionsOf(later).some(
                    (q) => q.behavior === p.behavior && q.is !== p.is
                  )
              )
          )
          .map((p) => ({
            case: p.behavior,
            r: c.says.rule as string,
            v: p.is,
          }))
      : []
  );
  const excepted = (r: string, k: string) =>
    rules.some(
      (c) =>
        c.says.rule === r &&
        ((c.says.except as string[] | undefined) ?? []).includes(k)
    );
  const set = (rows: string[]) => [...new Set(rows)].sort();
  const conflict = predicted.flatMap((a) =>
    predicted
      .filter(
        (b) =>
          a.case === b.case &&
          a.v !== b.v &&
          !excepted(a.r, a.case) &&
          !excepted(b.r, b.case)
      )
      .map((b) => `${a.r} ${b.r} ${a.case}`)
  );
  const contrary = predicted.flatMap((a) =>
    [REPO, HEAD].flatMap((p) =>
      [...firsthand(`behavior ${a.case}`, p)]
        .filter((w2) => w2 !== a.v && !excepted(a.r, a.case))
        .map((w2) => `${a.r} ${a.case} ${a.v} ${w2} ${p}`)
    )
  );
  const precedent = said
    .filter(
      (x) =>
        "follows" in x.c.says &&
        [REPO, HEAD].some((p) => firsthand(x.q, p).has(x.v))
    )
    .map((x) => `${x.c.says.behavior} ${x.c.says.follows} ${x.c.id}`);
  // A precedent other than Scheme, Racket, or JSON breaks the assumption,
  // unless it is JavaScript for a library function.
  const schemePrecedent = said
    .filter(
      (x) =>
        "follows" in x.c.says &&
        [REPO, HEAD].some((p) => firsthand(x.q, p).has(x.v)) &&
        !["scheme", "racket", "json"].includes(x.c.says.follows as string) &&
        !(x.c.says.follows === "javascript" && x.c.says.area === "library")
    )
    .map((x) => x.c.id);
  const decidedIn = new Set(
    w.claims.filter((c) => "decision" in c.says).map((c) => c.source)
  );
  const removed = FEATURES.flatMap((f) => {
    const q = `feature ${f}`;
    if (!firsthand(q, REPO).has("false")) {
      return [];
    }
    const mine = said.filter((x) => x.q === q && x.p === REPO);
    const last = Math.max(...mine.map((x) => x.t));
    return mine
      .filter((x) => x.v === "false" && x.t === last)
      .map((x) => ({ f, s: x.c.source }));
  });
  const undecidedRemoval = removed
    .filter((r) => !decidedIn.has(r.s))
    .map((r) => `${r.f} ${r.s}`);
  const undecidedBreaking = w.claims
    .filter((c) => c.says.breaking === true && !decidedIn.has(c.source))
    .map((c) => `${c.says.behavior} ${c.source}`);
  const measures = w.claims
    .filter((c) => "measured" in c.says && sourceOf.get(c.source)?.commit)
    .map((c) => ({
      a: c.says.after as number,
      b: c.says.before as number | undefined,
      m: c.says.measured as string,
      s: c.source,
      t: (sourceOf.get(c.source) as Source).published,
    }));
  const chainBreak = measures.flatMap((x) =>
    measures
      .filter(
        (y) =>
          y.m === x.m &&
          x.t < y.t &&
          y.b !== undefined &&
          x.a !== y.b &&
          !measures.some((z) => z.m === x.m && x.t < z.t && z.t < y.t)
      )
      .map((y) => `${x.m} ${x.s} ${y.s} ${x.a} ${y.b}`)
  );
  const silent = w.sources
    .filter((s) => s.commit && !w.claims.some((c) => c.source === s.id))
    .map((s) => s.id);
  const questions = new Set(said.map((x) => x.q));
  const drift = [...questions].flatMap((q) =>
    [...firsthand(q, REPO)].flatMap((v) =>
      [...firsthand(q, HEAD)]
        .filter((w2) => w2 !== v)
        .map((w2) => `${q} ${v} ${w2}`)
    )
  );
  const reversed = TOPICS.flatMap((t) => {
    const q = `decision ${t}`;
    const mine = said.filter((x) => x.q === q && x.p === REPO);
    if (mine.length === 0) {
      return [];
    }
    const last = Math.max(...mine.map((x) => x.t));
    const latest = new Set(mine.filter((x) => x.t === last).map((x) => x.v));
    return mine
      .filter((x) => x.t < last && !latest.has(x.v))
      .flatMap((x) => [...latest].map((after) => `${t} ${x.v} ${after}`));
  });
  return {
    chainBreak: set(chainBreak),
    conflict: set(conflict),
    predicted: set(predicted.map((p) => `${p.r} ${p.case} ${p.v}`)),
    schemePrecedent: set(schemePrecedent),
    contrary: set(contrary),
    drift: set(drift),
    inForce: set([...inForce]),
    precedent: set(precedent),
    reversed: set(reversed),
    silent: set(silent),
    undecidedBreaking: set(undecidedBreaking),
    undecidedRemoval: set(undecidedRemoval),
  };
};

const text = (...parts: string[]) => [
  "string/concat",
  ...parts.flatMap((p, at) => (at === 0 ? [p] : [" ", p])),
];

const QUESTIONS = {
  chainBreak: [
    "find",
    [
      "string/concat",
      "?m",
      " ",
      "?a",
      " ",
      "?b",
      " ",
      ["number/toString", "?x"],
      " ",
      ["number/toString", "?y"],
    ],
    ["chain_break", "?m", "?a", "?b", "?x", "?y"],
  ],
  conflict: [
    "find",
    text("?r", "?o", "?k"),
    ["conflict", "?r", "?o", "?k", "?_", "?_"],
  ],
  contrary: [
    "find",
    text("?r", "?k", "?v", "?w", "?p"),
    ["contrary", "?r", "?k", "?v", "?w", "?p"],
  ],
  drift: [
    "find",
    [
      "string/concat",
      [
        "cond",
        [
          ["value/string?", ["object/get", "?q", "feature", null]],
          ["string/concat", "feature ", ["object/get", "?q", "feature", null]],
        ],
        [
          ["value/string?", ["object/get", "?q", "behavior", null]],
          [
            "string/concat",
            "behavior ",
            ["object/get", "?q", "behavior", null],
          ],
        ],
        [
          ["value/string?", ["object/get", "?q", "rule", null]],
          ["string/concat", "rule ", ["object/get", "?q", "rule", null]],
        ],
        [
          ["value/string?", ["object/get", "?q", "decision", null]],
          [
            "string/concat",
            "decision ",
            ["object/get", "?q", "decision", null],
          ],
        ],
        [
          "else",
          [
            "string/concat",
            "measured ",
            ["object/get", "?q", "measured", null],
            " ",
            ["object/get", "?q", "at", null],
          ],
        ],
      ],
      " ",
      ["object/json-stringify", "?v"],
      " ",
      ["object/json-stringify", "?w"],
    ],
    ["drift", "?q", "?v", "?w"],
  ],
  inForce: ["find", "?r", ["in_force", "?r"]],
  predicted: [
    "find",
    text("?r", "?k", "?v"),
    ["predicted", "?r", "?k", "?v", "?_"],
  ],
  precedent: ["find", text("?k", "?f", "?c"), ["precedent", "?k", "?f", "?c"]],
  schemePrecedent: ["find", "?c", ["violated", "scheme-precedent", "?c"]],
  reversed: ["find", text("?t", "?b", "?a"), ["reversed", "?t", "?b", "?a"]],
  silent: ["find", "?s", ["silent", "?s"]],
  undecidedBreaking: [
    "find",
    text("?k", "?s"),
    ["undecided_breaking", "?k", "?s"],
  ],
  undecidedRemoval: [
    "find",
    text("?f", "?s"),
    ["undecided_removal", "?f", "?s"],
  ],
};

/** Lion writes a boolean's or number's JSON; the model writes it as a word. */
const unquote = (row: string) => row.replaceAll('"', "");

describe("the research frame", () => {
  it.effect.prop(
    "derives what a plain model of latest words, predictions, and decisions says",
    { w: world },
    ({ w }) =>
      Effect.gen(function* () {
        const answers = (yield* run(programOf(w, QUESTIONS) as never, stdlib, {
          database: new LogicDatabase(),
        })) as Record<string, string[]>;
        const expected = model(w);
        for (const [name, rows] of Object.entries(expected)) {
          expect(
            [...new Set((answers[name] ?? []).map(unquote))].sort(),
            name
          ).toEqual(rows.map(unquote));
        }
      }),
    { arbitrary: { runs: 300 } }
  );
});

const FINDINGS = join(
  REPOSITORY,
  "history/research/steps/06-findings.src.json"
);

/** Pairs of an assumption and its evidence: the shape every finding has. */
const ASSUMPTIONS = ["a0", "a1", "every-commit-read"];
const PAIRS = ASSUMPTIONS.flatMap((assumption) =>
  ["w0", "w1"].map((w) => ({ assumption, witness: { case: w } }))
);
const someOf = Arbitrary.map(
  Arbitrary.array(boolean, {
    minLength: PAIRS.length,
    maxLength: PAIRS.length,
  }),
  (keep) => PAIRS.filter((_, at) => keep[at] === true)
);

type Pair = (typeof PAIRS)[number];
const key = (pair: Pair) => `${pair.assumption} ${pair.witness.case}`;
const keys = (pairs: readonly Pair[]) => pairs.map(key).sort();
const minus = (pairs: readonly Pair[], away: readonly Pair[]) =>
  pairs.filter((pair) => !away.some((other) => key(other) === key(pair)));

const findingsProgram = (sets: {
  accepted: readonly Pair[];
  known: readonly Pair[];
  violated: readonly Pair[];
}) => {
  const facts = (relation: string, pairs: readonly Pair[], extra: unknown[]) =>
    pairs.length === 0
      ? []
      : [
          [
            "fact",
            ...pairs.map((pair) => [
              relation,
              ["quote", pair.assumption],
              ["quote", pair.witness],
              ...extra,
            ]),
          ],
        ];
  const asked = (relation: string) => [
    "find",
    ["string/concat", "?a", " ", ["object/get", "?w", "case", null]],
    [relation, "?a", "?w"],
  ];
  return [
    "begin",
    ...read(SKILL_CORE),
    ...read(FINDINGS),
    [
      "fact",
      ...ASSUMPTIONS.map((id) => [
        "assumption",
        ["quote", id],
        ["quote", `the statement of ${id}`],
      ]),
    ],
    ...facts("violated", sets.violated, []),
    ...facts("accepted", sets.accepted, [["quote", "a reason"]]),
    ...facts("known", sets.known, [["quote", "a note"]]),
    {
      fresh: asked("fresh_finding"),
      open: asked("open_finding"),
      stale: asked("stale_finding"),
    },
  ];
};

describe("the research's findings", () => {
  it.effect.prop(
    "are open, new, or stale as sets of violations, acceptances, and known findings say",
    { accepted: someOf, known: someOf, violated: someOf },
    ({ accepted, known, violated }) =>
      Effect.gen(function* () {
        const got = (yield* run(
          findingsProgram({ accepted, known, violated }) as never,
          stdlib,
          { database: new LogicDatabase() }
        )) as Record<string, string[]>;
        const open = minus(violated, accepted).filter(
          (pair) => pair.assumption !== "every-commit-read"
        );
        const expected = {
          fresh: keys(minus(open, known)),
          open: keys(open),
          stale: [
            ...new Set([
              ...keys(minus(known, open)),
              ...keys(minus(accepted, violated)),
            ]),
          ].sort(),
        };
        for (const [name, rows] of Object.entries(expected)) {
          expect([...new Set(got[name] ?? [])].sort(), name).toEqual(rows);
        }
      }),
    { arbitrary: { runs: 200 } }
  );
});
