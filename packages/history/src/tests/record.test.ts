/**
 * The record's rules and pages, checked on generated histories against a
 * plain model of what they define. The model says which release shipped a
 * claim by walking the commit graph, which commits no claim was made by,
 * which references and quotes fail, and where each item, a question with an
 * answer, first shipped and in whose words. The pages are written from the
 * model of the world's development and read back, and must hold what the
 * plain model says, in the order it says.
 */
import { describe, expect, it } from "@effect/vitest";
import { run } from "@lionlang/core/evaluation/evaluate";
import { LogicDatabase } from "@lionlang/core/logic/database";
import { stdlib } from "@lionlang/core/modules";
import { Arbitrary, Effect, Schema } from "effect";
import { parseChangelog } from "../changelog.ts";
import {
  claimsOfWorld,
  graphOf,
  itemsOf,
  itemsUnder,
  model,
  modelProgramOf,
  OUTPUTS,
  QUESTIONS,
  type ReleaseFile,
  SECTIONS,
  verdictOf,
  type World,
  world,
} from "./worlds.ts";

/**
 * Pages are written from the whole model of a world's development, which
 * takes a while to build for each world, so they are checked on fewer worlds
 * than the rules; the timeline, which shows the most of the model, on the most.
 */
const OPTIONS = { arbitrary: { runs: 100 } };
const PAGE_OPTIONS = { arbitrary: { runs: 50 } };
const TIMELINE_OPTIONS = { arbitrary: { runs: 100 } };

/** Evaluates `expression` against the model of the world's development. */
const fromModel = (w: World, expression: unknown) =>
  run(modelProgramOf(w, expression) as never, stdlib, {
    database: new LogicDatabase(),
  }) as Effect.Effect<unknown, unknown>;

const setOf = (rows: unknown) => [...new Set(rows as string[])].sort();

/** Text in the order Lion sorts it. */
const textOrder = (a: string, b: string) => Number(a > b) - Number(a < b);

describe("the record's rules", () => {
  it.effect.prop(
    "derive what a plain model of the commit graph, the releases, and the claims says",
    { w: world() },
    ({ w }) =>
      Effect.gen(function* () {
        const answers = (yield* fromModel(w, QUESTIONS)) as Record<
          string,
          unknown
        >;
        const expected = model(w);
        for (const [name, rows] of Object.entries(expected)) {
          expect(answers[name], name).toBeDefined();
          expect(setOf(answers[name]), name).toEqual(rows);
        }
      }),
    OPTIONS
  );
});

/** The sections CHANGELOG.md lists: every one the timeline has but figures. */
const IN_CHANGELOG = SECTIONS.filter((section) => section !== "Figures");

/**
 * The releases a world has, newest first, with the commit each is at, and
 * the draft that names the next release.
 */
const ordered = (w: World) => {
  const g = graphOf(w);
  const releases = g.releases
    .map(({ data, path }) => {
      const hash = (g.at.get(path) ?? [])[0];
      return {
        at: hash === undefined ? undefined : g.byHash.get(hash),
        data,
        path,
      };
    })
    .sort(
      (a, b) =>
        (b.at?.time ?? 5000) - (a.at?.time ?? 5000) ||
        Number(a.path > b.path) - Number(a.path < b.path)
    );
  const [, draft] =
    Object.entries(w.releases)
      .filter(([, data]) => data.draft === true)
      .sort(([a], [b]) => Number(a > b) - Number(a < b))[0] ?? [];
  return { draft, releases };
};

const SAYS_AFTER = / \([^()]*\)$/;

/** A bullet's words, without what it says after them. */
const wordsOf = (bullet: string) => bullet.replace(SAYS_AFTER, "");

const named = (ships: ReleaseFile["ships"]) =>
  ships
    .map((s) => (s.version === undefined ? s.name : `${s.name} ${s.version}`))
    .join(", ");

