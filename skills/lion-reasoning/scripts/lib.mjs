// What the scripts of this skill share: finding the project, keeping its
// versions, matching quotes, and running Lion on the model. Runs under node
// or bun, with nothing to install.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The folder every task folder lives in, at the root of the project. */
export const TASKS = ".lion";

/** The name of the version that is the project as it is now. */
export const NOW = "now";

const SKIPPED = new Set([".git", "node_modules", TASKS]);
const SETTLED_MS = 3000;
/** The most output a command may give: far more than any test run prints. */
export const MAX_OUTPUT = 256 * 1024 * 1024;
const JSON_FILE = /\.json$/;
const SPACES = /\s+/;

// ---------------------------------------------------------------- the project

/**
 * The project a task folder belongs to: the root of its git repository, or
 * else the folder that holds `.lion`. Paths in the model are relative to it.
 */
export const projectRoot = (folder) => {
  const git = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: folder,
    encoding: "utf8",
  });
  if (git.status === 0 && git.stdout.trim() !== "") {
    return realpathSync(git.stdout.trim());
  }
  const parent = dirname(realpathSync(folder));
  return basename(parent) === TASKS ? dirname(parent) : realpathSync(folder);
};

/**
 * A path as the model writes it: relative to the root with `/`, or `.` for
 * the root itself, or absolute when it is outside the project.
 */
export const pathIn = (root, path) => {
  const full = isAbsolute(path) ? path : join(root, path);
  const inside = relative(root, full);
  if (inside === "") {
    return ".";
  }
  return inside.startsWith("..") || isAbsolute(inside)
    ? full
    : inside.split(sep).join("/");
};

// ----------------------------------------------------------------- versions

const sha1 = (bytes) => createHash("sha1").update(bytes).digest("hex");

const walk = (root, prefix) =>
  readdirSync(join(root, prefix), { withFileTypes: true }).flatMap((entry) => {
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      return SKIPPED.has(entry.name) ? [] : walk(root, path);
    }
    return entry.isFile() ? [path] : [];
  });

/** Every file of the project, as paths from its root, without `.lion`. */
const projectFiles = (root) => {
  const git = spawnSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8", maxBuffer: MAX_OUTPUT }
  );
  const listed =
    git.status === 0
      ? git.stdout.split("\0").filter((file) => file !== "")
      : walk(root, "");
  return listed.filter((file) => !file.split("/").includes(TASKS));
};

/**
 * A version of the project: the hash of every file in it, by path. A file
 * whose size and time have not changed since the cache saw it is not read
 * again. A file changed in the last few seconds is never cached, since a
 * second change within the clock's resolution would keep its time.
 */
export const manifestNow = (root, cachePath) => {
  const cache =
    cachePath !== undefined && existsSync(cachePath)
      ? JSON.parse(readFileSync(cachePath, "utf8"))
      : {};
  const manifest = {};
  const kept = {};
  const settled = Date.now() - SETTLED_MS;
  for (const file of projectFiles(root).sort()) {
    const full = join(root, file);
    if (!existsSync(full)) {
      continue;
    }
    const stat = statSync(full);
    if (!stat.isFile()) {
      continue;
    }
    const stamp = `${stat.size}:${stat.mtimeMs}`;
    const hash =
      cache[file]?.[0] === stamp ? cache[file][1] : sha1(readFileSync(full));
    manifest[file] = hash;
    if (stat.mtimeMs < settled) {
      kept[file] = [stamp, hash];
    }
  }
  if (cachePath !== undefined) {
    writeFileSync(cachePath, JSON.stringify(kept));
  }
  return manifest;
};

/**
 * What a path holds on disk now, whatever git ignores: for a path outside
 * the project or one git ignores, such as build output, which versions do
 * not keep.
 */
export const liveHash = (path) => {
  if (!existsSync(path)) {
    return null;
  }
  if (statSync(path).isFile()) {
    return sha1(readFileSync(path));
  }
  const manifest = Object.fromEntries(
    walk(path, "").map((file) => [file, sha1(readFileSync(join(path, file)))])
  );
  return hashIn(manifest, ".");
};

/**
 * The relative paths among `paths` that git ignores in the project. Each is
 * also asked about as a folder, since a pattern such as `dist/` matches only
 * a folder, and a folder that was deleted is not known to be one.
 */
const ignoredOf = (root, paths) => {
  const relative = paths.filter((path) => !isAbsolute(path) && path !== ".");
  if (relative.length === 0) {
    return new Set();
  }
  const git = spawnSync("git", ["check-ignore", "--stdin"], {
    cwd: root,
    encoding: "utf8",
    input: relative.flatMap((path) => [path, `${path}/`]).join("\n"),
  });
  return new Set(
    (git.stdout ?? "")
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => (line.endsWith("/") ? line.slice(0, -1) : line))
  );
};

