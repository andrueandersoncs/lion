/**
 * The package's README, written from the repository's. A README here is a
 * description: sections, each a list of parts whose kind is known, so a plain
 * model says what the package's page holds without reading any Markdown. The
 * page keeps the opening and the language sections word for word, leaves the
 * other sections out and lists them at its end, and changes only where a
 * link leads: never what a fenced block or a code span holds.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Schema } from "effect";
import { packageReadme } from "../package-readme.ts";

const OPTIONS = { arbitrary: { runs: 300 } };

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

const element = <A>(items: readonly A[]): Arbitrary.Arbitrary<A> =>
  Arbitrary.map(int(0, items.length - 1), (at) => items[at] as A);

const REPOSITORY = "https://github.com/andrueandersoncs/lion";

/** Sections of the language, which the page keeps, each with its anchor. */
const KEPT: Readonly<Record<string, string>> = {
  "Basic Usage": "basic-usage",
  Logic: "logic",
  Schemas: "schemas",
  "Host Interop": "host-interop",
};
/** Sections about the repository, which the page leaves out. */
const LEFT: Readonly<Record<string, string>> = {
  Packages: "packages",
  "Command Line": "command-line",
  "TypeSafe AI and Jev": "typesafe-ai-and-jev",
  Website: "website",
};
/** Headings inside a section, with the anchors GitHub gives them. */
const INSIDE: Readonly<Record<string, string>> = {
  Forms: "forms",
  "`why`, and what it rests on": "why-and-what-it-rests-on",
  "The schema of a relation's rows": "the-schema-of-a-relations-rows",
};
const ANCHORS = { ...KEPT, ...LEFT, ...INSIDE };
const TITLES = [...Object.keys(KEPT), ...Object.keys(LEFT)];
const HEADINGS = Object.keys(INSIDE);
const anchorOf = (title: string) => ANCHORS[title] as string;
const FILES = ["CHANGELOG.md", "packages/agent/src/agent.json", "history/"];
const ADDRESSES = ["https://lionlang.dev", "mailto:lion@example.com"];

type Part =
  | { readonly kind: "prose"; readonly word: string }
  | { readonly kind: "heading"; readonly title: string }
  | { readonly kind: "file" | "address" | "span"; readonly target: string }
  | { readonly kind: "anchor"; readonly title: string }
  | { readonly kind: "block"; readonly target: string };

interface Section {
  readonly parts: readonly Part[];
  readonly title: string;
}

const part: Arbitrary.Arbitrary<Part> = Arbitrary.flatMap(
  element([
    "prose",
    "heading",
    "file",
    "address",
    "anchor",
    "span",
    "block",
  ] as const),
  (kind): Arbitrary.Arbitrary<Part> => {
    if (kind === "prose") {
      return Arbitrary.map(element(["facts", "rules", "a b"]), (word) => ({
        kind,
        word,
      }));
    }
    if (kind === "heading") {
      return Arbitrary.map(element(HEADINGS), (title) => ({ kind, title }));
    }
    if (kind === "anchor") {
      return Arbitrary.map(element([...TITLES, ...HEADINGS]), (title) => ({
        kind,
        title,
      }));
    }
    if (kind === "address") {
      return Arbitrary.map(element(ADDRESSES), (target) => ({ kind, target }));
    }
    return Arbitrary.map(element(FILES), (target) => ({ kind, target }));
  }
);

/** Sections with titles all different, in any order. */
const sections: Arbitrary.Arbitrary<readonly Section[]> = Arbitrary.map(
  Arbitrary.array(
    Arbitrary.all([
      int(0, TITLES.length - 1),
      Arbitrary.array(part, { maxLength: 6 }),
    ]),
    { maxLength: 8 }
  ),
  (drawn) =>
    drawn
      .filter(
        ([at], index) => drawn.findIndex(([same]) => same === at) === index
      )
      .map(([at, parts]) => ({ parts, title: TITLES[at] as string }))
);

const kept = (section: Section) => section.title in KEPT;

/** The anchors of the page: the headings of the sections it keeps. */
const anchorsOf = (readme: readonly Section[]) =>
  new Set(
    readme
      .filter(kept)
      .flatMap((section) => [
        anchorOf(section.title),
        ...section.parts.flatMap((each) =>
          each.kind === "heading" ? [anchorOf(each.title)] : []
        ),
      ])
  );

/**
 * A part as Markdown, with its link leading to `target`: in the repository's
 * README the target as written, and in the package's what the model says.
 */
const written = (each: Part, target: (each: Part) => string): string[] => {
  switch (each.kind) {
    case "prose":
      return [each.word, ""];
    case "heading":
      return [`### ${each.title}`, ""];
    case "span":
      return [`As code: \`["see"](${each.target})\` stays.`, ""];
    case "block":
      return ["```json", `["see"](${each.target})`, "## Logic", "```", ""];
    default:
      return [`See [\`the ${each.kind}\`](${target(each)}) for more.`, ""];
  }
};

/** Where a part's link leads as the repository's README writes it. */
const asWritten = (each: Part) => {
  if (each.kind === "anchor") {
    return `#${anchorOf(each.title)}`;
  }
  return "target" in each ? each.target : "";
};

const INTRO = ["# Lion", "", "Lion is a JSON-based Lisp.", ""];

const lines = (section: Section, target: (each: Part) => string) => [
  `## ${section.title}`,
  "",
  ...section.parts.flatMap((each) => written(each, target)),
];

describe("packageReadme", () => {
  it.prop(
    "keeps the language sections, and makes every other link an address",
    { readme: sections },
    ({ readme }) => {
      const anchors = anchorsOf(readme);
      const onPage = (each: Part) => {
        if (each.kind === "file") {
          return `${REPOSITORY}/blob/main/${each.target}`;
        }
        if (each.kind === "anchor" && !anchors.has(anchorOf(each.title))) {
          return `${REPOSITORY}#${anchorOf(each.title)}`;
        }
        return asWritten(each);
      };
      const root = [
        ...INTRO,
        ...readme.flatMap((section) => lines(section, asWritten)),
      ].join("\n");
      const page = packageReadme(root).split("\n");
      const body = [
        ...INTRO,
        ...readme.filter(kept).flatMap((section) => lines(section, onPage)),
      ]
        .join("\n")
        .trimEnd()
        .split("\n");
      const left = readme
        .filter((section) => !kept(section))
        .map(
          (section) =>
            `- [${section.title}](${REPOSITORY}#${anchorOf(section.title)})`
        );
      // The note that says where the page comes from, then the body.
      expect(page.slice(2, 2 + body.length)).toEqual(body);
      // Then the sections left out, each as a link into the repository.
      expect(page.slice(2 + body.length + 5, -1)).toEqual(left);
      expect(page.at(-1)).toBe("");
    },
    OPTIONS
  );
});
