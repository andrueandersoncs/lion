/**
 * Reads a changelog written the way the record writes `CHANGELOG.md`: a
 * `## ` heading for each release, its summary, and a `### ` heading for each
 * kind of change, with notes and then one `- ` line per change. The record
 * read the hand-written changelog this way once, and the properties read what
 * it writes this way to check that nothing is lost on the way.
 */

export interface ChangelogItem {
  /** Lines of the file the item spans, from 1. */
  readonly line: number;
  readonly text: string;
}

export interface ChangelogSection {
  /** Every `- ` line, in order. */
  readonly items: readonly ChangelogItem[];
  /** The heading, such as `Added`. */
  readonly kind: string;
  /** Paragraphs between the heading and the first item. */
  readonly notes: readonly string[];
}

export interface ChangelogRelease {
  /** The heading after `## `, such as `2026-11-13 — @lionlang/core 0.10.0`. */
  readonly heading: string;
  readonly sections: readonly ChangelogSection[];
  /** Paragraphs between the heading and the first section. */
  readonly summary: readonly string[];
}

interface Building {
  heading: string;
  sections: { items: ChangelogItem[]; kind: string; notes: string[] }[];
  summary: string[];
}

/** The releases of a changelog, in the order the file lists them. */
export const parseChangelog = (text: string): ChangelogRelease[] => {
  const releases: Building[] = [];
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    const release = releases.at(-1);
    const section = release?.sections.at(-1);
    if (line.startsWith("## ")) {
      releases.push({ heading: line.slice(3), sections: [], summary: [] });
    } else if (line.startsWith("### ") && release !== undefined) {
      release.sections.push({ items: [], kind: line.slice(4), notes: [] });
    } else if (line.startsWith("- ") && section !== undefined) {
      section.items.push({ line: index + 1, text: line.slice(2) });
    } else if (
      line.trim() !== "" &&
      !line.startsWith("#") &&
      !line.startsWith("<!--") &&
      release !== undefined
    ) {
      (section === undefined ? release.summary : section.notes).push(line);
    }
  });
  return releases;
};
