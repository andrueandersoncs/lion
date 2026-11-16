/**
 * What the record takes from git for a renamed file: builds a two-commit
 * repository in a temporary folder, with one exact rename and one rename by
 * likeness, and prints which commit `readHistory` says added each file. A
 * probe's command: it writes nothing in this repository.
 */
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readHistory } from "../src/git.ts";

// A git hook hands its own repository on through GIT_DIR and the like.
for (const name of Object.keys(process.env)) {
  if (name.startsWith("GIT_")) {
    delete process.env[name];
  }
}
const repository = mkdtempSync(join(tmpdir(), "lion-probe-"));
const git = (...args) =>
  execFileSync(
    "git",
    [
      "-c",
      "user.name=probe",
      "-c",
      "user.email=probe@example.com",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=/dev/null",
      ...args,
    ],
    { cwd: repository, encoding: "utf8" }
  );
const notes = (name) => join(repository, "history/notes", name);
try {
  git("init", "--quiet");
  mkdirSync(notes(""), { recursive: true });
  const lines = Array.from({ length: 20 }, (_, n) => `line ${n}`).join("\n");
  writeFileSync(notes("kept.json"), lines);
  writeFileSync(notes("alike.json"), `${lines}\nits own line`);
  git("add", ".");
  git("commit", "--quiet", "-m", "first commit");
  renameSync(notes("kept.json"), notes("moved.json"));
  rmSync(notes("alike.json"));
  writeFileSync(notes("other.json"), `${lines}\nanother line`);
  git("add", "--all");
  git("commit", "--quiet", "-m", "second commit");
  const { added, commits } = readHistory(repository, "history");
  const adder = (name) =>
    commits.find(({ hash }) => hash === added.get(`history/notes/${name}`))
      ?.message;
  console.log(
    `git, following likeness, says of the second commit: ${git("show", "--format=", "--name-status", "-M", "HEAD").trim().replace(/R\d+/g, "renamed").replace(/\s+/g, " ")}`
  );
  console.log(
    `moved.json, renamed with nothing changed, was added by: ${adder("moved.json")}`
  );
  console.log(
    `other.json, which is like the deleted alike.json, was added by: ${adder("other.json")}`
  );
} finally {
  rmSync(repository, { force: true, recursive: true });
}
