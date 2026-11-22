/**
 * Builds the reach map: runs each package's tests once with
 * `reach-trace.ts` as a setup file, and writes what every test file reached,
 * with how long it took, to `out/reach/map.json`. The commands a package's
 * test script runs besides vitest, such as the record's check, read the
 * whole repository, so each is a check that every change reaches.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { Reached, ReachMap } from "./affected.ts";
import { plainName } from "./functions.ts";
import { REPOSITORY } from "./sources.ts";

/** Where the map and the traces it is built from are kept. */
export const REACH = join(REPOSITORY, "out/reach");
/** The map `bun run affected` reads. */
export const MAP = join(REACH, "map.json");
const TRACER = join(import.meta.dirname, "reach-trace.ts");

/** What the tracer wrote for one test file. */
export interface Traced {
  /** The named functions that ran as the imports loaded, by script. */
  readonly atLoad?: Readonly<Record<string, readonly string[]>>;
  readonly commands: readonly string[];
  /** The named functions the tests ran, by the script they are in. */
  readonly ran?: Readonly<Record<string, readonly string[]>>;
  readonly read: readonly string[];
  readonly scripts: readonly string[];
  readonly test: string;
}

/**
 * A location as a path of the repository, or undefined when it is outside
 * it, in `node_modules`, or under `out/`.
 */
export const repositoryPath = (
  root: string,
  location: string
): string | undefined => {
  let absolute = location;
  if (location.startsWith("file://")) {
    absolute = fileURLToPath(location.split("?")[0] ?? location);
  } else if (!location.startsWith("/")) {
    return;
  }
  const path = relative(root, absolute);
  const outside =
    path === "" ||
    path.startsWith("..") ||
    path.startsWith("out/") ||
    path.split("/").includes("node_modules");
  return outside ? undefined : path;
};

const BUILT = /^(packages\/[^/]+)\/dist\/(.+)\.(?:mjs|cjs|js)$/;

/**
 * A file a test ran, as the source it was built from: a built file of a
 * package is the source file of the same name, or, for a chunk no source
 * file names, the whole package.
 */
export const sourceOf = (
  path: string,
  exists: (path: string) => boolean
): { readonly file: string } | { readonly package: string } => {
  const built = BUILT.exec(path);
  if (built === null) {
    return { file: path };
  }
  const source = `${built[1]}/src/${built[2]}.ts`;
  return exists(source) ? { file: source } : { package: built[1] as string };
};

/** One test file's record in the map, from what the tracer wrote. */
export const reachedOf = (
  root: string,
  folder: string,
  traced: Traced,
  seconds: number,
  exists: (path: string) => boolean
): Reached => {
  const files = new Set<string>();
  const packages = new Set<string>();
  const tracer = relative(root, TRACER);
  for (const location of [...traced.scripts, ...traced.read]) {
    const path = repositoryPath(root, location);
    if (path === undefined || path === tracer) {
      continue;
    }
    const source = sourceOf(path, exists);
    if ("file" in source) {
      files.add(source.file);
    } else {
      packages.add(source.package);
    }
  }
  const functions = new Set<string>();
  for (const [location, names] of [
    ...Object.entries(traced.ran ?? {}),
    ...Object.entries(traced.atLoad ?? {}),
  ]) {
    const path = repositoryPath(root, location);
    const source = path === undefined ? undefined : sourceOf(path, exists);
    if (source !== undefined && "file" in source) {
      for (const name of names) {
        functions.add(JSON.stringify([source.file, plainName(name)]));
      }
    }
  }
  const test = repositoryPath(root, traced.test) ?? traced.test;
  files.add(test);
  return {
    functions: [...functions]
      .sort()
      .map((pair) => JSON.parse(pair) as [string, string]),
    package: folder,
    packages: [...packages].sort(),
    reaches: [...files].sort(),
    repository: traced.commands.includes("git"),
    seconds,
    test,
  };
};

/** The parts of a package's test script: whether it runs vitest, and its other commands. */
export const testScript = (
  script: string
): { readonly commands: readonly string[]; readonly vitest: boolean } => {
  const parts = script.split("&&").map((part) => part.trim());
  return {
    commands: parts.filter((part) => part !== "vitest run" && part !== ""),
    vitest: parts.includes("vitest run"),
  };
};

/** A vitest config that is the package's own with the tracer added. */
const wrapperConfig = (packageRoot: string) => {
  const own = join(packageRoot, "vitest.config.ts");
  const base = existsSync(own)
    ? `import base from ${JSON.stringify(own)};`
    : "const base = {};";
  return [
    'import { mergeConfig } from "vitest/config";',
    base,
    `export default mergeConfig(base, { test: { setupFiles: [${JSON.stringify(TRACER)}] } });`,
    "",
  ].join("\n");
};

interface VitestReport {
  readonly testResults: readonly {
    readonly endTime: number;
    readonly name: string;
    readonly startTime: number;
  }[];
}

