// Runs the same programs on an earlier commit and on the working tree, and
// shows where they give something else. Use it to check what a change, or a
// changelog line, says about behavior.
//
//   bun run compare main programs.json
//
// The file holds a record of programs by name:
//
//   { "zero equals minus zero": ["=", 0, ["number/multiply", 0, -1]] }
//
// Its path is read from the repository root.
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { Effect } from "effect";
import { withCheckout } from "./src/checkout.ts";
import { canonical, evaluate, load, type Outcome } from "./src/lion.ts";
import { CORE, commitOf, REPOSITORY } from "./src/sources.ts";

const [ref, file] = process.argv.slice(2);
const commit = ref === undefined ? undefined : commitOf(ref);

const locate = (path: string) => {
  if (isAbsolute(path)) {
    return path;
  }
  const fromRoot = join(REPOSITORY, path);
  return existsSync(fromRoot) ? fromRoot : resolve(path);
};

const SHOWN = 400;

const show = (outcome: Outcome) => {
  const text = outcome.ok ? canonical(outcome.value) : `ERROR ${outcome.error}`;
  return text.length > SHOWN ? `${text.slice(0, SHOWN)}…` : text;
};

const outcomes = (source: string, programs: readonly unknown[]) =>
  Effect.flatMap(load(source), (lion) =>
    Effect.forEach(programs, (program) => evaluate(lion, program))
  );

const main = Effect.gen(function* () {
  if (ref === undefined || file === undefined) {
    console.error("Usage: bun run compare <commit> <programs.json>");
    process.exitCode = 1;
    return;
  }
  if (commit === undefined) {
    console.error(`git knows no commit called "${ref}".`);
    process.exitCode = 1;
    return;
  }
  const programs = JSON.parse(readFileSync(locate(file), "utf8")) as Record<
    string,
    unknown
  >;
  const names = Object.keys(programs);
  const given = Object.values(programs);
  const before = yield* withCheckout(commit, (directory) =>
    outcomes(join(directory, CORE), given)
  );
  const now = yield* outcomes(join(REPOSITORY, CORE), given);
  let different = 0;
  for (const [index, name] of names.entries()) {
    const was = show(before[index] as Outcome);
    const is = show(now[index] as Outcome);
    if (was === is) {
      console.log(`same       ${name}\n           ${is}`);
    } else {
      different += 1;
      console.log(
        `DIFFERENT  ${name}\n  ${ref.padEnd(8)} ${was}\n  ${"now".padEnd(8)} ${is}`
      );
    }
  }
  console.log(
    `\n${different} of ${names.length} programs give something else.`
  );
});

await Effect.runPromise(main);
