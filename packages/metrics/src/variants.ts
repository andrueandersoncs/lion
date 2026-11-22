/**
 * A known mistake found again in other programs: the lints `lion check`
 * runs, written as Lion rules over a program read as data, asked of every
 * Lion program the repository holds, and of the programs agents wrote for
 * the capability corpus.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { attemptsOf } from "./corpus-agents.ts";

/** A Lion program, and where it is: a file, and inside it where needed. */
export interface Found {
  readonly program: unknown;
  readonly where: string;
}

const EXAMPLE = /<lion-example[^>]*>([\s\S]*?)<\/lion-example>/g;
const SKIPPED = new Set(["node_modules", "dist", "out", ".git"]);

/** The files under a folder, with a name `keep` takes, in order. */
const filesUnder = (
  folder: string,
  keep: (name: string) => boolean
): string[] => {
  if (!existsSync(folder)) {
    return [];
  }
  if (statSync(folder).isFile()) {
    return keep(folder) ? [folder] : [];
  }
  return readdirSync(folder)
    .filter((name) => !SKIPPED.has(name))
    .sort()
    .flatMap((name) => filesUnder(join(folder, name), keep));
};

const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return;
  }
};

/** The programs the live examples of a page of the docs hold. */
export const examplesIn = (html: string): unknown[] =>
  [...html.matchAll(EXAMPLE)].flatMap((found) => {
    const program = parsed((found[1] ?? "").trim());
    return program === undefined ? [] : [program];
  });

/**
 * Every Lion program the repository holds: the corpus's reference programs,
 * the live examples of the docs, the project record's probes, and the
 * research model's probes; and, where `agents` names a folder of runs, each
 * program an agent wrote for a corpus task, and each one it tried.
 */
export const programsOf = (root: string, agents?: string): Found[] => {
  const where = (file: string) => relative(root, file);
  const json = (folder: string) =>
    filesUnder(join(root, folder), (name) => name.endsWith(".json")).flatMap(
      (file): Found[] => {
        const program = parsed(readFileSync(file, "utf8"));
        return program === undefined ? [] : [{ program, where: where(file) }];
      }
    );
  const examples = filesUnder(
    join(root, "packages/site-runtime/content"),
    (name) => name.endsWith(".html")
  ).flatMap((file) =>
    examplesIn(readFileSync(file, "utf8")).map((program, at) => ({
      program,
      where: `${where(file)}, example ${at + 1}`,
    }))
  );
  const probes = (
    (parsed(
      readFileSync(join(root, "history/research/probes.json"), "utf8")
    ) as { case?: string; feature?: string; program: unknown }[]) ?? []
  ).map((probe) => ({
    program: probe.program,
    where: `history/research/probes.json, ${probe.case ?? probe.feature}`,
  }));
  const ran =
    agents === undefined
      ? []
      : filesUnder(agents, (name) => name.endsWith(".json"))
          .filter((file) => file.split("/").at(-2) === "solutions")
          .flatMap((file): Found[] => {
            const program = parsed(readFileSync(file, "utf8"));
            return program === undefined
              ? []
              : [{ program, where: relative(root, file) }];
          });
  // Every program an agent tried, which `./try` logs beside why it failed.
  const tried =
    agents === undefined
      ? []
      : filesUnder(agents, (name) => name.endsWith(".jsonl")).flatMap((file) =>
          attemptsOf(readFileSync(file, "utf8")).flatMap((attempt, at) =>
            attempt.program === undefined
              ? []
              : [
                  {
                    program: attempt.program,
                    where: `${relative(root, file)}, try ${at + 1}`,
                  },
                ]
          )
        );
  return [
    ...json("packages/metrics/corpus/solutions"),
    ...examples,
    ...probes,
    ...json("research/probes").filter(
      (found) => !found.where.endsWith("package.json")
    ),
    ...ran,
    ...tried,
  ];
};