/**
 * How to hash a watched path in any version: from the version's files, or
 * from the disk as it is now for a path versions do not keep, one outside
 * the project or one git ignores.
 */
export const hasherFor = (root, paths) => {
  const ignored = ignoredOf(root, paths);
  const live = new Map();
  return (manifest, path) => {
    if (!(isAbsolute(path) || ignored.has(path))) {
      return hashIn(manifest, path);
    }
    if (!live.has(path)) {
      live.set(path, liveHash(isAbsolute(path) ? path : join(root, path)));
    }
    return live.get(path);
  };
};

/**
 * What a path holds in a version, as one hash: a file's hash, or one hash of
 * every file under a folder with its path, or `null` when nothing is there.
 * A path outside the project is not kept in versions, so it is hashed as it
 * is now.
 */
export const hashIn = (manifest, path) => {
  if (isAbsolute(path)) {
    return liveHash(path);
  }
  if (path !== "." && Object.hasOwn(manifest, path)) {
    return manifest[path];
  }
  const prefix = path === "." ? "" : `${path}/`;
  const listing = Object.keys(manifest)
    .filter((file) => file.startsWith(prefix))
    .sort()
    .map((file) => `${file.slice(prefix.length)}\0${manifest[file]}\n`)
    .join("");
  return listing === "" && path !== "." ? null : sha1(listing);
};

const versionsFolder = (folder) => join(folder, "versions");

/**
 * The versions a task folder has kept, oldest first, each with its name and
 * manifest. Each file holds only what changed since the one before.
 */
export const versionsOf = (folder) => {
  const where = versionsFolder(folder);
  if (!existsSync(where)) {
    return [];
  }
  let manifest = {};
  return readdirSync(where)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      const { changes } = JSON.parse(readFileSync(join(where, file), "utf8"));
      manifest = { ...manifest };
      for (const [path, hash] of Object.entries(changes)) {
        if (hash === null) {
          delete manifest[path];
        } else {
          manifest[path] = hash;
        }
      }
      return { manifest, name: `v${file.replace(JSON_FILE, "")}` };
    });
};

/** What changed from one manifest to the next: new hashes, and nulls. */
export const changesBetween = (before, after) => {
  const changes = {};
  for (const [path, hash] of Object.entries(after)) {
    if (before[path] !== hash) {
      changes[path] = hash;
    }
  }
  for (const path of Object.keys(before)) {
    if (!Object.hasOwn(after, path)) {
      changes[path] = null;
    }
  }
  return changes;
};

/**
 * Keeps the project as it is now as a version of the task, unless the last
 * version kept is the same. Gives the manifest.
 */
export const snapshot = (folder, root) => {
  const manifest = manifestNow(root, join(folder, "hash-cache.json"));
  const kept = versionsOf(folder);
  const changes = changesBetween(kept.at(-1)?.manifest ?? {}, manifest);
  if (kept.length === 0 || Object.keys(changes).length > 0) {
    mkdirSync(versionsFolder(folder), { recursive: true });
    const name = String(kept.length + 1).padStart(4, "0");
    writeFileSync(
      join(versionsFolder(folder), `${name}.json`),
      JSON.stringify({ changes })
    );
  }
  return manifest;
};

/**
 * The forms that tell the model each version: its name and number, and what
 * each watched path holds in it. `versions` are in the order they were kept,
 * numbered from 1, with `now` last. Versions that hold the same for every
 * watched path are one version, named after the first, with the numbers of
 * all of them; `now` always has a name of its own. `hash` gives what a path
 * holds in a manifest.
 */
export const versionForms = (versions, watched, hash = hashIn) => {
  const facts = [];
  const named = new Map();
  versions.forEach(({ manifest, name }, at) => {
    const hashes = watched.map((path) => hash(manifest, path));
    const key = JSON.stringify(hashes);
    const last = at === versions.length - 1;
    if (named.has(key) && !last) {
      facts.push(["version", ["quote", named.get(key)], at + 1]);
      return;
    }
    if (!last) {
      named.set(key, name);
    }
    facts.push(["version", ["quote", name], at + 1]);
    for (const [which, path] of watched.entries()) {
      facts.push([
        "at",
        ["quote", name],
        ["quote", path],
        ["quote", hashes[which]],
      ]);
    }
  });
  return ["fact", ...facts];
};

