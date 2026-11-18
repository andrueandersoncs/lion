/**
 * Properties of the reasoning skill's eval case `rechecks-what-changed`: the
 * eval service scores what a prompt says, not how it is laid out; the
 * project a run gets holds the wrong lines the case says it does, before and
 * after the changes, and neither git nor file times tell which prompts
 * changed; and the grade fails exactly the lines a report gets wrong.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { gradeOf } from "../skill-eval.ts";
import { REPOSITORY } from "../sources.ts";
import { between, element, text } from "./generators.ts";

const CASE = join(
  REPOSITORY,
  "skills/lion-reasoning/evals/rechecks-what-changed"
);

interface Prompt {
  readonly doc: number;
  readonly name: string;
  readonly text: string;
}
interface Change {
  readonly prompt: string;
  readonly to?: number;
  readonly type: string;
  readonly where: string;
}
interface World {
  readonly changes: readonly Change[];
  readonly first: readonly string[];
  readonly prompts: readonly Prompt[];
  readonly second: readonly string[];
}
interface Reference {
  readonly changed: readonly string[];
  readonly changeOf: Record<string, string>;
  readonly fixed: readonly string[];
  readonly lines: readonly string[];
  readonly scores: Record<string, number>;
  readonly wrong: readonly string[];
}
interface Stage {
  readonly failures: readonly string[];
  readonly name: string;
  readonly passed: number;
  readonly total: number;
}

const worldModule = import(join(CASE, "world.mjs")) as Promise<{
  readonly buildWorld: (n: number, seed: number) => World;
  readonly capsOf: (world: World) => Record<1 | 2, number>;
  readonly changeProject: (world: World, dir: string) => void;
  readonly lineId: (name: string, value: number) => string;
  readonly normalized: (text: string) => string;
  readonly reference: (world: World) => Reference;
  readonly scoreOf: (text: string) => number;
  readonly WORLD: World;
  readonly writeProject: (world: World, dir: string, service: object) => void;
}>;
const graderModule = import(join(CASE, "grade.mjs")) as Promise<{
  readonly gradeReport: (
    world: World,
    entries: readonly unknown[] | undefined
  ) => readonly Stage[];
  readonly printed: (stages: readonly Stage[]) => string;
}>;

const COMMENT = /^[a-z ]{0,12}$/;
const comments = Arbitrary.array(
  Arbitrary.all({
    at: between(0, 40),
    kind: element(["comment", "trailing", "blank"] as const),
    words: text(COMMENT),
  }),
  { maxLength: 6 }
);
const flags = (length: number) =>
  Arbitrary.array(Arbitrary.schema(Schema.Boolean), {
    maxLength: length,
    minLength: length,
  });

const RESULTS_LINE = /^- `([a-z-]+)` scores (\d\.\d\d) on the golden set\.$/;

/** RESULTS.md's lines in a project folder whose documented score is not what the prompt scores. */
const wrongOnDisk = (
  dir: string,
  scoreOf: (text: string) => number,
  lineId: (name: string, value: number) => string
) =>
  readFileSync(join(dir, "RESULTS.md"), "utf8")
    .split("\n")
    .flatMap((line) => {
      const found = RESULTS_LINE.exec(line);
      if (found === null) {
        return [];
      }
      const [, name, value] = found as unknown as [string, string, string];
      const score = scoreOf(
        readFileSync(join(dir, "prompts", `${name}.md`), "utf8")
      );
      return score === Number(value) ? [] : [lineId(name, Number(value))];
    })
    .sort();

