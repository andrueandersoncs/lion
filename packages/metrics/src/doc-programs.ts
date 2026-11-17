/**
 * The Lion programs the docs show: every fenced `json` block that is a
 * program, in the README files, the developer guidelines, and the skills.
 * `bun run compare <commit> --docs` runs them on two versions, which says
 * which documented results a change made untrue.
 *
 * The live examples of the website are not among them: the docs build runs
 * those and writes what they give.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BLOCK = /```json\n([\s\S]*?)\n```/g;

/** A program is a list that starts with a name: a form or a function. */
const isProgram = (value: unknown) =>
  Array.isArray(value) && typeof value[0] === "string";

/**
 * The programs a text shows in fenced `json` blocks, each with the line its
 * block starts on. A block that is not JSON, or not a program, is not one.
 */
export const programsIn = (
  text: string
): readonly (readonly [line: number, program: unknown])[] =>
  [...text.matchAll(BLOCK)].flatMap((found) => {
    try {
      const program = JSON.parse(found[1] ?? "") as unknown;
      const line = text.slice(0, found.index).split("\n").length;
      return isProgram(program) ? [[line, program] as const] : [];
    } catch {
      return [];
    }
  });

/** The folders of a folder, by path from the repository root. */
const folders = (repository: string, path: string) =>
  existsSync(join(repository, path))
    ? readdirSync(join(repository, path), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${path}/${entry.name}`)
    : [];

/** The Markdown files of a folder, by path from the repository root. */
const pages = (repository: string, path: string) =>
  existsSync(join(repository, path))
    ? readdirSync(join(repository, path))
        .filter((name) => name.endsWith(".md"))
        .map((name) => `${path}/${name}`)
    : [];

/** The files that show Lion programs, by path from the repository root. */
export const docFiles = (repository: string): readonly string[] =>
  [
    "README.md",
    "AGENTS.md",
    ...pages(repository, "guidelines"),
    ...folders(repository, "packages").map((folder) => `${folder}/README.md`),
    ...folders(repository, "skills").flatMap((folder) => [
      `${folder}/SKILL.md`,
      ...pages(repository, `${folder}/references`),
    ]),
  ].filter((path) => existsSync(join(repository, path)));

/** Every program the docs show, named by its file and line. */
export const docPrograms = (repository: string): Record<string, unknown> =>
  Object.fromEntries(
    docFiles(repository).flatMap((path) =>
      programsIn(readFileSync(join(repository, path), "utf8")).map(
        ([line, program]) => [`${path}:${line}`, program] as const
      )
    )
  );