/** The forms for every version a task folder kept, and for the present. */
export const versionsNow = (folder, root, watched) =>
  versionForms(
    [
      ...versionsOf(folder),
      {
        manifest: manifestNow(root, join(folder, "hash-cache.json")),
        name: NOW,
      },
    ],
    watched,
    hasherFor(root, watched)
  );

/** The number the latest version a task folder kept has. */
export const latestVersion = (folder) => versionsOf(folder).length;

// ------------------------------------------------------------------- quotes

const SINGLE_QUOTES = /[‘’‚‛′]/g;
const DOUBLE_QUOTES = /[“”„‟″]/g;
const DASHES = /[‐-―−]/g;
const ELLIPSIS = /…/g;
const WHITESPACE = /\s+/g;

/**
 * Text as it is compared: differences of spacing, line breaks, and
 * typographic quotes and dashes do not count, and every word does.
 */
export const normalize = (text) =>
  text
    .normalize("NFKC")
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(DASHES, "-")
    .replace(ELLIPSIS, "...")
    .replace(WHITESPACE, " ")
    .trim();

/** Whether the quote is in the text, word for word. */
export const hasQuote = (text, quote) =>
  normalize(quote) !== "" && normalize(text).includes(normalize(quote));

// --------------------------------------------------------------- the model

const unquoted = (value) =>
  Array.isArray(value) && value[0] === "quote" && value.length === 2
    ? value[1]
    : value;

/** The rows that `fact` forms among `forms` hold for one relation. */
export const rowsOf = (forms, relation) =>
  (Array.isArray(forms) ? forms : [])
    .filter((form) => Array.isArray(form) && form[0] === "fact")
    .flatMap((form) => form.slice(1))
    .filter((fact) => Array.isArray(fact) && fact[0] === relation)
    .map((fact) => fact.slice(1).map(unquoted));

/** The paths the observations among `forms` depend on. */
export const watchedPaths = (forms) =>
  [...new Set(rowsOf(forms, "about").map(([, path]) => path))].sort();

// ----------------------------------------------------------------- running

const NOISE = /^(Resolving dependencies|Resolved, downloaded|Saved lockfile)/;

const quiet = (text) =>
  (text ?? "")
    .split("\n")
    .filter((line) => !NOISE.test(line))
    .join("\n")
    .trim();

/**
 * Runs the lion command. It is the published one, fetched by version, so
 * that a project with its own copy of Lion, or a broken one, cannot change
 * the tool that checks the work. `LION_CLI` names another command.
 */
export const lion = (args) => {
  const chosen = process.env.LION_CLI?.trim();
  const [command, ...prefix] =
    chosen === undefined || chosen === ""
      ? ["bunx", "@lionlang/cli@latest"]
      : chosen.split(SPACES);
  let result = spawnSync(command, [...prefix, ...args], {
    encoding: "utf8",
    maxBuffer: MAX_OUTPUT,
  });
  if (result.error && (chosen === undefined || chosen === "")) {
    result = spawnSync("npx", ["-y", "@lionlang/cli@latest", ...args], {
      encoding: "utf8",
      maxBuffer: MAX_OUTPUT,
    });
  }
  return {
    error: quiet(`${result.stderr ?? ""}\n${result.stdout ?? ""}`),
    ok: result.status === 0,
    output: quiet(result.stdout),
  };
};

/**
 * Runs a program against a database file, or against a copy of it when
 * `keep` is false, so a question never changes the model.
 */
export const runProgram = (program, database, { keep }) => {
  const scratch = mkdtempSync(join(tmpdir(), "lion-reasoning-"));
  try {
    const file = join(scratch, "program.json");
    writeFileSync(file, JSON.stringify(program));
    let target = database;
    if (!keep) {
      target = join(scratch, "model.json");
      if (existsSync(database)) {
        writeFileSync(target, readFileSync(database));
      }
    }
    return lion([file, "--database", target]);
  } finally {
    rmSync(scratch, { force: true, recursive: true });
  }
};

/** Reads a JSON file, or says which one is not JSON and stops. */
export const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(`${path} is not JSON: ${error.message}`);
    process.exit(1);
  }
};

/** Stops with a message unless this is a task folder. */
export const inTaskFolder = () => {
  if (!(existsSync("steps") && existsSync("seen"))) {
    console.error(
      "There is no steps folder here. Run this in a task folder, made by start.mjs."
    );
    process.exit(1);
  }
};

/**
 * True when the file at `url` is the program that was started, by whatever
 * path: the skill is often installed as a link.
 */
export const isMain = (url) => {
  try {
    return (
      realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(url))
    );
  } catch {
    return false;
  }
};
