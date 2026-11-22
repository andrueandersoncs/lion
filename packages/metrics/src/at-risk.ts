/**
 * What the project record's rules protect, for the rules a change puts at
 * risk (M2 of the self-improvement plan). A rule in force predicts what
 * cases give, and a probe in `history/research/probes.json` checks each case
 * by a Lion program, which reads the repository only through `repo/read`,
 * `repo/json`, `repo/files`, and `repo/run`. So a rule protects the paths
 * its probes name: a file, a folder, or the folder a command runs in. A
 * probe that names none checks what Lion does, so it protects the core.
 * A change to a path a rule protects puts the rule at risk.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const READS = new Set(["repo/read", "repo/json", "repo/files", "repo/run"]);
/** What a probe that reads nothing of the repository checks: Lion itself. */
export const LION = "packages/core/src";

/** A path a call names: a string written as it is or quoted. */
const literal = (term: unknown): string | undefined => {
  if (typeof term === "string") {
    return term;
  }
  return Array.isArray(term) &&
    term[0] === "quote" &&
    typeof term[1] === "string"
    ? term[1]
    : undefined;
};

/**
 * The paths a probe's program names, a command as the folder it runs in.
 * A path the program computes could be any, so it is the whole repository,
 * and a program that names none checks Lion itself.
 */
export const pathsOf = (
  program: unknown,
  commands: Readonly<Record<string, { readonly cwd: string }>>
): string[] => {
  const found: string[] = [];
  const visit = (term: unknown) => {
    if (Array.isArray(term)) {
      if (typeof term[0] === "string" && READS.has(term[0])) {
        const named = literal(term[1]);
        if (named === undefined) {
          found.push(".");
        } else if (term[0] === "repo/run") {
          found.push(commands[named]?.cwd ?? ".");
        } else {
          found.push(named);
        }
      }
      term.forEach(visit);
    } else if (typeof term === "object" && term !== null) {
      Object.values(term).forEach(visit);
    }
  };
  visit(program);
  return found.length === 0 ? [LION] : [...new Set(found)].sort();
};

/** Each probe's case and the paths it reads. */
export const probeReads = (root: string): (readonly [string, string])[] => {
  const probes = JSON.parse(
    readFileSync(join(root, "history/research/probes.json"), "utf8")
  ) as { case?: string; program: unknown }[];
  const commands = JSON.parse(
    readFileSync(join(root, "history/research/commands.json"), "utf8")
  ) as Record<string, { cwd: string }>;
  return probes.flatMap((probe) =>
    probe.case === undefined
      ? []
      : pathsOf(probe.program, commands).map(
          (path) => [probe.case as string, path] as const
        )
  );
};

/** Each rule a note states and each case it predicts. */
export const rulePredictions = (
  root: string
): (readonly [string, string])[] => {
  const folder = join(root, "history/notes");
  const pairs = new Set<string>();
  const visit = (term: unknown) => {
    if (Array.isArray(term)) {
      term.forEach(visit);
      return;
    }
    if (typeof term !== "object" || term === null) {
      return;
    }
    const says = term as {
      predicts?: { behavior?: unknown }[];
      rule?: unknown;
    };
    if (typeof says.rule === "string" && Array.isArray(says.predicts)) {
      for (const predicted of says.predicts) {
        if (typeof predicted.behavior === "string") {
          pairs.add(JSON.stringify([says.rule, predicted.behavior]));
        }
      }
    }
    Object.values(term).forEach(visit);
  };
  for (const file of readdirSync(folder).filter((f) => f.endsWith(".json"))) {
    visit(JSON.parse(readFileSync(join(folder, file), "utf8")));
  }
  return [...pairs].sort().map((pair) => JSON.parse(pair) as [string, string]);
};
