/**
 * The record's rules and pages, checked on generated histories against a
 * plain model of what they define. The model says which release shipped a
 * change by walking the commit graph, which commits no entry records, which
 * references and quotes fail, and which decisions are in force. The pages
 * are read back with the same reader that imported the hand-written
 * changelog, and must hold what the model says, in the order it says.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { parseChangelog } from "../changelog.ts";
import { WORKING_TREE } from "../git.ts";
import { ask } from "../record.ts";
import {
  type ChangeItem,
  entriesOf,
  model,
  OUTPUTS,
  QUESTIONS,
  type ReleaseFile,
  sourcesOf,
  type World,
  world,
} from "./worlds.ts";

const OPTIONS = { arbitrary: { runs: 150 } };

const asked = (w: World, question: unknown) =>
  ask(sourcesOf(w), question) as Effect.Effect<unknown, unknown>;

const setOf = (rows: unknown) => [...new Set(rows as string[])].sort();

describe("the record's rules", () => {
  it.effect.prop(
    "derive what a plain model of the commit graph and the entries says",
    { w: world() },
    ({ w }) =>
      Effect.gen(function* () {
        const answers = (yield* asked(w, QUESTIONS)) as Record<string, unknown>;
        const expected = model(w);
        for (const [name, rows] of Object.entries(expected)) {
          expect(answers[name], name).toBeDefined();
          expect(setOf(answers[name]), name).toEqual(rows);
        }
      }),
    OPTIONS
  );
});

/** What a page's change line says, without the decisions it links to. */
const LINKS = / See (\[[^\]]*\]\(DECISIONS\.md#([a-z0-9-]+)\)(, | and )?)+\.$/;

const linked = (text: string) => {
  const found = LINKS.exec(text);
  return {
    decisions:
      found === null
        ? []
        : [...found[0].matchAll(/DECISIONS\.md#([a-z0-9-]+)/g)].map(
            (m) => m[1]
          ),
    text: found === null ? text : text.slice(0, found.index),
  };
};

/** The comma before the last item of a list, where the page says "and". */
const LAST_COMMA = /, ([^,]*)$/;

const RANKS: Record<string, number> = {
  Breaking: 0,
  Added: 1,
  Changed: 2,
  Fixed: 3,
  Documentation: 4,
};

/** The sections the model says a list of changes and notes make, in order. */
const sectionsOf = (
  w: World,
  ids: readonly string[],
  notes: readonly { readonly kind: string; readonly text: string }[]
) => {
  const entries = new Map(entriesOf(w).map((e) => [e.id, e]));
  const timeOf = (path: string) => {
    const at = w.added[path] ?? -1;
    return at < 0 ? 5000 : (w.commits[at]?.time ?? 5000);
  };
  const changes = ids
    .flatMap((id) => {
      const entry = entries.get(id);
      return entry?.kind === "change" ? [entry] : [];
    })
    .sort(
      (a, b) =>
        timeOf(a.path) - timeOf(b.path) ||
        Number(a.path > b.path) - Number(a.path < b.path) ||
        a.index - b.index
    )
    .map((e) => e.data as ChangeItem);
  const kinds = [
    ...new Set([
      ...changes.map((c) => c.kind as string),
      ...notes.map((n) => n.kind),
    ]),
  ];
  return kinds
    .map((kind, first) => ({ first, kind, rank: RANKS[kind] ?? 5 }))
    .sort((a, b) => a.rank - b.rank || a.first - b.first)
    .map(({ kind }) => ({
      items: changes
        .filter((c) => c.kind === kind)
        .map((c) => ({ decisions: c.decisions ?? [], text: c.text })),
      kind,
      notes: notes.filter((n) => n.kind === kind).map((n) => n.text),
    }));
};

/**
 * The model's releases, newest first, with the changes each shipped, and the
 * changes no release has shipped yet.
 */
const ordered = (w: World) => {
  const expected = model(w);
  const shippedIn = (release: string) =>
    expected.shipped
      .filter((row) => row.endsWith(` ${release}`))
      .map((row) => row.slice(0, -release.length - 1));
  const commitOf = (data: ReleaseFile, path: string) => {
    const hash =
      data.commit === undefined
        ? w.commits[w.added[path] ?? -1]?.hash
        : w.commits.find((c) => c.hash.startsWith(data.commit as string))?.hash;
    return w.commits.find((c) => c.hash === hash);
  };
  const releases = Object.entries(w.releases)
    .filter(([, data]) => data.draft !== true)
    .map(([path, data]) => ({ at: commitOf(data, path), data, path }))
    .sort(
      (a, b) =>
        (b.at?.time ?? 5000) - (a.at?.time ?? 5000) ||
        Number(a.path > b.path) - Number(a.path < b.path)
    );
  const unreleased = expected.unreleased.filter((id) => {
    const data = entriesOf(w).find((e) => e.id === id)?.data as ChangeItem;
    return data.internal === undefined;
  });
  const [, draft] =
    Object.entries(w.releases)
      .filter(([, data]) => data.draft === true)
      .sort(([a], [b]) => Number(a > b) - Number(a < b))[0] ?? [];
  return { draft, expected, releases, shippedIn, unreleased };
};

describe("CHANGELOG.md", () => {
  it.effect.prop(
    "lists each release, newest first, with every change it shipped under its kind",
    { w: world({ clean: true }) },
    ({ w }) =>
      Effect.gen(function* () {
        const pages = (yield* asked(w, OUTPUTS)) as Record<string, string>;
        const read = parseChangelog(pages["CHANGELOG.md"] ?? "").map((r) => ({
          heading: r.heading,
          sections: r.sections.map((s) => ({
            items: s.items.map((item) => linked(item.text)),
            kind: s.kind,
            notes: s.notes,
          })),
          summary: r.summary,
        }));
        const { draft, releases, shippedIn, unreleased } = ordered(w);
        const named = (ships: ReleaseFile["ships"]) =>
          ships
            .map((s) =>
              s.version === undefined ? s.name : `${s.name} ${s.version}`
            )
            .join(", ");
        expect(read).toEqual([
          ...(unreleased.length === 0
            ? []
            : [
                {
                  heading:
                    draft === undefined
                      ? "Unreleased"
                      : `Unreleased — ${named(draft.ships)}`,
                  sections: sectionsOf(w, unreleased, draft?.notes ?? []),
                  summary: draft?.summary === undefined ? [] : [draft.summary],
                },
              ]),
          ...releases.map(({ at, data, path }) => ({
            heading: `${at?.date ?? "2026-02-01"} — ${data.ships
              .map((s) =>
                s.version === undefined ? s.name : `${s.name} ${s.version}`
              )
              .join(", ")}`,
            sections: sectionsOf(w, shippedIn(path), data.notes ?? []),
            summary: data.summary === undefined ? [] : [data.summary],
          })),
        ]);
      }),
    OPTIONS
  );
});

describe("DECISIONS.md", () => {
  it.effect.prop(
    "indexes every decision, oldest first, with whether it is in force",
    { w: world({ clean: true }) },
    ({ w }) =>
      Effect.gen(function* () {
        const pages = (yield* asked(w, OUTPUTS)) as Record<string, string>;
        const rows = (pages["DECISIONS.md"] ?? "")
          .split("\n")
          .filter(
            (line) =>
              line.startsWith("| ") &&
              !line.startsWith("| Decided") &&
              !line.startsWith("| ---")
          );
        const expected = model(w);
        const timeOf = (hash: string) =>
          hash === WORKING_TREE
            ? 5000
            : (w.commits.find((c) => c.hash === hash)?.time ?? 0);
        const dated = Object.entries(w.decisions).map(([path, d]) => {
          const made =
            d.commits === undefined || d.commits.length === 0
              ? [w.commits[w.added[path] ?? -1]?.hash ?? WORKING_TREE]
              : d.commits.map(
                  (r) =>
                    w.commits.find((c) => c.hash.startsWith(r.commit))?.hash ??
                    ""
                );
          const first = Math.min(...made.map(timeOf));
          const date =
            first === 5000
              ? "2026-02-01"
              : (w.commits.find((c) => c.time === first)?.date ?? "");
          const by = Object.values(w.decisions)
            .filter((other) => other.supersedes?.includes(d.id))
            .map((other) => other.id)
            .sort();
          return { by, date, first, id: d.id };
        });
        expect(rows).toEqual(
          dated
            .sort((a, b) => a.first - b.first || (a.id < b.id ? -1 : 1))
            .map(
              ({ by, date, id }) =>
                `| ${date} | [Decision ${id}](#${id}) | ${
                  by.length === 0
                    ? "In force"
                    : `Superseded by ${by
                        .map((other) => `[Decision ${other}](#${other})`)
                        .join(", ")
                        .replace(LAST_COMMA, " and $1")}`
                } |`
            )
        );
        expect(expected.inForce).toEqual(
          dated
            .filter((d) => d.by.length === 0)
            .map((d) => d.id)
            .sort()
        );
      }),
    OPTIONS
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
const DECISION = /<details class="decision" id="decision-([^"]+)">/g;

/** Each item of the timeline: its id, kinds, changes, and decisions. */
const readTimeline = (html: string) =>
  html
    .split('<li class="timeline-item')
    .slice(1)
    .map((item) => ({
      changes: [...item.matchAll(CHANGE)].map((m) => ({
        kind: textOf(m[1] ?? ""),
        text: textOf(m[2] ?? ""),
      })),
      decisions: [...item.matchAll(DECISION)].map((m) => m[1]),
      id: ITEM.exec(item)?.[1],
      kinds: [...item.matchAll(SECTION)].map((m) => textOf(m[1] ?? "")),
    }));

describe("docs/changelog.html", () => {
  it.effect.prop(
    "shows each release, newest first, with its changes under their kinds and the decisions it put in effect",
    { w: world({ clean: true }) },
    ({ w }) =>
      Effect.gen(function* () {
        const pages = (yield* asked(w, OUTPUTS)) as Record<string, string>;
        const { expected, releases, shippedIn, unreleased } = ordered(w);
        const firstTime = (id: string) => {
          const path = `history/decisions/${id}.json`;
          const d = w.decisions[path];
          const times =
            d?.commits === undefined || d.commits.length === 0
              ? [w.commits[w.added[path] ?? -1]?.time ?? 5000]
              : d.commits.map(
                  (r) =>
                    w.commits.find((c) => c.hash.startsWith(r.commit))?.time ??
                    0
                );
          return Math.min(...times);
        };
        const decisionsIn = (release: string | undefined) =>
          Object.values(w.decisions)
            .map((d) => d.id)
            .filter((id) => {
              const rows = expected.inEffectFrom.filter((row) =>
                row.startsWith(`${id} `)
              );
              return release === undefined
                ? rows.length === 0
                : rows.includes(`${id} ${release}`);
            })
            .sort(
              (a, b) =>
                firstTime(a) - firstTime(b) || Number(a > b) - Number(a < b)
            );
        const item = (
          id: string,
          changes: readonly string[],
          notes: readonly { readonly kind: string; readonly text: string }[],
          release: string | undefined
        ) => {
          const sections = sectionsOf(w, changes, notes);
          return {
            changes: sections.flatMap((s) =>
              s.items.map((i) => ({ kind: s.kind, text: i.text }))
            ),
            decisions: decisionsIn(release),
            id,
            kinds: sections.map((s) => s.kind),
          };
        };
        const waiting = item("unreleased", unreleased, [], undefined);
        expect(readTimeline(pages["docs/changelog.html"] ?? "")).toEqual([
          ...(waiting.changes.length + waiting.decisions.length === 0
            ? []
            : [waiting]),
          ...releases.map(({ data, path }) =>
            item(
              `release-${path.slice("history/releases/".length, -".json".length)}`,
              shippedIn(path),
              data.notes ?? [],
              path
            )
          ),
        ]);
      }),
    OPTIONS
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
          changes: {},
          commits: [],
          decisions: {},
          releases: {},
          tags: [],
        };
        const html = (yield* asked(empty, [
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