/** Runs a package's tests with the tracer, and gives each test file's record. */
const traceVitest = (
  root: string,
  folder: string,
  log: (line: string) => void
): { readonly passed: boolean; readonly reached: Reached[] } => {
  const name = folder.split("/")[1] as string;
  const traces = join(REACH, name);
  rmSync(traces, { force: true, recursive: true });
  mkdirSync(traces, { recursive: true });
  const config = join(REACH, `${name}.config.ts`);
  writeFileSync(config, wrapperConfig(join(root, folder)));
  const report = join(REACH, `${name}.durations.json`);
  const started = Date.now();
  const ran = spawnSync(
    "bunx",
    [
      "vitest",
      "run",
      "--config",
      config,
      "--reporter=json",
      `--outputFile=${report}`,
    ],
    {
      cwd: join(root, folder),
      encoding: "utf8",
      env: { ...process.env, LION_REACH_DIR: traces },
    }
  );
  log(
    `${folder}: vitest ${ran.status === 0 ? "passed" : "failed"} in ${Math.round((Date.now() - started) / 1000)} s`
  );
  const durations = new Map<string, number>();
  if (existsSync(report)) {
    const results = JSON.parse(readFileSync(report, "utf8")) as VitestReport;
    for (const result of results.testResults) {
      durations.set(result.name, (result.endTime - result.startTime) / 1000);
    }
  }
  const exists = (path: string) => existsSync(join(root, path));
  const reached = readdirSync(traces)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const traced = JSON.parse(
        readFileSync(join(traces, file), "utf8")
      ) as Traced;
      return reachedOf(
        root,
        folder,
        traced,
        durations.get(traced.test) ?? 0,
        exists
      );
    });
  return { passed: ran.status === 0, reached };
};

/**
 * Why a map would be wrong to write: a package whose vitest run failed,
 * since a test file that failed may have written no trace, and a test the
 * map lacks is never picked. Nothing when every run passed.
 */
export const refusedMap = (
  runs: readonly { readonly folder: string; readonly passed: boolean }[]
): string | undefined => {
  const failed = runs.filter((run) => !run.passed).map((run) => run.folder);
  return failed.length === 0
    ? undefined
    : `The tests of ${failed.join(", ")} failed, so the map would lack what their failing files reached. No map was written: make the tests pass, with nothing else running, and map again.`;
};

/** Runs one command of a test script, and gives its record: a check every change reaches. */
const timeCommand = (
  root: string,
  folder: string,
  command: string,
  log: (line: string) => void
): Reached => {
  const started = Date.now();
  const ran = spawnSync("sh", ["-c", command], {
    cwd: join(root, folder),
    encoding: "utf8",
  });
  const seconds = (Date.now() - started) / 1000;
  log(
    `${folder}: ${command} ${ran.status === 0 ? "passed" : "failed"} in ${Math.round(seconds)} s`
  );
  return {
    package: folder,
    packages: [],
    reaches: [],
    repository: true,
    seconds,
    test: `${folder}: ${command}`,
  };
};

/**
 * Runs every package's tests once, traced, and writes the map, or says why
 * it wrote none.
 */
export const mapReach = (
  root: string = REPOSITORY,
  log: (line: string) => void = console.log
): ReachMap | { readonly refused: string } => {
  mkdirSync(REACH, { recursive: true });
  const tests: Reached[] = [];
  const runs: { folder: string; passed: boolean }[] = [];
  for (const name of readdirSync(join(root, "packages")).sort()) {
    const folder = `packages/${name}`;
    const manifest = join(root, folder, "package.json");
    if (!existsSync(manifest)) {
      continue;
    }
    const script = (
      JSON.parse(readFileSync(manifest, "utf8")) as {
        scripts?: Record<string, string>;
      }
    ).scripts?.test;
    if (script === undefined) {
      continue;
    }
    const { commands, vitest } = testScript(script);
    if (vitest) {
      const traced = traceVitest(root, folder, log);
      runs.push({ folder, passed: traced.passed });
      tests.push(...traced.reached);
    }
    for (const command of commands) {
      tests.push(timeCommand(root, folder, command, log));
    }
  }
  const refused = refusedMap(runs);
  if (refused !== undefined) {
    return { refused };
  }
  const commit = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).stdout.trim();
  const map: ReachMap = {
    commit,
    tests: tests.sort(
      (a, b) => Number(a.test > b.test) - Number(a.test < b.test)
    ),
  };
  writeFileSync(MAP, `${JSON.stringify(map, null, 2)}\n`);
  return map;
};

/** The map the last `--map` wrote, or undefined when there is none. */
export const readMap = (): ReachMap | undefined =>
  existsSync(MAP)
    ? (JSON.parse(readFileSync(MAP, "utf8")) as ReachMap)
    : undefined;
