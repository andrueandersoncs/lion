/**
 * The lion-research skill ships Lion programs: `assets/core.json`, whose
 * rules say who stands behind each answer of a research model, and
 * `assets/utc-minutes.json`, which turns a clock time into a number. It also
 * ships a script that packs a model into an explorer page. These properties
 * check the rules against a plain model of what they define, the clock
 * against JavaScript's, and the page against what it was given.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { canonical, evaluate, load } from "../lion.ts";
import { CORE, REPOSITORY } from "../sources.ts";
import { between, element, oneOf, text } from "./generators.ts";

const SKILL = join(REPOSITORY, "skills/lion-research");
const OPTIONS = { arbitrary: { runs: 200 } };

const asset = (name: string): unknown =>
  JSON.parse(readFileSync(join(SKILL, "assets", name), "utf8"));
const core = asset("core.json");
const utcMinutes = asset("utc-minutes.json");
const utcText = asset("utc-text.json");
const lion = Effect.runPromise(load(join(REPOSITORY, CORE)));

const answerOf = (program: unknown) =>
  Effect.flatMap(
    Effect.promise(() => lion),
    (evaluator) => evaluate(evaluator, program)
  );

interface Claim {
  readonly id: string;
  /** How the source put it. Claims that differ only here answer alike. */
  readonly note: number;
  readonly source: string;
  readonly topic: string;
  readonly value: number;
}

interface World {
  /** A claim's id, and a source its own source says it took the claim from. */
  readonly attributed: readonly (readonly [string, string])[];
  readonly claims: readonly Claim[];
  /** When each source was published, if it says. */
  readonly published: Readonly<Record<string, number | null>>;
  /** Who stands behind each source. Sources that share one are one voice. */
  readonly publishers: Readonly<Record<string, string>>;
  readonly sources: readonly string[];
}

/**
 * A few sources and claims, with few enough publishers, topics, values, and
 * dates that sources often share a publisher, claims often say the same
 * thing, a publisher often says something else later, and a claim is often
 * credited to a source that says something else.
 */
const world: Arbitrary.Arbitrary<World> = Arbitrary.map(
  Arbitrary.all({
    attributed: Arbitrary.array(Arbitrary.all([between(0, 5), between(0, 3)]), {
      maxLength: 6,
    }),
    claims: Arbitrary.array(
      Arbitrary.all({
        note: between(0, 1),
        source: between(0, 3),
        topic: between(0, 1),
        value: between(0, 1),
      }),
      { maxLength: 8 }
    ),
    publishers: Arbitrary.all([
      between(0, 2),
      between(0, 2),
      between(0, 2),
      between(0, 2),
    ]),
    published: Arbitrary.array(between(0, 3), { minLength: 4, maxLength: 4 }),
    sourceCount: between(1, 4),
  }),
  ({ attributed, claims, published, publishers, sourceCount }) => {
    const named = claims.map((claim, at) => ({
      id: `c${at}`,
      note: claim.note,
      source: `s${claim.source % sourceCount}`,
      topic: `t${claim.topic}`,
      value: claim.value,
    }));
    const pairs = attributed.flatMap(([claim, source]) => {
      const from = named[claim];
      const to = `s${source % sourceCount}`;
      // A claim cannot be taken from the source that makes it.
      return from === undefined || from.source === to
        ? []
        : [[from.id, to] as const];
    });
    return {
      attributed: [
        ...new Map(pairs.map((pair) => [pair.join(), pair])).values(),
      ],
      claims: named,
      // Day 0 stands for a source that gives no date.
      published: Object.fromEntries(
        published.map((day, at) => [`s${at}`, day === 0 ? null : day])
      ),
      publishers: Object.fromEntries(
        publishers.map((publisher, at) => [`s${at}`, `p${publisher}`])
      ),
      sources: Array.from({ length: sourceCount }, (_, at) => `s${at}`),
    };
  }
);

const says = ({ note, topic, value }: Claim) => ({ note, topic, value });

const rows = (columns: readonly string[], goal: readonly unknown[]) => [
  "find",
  ["array/make", ...columns],
  goal,
];

const program = ({
  attributed,
  claims,
  published,
  publishers,
  sources,
}: World) => [
  "begin",
  core,
  [
    "fact",
    ...sources.map((source) => [
      "source",
      source,
      `https://example.com/${source}`,
      ["quote", `Source ${source}`],
      publishers[source],
      "primary",
      published[source] ?? null,
    ]),
    ...claims.map((claim) => [
      "claim",
      claim.id,
      claim.source,
      ["quote", "said so"],
      ["quote", says(claim)],
    ]),
    ...attributed.map(([claim, to]) => ["attributed", claim, to]),
    ["assumption", "low", ["quote", "No claim gives the value 1"]],
  ],
  [
    "rule",
    ["answer", { topic: "?topic" }, "?value", "?claim"],
    [
      "claim",
      "?claim",
      "?_",
      "?_",
      ["schema/open", { topic: "?topic", value: "?value" }],
    ],
  ],
  [
    "rule",
    ["violated", "low", "?claim"],
    ["claim", "?claim", "?_", "?_", ["schema/open", { value: 1 }]],
  ],
  {
    backing: rows(
      ["?question", "?value", "?publishers"],
      ["backing", "?question", "?value", "?publishers"]
    ),
    corroborated: rows(
      ["?question", "?value"],
      ["corroborated", "?question", "?value"]
    ),
    disputed: rows(
      ["?question", "?values"],
      ["disputed", "?question", "?values"]
    ),
    holds: ["find", "?assumption", ["holds", "?assumption"]],
    misquoted: rows(
      ["?claim", "?to", "?question", "?relayed", "?said"],
      ["misquoted", "?claim", "?to", "?question", "?relayed", "?said"]
    ),
    reliance: rows(
      ["?publisher", "?answers"],
      ["reliance", "?publisher", "?answers"]
    ),
    restated: rows(
      ["?question", "?publisher", "?before", "?after"],
      ["restated", "?question", "?publisher", "?before", "?after"]
    ),
    secondhand: rows(
      ["?question", "?value", "?credited"],
      ["secondhand", "?question", "?value", "?credited"]
    ),
    single: rows(
      ["?question", "?value", "?publisher"],
      ["single_origin", "?question", "?value", "?publisher"]
    ),
    unread: ["find", "?source", ["unread", "?source"]],
  },
];

