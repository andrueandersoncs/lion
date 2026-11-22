import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Schema } from "effect";
import {
  functionsOf,
  holding,
  hunksOf,
  plainName,
  touchedBy,
} from "../functions.ts";
import { between, element, word } from "./generators.ts";

/** One top-level item of a generated script, and what a change to each of its lines touches. */
interface Item {
  /** The innermost named function that holds each line, or none. */
  readonly held: readonly (string | undefined)[];
  readonly lines: readonly string[];
  /** What a change to each line touches: names, nothing, or the whole file. */
  readonly touches: readonly (readonly string[] | "whole")[];
}

const boolean = Arbitrary.schema(Schema.Boolean);

/** A script of exported functions, each with an inner one, constants, imports, and comments. */
const script = Arbitrary.map(
  Arbitrary.array(
    Arbitrary.all({
      exported: boolean,
      kind: between(0, 3),
      uses: between(0, 3),
    }),
    { maxLength: 6, minLength: 1 }
  ),
  (picked) => {
    const constants = picked.flatMap((p, at) =>
      p.kind === 1 ? [{ at, exported: p.exported, name: `K${at}` }] : []
    );
    const users = (name: string) =>
      picked.flatMap((p, at) =>
        p.kind === 0 &&
        constants[p.uses % Math.max(constants.length, 1)]?.name === name
          ? [`outer${at}`]
          : []
      );
    const items: Item[] = picked.map((p, at): Item => {
      if (p.kind === 0) {
        const used = constants[p.uses % Math.max(constants.length, 1)]?.name;
        const outer = `outer${at}`;
        const inner = `inner${at}`;
        return {
          held: [outer, inner, inner, inner, outer, outer],
          lines: [
            `export const ${outer} = (a: number) => {`,
            `  const ${inner} = (b: number) => {`,
            "    return b + 1;",
            "  };",
            `  return ${inner}(a)${used === undefined ? "" : ` + ${used}`};`,
            "};",
          ],
          touches: [[outer], [inner], [inner], [inner], [outer], [outer]],
        };
      }
      if (p.kind === 1) {
        const name = `K${at}`;
        const changed = p.exported ? ("whole" as const) : users(name);
        return {
          held: [undefined, undefined, undefined, undefined],
          lines: [
            `${p.exported ? "export " : ""}const ${name} = [`,
            "  // a comment inside the constant",
            `  ${at},`,
            "];",
          ],
          touches: [changed, [], changed, changed],
        };
      }
      if (p.kind === 2) {
        return {
          held: [undefined],
          lines: [`import { x${at} } from "./x${at}.ts";`],
          touches: [[]],
        };
      }
      return { held: [undefined], lines: [`// note ${at}`], touches: [[]] };
    });
    return items;
  }
);

describe("the named functions of a script", () => {
  it.prop(
    "give each line to the innermost named function around it",
    { items: script },
    ({ items }) => {
      const text = items.flatMap((item) => item.lines).join("\n");
      const functions = functionsOf("x.ts", text);
      const held = items.flatMap((item) => item.held);
      for (const [at, name] of held.entries()) {
        expect(holding(functions, at + 1)).toBe(name);
      }
    }
  );

  it.prop(
    "say a change to one line touches its function, the functions that use a constant of the file's own, nothing for an import or a comment, and the whole file for an exported constant",
    { at: between(0, 100), items: script },
    ({ at, items }) => {
      const lines = items.flatMap((item) => item.lines);
      const touches = items.flatMap((item) => item.touches);
      const line = (at % lines.length) + 1;
      const before = lines.join("\n");
      const after = lines
        .map((row, k) => (k === line - 1 ? `${row} // changed` : row))
        .join("\n");
      const expected = touches[line - 1];
      const got = touchedBy("x.ts", before, after, [
        { after: [line, 1], before: [line, 1] },
      ]);
      expect(got).toStrictEqual(
        expected === "whole" ? "whole" : [...new Set(expected)].sort()
      );
    }
  );

  it.prop(
    "read a name V8 reports as the parse names the function: without the object it is a property of, an accessor's word, or a bundler's suffix",
    {
      name: word,
      owners: Arbitrary.array(word, { maxLength: 2 }),
      prefix: element(["", "get ", "set ", "bound "]),
      suffix: between(0, 3),
    },
    ({ name, owners, prefix, suffix }) => {
      const bundled = suffix === 0 ? "" : `$${String(suffix)}`;
      const reported = prefix + [...owners, name].join(".") + bundled;
      expect(plainName(reported)).toBe(name);
    }
  );

  it.prop(
    "read the hunks git diff -U0 prints, with a count of one where it leaves one out",
    {
      hunks: Arbitrary.array(
        Arbitrary.all({
          a: between(1, 500),
          b: between(0, 9),
          c: between(1, 500),
          d: between(0, 9),
        }),
        { maxLength: 4 }
      ),
    },
    ({ hunks }) => {
      const side = (start: number, count: number) =>
        count === 1 ? `${start}` : `${start},${count}`;
      const diff = [
        "diff --git a/x.ts b/x.ts",
        "--- a/x.ts",
        "+++ b/x.ts",
        ...hunks.map(
          (h) => `@@ -${side(h.a, h.b)} +${side(h.c, h.d)} @@ const x = 1;`
        ),
      ].join("\n");
      expect(hunksOf(diff)).toStrictEqual(
        hunks.map((h) => ({ after: [h.c, h.d], before: [h.a, h.b] }))
      );
    }
  );
});