describe("CHANGELOG.md", () => {
  it.effect.prop(
    "lists each release, newest first, with each item it first shipped under its section, in the latest words",
    { w: world({ clean: true }) },
    ({ w }) =>
      Effect.gen(function* () {
        const pages = (yield* fromModel(w, OUTPUTS)) as Record<string, string>;
        const read = parseChangelog(pages["CHANGELOG.md"] ?? "").map((r) => ({
          heading: r.heading,
          sections: r.sections.map((s) => ({
            items: s.items.map((item) => wordsOf(item.text)),
            kind: s.kind,
            notes: s.notes,
          })),
          summary: r.summary,
        }));
        const items = itemsOf(w);
        const { draft, releases } = ordered(w);
        const sectionsOf = (
          key: string,
          notes: readonly { readonly kind: string; readonly text: string }[]
        ) => {
          const under = itemsUnder(items, key);
          return [
            ...IN_CHANGELOG.map((kind) => ({
              // Items in the same words are one bullet.
              items: [
                ...new Set(
                  under.filter((i) => i.section === kind).map((i) => i.words)
                ),
              ],
              kind,
              notes: notes.filter((n) => n.kind === kind).map((n) => n.text),
            })).filter((s) => s.items.length + s.notes.length > 0),
            ...notes
              .filter((n) => !IN_CHANGELOG.includes(n.kind))
              .map((n) => ({ items: [], kind: n.kind, notes: [n.text] })),
          ];
        };
        const waiting = itemsUnder(items, "next");
        expect(read).toEqual([
          ...(waiting.length === 0
            ? []
            : [
                {
                  heading:
                    draft === undefined
                      ? "Unreleased"
                      : `Unreleased — ${named(draft.ships)}`,
                  sections: sectionsOf("next", draft?.notes ?? []),
                  summary: draft?.summary === undefined ? [] : [draft.summary],
                },
              ]),
          ...releases.map(({ at, data, path }) => ({
            heading: `${at?.date ?? "2026-02-01"} — ${named(data.ships)}`,
            sections: sectionsOf(path, data.notes ?? []),
            summary: data.summary === undefined ? [] : [data.summary],
          })),
        ]);
      }),
    PAGE_OPTIONS
  );
});

/** How DECISIONS.md says each assertion of a record stands. */
const VERDICT_WORDS = {
  replaced: "Replaced by a later word",
  stated: "Stated, not checked by running Lion",
} as const;

const ASSERTS = "**What it asserts, checked.**";

/** Where the next heading after `at` starts, or the end of the page. */
const nextHeading = (page: string, at: number) => {
  const next = [page.indexOf("\n### ", at + 1), page.indexOf("\n## ", at + 1)]
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];
  return next ?? page.length;
};