const unique = <A>(items: readonly A[]) => [
  ...new Map(items.map((item) => [canonical(item), item])).values(),
];

/**
 * What the skill says its core derives, computed the plain way. A claim is
 * first-hand when its source credits nobody for it. A publisher restates an
 * answer when its latest dated word on the question gives other values and
 * not that one. An answer is backed by the publishers who give it first-hand
 * and have not restated it, is withdrawn when it was restated and nobody
 * backs it, is second-hand when nobody gives it first-hand, and is misquoted
 * when the source it is credited to answers the question, and never with
 * that value.
 */
const expected = ({ attributed, claims, published, publishers }: World) => {
  const creditsOf = (claim: Claim) =>
    attributed.filter(([id]) => id === claim.id).map(([, to]) => to);
  const said = claims
    .filter((claim) => creditsOf(claim).length === 0)
    .map((claim) => ({
      day: published[claim.source] ?? null,
      publisher: publishers[claim.source] as string,
      topic: claim.topic,
      value: claim.value,
    }));
  const restated = unique(
    said.flatMap((earlier) => {
      const days = said
        .filter(
          (other) =>
            other.topic === earlier.topic &&
            other.publisher === earlier.publisher &&
            other.day !== null
        )
        .map((other) => other.day as number);
      const last = Math.max(...days);
      const latest = said.filter(
        (other) =>
          other.topic === earlier.topic &&
          other.publisher === earlier.publisher &&
          other.day === last
      );
      return earlier.day !== null &&
        earlier.day < last &&
        !latest.some((other) => other.value === earlier.value)
        ? latest.map((other) => [
            { topic: earlier.topic },
            earlier.publisher,
            earlier.value,
            other.value,
          ])
        : [];
    })
  );
  const isRestated = (topic: string, publisher: string, value: number) =>
    restated.some(
      ([question, by, before]) =>
        canonical(question) === canonical({ topic }) &&
        by === publisher &&
        before === value
    );
  const answers = unique(claims.map(({ topic, value }) => ({ topic, value })));
  const backersOf = ({ topic, value }: { topic: string; value: number }) =>
    unique(
      said
        .filter(
          (s) =>
            s.topic === topic &&
            s.value === value &&
            !isRestated(topic, s.publisher, value)
        )
        .map((s) => s.publisher)
    ).sort();
  const withdrawn = (answer: { topic: string; value: number }) =>
    backersOf(answer).length === 0 &&
    restated.some(
      ([question, , before]) =>
        canonical(question) === canonical({ topic: answer.topic }) &&
        before === answer.value
    );
  const giving = ({ topic, value }: { topic: string; value: number }) =>
    claims.filter((claim) => claim.topic === topic && claim.value === value);
  const backing = answers.flatMap((answer) => {
    const backers = backersOf(answer);
    return backers.length === 0 ? [] : [{ ...answer, backers }];
  });
  const single = backing.filter(({ backers }) => backers.length === 1);
  return {
    backing: backing.map(({ backers, topic, value }) => [
      { topic },
      value,
      backers,
    ]),
    corroborated: backing
      .filter(({ backers }) => backers.length > 1)
      .map(({ topic, value }) => [{ topic }, value]),
    disputed: unique(claims.map((claim) => claim.topic)).flatMap((topic) => {
      const values = unique(
        claims
          .filter((claim) => claim.topic === topic)
          .map((c) => c.value)
          .filter((value) => !withdrawn({ topic, value }))
      ).sort();
      return values.length > 1 ? [[{ topic }, values]] : [];
    }),
    holds: claims.some((claim) => claim.value === 1) ? [] : ["low"],
    misquoted: claims.flatMap((claim) =>
      creditsOf(claim).flatMap((to) => {
        const theirs = claims.filter(
          (other) => other.source === to && other.topic === claim.topic
        );
        return theirs.some((other) => other.value === claim.value)
          ? []
          : unique(theirs.map((other) => other.value)).map((said) => [
              claim.id,
              to,
              { topic: claim.topic },
              claim.value,
              said,
            ]);
      })
    ),
    reliance: unique(single.map(({ backers }) => backers[0])).map(
      (publisher) => [
        publisher,
        single.filter(({ backers }) => backers[0] === publisher).length,
      ]
    ),
    restated,
    secondhand: answers.flatMap((answer) => {
      const given = giving(answer);
      const credited = unique(given.flatMap(creditsOf)).sort();
      return backersOf(answer).length > 0 ||
        withdrawn(answer) ||
        credited.length === 0
        ? []
        : [[{ topic: answer.topic }, answer.value, credited]];
    }),
    single: single.map(({ backers, topic, value }) => [
      { topic },
      value,
      backers[0],
    ]),
    unread: unique(attributed.map(([, to]) => to)).filter(
      (to) => !claims.some((claim) => claim.source === to)
    ),
  };
};

/** Each answer as a set: the rules say which rows there are, not their order. */
const asSets = (answers: Record<string, readonly unknown[]>) =>
  Object.fromEntries(
    Object.entries(answers).map(([name, rows]) => [
      name,
      rows.map(canonical).sort(),
    ])
  );

/** Text in order, with null, a sense nobody stated, first, as Lion sorts it. */
const nullFirst = (a: string | null, b: string | null) => {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return -1;
  }
  return b === null ? 1 : a.localeCompare(b);
};