describe("the rechecks-what-changed eval's world", () => {
  it.effect.prop(
    "scores what a prompt says: comments, trailing spaces, and blank lines added anywhere leave its score as it was",
    { edits: comments, which: between(0, 23) },
    ({ edits, which }) =>
      Effect.gen(function* () {
        const { normalized, scoreOf, WORLD } = yield* Effect.promise(
          () => worldModule
        );
        const prompt = WORLD.prompts[which] as Prompt;
        const lines = prompt.text.split("\n");
        for (const edit of edits) {
          const at = edit.at % (lines.length + 1);
          if (edit.kind === "comment") {
            lines.splice(at, 0, `<!-- ${edit.words} -->`);
          } else if (edit.kind === "blank") {
            lines.splice(at, 0, "", "");
          } else if (at < lines.length) {
            lines[at] = `${lines[at]}  `;
          }
        }
        // The case's prompts name the world's prompts, in its order, and its caps.
        const { capsOf } = yield* Effect.promise(() => worldModule);
        const caps = capsOf(WORLD);
        for (const [session, names] of [
          [1, WORLD.first],
          [2, WORLD.second],
        ] as const) {
          const prompt = readFileSync(
            join(CASE, "sessions", `${session}.md`),
            "utf8"
          );
          const listed = names.map((name) => `\`${name}\``).join(", ");
          expect(prompt).toContain(listed);
          expect(prompt).toContain(`may run at most ${caps[session]} of them`);
        }
        const laidOut = lines.join("\n");
        expect(normalized(laidOut)).toBe(normalized(prompt.text));
        expect(scoreOf(laidOut)).toBe(scoreOf(prompt.text));
      })
  );

  it.effect.prop(
    "lays out a project whose wrong lines are the ones the case says, before and after the changes, which change no file git would list and leave every prompt with one time",
    { n: between(18, 32), seed: between(1, 100_000) },
    ({ n, seed }) =>
      Effect.gen(function* () {
        const {
          buildWorld,
          changeProject,
          lineId,
          reference,
          scoreOf,
          writeProject,
        } = yield* Effect.promise(() => worldModule);
        const world = buildWorld(n, seed);
        const ref = reference(world);
        const dir = mkdtempSync(join(tmpdir(), "rechecks-world-"));
        try {
          writeProject(world, dir, { key: "k", service: "http://127.0.0.1:1" });
          const status = () =>
            execFileSync("git", ["status", "--short"], {
              cwd: dir,
              encoding: "utf8",
            });
          const before = status();
          const atFirst = [
            ...ref.wrong.filter((line) => !ref.changed.includes(line)),
            ...ref.fixed,
          ].sort();
          expect(wrongOnDisk(dir, scoreOf, lineId)).toEqual(atFirst);
          changeProject(world, dir);
          expect(status()).toBe(before);
          expect(wrongOnDisk(dir, scoreOf, lineId)).toEqual(
            [...ref.wrong].sort()
          );
          const times = new Set(
            [
              ...world.prompts.map((p) => join("prompts", `${p.name}.md`)),
              "RESULTS.md",
            ].map((file) => statSync(join(dir, file)).mtimeMs)
          );
          expect(times.size).toBe(1);
          // What went wrong and what came right after the first session are the changes that did it.
          const kinds = (lines: readonly string[]) =>
            lines
              .map((line) => ref.changeOf[line.split("=")[0] as string])
              .sort();
          expect(kinds(ref.changed)).toEqual([
            "docBreak",
            "promptBreak",
            "promptBreak",
            "promptBreak",
            "promptBreak",
          ]);
          expect(kinds(ref.fixed)).toEqual(["docFix", "promptFix"]);
        } finally {
          rmSync(dir, { force: true, recursive: true });
        }
      }),
    { arbitrary: { runs: 12 }, timeout: 120_000 }
  );
});

describe("the rechecks-what-changed eval's grade", () => {
  it.effect.prop(
    "fails exactly the wrong lines a report leaves out, the lines it reports that came right or are right, and a report that is not there",
    {
      junk: Arbitrary.array(element(["a note", "`summarize-email` is fine"]), {
        maxLength: 2,
      }),
      keepFixed: flags(2),
      keepRight: Arbitrary.array(between(0, 23), { maxLength: 3 }),
      keepWrong: flags(10),
      missing: between(0, 9),
    },
    ({ junk, keepFixed, keepRight, keepWrong, missing }) =>
      Effect.gen(function* () {
        const { lineId, reference, WORLD } = yield* Effect.promise(
          () => worldModule
        );
        const { gradeReport, printed } = yield* Effect.promise(
          () => graderModule
        );
        const ref = reference(WORLD);
        const reportedWrong = ref.wrong.filter((_, i) => keepWrong[i] === true);
        const reportedFixed = ref.fixed.filter((_, i) => keepFixed[i] === true);
        // The lines RESULTS.md holds at the end, and of those the ones that are right.
        const finalLine = (p: Prompt) => {
          const change = WORLD.changes.find(
            (c) => c.prompt === p.name && c.where === "results"
          );
          return lineId(p.name, change?.to ?? p.doc);
        };
        // A line that came right after the first session is graded as such, not as a right line.
        const rightNow = WORLD.prompts
          .map(finalLine)
          .filter(
            (line) => !(ref.wrong.includes(line) || ref.fixed.includes(line))
          );
        const reportedRight = [
          ...new Set(
            keepRight.map((i) => rightNow[i % rightNow.length] as string)
          ),
        ];
        const entry = (line: string) => {
          const [name, value] = line.split("=") as [string, string];
          return {
            claim: `- \`${name}\` scores ${value} on the golden set.`,
            prompt: name,
            score: 0.5,
          };
        };
        const entries = [
          ...reportedWrong,
          ...reportedFixed,
          ...reportedRight,
        ].map(entry);
        const junkEntries = junk.map((claim) => ({ claim }));
        const absent = missing === 0;
        const graded = gradeOf(
          printed(
            gradeReport(
              WORLD,
              absent ? undefined : [...entries, ...junkEntries]
            )
          )
        );
        // The model: a Set of what the report got wrong.
        const reported = new Set(
          absent ? [] : [...reportedWrong, ...reportedFixed, ...reportedRight]
        );
        const missed = ref.wrong.filter((line) => !reported.has(line)).length;
        const cameRight = ref.fixed.filter((line) => reported.has(line)).length;
        const imprecise =
          !absent && (reportedRight.length > 0 || junk.length > 0) ? 1 : 0;
        const failed = (absent ? 1 : 0) + missed + cameRight + imprecise;
        expect(graded.total).toBe(1 + ref.wrong.length + ref.fixed.length + 1);
        expect(graded.total - graded.passed).toBe(failed);
        expect(graded.failures.length).toBe(failed);
      })
  );
});
