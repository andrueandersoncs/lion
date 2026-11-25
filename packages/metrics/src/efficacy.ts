/**
 * Research-KB, Ontology & Knowledge-Graph Efficacy Benchmark.
 *
 * Measures how effectively an AI agent can build, query, audit, and revise a
 * deep research artifact / knowledge base / ontology / graph in Lion across
 * four concrete dimensions:
 *   1. Task pass rate (correctness against independent Lion check lambdas)
 *   2. Native expressibility (native built-in vs workaround vs inexpressible)
 *   3. Authoring economy (JSON AST node count & snapshot bytes)
 *   4. Interactive speed (wall-clock execution latency in ms)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { Effect } from "effect";
import { evaluate, type Lion, newDatabase } from "./lion.ts";
import { REPOSITORY } from "./sources.ts";

export type EfficacyMode = "native" | "workaround" | "inexpressible";

export interface KbTask {
  readonly category:
    | "chronology"
    | "text-extraction"
    | "provenance"
    | "ontology"
    | "graph-investigation"
    | "belief-revision"
    | "epistemics"
    | "synthesis"
    | "verification";
  readonly check: unknown;
  readonly description: string;
  readonly id: string;
  readonly nativeProgram: unknown;
  readonly workaroundProgram?: unknown;
}

export interface TaskResult {
  readonly astNodes: number;
  readonly category: KbTask["category"];
  readonly error?: string;
  readonly id: string;
  readonly mode: EfficacyMode;
  readonly ms: number;
  readonly passed: boolean;
  readonly programBytes: number;
  readonly snapshotBytes: number;
}

export interface EfficacySummary {
  readonly compositeScore: number;
  readonly fastCount: number;
  readonly inexpressibleCount: number;
  readonly medianMs: number;
  readonly nativeCount: number;
  readonly passedCount: number;
  readonly results: readonly TaskResult[];
  readonly scaledKbMs: number;
  readonly scoreBreakdown: {
    readonly economy: number;
    readonly expressibility: number;
    readonly passRate: number;
    readonly speed: number;
  };
  readonly totalAstNodes: number;
  readonly totalBytes: number;
  readonly totalCount: number;
  readonly totalMs: number;
  readonly totalSnapshotBytes: number;
  readonly workaroundCount: number;
}

/** Counts every JSON AST node (primitives, arrays, objects) an agent must emit. */
export const countAstNodes = (value: unknown): number => {
  if (Array.isArray(value)) {
    return 1 + value.reduce((sum, item) => sum + countAstNodes(item), 0);
  }
  if (typeof value === "object" && value !== null) {
    return (
      1 +
      Object.values(value).reduce((sum, item) => sum + countAstNodes(item), 0)
    );
  }
  return 1;
};

const loadAsset = (name: string): unknown =>
  JSON.parse(
    readFileSync(join(REPOSITORY, "skills/lion-research/assets", name), "utf8")
  );

const UTC_MINUTES_ASSET = loadAsset("utc-minutes.json");
const UTC_TEXT_ASSET = loadAsset("utc-text.json");

/**
 * Ten realistic tasks covering the full lifecycle of an AI agent building a
 * deep research artifact, knowledge base, ontology, or knowledge graph.
 */
