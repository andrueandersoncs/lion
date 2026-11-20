/**
 * What a database says of two rows with one key that the key cannot make
 * one: which two it names, which one it says a rule derived, and by which
 * rule; and whether it keeps what it derived through a change that gives
 * such rows, refused or kept. A probe's command: it runs in memory and
 * writes nothing.
 */
import { run } from "@lionlang/core/evaluation/evaluate";
import { LogicDatabase } from "@lionlang/core/logic/database";
import { stdlib } from "@lionlang/core/modules";
import { Cause, Effect, Exit } from "effect";

console.error = () => undefined;
const say = (what, value) => console.log(`${what}: ${JSON.stringify(value)}`);
const outcome = async (program, database) => {
  const exit = await Effect.runPromiseExit(run(program, stdlib, { database }));
  return Exit.isSuccess(exit) ? exit.value : Cause.squash(exit.cause).message;
};

// A fact and two rows a rule gives, all with one key: the pair told is the
// one whose rows sort first, and its row a rule gives is the one derived.
say(
  "a fact and two derived rows with one key",
  await outcome(
    [
      "begin",
      ["relation", "a", ["kid", "value"]],
      ["relation", "out", ["kid", "value"], { key: "kid" }],
      ["rule", ["out", "?k", "?v"], ["a", "?k", "?v"]],
      ["fact", ["out", "k", 2], ["a", "k", 1], ["a", "k", 3]],
      ["query", ["out", "?k", "?v"]],
    ],
    new LogicDatabase()
  )
);

const TWINS = [
  ["relation", "person", ["name"]],
  ["relation", "twin", ["a", "b"]],
  ["relation", "tall", ["who"]],
  ["relation", "mother", ["child", "mother"], { key: "child" }],
  ["rule", ["exists", ["?m"], ["mother", "?c", "?m"]], ["person", "?c"]],
  [
    "rule",
    ["mother", "?a", "?m"],
    ["twin", "?a", "?b"],
    ["mother", "?b", "?m"],
  ],
];

// Ann's invented mother is made one with Fay, who is registered for her,
// and Bea's with Eve, whom the twin passes on to Ann: Fay sorts later, and
// the rule that invented the mother she became gives her row.
const refusing = new LogicDatabase();
await outcome(
  [
    "begin",
    ...TWINS,
    ["relation", "registered", ["child", "mother"]],
    [
      "rule",
      ["=", "?m", "?r"],
      ["mother", "?c", "?m"],
      ["registered", "?c", "?r"],
    ],
    [
      "fact",
      ["person", "ann"],
      ["person", "bea"],
      ["registered", "ann", "fay"],
      ["registered", "bea", "eve"],
    ],
    ["query", ["mother", "?c", "?m"]],
  ],
  refusing
);
const before = refusing.model;
say(
  "a twin an equality rule refuses",
  await outcome(["fact", ["twin", "ann", "bea"]], refusing)
);
say(
  "after it, the model is the one before",
  refusing.model !== undefined && refusing.model === before
);
say(
  "after it, Ann's mother",
  await outcome(["query", ["mother", "ann", "?m"]], refusing)
);

// Facts hold Ann's and Bea's invented mothers, so no key makes them one,
// and no invariant reads them: the change is kept, with its rows.
const keeping = new LogicDatabase();
await outcome(
  [
    "begin",
    ...TWINS,
    [
      "fact",
      ["person", "ann"],
      ["person", "bea"],
      ["tall", ["some", "?m", ["mother", "ann", "?m"]]],
      ["tall", ["some", "?m", ["mother", "bea", "?m"]]],
    ],
    ["query", ["mother", "?c", "?m"]],
  ],
  keeping
);
const kept = keeping.model;
say(
  "a twin no invariant reads",
  await outcome(["fact", ["twin", "ann", "bea"]], keeping)
);
say(
  "after it, the model is the one before",
  keeping.model !== undefined && keeping.model === kept
);
say(
  "after it, a question about mothers",
  await outcome(["query", ["mother", "?c", "?m"]], keeping)
);
