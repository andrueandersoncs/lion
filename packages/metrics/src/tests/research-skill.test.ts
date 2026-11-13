/**
 * The lion-research skill ships Lion programs: `assets/core.json`, whose
 * rules say who stands behind each answer of a research model, and
 * `assets/utc-minutes.json`, which turns a clock time into a number. It also
 * ships a script that packs a model into an explorer page. These properties
 * check the rules against a plain model of what they define, the clock
 * against JavaScript's, and the page against what it was given.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";
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
  /** Who stands behind each source. Sources that share one are one voice. */
  readonly publishers: Readonly<Record<string, string>>;
  readonly sources: readonly string[];
}

/**
 * A few sources and claims, with few enough publishers, topics, and values
 * that sources often share a publisher, claims often say the same thing, and
 * a claim is often credited to a source that says something else.
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
      { maxLength: 6 }
    ),
    publishers: Arbitrary.all([
      between(0, 2),
      between(0, 2),
      between(0, 2),
      between(0, 2),
    ]),
    sourceCount: between(1, 4),
  }),
  ({ attributed, claims, publishers, sourceCount }) => {
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

const program = ({ attributed, claims, publishers, sources }: World) => [
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
      null,
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
 * first-hand when its source credits nobody for it. An answer is backed by
 * the publishers who give it first-hand, is second-hand when nobody does, and
 * is misquoted when the source it is credited to answers the question, and
 * never with that value.
 */
const expected = ({ attributed, claims, publishers }: World) => {
  const creditsOf = (claim: Claim) =>
    attributed.filter(([id]) => id === claim.id).map(([, to]) => to);
  const answers = unique(claims.map(({ topic, value }) => ({ topic, value })));
  const giving = ({ topic, value }: { topic: string; value: number }) =>
    claims.filter((claim) => claim.topic === topic && claim.value === value);
  const backing = answers.flatMap((answer) => {
    const firsthand = giving(answer).filter(
      (claim) => creditsOf(claim).length === 0
    );
    const backers = unique(
      firsthand.map((claim) => publishers[claim.source])
    ).sort();
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
        claims.filter((claim) => claim.topic === topic).map((c) => c.value)
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
    secondhand: answers.flatMap((answer) => {
      const given = giving(answer);
      const credited = unique(given.flatMap(creditsOf)).sort();
      return given.some((claim) => creditsOf(claim).length === 0) ||
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

type Build = (page: {
  readonly database: unknown;
  readonly generated: string;
  readonly page: unknown;
}) => string;
type Fill = (query: unknown, chosen: Record<string, unknown>) => unknown;
type Queries = (page: unknown) => Record<string, unknown>;

const builder = import(join(SKILL, "scripts/build-explorer.mjs")) as Promise<{
  readonly buildExplorer: Build;
  readonly filled: Fill;
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
        const html = buildExplorer(page);
        // A browser ends each element at its first closing tag, as these do.
        expect(JSON.parse(DATA.exec(html)?.[1] ?? "null")).toEqual(page);
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
});

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
    "put what the reader chose into a query as data, whatever it is",
    { chosen: picked },
    ({ chosen }) =>
      Effect.gen(function* () {
        const { filled, queriesOf } = yield* Effect.promise(() => builder);
        const block = {
          choose: { it: { options: ["quote", [chosen]] } },
          example: { it: chosen },
          query: ["query", ["=", "?x", "$it"]],
          type: "lookup",
        };
        const queries = queriesOf({ views: [{ blocks: [block], name: "v" }] });
        expect(filled(block.query, { it: chosen })).toEqual(
          Object.values(queries)[1]
        );
        const outcome = yield* answerOf([
          "begin",
          ["relation", "claim", ["id"]],
          queries,
        ]);
        expect(
          outcome.ok ? Object.values(outcome.value as never) : outcome
        ).toEqual([[chosen], [{ x: chosen }]]);
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
          })),
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
          stepOf(notes),
          {
            attributed: rows(
              ["?claim", "?to"],
              ["attributed", "?claim", "?to"]
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
          failed: outcome.ok ? undefined : outcome,
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
          failed: undefined,
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
