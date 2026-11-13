#!/usr/bin/env node
// Asks the model a question, as the files it depends on stand now.
//
//   node ask.mjs                 the standing questions in checks.json
//   node ask.mjs question.json   a Lion program in a file
//   node ask.mjs '<Lion JSON>'   a Lion program given here
//
// Run it in the task folder. It first tells the model what every file its
// observations depend on holds now and in each version kept, so evidence
// about a file that changed no longer counts as the present, then runs the
// program and prints its value as JSON. It
// runs on a copy: a question never changes the model, so a program that
// adds facts asks "what if" and is forgotten. Runs under node or bun.
import { existsSync } from "node:fs";
import {
  inTaskFolder,
  isMain,
  projectRoot,
  readJson,
  runProgram,
  versionsNow,
  watchedPaths,
} from "./lib.mjs";

/** The program as it is asked: the versions as they are now, then the question. */
export const askingOf = (question, versions) => ["begin", versions, question];

const questionOf = (argument) => {
  if (argument === undefined) {
    return readJson("checks.json");
  }
  if (existsSync(argument)) {
    return readJson(argument);
  }
  try {
    return JSON.parse(argument);
  } catch {
    console.error(
      `${argument} is neither a file nor Lion JSON. Usage: node ask.mjs [question.json | '<Lion JSON>']`
    );
    process.exit(1);
  }
};

const main = (argument) => {
  inTaskFolder();
  if (!existsSync("model.json")) {
    console.error("There is no model.json here yet. Run replay.mjs first.");
    process.exit(1);
  }
  const question = questionOf(argument);
  const versions = versionsNow(
    ".",
    projectRoot("."),
    watchedPaths(readJson("model.json"))
  );
  const result = runProgram(askingOf(question, versions), "model.json", {
    keep: false,
  });
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  console.log(result.output);
};

if (isMain(import.meta.url)) {
  main(process.argv[2]);
}