export const KB_TASKS: readonly KbTask[] = [
  // 1. Multi-timezone chronology & calendar validation
  {
    id: "kb-timezone-timeline",
    category: "chronology",
    description:
      "Normalize timestamps across UTC/Eastern/Tokyo zones, reject invalid dates, compute elapsed minutes, and format UTC ISO timestamps",
    nativeProgram: [
      "begin",
      ["relation", "raw_event", ["event", "stamp"]],
      ["relation", "happened", ["event", "ms", "utc"]],
      ["relation", "elapsed", ["from", "to", "minutes"]],
      [
        "fact",
        ["raw_event", "detected", "2026-03-03T14:05:00Z"],
        ["raw_event", "mitigated", "2026-03-03T11:40:00-05:00"],
        ["raw_event", "mitigated", "2026-03-04T01:40:00+09:00"],
        ["raw_event", "bogus", "2026-02-29T12:00:00Z"],
      ],
      [
        "rule",
        ["happened", "?e", "?ms", ["time/format", "?ms", "minute"]],
        ["raw_event", "?e", "?s"],
        ["=", "?ms", ["time/parse", "?s"]],
        ["value/integer?", "?ms"],
      ],
      [
        "rule",
        ["elapsed", "?a", "?b", ["time/diff", "?tb", "?ta", "minutes"]],
        ["happened", "?a", "?ta", "?_"],
        ["happened", "?b", "?tb", "?_"],
        ["number/lessThan", "?ta", "?tb"],
      ],
      {
        timeline: [
          "query",
          ["happened", "?event", "?ms", "?utc"],
          { order: "ms" },
        ],
        elapsed: ["query", ["elapsed", "?from", "?to", "?minutes"]],
      },
    ],
    workaroundProgram: [
      "begin",
      ["define", "utc-minutes", UTC_MINUTES_ASSET],
      ["define", "utc-text", UTC_TEXT_ASSET],
      ["relation", "raw_event", ["event", "parts", "offset"]],
      ["relation", "happened", ["event", "m", "utc"]],
      ["relation", "elapsed", ["from", "to", "minutes"]],
      [
        "fact",
        ["raw_event", "detected", ["quote", [2026, 3, 3, 14, 5]], 0],
        ["raw_event", "mitigated", ["quote", [2026, 3, 3, 11, 40]], -300],
        ["raw_event", "mitigated", ["quote", [2026, 3, 4, 1, 40]], 540],
      ],
      [
        "rule",
        [
          "happened",
          "?e",
          "?m",
          [
            "string/concat",
            [
              "string/replaceAll",
              ["string/slice", ["utc-text", "?m"], 0, 16],
              " ",
              "T",
            ],
            "Z",
          ],
        ],
        [
          "raw_event",
          "?e",
          ["array/make", "?y", "?mo", "?d", "?h", "?mi"],
          "?off",
        ],
        ["=", "?m", ["utc-minutes", "?y", "?mo", "?d", "?h", "?mi", "?off"]],
      ],
      [
        "rule",
        ["elapsed", "?a", "?b", ["number/subtract", "?tb", "?ta"]],
        ["happened", "?a", "?ta", "?_"],
        ["happened", "?b", "?tb", "?_"],
        ["number/lessThan", "?ta", "?tb"],
      ],
      {
        timeline: [
          "query",
          ["happened", "?event", "?ms", "?utc"],
          { order: "ms" },
        ],
        elapsed: ["query", ["elapsed", "?from", "?to", "?minutes"]],
      },
    ],
    check: [
      "lambda",
      ["out"],
      [
        "and",
        ["=", ["array/length", ["object/get", "out", "timeline"]], 2],
        [
          "=",
          [
            "object/get",
            ["array/at", ["object/get", "out", "timeline"], 0],
            "utc",
          ],
          "2026-03-03T14:05Z",
        ],
        [
          "=",
          [
            "object/get",
            ["array/at", ["object/get", "out", "timeline"], 1],
            "utc",
          ],
          "2026-03-03T16:40Z",
        ],
        [
          "=",
          ["object/get", "out", "elapsed"],
          ["quote", [{ from: "detected", to: "mitigated", minutes: 155 }]],
        ],
      ],
    ],
  },

  // 2. Verbatim quote verification inside Lion rules
  {
    id: "kb-quote-verification",
    category: "text-extraction",
    description:
      "Verify claim quotes against raw saved source text with smart quotes, en-dashes, ellipses, and line breaks inside Lion rules",
    nativeProgram: [
      "begin",
      ["relation", "source_text", ["id", "body"], { key: "id" }],
      ["relation", "claim", ["id", "source", "quote"], { key: "id" }],
      ["relation", "verified", ["claim"]],
      ["relation", "unverified", ["claim"]],
      [
        "fact",
        [
          "source_text",
          "s1",
          [
            "quote",
            "Acme’s FY25 filing reports “revenue of $409.8M”\n— up 12%… after restatement.",
          ],
        ],
        [
          "claim",
          "c1",
          "s1",
          [
            "quote",
            'Acme\'s FY25 filing reports "revenue of $409.8M" - up 12%...',
          ],
        ],
        ["claim", "c2", "s1", ["quote", "Acme posted $412.6M in revenue"]],
      ],
      [
        "rule",
        ["verified", "?c"],
        ["claim", "?c", "?s", "?q"],
        ["source_text", "?s", "?body"],
        [
          "string/includes",
          ["string/normalize", "?body"],
          ["string/normalize", "?q"],
        ],
      ],
      [
        "rule",
        ["unverified", "?c"],
        ["claim", "?c", "?_", "?_"],
        ["not", ["verified", "?c"]],
      ],
      {
        verified: ["find", "?c", ["verified", "?c"]],
        unverified: ["find", "?c", ["unverified", "?c"]],
      },
    ],
    workaroundProgram: [
      "begin",
      [
        "define",
        "norm",
        [
          "lambda",
          ["t"],
          [
            "string/join",
            [
              "array/filter",
              [
                "string/split",
                [
                  "string/replaceAll",
                  [
                    "string/replaceAll",
                    [
                      "string/replaceAll",
                      [
                        "string/replaceAll",
                        [
                          "string/replaceAll",
                          [
                            "string/replaceAll",
                            ["string/replaceAll", "t", "\n", " "],
                            "’",
                            "'",
                          ],
                          "“",
                          '"',
                        ],
                        "”",
                        '"',
                      ],
                      "—",
                      "-",
                    ],
                    "–",
                    "-",
                  ],
                  "…",
                  "...",
                ],
                " ",
              ],
              ["lambda", ["w"], ["not", ["string/equals?", "w", ""]]],
            ],
            " ",
          ],
        ],
      ],
      ["relation", "source_text", ["id", "body"], { key: "id" }],
      ["relation", "claim", ["id", "source", "quote"], { key: "id" }],
      ["relation", "verified", ["claim"]],
      ["relation", "unverified", ["claim"]],
      [
        "fact",
        [
          "source_text",
          "s1",
          [
            "quote",
            "Acme’s FY25 filing reports “revenue of $409.8M”\n— up 12%… after restatement.",
          ],
        ],
        [
          "claim",
          "c1",
          "s1",
          [
            "quote",
            'Acme\'s FY25 filing reports "revenue of $409.8M" - up 12%...',
          ],
        ],
        ["claim", "c2", "s1", ["quote", "Acme posted $412.6M in revenue"]],
      ],
      [
        "rule",
        ["verified", "?c"],
        ["claim", "?c", "?s", "?q"],
        ["source_text", "?s", "?body"],
        ["string/includes", ["norm", "?body"], ["norm", "?q"]],
      ],
      [
        "rule",
        ["unverified", "?c"],
        ["claim", "?c", "?_", "?_"],
        ["not", ["verified", "?c"]],
      ],
      {
        verified: ["find", "?c", ["verified", "?c"]],
        unverified: ["find", "?c", ["unverified", "?c"]],
      },
    ],
    check: [
      "lambda",
      ["out"],
      ["=", "out", ["quote", { verified: ["c1"], unverified: ["c2"] }]],
    ],
  },

  // 3. Structured entity/citation extraction from prose via regex
  {
    id: "kb-citation-extraction",
    category: "text-extraction",
    description:
      "Extract all bracketed citations and named CVE identifiers from raw claim text inside Datalog rules and join with a catalog",
    nativeProgram: [
      "begin",
      ["relation", "note", ["id", "text"]],
      ["relation", "advisory", ["cve", "severity"]],
      ["relation", "note_cve", ["note", "cve", "severity"]],
      [
        "fact",
        [
          "note",
          "n1",
          ["quote", "Patched CVE-2025-1042 and CVE-2026-0091 in release 2.4."],
        ],
        ["note", "n2", ["quote", "No vulnerabilities reported."]],
        ["advisory", "CVE-2025-1042", "high"],
        ["advisory", "CVE-2026-0091", "critical"],
      ],
      [
        "rule",
        ["note_cve", "?id", "?cve", "?sev"],
        ["note", "?id", "?text"],
        [
          "in",
          { match: "?cve", index: "?_", groups: "?_", named: "?_" },
          ["string/matchAll", "?text", "CVE-\\d{4}-\\d{4}"],
        ],
        ["advisory", "?cve", "?sev"],
      ],
      ["query", ["note_cve", "?note", "?cve", "?severity"], { order: "cve" }],
    ],
    check: [
      "lambda",
      ["out"],
      [
        "=",
        "out",
        [
          "quote",
          [
            { note: "n1", cve: "CVE-2025-1042", severity: "high" },
            { note: "n1", cve: "CVE-2026-0091", severity: "critical" },
          ],
        ],
      ],
    ],
  },

  // 4. First-class provenance grounding & reverse source-impact graph
  {
    id: "kb-provenance-lineage",
    category: "provenance",
    description:
      "Extract ground claim/source facts and closed-world absences from why trees inside rules to build a reverse source-impact index",
    nativeProgram: [
      "begin",
      ["relation", "source", ["id", "publisher"]],
      ["relation", "claim", ["id", "source", "topic", "val"]],
      ["relation", "attributed", ["claim", "to"]],
      ["relation", "firsthand", ["topic", "val", "pub"]],
      ["relation", "corroborated", ["topic", "val"]],
      ["relation", "rests_on_source", ["topic", "source"]],
      ["relation", "rests_on_absence", ["topic", "absent"]],
      [
        "fact",
        ["source", "s1", "Acme"],
        ["source", "s2", "Registry"],
        ["source", "s3", "Wire"],
        ["claim", "c1", "s1", "warehouses", 37],
        ["claim", "c2", "s2", "warehouses", 37],
        ["claim", "c3", "s3", "warehouses", 37],
        ["attributed", "c3", "s1"],
      ],
      [
        "rule",
        ["firsthand", "?t", "?v", "?pub"],
        ["claim", "?c", "?s", "?t", "?v"],
        ["not", ["attributed", "?c", "?_"]],
        ["source", "?s", "?pub"],
      ],
      [
        "rule",
        ["corroborated", "?t", "?v"],
        ["firsthand", "?t", "?v", "?p1"],
        ["firsthand", "?t", "?v", "?p2"],
        ["string/lessThan", "?p1", "?p2"],
      ],
      [
        "rule",
        ["rests_on_source", "?t", "?s"],
        ["corroborated", "?t", "?v"],
        [
          "in",
          ["array/make", ["quote", "source"], "?s", "?_"],
          ["proof/facts", ["why", ["corroborated", "?t", "?v"]]],
        ],
      ],
      [
        "rule",
        ["rests_on_absence", "?t", "?a"],
        ["corroborated", "?t", "?v"],
        [
          "in",
          "?a",
          ["proof/assumptions", ["why", ["corroborated", "?t", "?v"]]],
        ],
      ],
      {
        sources: ["find", "?s", ["rests_on_source", "warehouses", "?s"]],
        absences: ["find", "?a", ["rests_on_absence", "warehouses", "?a"]],
      },
    ],
    workaroundProgram: [
      "begin",
      [
        "define",
        "collect-facts",
        [
          "lambda",
          ["node"],
          [
            "cond",
            [
              ["not", ["value/object?", "node"]],
              ["quote", []],
            ],
            [
              ["=", ["object/get", "node", "given", false], true],
              ["array/make", ["object/get", "node", "fact"]],
            ],
            [
              "else",
              [
                "array/concat",
                [
                  "array/flat-map",
                  ["object/get", "node", "because", ["quote", []]],
                  "collect-facts",
                ],
                [
                  "array/flat-map",
                  ["object/get", "node", "matches", ["quote", []]],
                  ["lambda", ["m"], ["array/flat-map", "m", "collect-facts"]],
                ],
                [
                  "cond",
                  [
                    ["object/has?", "node", "but"],
                    ["collect-facts", ["object/get", "node", "but"]],
                  ],
                  ["else", ["quote", []]],
                ],
              ],
            ],
          ],
        ],
      ],
      [
        "define",
        "collect-absent",
        [
          "lambda",
          ["node"],
          [
            "cond",
            [
              ["not", ["value/object?", "node"]],
              ["quote", []],
            ],
            [
              [
                "and",
                ["object/has?", "node", "absent"],
                [
                  "=",
                  [
                    "array/length",
                    ["object/get", "node", "because", ["quote", []]],
                  ],
                  0,
                ],
              ],
              ["array/make", ["object/get", "node", "absent"]],
            ],
            [
              "else",
              [
                "array/concat",
                [
                  "array/flat-map",
                  ["object/get", "node", "because", ["quote", []]],
                  "collect-absent",
                ],
                [
                  "array/flat-map",
                  ["object/get", "node", "matches", ["quote", []]],
                  ["lambda", ["m"], ["array/flat-map", "m", "collect-absent"]],
                ],
                [
                  "cond",
                  [
                    ["object/has?", "node", "but"],
                    ["collect-absent", ["object/get", "node", "but"]],
                  ],
                  ["else", ["quote", []]],
                ],
              ],
            ],
          ],
        ],
      ],
      ["relation", "source", ["id", "publisher"]],
      ["relation", "claim", ["id", "source", "topic", "val"]],
      ["relation", "attributed", ["claim", "to"]],
      ["relation", "firsthand", ["topic", "val", "pub"]],
      ["relation", "corroborated", ["topic", "val"]],
      ["relation", "rests_on_source", ["topic", "source"]],
      ["relation", "rests_on_absence", ["topic", "absent"]],
      [
        "fact",
        ["source", "s1", "Acme"],
        ["source", "s2", "Registry"],
        ["source", "s3", "Wire"],
        ["claim", "c1", "s1", "warehouses", 37],
        ["claim", "c2", "s2", "warehouses", 37],
        ["claim", "c3", "s3", "warehouses", 37],
        ["attributed", "c3", "s1"],
      ],
      [
        "rule",
        ["firsthand", "?t", "?v", "?pub"],
        ["claim", "?c", "?s", "?t", "?v"],
        ["not", ["attributed", "?c", "?_"]],
        ["source", "?s", "?pub"],
      ],
      [
        "rule",
        ["corroborated", "?t", "?v"],
        ["firsthand", "?t", "?v", "?p1"],
        ["firsthand", "?t", "?v", "?p2"],
        ["string/lessThan", "?p1", "?p2"],
      ],
      [
        "rule",
        ["rests_on_source", "?t", "?s"],
        ["corroborated", "?t", "?v"],
        [
          "in",
          ["array/make", ["quote", "source"], "?s", "?_"],
          [
            "aggregate/unique",
            ["collect-facts", ["why", ["corroborated", "?t", "?v"]]],
          ],
        ],
      ],
      [
        "rule",
        ["rests_on_absence", "?t", "?a"],
        ["corroborated", "?t", "?v"],
        [
          "in",
          "?a",
          [
            "aggregate/unique",
            ["collect-absent", ["why", ["corroborated", "?t", "?v"]]],
          ],
        ],
      ],
      {
        sources: ["find", "?s", ["rests_on_source", "warehouses", "?s"]],
        absences: ["find", "?a", ["rests_on_absence", "warehouses", "?a"]],
      },
    ],
    check: [
      "lambda",
      ["out"],
      [
        "and",
        ["=", ["object/get", "out", "sources"], ["quote", ["s1", "s2"]]],
        ["=", ["array/length", ["object/get", "out", "absences"]], 2],
      ],
    ],
  },

  // 5. Ontology taxonomy Lowest Common Ancestors & taxonomic distance
  {
    id: "kb-ontology-lca",
    category: "ontology",
    description:
      "Compute all Lowest Common Ancestors and shortest taxonomic distances in a diamond multiple-inheritance ontology DAG",
    nativeProgram: [
      "begin",
      ["relation", "isa", ["child", "parent"]],
      [
        "fact",
        ["isa", "seaplane", "aircraft"],
        ["isa", "seaplane", "watercraft"],
        ["isa", "amphibious_drone", "aircraft"],
        ["isa", "amphibious_drone", "watercraft"],
        ["isa", "aircraft", "vehicle"],
        ["isa", "watercraft", "vehicle"],
      ],
      [
        "query",
        [
          "graph/lca",
          "isa",
          "seaplane",
          "amphibious_drone",
          "?lca",
          "?d1",
          "?d2",
        ],
        { order: "lca" },
      ],
    ],
    workaroundProgram: [
      "begin",
      ["relation", "isa", ["child", "parent"]],
      ["relation", "node", ["x"]],
      ["relation", "anc", ["x", "y"]],
      ["relation", "dist", ["x", "y", "d"]],
      ["relation", "common", ["x"]],
      ["relation", "lca_out", ["x", "d1", "d2"]],
      [
        "fact",
        ["isa", "seaplane", "aircraft"],
        ["isa", "seaplane", "watercraft"],
        ["isa", "amphibious_drone", "aircraft"],
        ["isa", "amphibious_drone", "watercraft"],
        ["isa", "aircraft", "vehicle"],
        ["isa", "watercraft", "vehicle"],
      ],
      ["rule", ["node", "?x"], ["isa", "?x", "?_"]],
      ["rule", ["node", "?y"], ["isa", "?_", "?y"]],
      ["rule", ["anc", "?x", "?y"], ["isa", "?x", "?y"]],
      ["rule", ["anc", "?x", "?z"], ["anc", "?x", "?y"], ["isa", "?y", "?z"]],
      ["rule", ["dist", "?x", "?x", ["aggregate/min", 0]], ["node", "?x"]],
      [
        "rule",
        ["dist", "?x", "?z", ["aggregate/min", ["number/add", "?d", 1]]],
        ["dist", "?x", "?y", "?d"],
        ["isa", "?y", "?z"],
      ],
      [
        "rule",
        ["common", "?x"],
        ["dist", "seaplane", "?x", "?_"],
        ["dist", "amphibious_drone", "?x", "?_"],
      ],
      [
        "rule",
        ["lca_out", "?x", "?d1", "?d2"],
        ["common", "?x"],
        ["not", ["and", ["common", "?y"], ["anc", "?y", "?x"]]],
        ["dist", "seaplane", "?x", "?d1"],
        ["dist", "amphibious_drone", "?x", "?d2"],
      ],
      ["query", ["lca_out", "?lca", "?d1", "?d2"], { order: "lca" }],
    ],
    check: [
      "lambda",
      ["out"],
      [
        "=",
        "out",
        [
          "quote",
          [
            { lca: "aircraft", d1: 1, d2: 1 },
            { lca: "watercraft", d1: 1, d2: 1 },
          ],
        ],
      ],
    ],
  },

  // 6. All cycle-free multi-hop paths in an ownership / attribution network
  {
    id: "kb-ownership-all-paths",
    category: "graph-investigation",
    description:
      "Enumerate every cycle-free weighted ownership/attribution chain between two entities up to 4 hops despite cycles in the graph",
    nativeProgram: [
      "begin",
      ["relation", "owns", ["from", "to", "hops"]],
      [
        "fact",
        ["owns", "holding", "shell_a", 1],
        ["owns", "shell_a", "target", 2],
        ["owns", "holding", "shell_b", 2],
        ["owns", "shell_b", "shell_c", 1],
        ["owns", "shell_c", "target", 1],
        ["owns", "shell_c", "holding", 1],
      ],
      [
        "query",
        ["graph/simplePaths", "owns", "holding", "target", 4, "?cost", "?path"],
        { order: ["cost", "path"] },
      ],
    ],
    check: [
      "lambda",
      ["out"],
      [
        "=",
        "out",
        [
          "quote",
          [
            { cost: 3, path: ["holding", "shell_a", "target"] },
            { cost: 4, path: ["holding", "shell_b", "shell_c", "target"] },
          ],
        ],
      ],
    ],
  },

  // 7. Single-point-of-failure / bottleneck discovery via dominators composed with LCA
  {
    id: "kb-bottleneck-dominators",
    category: "graph-investigation",
    description:
      "Compute immediate dominator tree from a root source/service and compose with graph/lca to find the shared bottleneck of two targets",
    nativeProgram: [
      "begin",
      ["relation", "feeds", ["from", "to"]],
      ["relation", "idom", ["node", "dominator"]],
      [
        "fact",
        ["feeds", "filing", "pr"],
        ["feeds", "pr", "wire_a"],
        ["feeds", "pr", "wire_b"],
        ["feeds", "wire_a", "blog_1"],
        ["feeds", "wire_b", "blog_1"],
        ["feeds", "wire_b", "blog_2"],
      ],
      [
        "rule",
        ["idom", "?n", "?d"],
        ["graph/dominators", "feeds", "filing", "?n", "?d"],
      ],
      {
        doms: ["query", ["idom", "?node", "?dominator"], { order: "node" }],
        shared: [
          "find",
          "?lca",
          ["graph/lca", "idom", "blog_1", "blog_2", "?lca", "?_", "?_"],
        ],
      },
    ],
    check: [
      "lambda",
      ["out"],
      [
        "and",
        ["=", ["object/get", "out", "shared"], ["quote", ["pr"]]],
        [
          "=",
          ["object/get", "out", "doms"],
          [
            "quote",
            [
              { node: "blog_1", dominator: "pr" },
              { node: "blog_2", dominator: "wire_b" },
              { node: "pr", dominator: "filing" },
              { node: "wire_a", dominator: "pr" },
              { node: "wire_b", dominator: "pr" },
            ],
          ],
        ],
      ],
    ],
  },

  // 8. Epistemic provenance reconciliation with mixed-timezone ISO timestamps
  {
    id: "kb-epistemic-reconciliation",
    category: "epistemics",
    description:
      "Reconcile multi-publisher claims with mixed-timezone ISO timestamps where lexicographic order disagrees with chronological order",
    nativeProgram: [
      "begin",
      ["relation", "source", ["id", "pub", "published"]],
      ["relation", "claim", ["id", "src", "q", "val"]],
      ["relation", "credits", ["claim", "to"]],
      ["relation", "said", ["q", "val", "pub", "ts"]],
      ["relation", "latest", ["q", "pub", "ts"]],
      ["relation", "current", ["q", "val", "pub"]],
      ["relation", "corroborated", ["q", "val"]],
      [
        "fact",
        ["source", "pr", "Acme", "2025-03-15T15:00:00Z"],
        ["source", "10k", "Acme", "2025-03-15T11:00:00-05:00"],
        ["source", "reg", "State", "2025-03-15T17:00:00Z"],
        ["source", "wire", "News", "2025-03-15T15:30:00Z"],
        ["claim", "c1", "pr", "rev", 120],
        ["claim", "c2", "10k", "rev", 118.6],
        ["claim", "c3", "reg", "rev", 118.6],
        ["claim", "c4", "wire", "rev", 120],
        ["credits", "c4", "pr"],
      ],
      [
        "rule",
        ["said", "?q", "?v", "?pub", ["time/parse", "?d"]],
        ["claim", "?c", "?s", "?q", "?v"],
        ["not", ["credits", "?c", "?_"]],
        ["source", "?s", "?pub", "?d"],
      ],
      [
        "rule",
        ["latest", "?q", "?pub", ["aggregate/max", "?ts"]],
        ["said", "?q", "?_", "?pub", "?ts"],
      ],
      [
        "rule",
        ["current", "?q", "?v", "?pub"],
        ["latest", "?q", "?pub", "?ts"],
        ["said", "?q", "?v", "?pub", "?ts"],
      ],
      [
        "rule",
        ["corroborated", "?q", "?v"],
        ["current", "?q", "?v", "?p1"],
        ["current", "?q", "?v", "?p2"],
        ["string/lessThan", "?p1", "?p2"],
      ],
      ["query", ["corroborated", "?q", "?v"]],
    ],
    check: [
      "lambda",
      ["out"],
      ["=", "out", ["quote", [{ q: "rev", v: 118.6 }]]],
    ],
  },

  // 9. Counterfactual belief revision & provenance comparison via assuming
  {
    id: "kb-counterfactual-revision",
    category: "belief-revision",
    description:
      "Simulate retracting a source via assuming and inspect how derived conclusions and their ground support facts change",
    nativeProgram: [
      "begin",
      ["relation", "edge", ["from", "to"]],
      ["relation", "reach", ["from", "to"]],
      ["fact", ["edge", "a", "b"], ["edge", "b", "c"], ["edge", "a", "c"]],
      ["rule", ["reach", "?x", "?y"], ["edge", "?x", "?y"]],
      [
        "rule",
        ["reach", "?x", "?z"],
        ["reach", "?x", "?y"],
        ["edge", "?y", "?z"],
      ],
      {
        before: ["proof/facts", ["why", ["reach", "a", "c"]]],
        after: [
          "assuming",
          ["retract", ["edge", "a", "c"]],
          ["proof/facts", ["why", ["reach", "a", "c"]]],
        ],
      },
    ],
    workaroundProgram: [
      "begin",
      [
        "define",
        "leaves",
        [
          "lambda",
          ["node"],
          [
            "cond",
            [
              ["not", ["value/object?", "node"]],
              ["quote", []],
            ],
            [
              ["=", ["object/get", "node", "given", false], true],
              ["array/make", ["object/get", "node", "fact"]],
            ],
            [
              "else",
              [
                "array/flat-map",
                ["object/get", "node", "because", ["quote", []]],
                "leaves",
              ],
            ],
          ],
        ],
      ],
      ["relation", "edge", ["from", "to"]],
      ["relation", "reach", ["from", "to"]],
      ["fact", ["edge", "a", "b"], ["edge", "b", "c"], ["edge", "a", "c"]],
      ["rule", ["reach", "?x", "?y"], ["edge", "?x", "?y"]],
      [
        "rule",
        ["reach", "?x", "?z"],
        ["reach", "?x", "?y"],
        ["edge", "?y", "?z"],
      ],
      {
        before: ["aggregate/unique", ["leaves", ["why", ["reach", "a", "c"]]]],
        after: [
          "assuming",
          ["retract", ["edge", "a", "c"]],
          ["aggregate/unique", ["leaves", ["why", ["reach", "a", "c"]]]],
        ],
      },
    ],
    check: [
      "lambda",
      ["out"],
      [
        "and",
        ["=", ["object/get", "out", "before"], ["quote", [["edge", "a", "c"]]]],
        [
          "=",
          ["object/get", "out", "after"],
          [
            "quote",
            [
              ["edge", "a", "b"],
              ["edge", "b", "c"],
            ],
          ],
        ],
      ],
    ],
  },

  // 10. Ontology hygiene & quantitative synthesis with units and aggregates
  {
    id: "kb-ontology-synthesis",
    category: "synthesis",
    description:
      "Audit DAG hierarchy via transitive reduction, compute exact median/argMax across estimates, and check dimensional quantities",
    nativeProgram: [
      "begin",
      ["relation", "sub", ["child", "parent"]],
      ["relation", "estimate", ["source", "usd_m"]],
      ["relation", "summary", ["med", "top"]],
      [
        "fact",
        ["sub", "cat", "mammal"],
        ["sub", "mammal", "animal"],
        ["sub", "cat", "animal"],
        ["estimate", "a", 100],
        ["estimate", "b", 120],
        ["estimate", "c", 115],
        ["estimate", "d", 110],
      ],
      [
        "rule",
        [
          "summary",
          ["aggregate/median", "?v"],
          ["aggregate/argMax", ["array/make", "?v", "?s"]],
        ],
        ["estimate", "?s", "?v"],
      ],
      {
        minimal: [
          "find",
          ["array/make", "?u", "?v"],
          ["graph/transitiveReduction", "sub", "?u", "?v"],
        ],
        summary: ["query", ["summary", "?med", "?top"]],
        perShare: [
          "quantity/in",
          [
            "quantity/divide",
            { value: 450, unit: { usd: 1 } },
            { value: 15, unit: { share: 1 } },
          ],
          { usd: 1, share: -1 },
        ],
      },
    ],
    check: [
      "lambda",
      ["out"],
      [
        "and",
        [
          "=",
          ["object/get", "out", "minimal"],
          [
            "quote",
            [
              ["cat", "mammal"],
              ["mammal", "animal"],
            ],
          ],
        ],
        [
          "=",
          ["object/get", "out", "summary"],
          ["quote", [{ med: 112.5, top: "b" }]],
        ],
        ["=", ["object/get", "out", "perShare"], 30],
      ],
    ],
  },

  // 11. First-class universal verification & counterexample synthesis
  {
    id: "kb-proof-counterexample",
    category: "verification",
    description:
      "Prove a margin floor holds across rounded revenue/cost intervals with a kernel-valid certificate, and synthesize a concrete counterexample for a tighter floor",
    nativeProgram: [
      "begin",
      [
        "define",
        "holds25",
        [
          "proof/prove",
          [
            "not",
            [
              "exists",
              ["?rev", "?cost"],
              [
                "and",
                ["schema/fits?", "?rev", "value/number?"],
                ["schema/fits?", "?cost", "value/number?"],
                ["number/greaterThanOrEqualTo", "?rev", 405],
                ["number/lessThanOrEqualTo", "?rev", 415],
                ["number/greaterThanOrEqualTo", "?cost", 300],
                ["number/lessThanOrEqualTo", "?cost", 303],
                [
                  "number/lessThan",
                  [
                    "number/divide",
                    ["number/subtract", "?rev", "?cost"],
                    "?rev",
                  ],
                  0.25,
                ],
              ],
            ],
          ],
        ],
      ],
      [
        "define",
        "holds26",
        [
          "proof/prove",
          [
            "not",
            [
              "exists",
              ["?rev", "?cost"],
              [
                "and",
                ["schema/fits?", "?rev", "value/number?"],
                ["schema/fits?", "?cost", "value/number?"],
                ["number/greaterThanOrEqualTo", "?rev", 405],
                ["number/lessThanOrEqualTo", "?rev", 415],
                ["number/greaterThanOrEqualTo", "?cost", 300],
                ["number/lessThanOrEqualTo", "?cost", 303],
                [
                  "number/lessThan",
                  [
                    "number/divide",
                    ["number/subtract", "?rev", "?cost"],
                    "?rev",
                  ],
                  0.26,
                ],
              ],
            ],
          ],
        ],
      ],
      {
        proved25: ["object/get", "holds25", "proved"],
        valid25: ["proof/valid?", "holds25"],
        proved26: ["object/get", "holds26", "proved"],
        hasCounterexample: ["object/has?", "holds26", "counterexample"],
      },
    ],
    check: [
      "lambda",
      ["out"],
      [
        "and",
        ["=", ["object/get", "out", "proved25"], true],
        ["=", ["object/get", "out", "valid25"], true],
        ["=", ["object/get", "out", "proved26"], false],
        ["=", ["object/get", "out", "hasCounterexample"], true],
      ],
    ],
  },

  // 12. Exact linear-fractional interval bounds under rounding uncertainty
  {
    id: "kb-ratio-interval-bounds",
    category: "verification",
    description:
      "Compute exact tight [min, max] gross margin bounds and endpoint witnesses over rounded revenue/cost intervals with kernel-checked bound certificates",
    nativeProgram: [
      "begin",
      [
        "define",
        "b",
        [
          "proof/bounds",
          ["number/divide", ["number/subtract", "?rev", "?cost"], "?rev"],
          [
            "and",
            ["schema/fits?", "?rev", "value/number?"],
            ["schema/fits?", "?cost", "value/number?"],
            ["number/greaterThanOrEqualTo", "?rev", 405],
            ["number/lessThanOrEqualTo", "?rev", 415],
            ["number/greaterThanOrEqualTo", "?cost", 300],
            ["number/lessThanOrEqualTo", "?cost", 303],
          ],
        ],
      ],
      {
        minExact: [
          "=",
          ["object/get", "b", "min"],
          ["number/divide", 102, 405],
        ],
        maxExact: [
          "=",
          ["object/get", "b", "max"],
          ["number/divide", 115, 415],
        ],
        minCert: ["proof/valid?", ["object/get", "b", "minProof"]],
        maxCert: ["proof/valid?", ["object/get", "b", "maxProof"]],
      },
    ],
    check: [
      "lambda",
      ["out"],
      [
        "and",
        ["=", ["object/get", "out", "minExact"], true],
        ["=", ["object/get", "out", "maxExact"], true],
        ["=", ["object/get", "out", "minCert"], true],
        ["=", ["object/get", "out", "maxCert"], true],
      ],
    ],
  },

  // 13. Universal frame & research-aggregate soundness via rule induction
  {
    id: "kb-frame-rule-soundness",
    category: "verification",
    description:
      "Prove universally via proof/rules that a research frame with column-level Says invariant, record destructuring, and count/sum/mean rules preserves output schemas",
    nativeProgram: [
      "begin",
      [
        "schema",
        "Pos",
        [
          "schema/allOf",
          "value/number?",
          ["lambda", ["n"], ["number/greaterThan", "n", 0]],
        ],
      ],
      [
        "schema",
        "Says",
        ["schema/anyOf", { revenue: "value/string?", usd_m: "Pos" }],
      ],
      ["relation", "claim", ["id", "source", "quote", "says"]],
      [
        "invariant",
        [
          "and",
          ["claim", "?id", "?_", "?_", "?says"],
          ["not", ["Says", "?says"]],
        ],
        { assert: "none" },
      ],
      ["relation", "ans", ["co", "v"]],
      [
        "rule",
        ["ans", "?co", "?v"],
        ["claim", "?_", "?_", "?_", { revenue: "?co", usd_m: "?v" }],
      ],
      ["relation", "tot", ["co", "s"]],
      ["rule", ["tot", "?co", ["aggregate/sum", "?v"]], ["ans", "?co", "?v"]],
      ["schema", "AnsRow", { co: "value/string?", v: "Pos" }],
      ["schema", "TotRow", { co: "value/string?", s: "Pos" }],
      ["define", "p", ["proof/rules", { ans: "AnsRow", tot: "TotRow" }]],
      { proved: ["object/get", "p", "proved"], valid: ["proof/valid?", "p"] },
    ],
    check: [
      "lambda",
      ["out"],
      [
        "and",
        ["=", ["object/get", "out", "proved"], true],
        ["=", ["object/get", "out", "valid"], true],
      ],
    ],
  },

  // 14. Formal temporal SLA proof & duration envelope over uncertain UTC windows
  {
    id: "kb-temporal-window-proof",
    category: "chronology",
    description:
      "Bound incident outage duration and prove minimum SLA breach across uncertain UTC detection windows using symbolic time/add and time/diff",
    nativeProgram: [
      "begin",
      ["define", "t0", ["time/parse", "2026-03-03T14:00:00Z"]],
      ["define", "tMit", ["time/parse", "2026-03-03T16:40:00Z"]],
      [
        "define",
        "b",
        [
          "proof/bounds",
          ["time/diff", "tMit", "?det", "minutes"],
          [
            "and",
            ["schema/fits?", "?det", "value/integer?"],
            ["number/greaterThanOrEqualTo", "?det", "t0"],
            [
              "number/lessThanOrEqualTo",
              "?det",
              ["time/add", "t0", 10, "minutes"],
            ],
          ],
        ],
      ],
      {
        min: ["object/get", "b", "min"],
        max: ["object/get", "b", "max"],
        cert: ["proof/valid?", ["object/get", "b", "minProof"]],
      },
    ],
    check: [
      "lambda",
      ["out"],
      [
        "and",
        ["=", ["object/get", "out", "min"], 150],
        ["=", ["object/get", "out", "max"], 160],
        ["=", ["object/get", "out", "cert"], true],
      ],
    ],
  },

  // 15. Empirical obligation proving with counterfactual source retraction
  {
    id: "kb-obligation-counterfactual",
    category: "epistemics",
    description:
      "Prove an empirical corroborated finding with ground facts and closed-world assumptions, then prove its fragility under counterfactual retraction via assuming",
    nativeProgram: [
      "begin",
      ["relation", "backs", ["pub", "q", "v"]],
      ["relation", "corroborated", ["q", "v"]],
      ["fact", ["backs", "acme", "wh", 37], ["backs", "registry", "wh", 37]],
      [
        "rule",
        ["corroborated", "?q", "?v"],
        ["backs", "?p1", "?q", "?v"],
        ["backs", "?p2", "?q", "?v"],
        ["not", ["=", "?p1", "?p2"]],
      ],
      ["define", "now", ["proof/prove", ["corroborated", "wh", 37]]],
      [
        "define",
        "withoutReg",
        [
          "assuming",
          ["retract", ["backs", "registry", "wh", 37]],
          ["proof/prove", ["corroborated", "wh", 37]],
        ],
      ],
      {
        provedNow: ["object/get", "now", "proved"],
        validNow: ["proof/valid?", "now"],
        factCount: ["array/length", ["object/get", "now", "facts"]],
        provedWithoutReg: ["object/get", "withoutReg", "proved"],
      },
    ],
    check: [
      "lambda",
      ["out"],
      [
        "and",
        ["=", ["object/get", "out", "provedNow"], true],
        ["=", ["object/get", "out", "validNow"], true],
        ["=", ["object/get", "out", "factCount"], 2],
        ["=", ["object/get", "out", "provedWithoutReg"], false],
      ],
    ],
  },

  // 16. Live reactive bulk counterfactual retraction by source tier (retract ... where)
  {
    id: "kb-bulk-counterfactual-where",
    category: "belief-revision",
    description:
      "Test whether a majority-control conclusion survives retracting ALL tertiary-source claims via a live reactive retract-where counterfactual rule",
    nativeProgram: [
      "begin",
      ["relation", "source", ["id", "kind"], { key: "id" }],
      [
        "relation",
        "stake",
        ["id", "src", "owner", "target", "pct"],
        { key: "id" },
      ],
      ["relation", "direct_sum", ["owner", "target", "pct"]],
      [
        "fact",
        ["source", "filing", "primary"],
        ["source", "blog1", "tertiary"],
        ["source", "blog2", "tertiary"],
        ["stake", "k1", "filing", "helios", "vespera", 34],
        ["stake", "k2", "blog1", "helios", "vespera", 12],
        ["stake", "k3", "blog2", "helios", "vespera", 9],
      ],
      [
        "rule",
        ["direct_sum", "?o", "?t", ["aggregate/sum", "?p"]],
        ["stake", "?_", "?_", "?o", "?t", "?p"],
      ],
      {
        withAll: ["find", "?p", ["direct_sum", "helios", "vespera", "?p"]],
        withoutTertiary: [
          "assuming",
          [
            "retract",
            ["stake", "?id", "?s", "?_", "?_", "?_"],
            { where: ["source", "?s", "tertiary"] },
          ],
          ["find", "?p", ["direct_sum", "helios", "vespera", "?p"]],
        ],
      },
    ],
    check: [
      "lambda",
      ["out"],
      [
        "and",
        ["=", ["object/get", "out", "withAll"], ["quote", [55]]],
        ["=", ["object/get", "out", "withoutTertiary"], ["quote", [34]]],
      ],
    ],
  },

  // 17. Exact integer-ratio bounds & claim-bound kernel verification
  {
    id: "kb-integer-ratio-claim-bound",
    category: "verification",
    description:
      "Compute exact integer-ratio bounds via Dinkelbach and certify threshold compliance directly with 2-arg claim-bound proof/valid?",
    nativeProgram: [
      "begin",
      [
        "define",
        "b",
        [
          "proof/bounds",
          ["number/divide", "?pass", ["number/add", "?pass", "?fail"]],
          [
            "and",
            ["schema/fits?", "?pass", "value/integer?"],
            ["schema/fits?", "?fail", "value/integer?"],
            ["number/greaterThanOrEqualTo", "?pass", 17],
            ["number/lessThanOrEqualTo", "?pass", 20],
            ["number/greaterThanOrEqualTo", "?fail", 2],
            ["number/lessThanOrEqualTo", "?fail", 5],
            ["number/lessThanOrEqualTo", ["number/add", "?pass", "?fail"], 22],
          ],
        ],
      ],
      {
        minPct: [
          "number/round",
          ["number/multiply", 100, ["object/get", "b", "min"]],
          2,
        ],
        maxPct: [
          "number/round",
          ["number/multiply", 100, ["object/get", "b", "max"]],
          2,
        ],
        clears77: ["proof/valid?", "b", { atLeast: 0.77 }],
        clears80: ["proof/valid?", "b", { atLeast: 0.8 }],
      },
    ],
    check: [
      "lambda",
      ["out"],
      [
        "and",
        ["=", ["object/get", "out", "minPct"], 77.27],
        ["=", ["object/get", "out", "maxPct"], 90.91],
        ["=", ["object/get", "out", "clears77"], true],
        ["=", ["object/get", "out", "clears80"], false],
      ],
    ],
  },

  // 18. Exact coupled bilinear product bounds (uncertain units * price / chained stakes)
  {
    id: "kb-coupled-bilinear-bounds",
    category: "verification",
    description:
      "Bound exact product of coupled uncertain quantities hitting an interior edge stationary point via 2D FM polygon projection",
    nativeProgram: [
      "begin",
      [
        "define",
        "b",
        [
          "proof/bounds",
          ["number/multiply", "?a", "?b"],
          [
            "and",
            ["schema/fits?", "?a", "value/number?"],
            ["schema/fits?", "?b", "value/number?"],
            ["number/greaterThanOrEqualTo", "?a", 2],
            ["number/lessThanOrEqualTo", "?a", 9],
            ["number/greaterThanOrEqualTo", "?b", 2],
            ["number/lessThanOrEqualTo", "?b", 9],
            ["number/lessThanOrEqualTo", ["number/add", "?a", "?b"], 12],
          ],
        ],
      ],
      {
        min: ["object/get", "b", "min"],
        max: ["object/get", "b", "max"],
      },
    ],
    check: [
      "lambda",
      ["out"],
      [
        "and",
        ["=", ["object/get", "out", "min"], 4],
        ["=", ["object/get", "out", "max"], 36],
      ],
    ],
  },

  // 19. Multi-hop weighted ownership/influence propagation across arbitrary chain depth
  {
    id: "kb-multihop-weighted-influence",
    category: "graph-investigation",
    description:
      "Compute exact multi-hop effective voting ownership across direct and 3-hop indirect chains with graph/influence",
    nativeProgram: [
      "begin",
      ["relation", "owns", ["owner", "target", "share"]],
      [
        "fact",
        ["owns", "helios", "vespera", 0.18],
        ["owns", "helios", "apex", 0.6],
        ["owns", "apex", "midco", 0.5],
        ["owns", "midco", "vespera", 0.8],
        ["owns", "apex", "vespera", 0.2],
      ],
      ["query", ["graph/influence", "owns", "helios", "vespera", "?stake"]],
    ],
    check: [
      "lambda",
      ["out"],
      [
        "and",
        ["=", ["array/length", "out"], 1],
        ["=", ["object/get", ["array/at", "out", 0], "stake"], 0.54],
      ],
    ],
  },

  // 20. All-derivations epistemic sensitivity & minimal retraction cut-sets
  {
    id: "kb-all-derivations-sensitivity",
    category: "epistemics",
    description:
      "Distinguish single-point-of-failure facts from redundant multi-derivation facts and compute minimal retraction cut-sets with proof/sensitivity",
    nativeProgram: [
      "begin",
      ["relation", "backs", ["pub", "q", "v"]],
      ["relation", "corroborated", ["q", "v"]],
      [
        "fact",
        ["backs", "sec", "rev", 410],
        ["backs", "auditor", "rev", 410],
        ["backs", "registry", "rev", 410],
      ],
      [
        "rule",
        ["corroborated", "?q", "?v"],
        ["backs", "?p1", "?q", "?v"],
        ["backs", "?p2", "?q", "?v"],
        ["not", ["=", "?p1", "?p2"]],
      ],
      ["define", "s3", ["proof/sensitivity", ["corroborated", "rev", 410]]],
      [
        "define",
        "s2",
        [
          "assuming",
          ["retract", ["backs", "registry", "rev", 410]],
          ["proof/sensitivity", ["corroborated", "rev", 410]],
        ],
      ],
      {
        threeResilient: ["object/get", "s3", "resilient"],
        threeCutSize: ["object/get", "s3", "minCutSize"],
        twoResilient: ["object/get", "s2", "resilient"],
        twoCriticalCount: ["array/length", ["object/get", "s2", "critical"]],
      },
    ],
    check: [
      "lambda",
      ["out"],
      [
        "and",
        ["=", ["object/get", "out", "threeResilient"], true],
        ["=", ["object/get", "out", "threeCutSize"], 2],
        ["=", ["object/get", "out", "twoResilient"], false],
        ["=", ["object/get", "out", "twoCriticalCount"], 2],
      ],
    ],
  },
];