describe("DECISIONS.md", () => {
  it.effect.prop(
    "indexes every decided question by when it was first decided, and shows each record under the first question it decides with how each thing it asserts stands",
    { w: world({ clean: true }) },
    ({ w }) =>
      Effect.gen(function* () {
        const pages = (yield* fromModel(w, OUTPUTS)) as Record<string, string>;
        const page = pages["DECISIONS.md"] ?? "";
        const g = graphOf(w);
        const claims = claimsOfWorld(w);
        const decided = claims.filter(
          (c) => typeof c.says.decision === "string"
        );
        const firstOf = new Map<string, number>();
        for (const c of decided) {
          const topic = c.says.decision as string;
          const choice = `${topic} ${String(c.says.chose)}`;
          const times = decided
            .filter(
              (d) =>
                `${d.says.decision as string} ${String(d.says.chose)}` ===
                choice
            )
            .filter((d) => g.madeBy(d).size > 0)
            .map(g.firstTime);
          const time = Math.min(...times);
          firstOf.set(
            topic,
            Math.min(firstOf.get(topic) ?? Number.POSITIVE_INFINITY, time)
          );
        }
        const choiceTime = (topic: string, chose: unknown) =>
          Math.min(
            ...decided
              .filter(
                (d) => d.says.decision === topic && d.says.chose === chose
              )
              .filter((d) => g.madeBy(d).size > 0)
              .map(g.firstTime)
          );
        const choices = [
          ...new Map(
            decided.map((d) => [
              `${d.says.decision as string} ${String(d.says.chose)}`,
              { chose: String(d.says.chose), topic: d.says.decision as string },
            ])
          ).values(),
        ].sort(
          (a, b) =>
            choiceTime(a.topic, a.chose) - choiceTime(b.topic, b.chose) ||
            textOrder(a.topic, b.topic) ||
            textOrder(a.chose, b.chose)
        );
        const topics = [...new Set(choices.map((c) => c.topic))];
        const rows = page
          .split("\n")
          .filter(
            (line) =>
              line.startsWith("| ") &&
              !line.startsWith("| Decided") &&
              !line.startsWith("| ---")
          );
        const dateAt = (time: number) =>
          g.all.find((c) => c.time === time)?.date ?? "not committed yet";
        expect(
          rows.map((row) => row.split(" | ").slice(0, 2).join(" | "))
        ).toEqual(
          topics.map(
            (t) =>
              `| ${dateAt(choiceTime(t, choices.find((c) => c.topic === t)?.chose))} | [\`${t}\`](#${t})`
          )
        );
        const records = Object.entries(w.notes)
          .filter(([, file]) => file.title !== undefined)
          .map(([path, file]) => ({
            id: path.slice("history/notes/".length, -".json".length),
            title: file.title as string,
            topics: decided
              .filter((d) => d.path === path)
              .map((d) => d.says.decision as string),
          }))
          .filter((r) => r.topics.length > 0);
        for (const record of records) {
          const home = topics.find((t) => record.topics.includes(t)) as string;
          const at = page.indexOf(`### ${record.title}\n`);
          expect(at, record.id).toBeGreaterThan(-1);
          expect(page.indexOf(`### ${record.title}\n`, at + 1), record.id).toBe(
            -1
          );
          const section = page.lastIndexOf("\n## ", at);
          expect(
            page.slice(section + 4, page.indexOf("\n", section + 4)),
            record.id
          ).toBe(home);
          // Each thing the record asserts, with how it stands.
          const block = page.slice(at, nextHeading(page, at));
          const asserts = block
            .slice(block.indexOf(ASSERTS))
            .split("\n")
            .filter((line) => line.startsWith("- "))
            .map((line) => {
              const verdict = line.slice(2, line.indexOf(": "));
              return `${verdict} ${line.slice(line.indexOf('. "') + 3, -1)}`;
            });
          expect(setOf(asserts), record.id).toEqual(
            setOf(
              claims
                .filter((c) => c.path === `history/notes/${record.id}.json`)
                .map((c) => `${VERDICT_WORDS[verdictOf(g, c)]} ${c.quote}`)
            )
          );
        }
      }),
    PAGE_OPTIONS
  );
});

const ENTITIES: readonly (readonly [string, string])[] = [
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&quot;", '"'],
  ["&amp;", "&"],
];

/** The text an HTML fragment shows: its tags left out, its entities read. */
const textOf = (html: string) =>
  ENTITIES.reduce(
    (text, [entity, character]) => text.replaceAll(entity, character),
    html.replace(TAG, "")
  );

const TAG = /<[^>]+>/g;
const ITEM = /id="([^"]+)"/;
const SECTION = /<section class="kind-section [^"]*" data-kind="([^"]*)">/g;
const CHANGE =
  /<li class="change" data-kind="([^"]*)"><div class="change-text">(.*?)<\/div>/g;

/** Each item of the timeline: its id, sections, and items with their words. */
const readTimeline = (html: string) =>
  html
    .split('<li class="timeline-item')
    .slice(1)
    .map((item) => ({
      id: ITEM.exec(item)?.[1],
      items: [...item.matchAll(CHANGE)].map((m) => ({
        kind: textOf(m[1] ?? ""),
        words: textOf(m[2] ?? ""),
      })),
      sections: [...item.matchAll(SECTION)].map((m) => textOf(m[1] ?? "")),
    }));

describe("docs/changelog.html", () => {
  it.effect.prop(
    "shows each release, newest first, with each item it first shipped under its section, in the latest words",
    { w: world({ clean: true }) },
    ({ w }) =>
      Effect.gen(function* () {
        const pages = (yield* fromModel(w, OUTPUTS)) as Record<string, string>;
        const items = itemsOf(w);
        const { releases } = ordered(w);
        const shown = (id: string, key: string) => {
          const under = itemsUnder(items, key);
          const sections = SECTIONS.filter((s) =>
            under.some((i) => i.section === s)
          );
          return {
            id,
            // Items in the same words are one entry.
            items: sections.flatMap((s) =>
              [
                ...new Set(
                  under.filter((i) => i.section === s).map((i) => i.words)
                ),
              ].map((words) => ({ kind: s, words }))
            ),
            sections,
          };
        };
        const waiting = shown("unreleased", "next");
        expect(readTimeline(pages["docs/changelog.html"] ?? "")).toEqual([
          ...(waiting.items.length === 0 ? [] : [waiting]),
          ...releases.map(({ path }) =>
            shown(
              `release-${path.slice("history/releases/".length, -".json".length)}`,
              path
            )
          ),
        ]);
      }),
    TIMELINE_OPTIONS
  );
});