describe("the research skill's core rules", () => {
  it.effect.prop(
    "derive what a plain model of provenance derives",
    { given: world },
    ({ given }) =>
      Effect.gen(function* () {
        const outcome = yield* answerOf(program(given));
        expect(outcome.ok ? asSets(outcome.value as never) : outcome).toEqual(
          asSets(expected(given))
        );
      }),
    OPTIONS
  );

  it.effect.prop(
    "take a publisher's later word over its earlier one, also where others relay the earlier",
    {
      before: between(0, 50),
      change: between(1, 50),
      day: between(1, 9),
      gap: between(1, 9),
      others: between(0, 2),
      relays: between(0, 3),
    },
    ({ before, change, day, gap, others, relays }) =>
      Effect.gen(function* () {
        const after = before + change;
        const source = (id: string, publisher: string, on: number) => [
          "source",
          id,
          `https://example.com/${id}`,
          ["quote", id],
          ["quote", publisher],
          "primary",
          on,
        ];
        const claim = (id: string, from: string, value: number) => [
          "claim",
          id,
          from,
          ["quote", "said so"],
          ["quote", { topic: "t", value }],
        ];
        const relayed = Array.from({ length: relays }, (_, at) => `r${at}`);
        const other = Array.from({ length: others }, (_, at) => `o${at}`);
        const outcome = yield* answerOf([
          "begin",
          core,
          [
            "fact",
            source("early", "Acme", day),
            source("late", "Acme", day + gap),
            claim("c-early", "early", before),
            claim("c-late", "late", after),
            ...relayed.flatMap((id) => [
              source(id, `Relay ${id}`, day),
              claim(`c-${id}`, id, before),
              ["attributed", `c-${id}`, "early"],
            ]),
            ...other.flatMap((id) => [
              source(id, `Other ${id}`, day),
              claim(`c-${id}`, id, before),
            ]),
          ],
          [
            "rule",
            ["answer", { topic: "?topic" }, "?value", "?claim"],
            [
              "claim",
              "?claim",
              "?_",
              "?_",
              ["schema/open", { topic: "?topic", value: "?value" }],
            ],
          ],
          {
            backing: rows(
              ["?value", "?publishers"],
              ["backing", { topic: "t" }, "?value", "?publishers"]
            ),
            disputed: ["find", "?values", ["disputed", "?_", "?values"]],
            misquoted: [
              "find",
              "?c",
              ["misquoted", "?c", "?_", "?_", "?_", "?_"],
            ],
            restated: rows(
              ["?publisher", "?before", "?after"],
              ["restated", "?_", "?publisher", "?before", "?after"]
            ),
            secondhand: ["find", "?v", ["secondhand", "?_", "?v", "?_"]],
          },
        ]);
        const others_ = other.map((id) => `Other ${id}`).sort();
        expect(outcome.ok ? asSets(outcome.value as never) : outcome).toEqual(
          asSets({
            backing: [
              [after, ["Acme"]],
              ...(others > 0 ? [[before, others_]] : []),
            ],
            // Without another voice, the earlier figure is withdrawn.
            disputed: others > 0 ? [[before, after]] : [],
            misquoted: [],
            restated: [["Acme", before, after]],
            secondhand: [],
          })
        );
      }),
    OPTIONS
  );

  it.effect.prop(
    "find each number a claim states that its quote does not write",
    {
      claims: Arbitrary.array(
        Arbitrary.all({
          fields: Arbitrary.array(
            Arbitrary.all({ from: between(0, 3), stray: between(-9999, 9999) }),
            { maxLength: 3 }
          ),
          written: Arbitrary.array(between(-2_000_000, 2_000_000), {
            maxLength: 3,
          }),
        }),
        { maxLength: 4 }
      ),
      context: Arbitrary.schema(Schema.Boolean),
    },
    ({ claims, context }) =>
      Effect.gen(function* () {
        // A field holds one of the numbers written in the quote, or another.
        const stated = claims.map(({ fields, written }) =>
          Object.fromEntries(
            fields.map(({ from, stray }, at) => [
              at === 0 ? "year" : `n${at}`,
              written[from] ?? stray,
            ])
          )
        );
        const quotes = claims.map(({ written }) =>
          written
            .map((n) => `about ${n.toLocaleString("en-US")} units`)
            .join(" and ")
        );
        const outcome = yield* answerOf([
          "begin",
          core,
          [
            "fact",
            ["source", "s", "https://example.com", "s", "S", "primary", null],
            ...stated.map((says, at) => [
              "claim",
              `c${at}`,
              "s",
              ["quote", quotes[at]],
              ["quote", { ...says, kind: "figure" }],
            ]),
            ...(context ? [["context", "year"]] : []),
          ],
          rows(
            ["?claim", "?field", "?value"],
            ["unquoted", "?claim", "?field", "?value"]
          ),
        ]);
        expect(
          outcome.ok
            ? (outcome.value as unknown[]).map(canonical).sort()
            : outcome
        ).toEqual(
          stated
            .flatMap((says, at) =>
              Object.entries(says)
                .filter(
                  ([field, value]) =>
                    !(
                      (context && field === "year") ||
                      (claims[at]?.written ?? []).includes(value)
                    )
                )
                .map(([field, value]) => canonical([`c${at}`, field, value]))
            )
            .sort()
        );
      }),
    OPTIONS
  );

  it.effect.prop(
    "say which readings of a question sources answer, and which the reader's choices keep",
    {
      answered: Arbitrary.array(
        Arbitrary.all({
          basis: between(0, 2),
          period: between(0, 2),
          topic: between(0, 1),
        }),
        { maxLength: 6 }
      ),
      chosen: Arbitrary.all({ basis: between(0, 2), period: between(0, 2) }),
      readings: Arbitrary.all({
        basis: Arbitrary.schema(Schema.Boolean),
        period: Arbitrary.schema(Schema.Boolean),
      }),
    },
    ({ answered, chosen, readings }) =>
      Effect.gen(function* () {
        const word = (at: number) => [null, "a", "b"][at] ?? null;
        const KEYS = ["basis", "period"] as const;
        // Each question states a reading of a key, or leaves the key out.
        const questions = unique(
          answered.map((q) => ({
            topic: `t${q.topic}`,
            ...(word(q.basis) === null ? {} : { basis: word(q.basis) }),
            ...(word(q.period) === null ? {} : { period: word(q.period) }),
          }))
        ) as Record<string, string>[];
        const isReading = (key: string) =>
          readings[key as (typeof KEYS)[number]] ?? false;
        const decision = (key: (typeof KEYS)[number]) =>
          isReading(key) ? word(chosen[key]) : null;
        const baseOf = (q: Record<string, string>) =>
          Object.fromEntries(
            Object.entries(q).filter(([key]) => !isReading(key))
          );
        const outcome = yield* answerOf([
          "begin",
          core,
          [
            "fact",
            ["source", "s", "https://example.com", "s", "S", "primary", null],
            ...questions.map((q, at) => [
              "claim",
              `c${at}`,
              "s",
              "said so",
              ["quote", { ...q, value: at }],
            ]),
            ...KEYS.filter(isReading).map((key) => ["reading", key]),
            ...KEYS.flatMap((key) => {
              const value = decision(key);
              return value === null ? [] : [["decided", key, value, "chosen"]];
            }),
          ],
          [
            "rule",
            ["answer", ["object/remove", "?says", "value"], "?v", "?c"],
            ["claim", "?c", "?_", "?_", "?says"],
            ["=", "?v", ["object/get", "?says", "value"]],
          ],
          {
            ambiguous: rows(
              ["?base", "?key", "?values"],
              ["ambiguous", "?base", "?key", "?values"]
            ),
            meant: rows(["?base", "?q"], ["meant", "?base", "?q"]),
            set_aside: rows(
              ["?q", "?key", "?stated", "?chosen"],
              ["set_aside", "?q", "?key", "?stated", "?chosen"]
            ),
          },
        ]);
        const bases = unique(questions.map(baseOf));
        const setAside = questions.flatMap((q) =>
          KEYS.flatMap((key) => {
            const value = decision(key);
            return value !== null && key in q && q[key] !== value
              ? [[q, key, q[key], value]]
              : [];
          })
        );
        expect(outcome.ok ? asSets(outcome.value as never) : outcome).toEqual(
          asSets({
            ambiguous: bases.flatMap((base) =>
              KEYS.filter((key) => isReading(key) && decision(key) === null)
                .map((key) => {
                  const values = unique(
                    questions
                      .filter((q) => canonical(baseOf(q)) === canonical(base))
                      .map((q) => q[key] ?? null)
                  ).sort(nullFirst);
                  return [base, key, values];
                })
                .filter(([, , values]) => (values as unknown[]).length > 1)
            ),
            meant: questions
              .filter((q) => !setAside.some(([aside]) => aside === q))
              .map((q) => [baseOf(q), q]),
            set_aside: setAside,
          })
        );
      }),
    OPTIONS
  );
});