/** Runs one candidate program and checks it against `task.check`. */
const tryProgram = (lion: Lion, program: unknown, check: unknown) =>
  Effect.gen(function* () {
    const db = newDatabase(lion);
    const start = performance.now();
    const ran = yield* evaluate(lion, program, { database: db });
    const ms = performance.now() - start;
    if (!ran.ok) {
      return {
        passed: false as const,
        ms,
        error: ran.error,
        snapshotBytes: 0,
      };
    }
    const checker = yield* evaluate(lion, check);
    if (!checker.ok) {
      return {
        passed: false as const,
        ms,
        error: `check failed: ${checker.error}`,
        snapshotBytes: 0,
      };
    }
    const verified = yield* evaluate(lion, ["__check__", "__out__"], {
      database: db,
      environment: { __check__: checker.value, __out__: ran.value },
    });
    const passed = verified.ok && verified.value === true;
    const snapshotBytes =
      passed && typeof db === "object" && db !== null
        ? JSON.stringify(program).length
        : 0;
    return {
      passed,
      ms,
      ...(passed
        ? {}
        : {
            error: verified.ok
              ? `check returned ${JSON.stringify(verified.value)}`
              : verified.error,
          }),
      snapshotBytes,
    };
  });

/** Measures snapshot size of a database after running `program`. */
const measureSnapshotBytes = (
  sourceDir: string,
  lion: Lion,
  program: unknown
): Effect.Effect<number> =>
  Effect.gen(function* () {
    const snapMod = yield* Effect.promise(
      () =>
        import(`${sourceDir}/logic/snapshot.ts`) as Promise<{
          readonly saveDatabase: (
            db: unknown
          ) => Effect.Effect<unknown, unknown>;
        }>
    );
    const db = newDatabase(lion);
    const ran = yield* evaluate(lion, program, { database: db });
    if (!ran.ok) {
      return 0;
    }
    const saved = yield* snapMod.saveDatabase(db).pipe(
      Effect.map((s) => JSON.stringify(s).length),
      Effect.catch(() => Effect.succeed(0))
    );
    return saved;
  });

