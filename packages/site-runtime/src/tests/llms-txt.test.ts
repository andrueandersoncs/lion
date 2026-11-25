/**
 * Properties of `llms.txt` and `llms-full.txt` generation: clean Markdown
 * output with no leftover HTML markup, every doc and package version indexed,
 * and every evaluated example preserved with its real result.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Schema } from "effect";
import {
  htmlToMarkdown,
  type LlmsDoc,
  type LlmsExample,
  type LlmsKindGroup,
  type PackageVersions,
  renderLlmsFullTxt,
  renderLlmsTxt,
  SITE_URL,
} from "../llms-txt.ts";

const OPTIONS = { arbitrary: { runs: 200 } };
const RAW_HTML_TAG = /<\/?(?:h2|p|ul|li|a|strong|code)\b/;

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

const element = <A>(items: readonly A[]): Arbitrary.Arbitrary<A> =>
  Arbitrary.map(int(0, items.length - 1), (at) => items[at] as A);

const word = element([
  "alpha",
  "beta",
  "gamma",
  "delta",
  "policy",
  "proof",
  "graph",
  "schema",
]);

const version: Arbitrary.Arbitrary<string> = Arbitrary.map(
  Arbitrary.all([int(0, 9), int(0, 30), int(0, 9)]),
  ([major, minor, patch]) => `${major}.${minor}.${patch}`
);

const versionsArb: Arbitrary.Arbitrary<PackageVersions> = Arbitrary.map(
  Arbitrary.all([version, version, version, version]),
  ([core, cli, typesafeAi, ui]) => ({ core, cli, typesafeAi, ui })
);

const docEntry = Arbitrary.map(
  Arbitrary.all([word, word, word, int(1, 99)]),
  ([a, b, c, n]) => ({
    id: `${a}-${n}`,
    summary: `Explains ${b} and ${c}.`,
    title: `${a} ${b}`,
  })
);

const groupArb: Arbitrary.Arbitrary<LlmsKindGroup> = Arbitrary.map(
  Arbitrary.all([
    element(["Tutorials", "How-to guides", "Reference", "Explanation"]),
    Arbitrary.array(docEntry, { maxLength: 4, minLength: 1 }),
  ]),
  ([title, docs]) => ({ docs, title })
);

const exampleArb: Arbitrary.Arbitrary<LlmsExample> = Arbitrary.map(
  Arbitrary.all([word, int(-50, 50), int(-50, 50), element([true, false])]),
  ([name, a, b, ok]): LlmsExample =>
    ok
      ? {
          name,
          ok: true,
          source: `["number/add", ${a}, ${b}]`,
          value: String(a + b),
        }
      : {
          error: `Bad input ${a}`,
          name,
          ok: false,
          source: `["bad", ${a}]`,
        }
);

describe("llms.txt generation", () => {
  it.prop(
    "indexes every document link, title, summary, and package version",
    {
      groups: Arbitrary.array(groupArb, { maxLength: 4, minLength: 1 }),
      versions: versionsArb,
    },
    ({ groups, versions }) => {
      const out = renderLlmsTxt(groups, versions);
      expect(out).toContain(`${SITE_URL}/llms-full.txt`);
      expect(out).toContain(`@lionlang/core\` (v${versions.core})`);
      expect(out).toContain(`@lionlang/ui\` (v${versions.ui})`);
      expect(out).toContain(`@lionlang/cli\` (v${versions.cli})`);
      expect(out).toContain(
        `@lionlang/typesafe-ai\` (v${versions.typesafeAi})`
      );
      expect(out).toContain("npx skills add andrueandersoncs/lion");
      for (const group of groups) {
        expect(out).toContain(`### ${group.title}`);
        for (const doc of group.docs) {
          expect(out).toContain(
            `- [${doc.title}](${SITE_URL}/docs.html#${doc.id}): ${doc.summary}`
          );
        }
      }
    },
    OPTIONS
  );

  it.prop(
    "converts HTML fragments to clean Markdown without leaving raw tags",
    {
      codeText: word,
      heading: word,
      itemA: word,
      itemB: word,
      linkId: word,
      paragraph: word,
    },
    ({ codeText, heading, itemA, itemB, linkId, paragraph }) => {
      const html = `
        <h2>${heading}</h2>
        <p>Read <a href="#${linkId}"><code>${codeText}</code></a> about <strong>${paragraph}</strong>.</p>
        <ul><li>${itemA}</li><li>${itemB}</li></ul>
      `;
      const md = htmlToMarkdown(html);
      expect(md).toContain(`### ${heading}`);
      expect(md).toContain(
        `[\`${codeText}\`](${SITE_URL}/docs.html#${linkId})`
      );
      expect(md).toContain(`**${paragraph}**`);
      expect(md).toContain(`- ${itemA}`);
      expect(md).toContain(`- ${itemB}`);
      expect(md).not.toMatch(RAW_HTML_TAG);
    },
    OPTIONS
  );

  it.prop(
    "includes every evaluated example source and output in llms-full.txt",
    {
      examples: Arbitrary.array(exampleArb, { maxLength: 4, minLength: 1 }),
      id: word,
      versions: versionsArb,
    },
    ({ examples, id, versions }) => {
      const body = examples
        .map(
          (ex) => `<lion-example name="${ex.name}">${ex.source}</lion-example>`
        )
        .join("\n");
      const doc: LlmsDoc = {
        examples,
        id,
        kindLabel: "How-to guide",
        kindTitle: "How-to guides",
        rawBody: `<p>Intro</p>\n${body}`,
        summary: `Guide for ${id}.`,
        title: `Guide ${id}`,
      };
      const index = renderLlmsTxt(
        [
          {
            docs: [{ id: doc.id, summary: doc.summary, title: doc.title }],
            title: "How-to guides",
          },
        ],
        versions
      );
      const full = renderLlmsFullTxt(index, [doc]);
      expect(full.startsWith(index.trimEnd())).toBe(true);
      expect(full).toContain(`URL: ${SITE_URL}/docs.html#${id}`);
      for (const ex of examples) {
        expect(full).toContain(ex.source);
        if (ex.ok) {
          expect(full).toContain(ex.value ?? "");
        } else {
          expect(full).toContain(ex.error ?? "");
        }
      }
    },
    OPTIONS
  );
});