describe("the research skill's clock", () => {
  it.effect.prop(
    "counts the minutes from 1970 to a time, as JavaScript does",
    {
      day: between(1, 28),
      hour: between(0, 23),
      minute: between(0, 59),
      month: between(1, 12),
      offset: between(-720, 840),
      year: between(1600, 2400),
    },
    ({ day, hour, minute, month, offset, year }) =>
      Effect.gen(function* () {
        const outcome = yield* answerOf([
          utcMinutes,
          year,
          month,
          day,
          hour,
          minute,
          offset,
        ]);
        expect(outcome).toEqual({
          ok: true,
          value: Date.UTC(year, month - 1, day, hour, minute) / 60_000 - offset,
        });
      }),
    OPTIONS
  );
});

const two = (part: number) => String(part).padStart(2, "0");

describe("the research skill's clock, as text", () => {
  it.effect.prop(
    "writes a count of minutes as the time JavaScript says it is",
    { minutes: between(-200_000_000, 250_000_000) },
    ({ minutes }) =>
      Effect.gen(function* () {
        const at = new Date(minutes * 60_000);
        const date = `${at.getUTCFullYear()}-${two(at.getUTCMonth() + 1)}-${two(at.getUTCDate())}`;
        expect(yield* answerOf([utcText, minutes])).toEqual({
          ok: true,
          value: `${date} ${two(at.getUTCHours())}:${two(at.getUTCMinutes())} UTC`,
        });
      }),
    OPTIONS
  );
});

interface Passages {
  readonly marks: Record<string, readonly [number, number]>;
  readonly texts: Record<string, string>;
}
type Build = (page: {
  readonly database: unknown;
  readonly generated: string;
  readonly page: unknown;
  readonly passages?: Passages;
}) => string;
type Queries = (page: unknown) => Record<string, unknown>;

const builder = import(join(SKILL, "scripts/build-explorer.mjs")) as Promise<{
  readonly buildExplorer: Build;
  readonly namedReadingsOf: Queries;
  readonly passagesOf: (
    database: unknown,
    textOf: (source: string) => string | undefined
  ) => Passages;
  readonly queriesOf: Queries;
}>;

