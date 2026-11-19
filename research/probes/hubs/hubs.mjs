// Writes the Lion program the lion-improvements run timed on 2026-11-17
// (source lion-bench, claims li-l27, li-l28, li-l38): m nodes, each linked to
// and from two hub nodes, 0 and 1, plus m edges between scattered pairs of
// the m nodes; it counts the triangles with one find over three edge goals.
// The generator is the one that run used, kept here so the workload can be
// timed again as Lion changes. With `load` after m, the program loads the same
// edges and asks no triangles, which times the start-up and the loading alone.
//
//   node research/probes/hubs/hubs.mjs <m> [load] > hubs-<m>.json
const m = Number(process.argv[2]);
const loadOnly = process.argv[3] === "load";
let seed = 7;
const rand = () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
  return seed / 2_147_483_648;
};
const edges = new Set();
for (let i = 2; i < m; i++) {
  for (const h of [0, 1]) {
    edges.add(`${i},${h}`);
    edges.add(`${h},${i}`);
  }
}
for (let i = 0; i < m; i++) {
  edges.add(`${Math.floor(rand() * m)},${Math.floor(rand() * m)}`);
}
const facts = [...edges].map((e) => ["edge", ...e.split(",").map(Number)]);
const triangles = [
  "aggregate/count",
  [
    "find",
    1,
    ["and", ["edge", "?a", "?b"], ["edge", "?b", "?c"], ["edge", "?c", "?a"]],
  ],
];
console.log(
  JSON.stringify([
    "begin",
    ["relation", "edge", ["from", "to"]],
    ["fact", ...facts],
    loadOnly ? { edges: facts.length } : { edges: facts.length, triangles },
  ])
);
