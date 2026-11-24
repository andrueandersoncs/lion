/**
 * What a probe can see of the repository, as functions a probe's program
 * calls. Lion evaluates in memory and its library reads no file and runs no
 * command, so these are given by the host that runs the probes:
 *
 * - `["repo/files", path]` gives the paths of the files under a folder of the
 *   repository, in order, and none for a path that names nothing.
 * - `["repo/read", path]` gives the text of a file of the repository.
 * - `["repo/json", path]` gives a JSON file of the repository as a value.
 * - `["repo/run", name]` runs a command `commands.json` declares, and gives
 *   `{"exit", "output"}`: its exit code, and what it wrote.
 *
 * A probe cannot name a command of its own: the commands a probe may run are
 * the ones the file lists, each as the words of one command line, with no
 * shell between them. A command runs once in a build, however many probes
 * ask for it, so every probe is told the same.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { logicError } from "@lionlang/core/errors/evaluation";
import { overEffect } from "@lionlang/core/modules/lib/shared";
import { Effect, Schema } from "effect";

/** The file that declares the commands a probe may run, in the research folder. */
export const COMMANDS = "commands.json";

/** The longest a declared command may run. */
export const COMMAND_TIMEOUT = 120_000;

/** A command a probe may run: its words, and the folder it runs in. */
export interface Command {
  /** The program and its arguments, as they are passed: no shell reads them. */
  readonly command: readonly string[];
  /** The folder it runs in, relative to the repository. The repository, when absent. */
  readonly cwd?: string;
}

/** What a command gave: its exit code, and what it wrote, output then errors. */
export interface Ran {
  readonly exit: number;
  readonly output: string;
}

/** The path inside the repository, or nothing when it leads out of it. */
const inside = (repository: string, path: string) => {
  const full = resolve(repository, path);
  const from = relative(repository, full);
  return from.startsWith("..") || isAbsolute(from) ? undefined : full;
};

/** Folders no probe looks into: git's own, agent worktrees, and installed packages. */
const SKIPPED = new Set([".claude", ".git", "node_modules"]);

/**
 * The files at a path, as paths from the repository: the file itself, every
 * file under a folder, or none when nothing is there. A link is not followed.
 */
const filesAt = (repository: string, full: string): string[] => {
  if (!existsSync(full)) {
    return [];
  }
  if (statSync(full).isFile()) {
    return [relative(repository, full)];
  }
  return readdirSync(full, { withFileTypes: true })
    .filter((entry) => !SKIPPED.has(entry.name))
    .flatMap((entry) => {
      if (entry.isDirectory()) {
        return filesAt(repository, join(full, entry.name));
      }
      return entry.isFile()
        ? [relative(repository, join(full, entry.name))]
        : [];
    })
    .sort();
};

const readText = (repository: string, name: string, path: string) => {
  const full = inside(repository, path);
  if (full === undefined) {
    return logicError(`${name}: "${path}" is outside the repository.`);
  }
  if (!(existsSync(full) && statSync(full).isFile())) {
    return logicError(`${name}: the repository has no file "${path}".`);
  }
  return Effect.succeed(readFileSync(full, "utf8"));
};

/** The functions a probe of the repository at `repository` is given. */
export const repositoryFunctions = (
  repository: string,
  commands: Readonly<Record<string, Command>> = {}
) => {
  const ran = new Map<string, Ran>();
  const runCommand = (name: string) => {
    const declared = Object.hasOwn(commands, name) ? commands[name] : undefined;
    const [program, ...args] = declared?.command ?? [];
    if (declared === undefined || program === undefined) {
      return logicError(
        `repo/run: no command "${name}" is declared in ${COMMANDS}.`
      );
    }
    const cwd = inside(repository, declared.cwd ?? ".");
    if (cwd === undefined) {
      return logicError(
        `repo/run: the command "${name}" runs outside the repository.`
      );
    }
    const before = ran.get(name);
    if (before !== undefined) {
      return Effect.succeed(before);
    }
    const result = spawnSync(program, args, {
      cwd,
      encoding: "utf8",
      timeout: COMMAND_TIMEOUT,
    });
    if (result.status === null) {
      return logicError(
        `repo/run: the command "${name}" did not finish: ${result.error?.message ?? result.signal ?? "stopped"}.`
      );
    }
    const gave = {
      exit: result.status,
      output: `${result.stdout}${result.stderr}`,
    };
    ran.set(name, gave);
    return Effect.succeed(gave);
  };
  return {
    "repo/files": overEffect([Schema.String], (path) => {
      const full = inside(repository, path);
      return full === undefined
        ? logicError(`repo/files: "${path}" is outside the repository.`)
        : Effect.succeed(filesAt(repository, full));
    }),
    "repo/json": overEffect([Schema.String], (path) =>
      Effect.flatMap(readText(repository, "repo/json", path), (text) =>
        Effect.try({
          catch: () => undefined,
          try: () => JSON.parse(text) as unknown,
        }).pipe(
          Effect.catch(() => logicError(`repo/json: "${path}" is not JSON.`))
        )
      )
    ),
    "repo/read": overEffect([Schema.String], (path) =>
      readText(repository, "repo/read", path)
    ),
    "repo/run": overEffect([Schema.String], runCommand),
  };
};

/** The commands the research folder declares, or none when it has no file. */
export const readCommands = (
  repository: string,
  folder: string
): Record<string, Command> => {
  const file = join(repository, folder, COMMANDS);
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, Command>)
    : {};
};