/** Text with the characters that end an element, or a replace pattern. */
const awkward = oneOf(
  text(/^[a-z <>/!&$'"-]{0,12}$/),
  element([
    "</script>",
    "</title>",
    "<!--",
    "<script>",
    "&amp;",
    "&lt;b>",
    "$&",
    "$1",
    "\u2028",
  ])
);

const DATA =
  /<script type="application\/json" id="lion-data">([\s\S]*?)<\/script/;
const TITLE = /<title>([\s\S]*?)<\/title/;

const unescaped = (html: string) =>
  html.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");

describe("the research skill's explorer page", () => {
  it.effect.prop(
    "carries the model, questions, and title it was given, whatever text they hold",
    {
      facts: Arbitrary.array(Arbitrary.all({ quote: awkward, says: awkward }), {
        maxLength: 4,
      }),
      answer: awkward,
      question: awkward,
      summary: awkward,
      title: awkward,
    },
    ({ answer, facts, question, summary, title }) =>
      Effect.gen(function* () {
        const { buildExplorer } = yield* Effect.promise(() => builder);
        const page = {
          database: [
            "begin",
            ["fact", ...facts.map((fact) => ["claim", fact])],
          ],
          generated: "2026-01-01",
          page: {
            names: { [answer]: question },
            summary,
            title,
            views: [
              {
                blocks: [
                  {
                    answer,
                    evidence: ["query", ["claim", "?fact"]],
                    question,
                    type: "answer",
                  },
                ],
                name: question,
              },
            ],
          },
        };
        // The saved text of a source, and where a quote stands in it.
        const passages = {
          marks: { [answer]: [0, summary.length] as const },
          texts: { [question]: summary },
        };
        const html = buildExplorer({ ...page, passages });
        // A browser ends each element at its first closing tag, as these do.
        // The page also carries the wording helpers, the same for every plan.
        expect(JSON.parse(DATA.exec(html)?.[1] ?? "null")).toEqual({
          ...page,
          ...passages,
          words: asset("words.json"),
        });
        expect(unescaped(TITLE.exec(html)?.[1] ?? "")).toBe(title);
      }),
    OPTIONS
  );
});

const scripts = <A>(name: string) =>
  import(join(SKILL, "scripts", name)) as Promise<A>;

const reader = scripts<{ readonly htmlToText: (html: string) => string }>(
  "page-text.mjs"
);

/** Words a page shows, with the characters that markup gives a meaning. */
const shown = text(/^[a-z0-9&<>"' ]{1,10}$/);
const hidden = element(["script", "style", "noscript"]);
const block = element(["p", "div", "li", "h2", "blockquote"]);
const inline = element(["b", "a", "span"]);

const escaped = (words: string) =>
  words
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const squeezed = (words: string) => words.replaceAll(/ +/g, " ").trim();

describe("the research skill's page reader", () => {
  it.effect.prop(
    "gives each block's words on a line, and nothing a reader does not see",
    {
      blocks: Arbitrary.array(
        Arbitrary.all({
          aside: shown,
          before: shown,
          block,
          hidden,
          inline,
          marked: shown,
        }),
        { maxLength: 5 }
      ),
    },
    ({ blocks }) =>
      Effect.gen(function* () {
        const { htmlToText } = yield* Effect.promise(() => reader);
        const html = blocks
          .map(
            (part) =>
              `<${part.block} class="x">${escaped(part.before)} <${part.inline}>${escaped(part.marked)}</${part.inline}><${part.hidden}>${escaped(part.aside)} zzz</${part.hidden}><!-- zzz --></${part.block}>`
          )
          .join("");
        const page = `<!doctype html><?xml version="1.0"?><html lang="en"><head><title>zzz</title></head><body>${html}</body></html>`;
        expect(htmlToText(page)).toBe(
          blocks
            .map((part) => squeezed(`${part.before} ${part.marked}`))
            .filter((line) => line !== "")
            .join("\n")
        );
      }),
    OPTIONS
  );
});

interface Checked {
  readonly found: readonly unknown[];
  readonly missing: readonly unknown[];
  readonly unsaved: readonly unknown[];
}

const checker = scripts<{
  readonly checkQuotes: (
    claims: readonly unknown[],
    textOf: (source: string) => string | undefined
  ) => Checked;
  readonly claimsOf: (model: unknown) => readonly unknown[];
}>("check-quotes.mjs");

const word = text(/^[a-z]{1,6}$/);
const gap = element([" ", "  ", "\n", " \n ", "\u00a0"]);
const mark = element(["'", "\u2019", '"', "\u201c", "-", "\u2014", ""]);

const PLAIN: Readonly<Record<string, string>> = {
  "\u2014": "-",
  "\u2019": "'",
  "\u201c": '"',
};
const plain = (typed: string) => PLAIN[typed] ?? typed;

/** The same words as they look after a page is saved and a quote is copied. */
const respaced = (words: readonly string[], gaps: readonly string[]) =>
  words.map((part, at) => part + (gaps[at % gaps.length] ?? " ")).join("");

describe("the research skill's quote check", () => {
  it.effect.prop(
    "finds a quote that is in its source's text, however it is spaced, and no other",
    {
      from: between(0, 5),
      gaps: Arbitrary.array(gap, { minLength: 1, maxLength: 4 }),
      length: between(1, 4),
      marks: Arbitrary.array(mark, { minLength: 1, maxLength: 4 }),
      words: Arbitrary.array(word, { minLength: 6, maxLength: 12 }),
    },
    ({ from, gaps, length, marks, words }) =>
      Effect.gen(function* () {
        const { checkQuotes, claimsOf } = yield* Effect.promise(() => checker);
        const page = words.map(
          (part, at) => part + (marks[at % marks.length] ?? "")
        );
        // The quote is typed with plain marks where the page has curly ones.
        const quoted = words
          .slice(from, from + length)
          .map(
            (part, at) => part + plain(marks[(from + at) % marks.length] ?? "")
          );
        const model = [
          "begin",
          ["relation", "claim", ["id", "source", "quote", "says"]],
          [
            "fact",
            ["claim", "in", "read", ["quote", quoted.join(" ")], {}],
            ["claim", "out", "read", [...quoted, "ZZZ"].join(" "), {}],
            ["claim", "none", "unread", quoted.join(" "), {}],
            ["source", "read"],
          ],
        ];
        const result = checkQuotes(claimsOf(model), (source) =>
          source === "read" ? respaced(page, gaps) : undefined
        );
        const ids = (claims: readonly unknown[]) =>
          claims.map((claim) => (claim as { readonly id: string }).id);
        expect({
          found: ids(result.found),
          missing: ids(result.missing),
          unsaved: ids(result.unsaved),
        }).toEqual({ found: ["in"], missing: ["out"], unsaved: ["none"] });
      }),
    OPTIONS
  );

  it.effect.prop(
    "points at the first stretch of the text that reads as the quote, which the page then carries",
    {
      before: element(["", "  ", "\n\n", "é ", "é ", "… "]),
      from: between(0, 5),
      gaps: Arbitrary.array(gap, { minLength: 1, maxLength: 4 }),
      length: between(1, 4),
      marks: Arbitrary.array(mark, { minLength: 1, maxLength: 4 }),
      twice: Arbitrary.schema(Schema.Boolean),
      words: Arbitrary.array(word, { minLength: 6, maxLength: 12 }),
    },
    ({ before, from, gaps, length, marks, twice, words }) =>
      Effect.gen(function* () {
        const { normalize, whereIn } = yield* Effect.promise(() => locator);
        const { passagesOf } = yield* Effect.promise(() => builder);
        const page = words.map(
          (part, at) => part + (marks[at % marks.length] ?? "")
        );
        const quote = words
          .slice(from, from + length)
          .map(
            (part, at) => part + plain(marks[(from + at) % marks.length] ?? "")
          )
          .join(" ");
        const saved = respaced(page, gaps);
        const held = before + saved + (twice ? ` ${saved}` : "");
        const at = whereIn(held, quote);
        expect(at).toBeDefined();
        const [start, end] = at ?? [0, 0];
        expect(normalize(held.slice(start, end))).toBe(normalize(quote));
        // No stretch that ends earlier reads as the quote.
        expect(
          normalize(held.slice(0, end - 1)).includes(normalize(quote))
        ).toBe(false);
        expect(whereIn(held, `${quote} ZZZ`)).toBeUndefined();
        // Spacing around a quote is not part of it.
        expect(whereIn(held, ` \n${quote}\t`)).toEqual(at);
        const model = [
          "begin",
          [
            "fact",
            ["claim", "in", "read", ["quote", quote], {}],
            ["claim", "out", "read", `${quote} ZZZ`, {}],
            ["claim", "none", "unread", quote, {}],
            ["claim", "lost", "other", quote, {}],
          ],
        ];
        // A source whose quotes are not in its text is not carried.
        const textOf = (source: string) =>
          ({ other: "0 1 2", read: held })[source];
        expect(passagesOf(model, textOf)).toEqual({
          marks: { in: [start, end] },
          texts: { read: held },
        });
      }),
    OPTIONS
  );
});

const locator = scripts<{
  readonly normalize: (text: string) => string;
  readonly whereIn: (
    text: string,
    quote: string
  ) => readonly [number, number] | undefined;
}>("check-quotes.mjs");

/** The skill is installed as a link, so its scripts are started through one. */
const linked = mkdtempSync(join(tmpdir(), "lion-research-"));
symlinkSync(SKILL, join(linked, "skill"));
for (const name of [
  "build-explorer.mjs",
  "check-quotes.mjs",
  "page-text.mjs",
  "record.mjs",
  "replay.mjs",
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
  { args: [], name: "build-explorer.mjs", says: "Usage:" },
  { args: [], name: "page-text.mjs", says: "Usage:" },
  { args: [linked], name: "check-quotes.mjs", says: "There is no model.json" },
  { args: [], name: "record.mjs", says: "Usage:" },
  { args: [], name: "replay.mjs", says: "There is no steps folder" },
]);

describe("the research skill's scripts", () => {
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

/** A value a reader could pick: text that is also a name, a variable, or code. */
const picked = oneOf<unknown>(
  awkward,
  element<unknown>([
    "claim",
    "?x",
    "number/add",
    "$other",
    ["number/add", 1, 2],
    { a: ["quote", 1] },
    null,
    true,
    7,
  ])
);

describe("the research skill's lookups", () => {
  it.effect.prop(
    "pass what the reader chose to the query as data, whatever it is",
    { chosen: picked },
    ({ chosen }) =>
      Effect.gen(function* () {
        const { queriesOf } = yield* Effect.promise(() => builder);
        const block = {
          choose: { it: { options: ["quote", [chosen]] } },
          example: { it: chosen },
          query: ["lambda", ["it"], ["query", ["=", "?x", "it"]]],
          type: "lookup",
        };
        const outcome = yield* answerOf([
          "begin",
          ["relation", "claim", ["id"]],
          queriesOf({ views: [{ blocks: [block], name: "v" }] }),
        ]);
        expect(
          outcome.ok ? Object.values(outcome.value as never) : outcome
        ).toEqual([[chosen], [{ x: chosen }]]);
      }),
    OPTIONS
  );
});

describe("the research skill's page check", () => {
  it.effect.prop(
    "holds every text and query the plan computes, also when blocks share a title",
    {
      views: Arbitrary.array(
        Arbitrary.all({
          name: element(["A", "B"]),
          titles: Arbitrary.array(element(["Q", "R", undefined]), {
            maxLength: 4,
          }),
        }),
        { maxLength: 3 }
      ),
    },
    ({ views }) =>
      Effect.gen(function* () {
        const { queriesOf } = yield* Effect.promise(() => builder);
        let next = 0;
        const plan = {
          summary: ["quote", next++],
          views: views.map(({ name, titles }) => ({
            blocks: titles.map((title) => ({
              answer: ["quote", next++],
              evidence: ["query", ["=", "?x", next++]],
              ...(title === undefined ? {} : { question: title }),
              type: "answer",
            })),
            name,
          })),
        };
        const asked = Object.values(queriesOf(plan)).map((each) =>
          canonical((each as unknown[]).at(-1))
        );
        const given = [
          plan.summary,
          ...plan.views.flatMap((view) =>
            view.blocks.flatMap((block) => [block.answer, block.evidence])
          ),
        ];
        expect(asked.sort()).toEqual(given.map(canonical).sort());
      })
  );
});

/** Questions a plan may name: a base, two readings of it, another, and a pattern. */
const NAMED = [
  { t: "x" },
  { basis: "a", t: "x" },
  { basis: "b", t: "x" },
  { t: "y" },
  { t: "?any" },
];

describe("the research skill's page check", () => {
  it.effect.prop(
    "names each question the plan names that a choice set aside, or that has readings nobody chose between",
    {
      chosen: element([null, "a", "b"]),
      named: Arbitrary.array(between(0, NAMED.length - 1), { maxLength: 6 }),
      viaMeant: Arbitrary.array(between(0, NAMED.length - 1), { maxLength: 3 }),
    },
    ({ chosen, named, viaMeant }) =>
      Effect.gen(function* () {
        const { namedReadingsOf } = yield* Effect.promise(() => builder);
        const asked = named.map((at) => NAMED[at]);
        const plan = {
          views: [
            {
              blocks: [
                ...asked.map((question) => ({
                  answer: [
                    "words/listed",
                    ["find", "?v", ["answer", question, "?v", "?_"]],
                  ],
                  evidence: ["query", ["answer", question, "?v", "?_"]],
                  question: "?",
                  type: "answer",
                })),
                // A base handed to `meant` is how a plan should ask about it.
                ...viaMeant.map((at) => ({
                  evidence: ["query", ["meant", NAMED[at], "?q"]],
                  question: "?",
                  type: "answer",
                })),
              ],
              name: "v",
            },
          ],
        };
        const outcome = yield* answerOf([
          "begin",
          core,
          [
            "fact",
            ["reading", "basis"],
            ["source", "s", "https://example.com", "s", "S", "primary", null],
            ...NAMED.slice(1, 4).map((says, at) => [
              "claim",
              `c${at}`,
              "s",
              "said so",
              ["quote", { ...says, value: at }],
            ]),
            ...(chosen === null ? [] : [["decided", "basis", chosen, "mine"]]),
          ],
          [
            "rule",
            ["answer", ["object/remove", "?says", "value"], "?v", "?c"],
            ["claim", "?c", "?_", "?_", "?says"],
            ["=", "?v", ["object/get", "?says", "value"]],
          ],
          namedReadingsOf(plan),
        ]);
        // Undecided, the base has two readings; decided, the other one is set aside.
        const flagged =
          chosen === null
            ? [{ t: "x" }]
            : [{ basis: chosen === "a" ? "b" : "a", t: "x" }];
        const expected = unique(
          asked.filter((question) =>
            flagged.some((other) => canonical(other) === canonical(question))
          )
        );
        expect(
          outcome.ok
            ? Object.values(outcome.value as never)
                .flat()
                .map(canonical)
                .sort()
            : outcome
        ).toEqual(expected.map(canonical).sort());
      }),
    OPTIONS
  );
});

const words = asset("words.json") as Record<string, unknown>;
const withWords = (expression: unknown) => [
  "begin",
  ...Object.entries(words).map(([name, value]) => ["define", name, value]),
  expression,
];

/** Names as a sentence lists them, the plain way. */
const listedPlainly = (names: readonly string[]) =>
  names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

describe("the research skill's wording", () => {
  it.effect.prop(
    "lists names as a sentence does, and writes whole numbers with separators",
    {
      count: between(-2_000_000_000, 2_000_000_000),
      names: Arbitrary.array(word, { maxLength: 5 }),
    },
    ({ count, names }) =>
      Effect.gen(function* () {
        expect(
          yield* answerOf(
            withWords({
              counted: ["words/count", count, "source", "sources"],
              listed: ["words/listed", ["quote", names]],
              missing: ["words/number", ["array/head", ["quote", []]]],
              nobody: ["words/listed", ["array/head", ["quote", []]]],
              number: ["words/number", count],
            })
          )
        ).toEqual({
          ok: true,
          value: {
            counted: `${count.toLocaleString("en-US")} ${count === 1 ? "source" : "sources"}`,
            listed: listedPlainly(names),
            // A figure the model does not have is words, never a failure.
            missing: "nothing",
            nobody: "nothing",
            number: count.toLocaleString("en-US"),
          },
        });
      }),
    OPTIONS
  );
});

interface Notes {
  readonly claims: readonly {
    readonly credits: readonly string[];
    readonly id: string;
    readonly quote: string;
    readonly says: unknown;
    readonly source: string;
    readonly where?: string;
  }[];
  readonly decisions?: readonly {
    readonly key: string;
    readonly value: unknown;
    readonly words: string;
  }[];
  readonly sources: readonly Record<string, unknown>[];
}

const recorder = scripts<{
  readonly problemsOf: (
    notes: Notes,
    textOf: (source: string) => string | undefined
  ) => readonly string[];
  readonly stepOf: (notes: Notes) => unknown;
}>("record.mjs");

/** Text a note can hold that Lion would read as something else if left bare. */
const risky = oneOf(
  awkward,
  element(["claim", "source", "?x", "number/add", "value/any?", "$it"])
);

describe("the research skill's recorder", () => {
  it.effect.prop(
    "records notes as the data they are, and refuses a quote its source does not hold",
    {
      extra: word,
      ids: Arbitrary.array(risky, { minLength: 1, maxLength: 3 }),
      quote: risky,
      says: risky,
    },
    ({ extra, ids, quote, says }) =>
      Effect.gen(function* () {
        const { problemsOf, stepOf } = yield* Effect.promise(() => recorder);
        const names = [...new Set(ids)];
        const notes: Notes = {
          claims: names.map((id, at) => ({
            credits: at > 0 ? [`s-${names[0]}`] : [],
            id: `c-${id}`,
            quote,
            // A record key is never empty here: Lion drops an empty key.
            says: { [`k${says}`]: [says, at] },
            source: `s-${id}`,
            // Where the quote stands is given for every other claim.
            ...(at % 2 === 0 ? { where: `${says} ${at}` } : {}),
          })),
          decisions: [{ key: `k${says}`, value: says, words: quote }],
          sources: names.map((id) => ({
            id: `s-${id}`,
            kind: "primary",
            published: null,
            publisher: id,
            title: quote,
            url: `https://example.com/${extra}`,
          })),
        };
        const outcome = yield* answerOf([
          "begin",
          core,
          // A decision is about a key the frame says picks a reading.
          ["fact", ["reading", ["quote", `k${says}`]]],
          stepOf(notes),
          {
            attributed: rows(
              ["?claim", "?to"],
              ["attributed", "?claim", "?to"]
            ),
            decided: rows(
              ["?key", "?value", "?words"],
              ["decided", "?key", "?value", "?words"]
            ),
            located: rows(
              ["?claim", "?where"],
              ["located", "?claim", "?where"]
            ),
            claims: ["query", ["claim", "?id", "?source", "?quote", "?says"]],
            publishers: [
              "find",
              "?p",
              ["source", "?_", "?_", "?_", "?p", "?_", "?_"],
            ],
          },
        ]);
        const sorted = (items: readonly unknown[]) =>
          [...items].map(canonical).sort();
        const got = outcome.ok
          ? (outcome.value as Record<string, readonly unknown[]>)
          : {};
        expect({
          attributed: sorted(got.attributed ?? []),
          claims: sorted(got.claims ?? []),
          decided: sorted(got.decided ?? []),
          failed: outcome.ok ? undefined : outcome,
          located: sorted(got.located ?? []),
          publishers: sorted(got.publishers ?? []),
        }).toEqual({
          attributed: sorted(
            notes.claims.flatMap((claim) =>
              claim.credits.map((to) => [claim.id, to])
            )
          ),
          claims: sorted(
            notes.claims.map((claim) => ({
              id: claim.id,
              quote: claim.quote,
              says: claim.says,
              source: claim.source,
            }))
          ),
          decided: sorted([[`k${says}`, says, quote]]),
          failed: undefined,
          located: sorted(
            notes.claims.flatMap((claim) =>
              claim.where === undefined ? [] : [[claim.id, claim.where]]
            )
          ),
          publishers: sorted(names),
        });
        const saved = (held: string) => (source: string) =>
          source === notes.claims[0]?.source ? held : undefined;
        expect(problemsOf(notes, saved(`before ${quote} after`))).toHaveLength(
          quote.trim() === "" ? names.length : names.length - 1
        );
        expect(problemsOf(notes, saved(""))).toHaveLength(names.length);
      }),
    OPTIONS
  );
});

const replayer = scripts<{
  readonly expanded: (
    program: unknown,
    helpers: Record<string, unknown>
  ) => unknown;
}>("replay.mjs");

describe("the research skill's replay", () => {
  it.effect.prop(
    "gives a frame the time functions it names, and leaves quoted text alone",
    { minutes: between(-200_000_000, 250_000_000) },
    ({ minutes }) =>
      Effect.gen(function* () {
        const { expanded } = yield* Effect.promise(() => replayer);
        const frame = [
          "begin",
          ["define", "as-text", "@utc-text"],
          { kept: ["quote", "@utc-text"], text: ["as-text", minutes] },
        ];
        const direct = yield* answerOf([utcText, minutes]);
        expect(
          yield* answerOf(expanded(frame, { "utc-text": utcText }))
        ).toEqual({
          ok: true,
          value: {
            kept: "@utc-text",
            text: direct.ok ? direct.value : undefined,
          },
        });
      }),
    OPTIONS
  );
});

const CASE = join(SKILL, "evals/verifies-company-figures");

interface Check {
  readonly check: string;
  readonly rests_on: readonly string[];
}

const grader = import(join(CASE, "grade.mjs")) as Promise<{
  readonly answers: () => readonly Check[];
  readonly queriesOf: (checks: readonly Check[]) => Record<string, unknown>;
  readonly verdicts: (
    checks: readonly Check[],
    found: Record<string, unknown>
  ) => readonly (Check & { readonly pass: boolean })[];
}>;

const caseFile = (...path: string[]) =>
  readFileSync(join(CASE, ...path), "utf8");

/** The corpus's sources, by the id each is recorded under. */
const TEXT_FILE = /\.txt$/;
const CORPUS = readdirSync(join(CASE, "corpus")).map((name) =>
  name.replace(TEXT_FILE, "")
);

describe("the research skill's frozen eval", () => {
  it.effect.prop(
    "passes the reference run, and fails just the checks that rest on a source it did not read, in whatever order each note lists them",
    { first: between(0, 7), reversed: Arbitrary.schema(Schema.Boolean) },
    ({ first, reversed }) =>
      Effect.gen(function* () {
        const { answers, queriesOf, verdicts } = yield* Effect.promise(
          () => grader
        );
        const { stepOf } = yield* Effect.promise(() => recorder);
        const { namedReadingsOf, queriesOf: pageQueries } =
          yield* Effect.promise(() => builder);
        const { checkQuotes } = yield* Effect.promise(() => checker);
        const page = JSON.parse(caseFile("reference/page.json"));
        const checks = answers();
        // A note is one change, so the order of its sources and claims is free.
        const reordered = <A>(items: readonly A[]) => {
          const at = first % Math.max(1, items.length);
          const turned = [...items.slice(at), ...items.slice(0, at)];
          return reversed ? turned.reverse() : turned;
        };
        const names = readdirSync(join(CASE, "reference/notes")).sort();
        // Every source is left out in turn, and none.
        for (const dropped of [undefined, ...CORPUS]) {
          // A source left unread keeps its place, so what credits it still can.
          const notes = names
            .map((name) => JSON.parse(caseFile("reference/notes", name)))
            .map((note) => ({
              ...note,
              claims: reordered(
                note.claims.filter(
                  (claim: { source: string }) => claim.source !== dropped
                )
              ),
              sources: reordered(note.sources),
            }));
          const model = [
            core,
            JSON.parse(caseFile("reference/frame.src.json")),
            ...notes.map(stepOf),
          ];
          const queried = yield* answerOf([
            "begin",
            ...model,
            queriesOf(checks),
          ]);
          const worded = yield* answerOf([
            "begin",
            ...model,
            { ...pageQueries(page), ...namedReadingsOf(page) },
          ]);
          const quotes = checkQuotes(
            notes.flatMap((note) => note.claims),
            (source) =>
              CORPUS.includes(source)
                ? caseFile("corpus", `${source}.txt`)
                : undefined
          );
          const failed = verdicts(checks, {
            files: ["explorer.html", "report.md", "page-check.json"],
            page: worded.ok ? worded.value : undefined,
            queried: queried.ok ? queried.value : undefined,
            quotes: { missing: quotes.missing.length },
            report: caseFile("reference/report.md"),
          })
            .filter((verdict) => !verdict.pass)
            .map((verdict) => verdict.check);
          expect(failed.sort(), `without ${dropped}`).toEqual(
            checks
              .filter(
                (check) =>
                  dropped !== undefined && check.rests_on.includes(dropped)
              )
              .map((check) => check.check)
              .sort()
          );
        }
      }),
    { arbitrary: { runs: 12 } }
  );
});
