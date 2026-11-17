/**
 * The README of `@lionlang/core`, the page npm shows, written from the
 * repository's README so that the two cannot say different things: its
 * opening, and the sections that describe the language, word for word.
 *
 * A page on npm is read away from the repository, so a link to a file of the
 * repository, or to a section this page leaves out, is written as the full
 * address of what it names. A link to a section this page holds stays as it
 * is. What a fenced block or a code span holds is code, and is not touched.
 */

export const REPOSITORY = "https://github.com/andrueandersoncs/lion";

/** The sections of the repository's README that describe the language. */
export const LANGUAGE: readonly string[] = [
  "Basic Usage",
  "Custom Environment",
  "Expression Model",
  "Special Forms",
  "Logic",
  "Schemas",
  "Standard Library",
  "Host Interop",
];

const NOTE =
  "<!-- Written from the repository's README.md by `bun run --cwd packages/site-runtime docs`. Edit README.md, not this file. -->";

const FENCE = "```";
const SECTION = "## ";
const HEADING = /^#{1,6} (.*)$/;
const LINK = /\]\(([^)\s]+)\)/g;
const ADDRESS = /^[a-z][a-z0-9+.-]*:/i;
const NOT_IN_ANCHOR = /[^\p{L}\p{N}_\- ]/gu;

interface Line {
  /** Whether the line is part of a fenced block, its fences included. */
  readonly code: boolean;
  readonly text: string;
}

const linesOf = (text: string): readonly Line[] => {
  let fenced = false;
  return text.split("\n").map((line) => {
    const fence = line.startsWith(FENCE);
    const code = fenced || fence;
    fenced = fence ? !fenced : fenced;
    return { code, text: line };
  });
};

/** The anchor GitHub and npm give a heading. */
export const anchorOf = (heading: string) =>
  heading.toLowerCase().replace(NOT_IN_ANCHOR, "").replaceAll(" ", "-");

/** The title of the section a line starts, if it starts one. */
const sectionOf = (line: Line) =>
  !line.code && line.text.startsWith(SECTION)
    ? line.text.slice(SECTION.length)
    : undefined;

/**
 * Where a link leads from the package's page: an address as it is, a section
 * the page holds as it is, and anything else in the repository.
 */
const leads = (anchors: ReadonlySet<string>) => (target: string) => {
  if (ADDRESS.test(target)) {
    return target;
  }
  if (target.startsWith("#")) {
    return anchors.has(target.slice(1)) ? target : `${REPOSITORY}${target}`;
  }
  return `${REPOSITORY}/blob/main/${target}`;
};

/** A line of prose with each link's target replaced; code spans are kept. */
const relinked = (text: string, to: (target: string) => string) =>
  text
    .split("`")
    .map((part, index) =>
      index % 2 === 0
        ? part.replace(LINK, (_, target: string) => `](${to(target)})`)
        : part
    )
    .join("`");

/** The package's README, given the repository's. */
export const packageReadme = (readme: string): string => {
  const kept: Line[] = [];
  const left: string[] = [];
  let keeping = true;
  for (const line of linesOf(readme)) {
    const title = sectionOf(line);
    if (title !== undefined) {
      keeping = LANGUAGE.includes(title);
      left.push(...(keeping ? [] : [title]));
    }
    kept.push(...(keeping ? [line] : []));
  }
  const anchors = new Set(
    kept.flatMap((line) => {
      const heading = line.code ? null : HEADING.exec(line.text);
      return heading === null ? [] : [anchorOf(heading[1] ?? "")];
    })
  );
  const to = leads(anchors);
  const body = kept
    .map((line) => (line.code ? line.text : relinked(line.text, to)))
    .join("\n")
    .trimEnd();
  const more = [
    "## More",
    "",
    `This page is the language part of [the README of Lion's repository](${REPOSITORY}#readme). That README goes on to:`,
    "",
    ...left.map((title) => `- [${title}](${REPOSITORY}#${anchorOf(title)})`),
  ];
  return `${[NOTE, "", body, "", ...more].join("\n")}\n`;
};
