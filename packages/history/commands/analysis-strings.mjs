/**
 * What the analysis says each string of a program means, read by the
 * scopes a run with the standard library reads it by. A probe's command:
 * it runs nothing and writes nothing.
 */
import { analyze, flattenAnalysis } from "@lionlang/core/analysis/analyze";
import { stdlib } from "@lionlang/core/modules";

const program = [
  "begin",
  ["define", "total", 0],
  [
    ["lambda", ["n"], ["array/make", "n", "total", "?x", "done", "numbr/add"]],
    1,
  ],
];
console.log(`program: ${JSON.stringify(program)}`);
for (const node of flattenAnalysis(analyze(program, stdlib))) {
  const { meaning, pointer, value } = node;
  if (meaning === undefined) {
    continue;
  }
  const binding =
    meaning.kind === "name" || meaning.kind === "binding"
      ? ` ${meaning.binding.kind}${meaning.binding.top ? "" : " in a lambda"}`
      : "";
  console.log(`${pointer} ${JSON.stringify(value)}: ${meaning.kind}${binding}`);
}

// The head of a call is a name: one nothing declares is unbound there, and
// the same string elsewhere is data.
const called = ["begin", ["zcall", 1], "zcall"];
console.log(`called program: ${JSON.stringify(called)}`);
for (const { meaning, pointer, value } of flattenAnalysis(
  analyze(called, stdlib)
)) {
  if (meaning !== undefined) {
    console.log(`called ${pointer} ${JSON.stringify(value)}: ${meaning.kind}`);
  }
}