/**
 * Generates a realistic medium-scale synthetic research knowledge base
 * (40 sources, 120 claims, 40-node ontology DAG, 60-edge attribution graph)
 * and times end-to-end ingestion + queries.
 */
const scaledResearchKbProgram = (hasNewFeatures: boolean) => {
  const sources = Array.from({ length: 40 }, (_, i) => [
    "source",
    `s${i}`,
    `Publisher_${i % 10}`,
    `2026-01-${String((i % 28) + 1).padStart(2, "0")}T12:00:00Z`,
  ]);
  const claims = Array.from({ length: 120 }, (_, i) => [
    "claim",
    `c${i}`,
    `s${i % 40}`,
    `topic_${i % 20}`,
    100 + (i % 3),
    ["quote", `Filing reports “figure ${100 + (i % 3)}” [ref-${i % 10}]`],
  ]);
  const isa = Array.from({ length: 39 }, (_, i) => [
    "isa",
    `concept_${i + 1}`,
    `concept_${Math.floor(i / 2)}`,
  ]);
  const attr = Array.from({ length: 50 }, (_, i) => [
    "relies",
    `s${(i % 39) + 1}`,
    `s${i % 10}`,
  ]);
  return [
    "begin",
    ["relation", "source", ["id", "pub", "ts"], { key: "id" }],
    [
      "relation",
      "claim",
      ["id", "src", "topic", "val", "quote"],
      { key: "id" },
    ],
    ["relation", "isa", ["child", "parent"]],
    ["relation", "relies", ["from", "to"]],
    ["fact", ...sources, ...claims, ...isa, ...attr],
    ["relation", "pub_val", ["topic", "val", "pub"]],
    [
      "rule",
      ["pub_val", "?t", "?v", "?p"],
      ["claim", "?_", "?s", "?t", "?v", "?_"],
      ["source", "?s", "?p", "?_"],
    ],
    ["relation", "backing", ["topic", "val", "pubs"]],
    [
      "rule",
      ["backing", "?t", "?v", ["aggregate/unique", "?p"]],
      ["pub_val", "?t", "?v", "?p"],
    ],
    ["relation", "corroborated", ["topic", "val"]],
    [
      "rule",
      ["corroborated", "?t", "?v"],
      ["backing", "?t", "?v", "?ps"],
      ["number/greaterThan", ["array/length", "?ps"], 1],
    ],
    {
      corroborated: ["query", ["corroborated", "?t", "?v"]],
      ...(hasNewFeatures
        ? {
            lca: [
              "query",
              [
                "graph/lca",
                "isa",
                "concept_35",
                "concept_38",
                "?lca",
                "?a",
                "?b",
              ],
            ],
            doms: ["query", ["graph/dominators", "relies", "s15", "?n", "?d"]],
            parsed: ["time/parse", "2026-01-15T12:00:00Z"],
          }
        : {}),
    },
  ];
};

