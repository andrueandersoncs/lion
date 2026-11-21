// Asks the JavaScript runtime that runs it whether JSON.parse gives a reviver
// the source text of each number (TC39 "JSON.parse source text access"), so a
// reader could keep the digits a JSON number writes instead of the nearest
// double. Prints what it found; run it with each runtime Lion runs on:
//
//   node research/probes/json-source/check.mjs
//   bun research/probes/json-source/check.mjs
const runtime =
  globalThis.Bun === undefined
    ? `node ${process.version}`
    : `bun ${globalThis.Bun.version}`;
const text = "[0.1, 9007199254740993, 0.100000000000000000001]";
const seen = [];
JSON.parse(text, (_key, value, context) => {
  if (typeof value === "number") {
    seen.push(
      `${JSON.stringify(value)} from ${context === undefined ? "no source text" : JSON.stringify(context.source)}`
    );
  }
  return value;
});
console.log(
  `${runtime}: JSON.parse of ${text} gives a reviver ${seen.join(", ")}.`
);
console.log(
  `${runtime}: JSON.rawJSON is ${typeof JSON.rawJSON === "function" ? "a function" : "missing"}.`
);
console.log(
  `${runtime}: BigInt("9007199254740993") + 1n is ${BigInt("9007199254740993") + 1n}.`
);
