/**
 * A vitest setup file that records what one test file reaches: the source
 * files whose functions its tests ran, and the names of those functions, the
 * files of the repository it read,
 * and the commands it started. What its imports ran as they loaded is
 * recorded apart, as `loaded`.
 * `bun run affected --map` adds it to each package's tests, one run for the
 * whole suite, and reads what it wrote.
 *
 * It runs inside the tests of other packages, so it imports only vitest and
 * Node, and writes one JSON file per test file to the folder that
 * `LION_REACH_DIR` names.
 */

import childProcess from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { Session } from "node:inspector/promises";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { afterAll, beforeAll, expect } from "vitest";

const folder = process.env.LION_REACH_DIR;
const read = new Set<string>();
const session = new Session();

/** The functions of `node:child_process` that start a command. */
const COMMANDS = [
  "exec",
  "execFile",
  "execFileSync",
  "execSync",
  "spawn",
  "spawnSync",
] as const;

const started = new Set<string>();

/**
 * Records the path of every file a test reads, and the name of every
 * command it runs, such as `git`, which reads files this cannot see.
 */
const watch = () => {
  const original = fs.readFileSync;
  fs.readFileSync = ((path: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
    if (typeof path === "string" || path instanceof URL) {
      read.add(String(path));
    }
    return (original as (...args: unknown[]) => unknown)(path, ...rest);
  }) as typeof fs.readFileSync;
  const processes = childProcess as unknown as Record<string, unknown>;
  for (const name of COMMANDS) {
    const run = processes[name] as (...args: unknown[]) => unknown;
    processes[name] = (command: unknown, ...rest: unknown[]) => {
      started.add(String(command).split(" ")[0] ?? "");
      return run(command, ...rest);
    };
  }
  syncBuiltinESMExports();
};

interface Covered {
  readonly functions: readonly {
    readonly functionName: string;
    readonly ranges: readonly {
      readonly count: number;
      readonly startOffset: number;
    }[];
  }[];
  readonly url: string;
}

/** A script ran when a function in it other than the module's own body did. */
const executed = (script: Covered) =>
  script.functions.some((f) =>
    f.ranges.some((r) => r.startOffset > 0 && r.count > 0)
  );

if (folder !== undefined) {
  watch();
  // Started before the test file is imported, and taken once to drop what
  // earlier files ran in a worker that is used again.
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.startPreciseCoverage", {
    callCount: true,
    detailed: false,
  });
  await session.post("Profiler.takePreciseCoverage");
  const take = async () =>
    (
      (await session.post("Profiler.takePreciseCoverage")) as {
        result: Covered[];
      }
    ).result.filter(executed);
  /** The named functions of each script that ran since coverage was last taken. */
  const named = (scripts: readonly Covered[]) =>
    Object.fromEntries(
      scripts.map((script) => [
        script.url,
        [
          ...new Set(
            script.functions
              .filter(
                (f) => f.functionName !== "" && (f.ranges[0]?.count ?? 0) > 0
              )
              .map((f) => f.functionName)
          ),
        ],
      ])
    );
  // What the imports ran as they loaded, such as the calls that build the
  // library's functions, is every test's alike, so it is kept apart from
  // what the tests ran.
  let loaded: string[] = [];
  // The named functions that ran as the imports loaded, such as those that
  // build the library's functions. A function they built runs in the tests
  // with no name of its own, so a change inside it reaches the tests through
  // the function that built it.
  let atLoad: Record<string, string[]> = {};
  beforeAll(async () => {
    const covered = await take();
    loaded = covered.map((script) => script.url);
    atLoad = named(covered);
  });
  afterAll(async () => {
    const covered = await take();
    const scripts = covered.map((script) => script.url);
    await session.post("Profiler.stopPreciseCoverage");
    session.disconnect();
    // biome-ignore lint/suspicious/noMisplacedAssertion: it reads the path of the test file, and asserts nothing
    const test = expect.getState().testPath ?? "unknown";
    const name = createHash("sha256").update(test).digest("hex").slice(0, 16);
    fs.writeFileSync(
      join(folder, `${name}.json`),
      JSON.stringify({
        commands: [...started],
        atLoad,
        loaded,
        ran: named(covered),
        read: [...read],
        scripts,
        test,
      })
    );
  });
}