const pick = (characters: readonly string[], maxLength: number) =>
  Arbitrary.map(
    Arbitrary.array(
      Arbitrary.schema(
        Schema.Int.check(
          Schema.isBetween({ minimum: 0, maximum: characters.length - 1 })
        )
      ),
      { maxLength }
    ),
    (at) => at.map((i) => characters[i]).join("")
  );

/**
 * Pieces of the Markdown the record's texts use: prose, `code`, and
 * [links](url). Prose has no "]", so it never closes a link by accident, and
 * every piece holds the characters HTML gives a meaning to.
 */
type Piece =
  | { readonly kind: "code" | "prose"; readonly text: string }
  | { readonly kind: "link"; readonly text: string; readonly url: string };

const PIECE: Arbitrary.Arbitrary<Piece> = Arbitrary.flatMap(
  Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2 }))
  ),
  (kind): Arbitrary.Arbitrary<Piece> => {
    if (kind === 0) {
      return Arbitrary.map(
        pick(["a", " ", "<", ">", "&", '"', "'", "(", ")", "[", "&amp;"], 8),
        (text) => ({ kind: "prose" as const, text })
      );
    }
    if (kind === 1) {
      return Arbitrary.map(
        pick(["x", " ", "<", ">", "&", '"', "[", "]", "(", ")"], 8),
        (text) => ({ kind: "code" as const, text })
      );
    }
    return Arbitrary.map(
      Arbitrary.all([
        pick(["w", " ", "<", ">", "&", '"'], 6),
        pick(["h", "/", ":", ".", "#", "&", "<", '"', "?"], 8),
      ]),
      ([text, url]) => ({ kind: "link" as const, text, url })
    );
  }
);

const written = (piece: Piece) => {
  if (piece.kind === "code") {
    return `\`${piece.text}\``;
  }
  return piece.kind === "link" ? `[${piece.text}](${piece.url})` : piece.text;
};

const ALLOWED = /<code>|<\/code>|<a href="[^"<>]*">|<\/a>/g;
const ENTITY = /&(?!(?:amp|lt|gt|quot);)/;
const HREF = /<a href="([^"]*)">/g;
const CODE_OPENS = /<code>/g;
const MARKUP = /[<>"]/;

describe("the timeline's inline Markdown", () => {
  it.effect.prop(
    "writes code and links as HTML, and every other character as text",
    {
      texts: Arbitrary.array(Arbitrary.array(PIECE, { maxLength: 6 }), {
        maxLength: 8,
      }),
    },
    ({ texts }) =>
      Effect.gen(function* () {
        const empty: World = {
          added: {},
          commits: [],
          notes: {},
          releases: {},
          tags: [],
        };
        const html = (yield* fromModel(empty, [
          ...(OUTPUTS as unknown[]).slice(0, -1),
          [
            "array/map",
            ["quote", texts.map((t) => t.map(written).join(""))],
            "inline",
          ],
        ])) as string[];
        texts.forEach((pieces, at) => {
          const out = html[at] ?? "";
          expect(textOf(out)).toBe(pieces.map((p) => p.text).join(""));
          expect(out.match(CODE_OPENS)?.length ?? 0).toBe(
            pieces.filter((p) => p.kind === "code").length
          );
          expect(
            [...out.matchAll(HREF)].map((m) => textOf(m[1] ?? ""))
          ).toEqual(pieces.flatMap((p) => (p.kind === "link" ? [p.url] : [])));
          const rest = out.replace(ALLOWED, "");
          expect(rest).not.toMatch(MARKUP);
          expect(rest).not.toMatch(ENTITY);
        });
      }),
    { arbitrary: { runs: 60 } }
  );
});