/** Evaluates all KB efficacy tasks and computes the quantitative summary. */
export const evaluateEfficacy = (
  sourceDir: string,
  lion: Lion
): Effect.Effect<EfficacySummary> =>
  Effect.gen(function* () {
    const results: TaskResult[] = [];
    for (const task of KB_TASKS) {
      const nativeTry = yield* tryProgram(lion, task.nativeProgram, task.check);
      if (nativeTry.passed) {
        const snap = yield* measureSnapshotBytes(
          sourceDir,
          lion,
          task.nativeProgram
        );
        results.push({
          id: task.id,
          category: task.category,
          mode: "native",
          passed: true,
          astNodes: countAstNodes(task.nativeProgram),
          programBytes: JSON.stringify(task.nativeProgram).length,
          snapshotBytes: snap,
          ms: nativeTry.ms,
        });
        continue;
      }
      if (task.workaroundProgram !== undefined) {
        const workTry = yield* tryProgram(
          lion,
          task.workaroundProgram,
          task.check
        );
        if (workTry.passed) {
          const snap = yield* measureSnapshotBytes(
            sourceDir,
            lion,
            task.workaroundProgram
          );
          results.push({
            id: task.id,
            category: task.category,
            mode: "workaround",
            passed: true,
            astNodes: countAstNodes(task.workaroundProgram),
            programBytes: JSON.stringify(task.workaroundProgram).length,
            snapshotBytes: snap,
            ms: workTry.ms,
          });
          continue;
        }
      }
      results.push({
        id: task.id,
        category: task.category,
        mode: "inexpressible",
        passed: false,
        astNodes: 0,
        programBytes: 0,
        snapshotBytes: 0,
        ms: nativeTry.ms,
        ...(nativeTry.error === undefined ? {} : { error: nativeTry.error }),
      });
    }

    const hasNew = "time/parse" in lion.stdlib && "graph/lca" in lion.stdlib;
    const scaledProg = scaledResearchKbProgram(hasNew);
    const scaledStart = performance.now();
    yield* evaluate(lion, scaledProg);
    const scaledKbMs = performance.now() - scaledStart;

    const totalCount = results.length;
    const passed = results.filter((r) => r.passed);
    const passedCount = passed.length;
    const nativeCount = results.filter((r) => r.mode === "native").length;
    const workaroundCount = results.filter(
      (r) => r.mode === "workaround"
    ).length;
    const inexpressibleCount = results.filter(
      (r) => r.mode === "inexpressible"
    ).length;
    const fastCount = passed.filter((r) => r.ms < 50).length;

    const totalAstNodes = passed.reduce((s, r) => s + r.astNodes, 0);
    const totalBytes = passed.reduce((s, r) => s + r.programBytes, 0);
    const totalSnapshotBytes = passed.reduce((s, r) => s + r.snapshotBytes, 0);
    const totalMs = passed.reduce((s, r) => s + r.ms, 0);
    const sortedMs = passed.map((r) => r.ms).sort((a, b) => a - b);
    const medianMs =
      sortedMs.length === 0
        ? 0
        : (sortedMs[Math.floor(sortedMs.length / 2)] ?? 0);

    // Transparent 100-point composite score:
    //   40 pts: task pass rate
    //   25 pts: native expressibility (no heavy workarounds / external scripts)
    //   20 pts: authoring economy (each passing task scored min(1, 140 / astNodes))
    //   15 pts: interactive speed (< 50 ms per task)
    const passRate = (40 * passedCount) / totalCount;
    const expressibility = (25 * nativeCount) / totalCount;
    const economy =
      (20 *
        results.reduce(
          (acc, r) => acc + (r.passed ? Math.min(1, 140 / r.astNodes) : 0),
          0
        )) /
      totalCount;
    const speed = (15 * fastCount) / totalCount;
    const compositeScore =
      Math.round((passRate + expressibility + economy + speed) * 10) / 10;

    return {
      results,
      passedCount,
      nativeCount,
      workaroundCount,
      inexpressibleCount,
      fastCount,
      totalCount,
      totalAstNodes,
      totalBytes,
      totalSnapshotBytes,
      totalMs,
      medianMs,
      scaledKbMs,
      scoreBreakdown: {
        passRate: Math.round(passRate * 10) / 10,
        expressibility: Math.round(expressibility * 10) / 10,
        economy: Math.round(economy * 10) / 10,
        speed: Math.round(speed * 10) / 10,
      },
      compositeScore,
    };
  });
