/**
 * The mutations `bun run mutate` checks. Each breaks one behavior that the
 * property tests are meant to pin down, and names the behavior it breaks.
 *
 * Add a mutation for each behavior you add, and run it to see the tests
 * fail. When code moves and a mutation's text is no longer there, the run
 * reports it as stale: point it at the code that now does that job.
 */
import type { Mutation } from "./mutation.ts";

const core = (file: string) => `packages/core/src/${file}`;
const EXISTENTIAL_TESTS = ["src/logic/tests/existentials.test.ts"];
/** The properties of what a string means, by the scopes it is written in. */
const SCOPE_TESTS = "src/evaluation/tests/scopes.test.ts";
/** The properties of the analysis, checked against the evaluator. */
const ANALYSIS_TESTS = "src/analysis/tests/analyze.test.ts";
/** The properties of a relation's candidates, and of taking rules back. */
const CANDIDATE_TESTS = "src/logic/tests/candidates.test.ts";
/** The properties of the value a key or an equality rule keeps. */
const LEAST_MEMBER_TESTS = [
  ...EXISTENTIAL_TESTS,
  "src/logic/tests/merges.test.ts",
];
const WHY_NOT_TESTS = ["src/logic/tests/why-not.test.ts"];
/** The properties of asking what would hold after some changes. */
const ASSUMING_TESTS = ["src/logic/tests/assuming.test.ts"];
/** The properties of relations that merge what a key gets. */
const MERGE_TESTS = ["src/logic/tests/merging.test.ts"];
/** The properties of the rest of a record or list, and of the model of schemas. */
const REST_TESTS = [
  "src/logic/tests/rests.test.ts",
  "src/logic/tests/schemas.test.ts",
  "src/logic/tests/patterns.test.ts",
];
/** The properties of the solver, against brute force. */
const SOLVER_TESTS = ["src/logic/tests/solver.test.ts"];
/** The properties of solving for a variable a schema types, against listing. */
const SOLVING_TESTS = ["src/logic/tests/solving.test.ts"];
/** The properties of a schema that stands for each value it allows. */
const LISTING_TESTS = ["src/logic/tests/listing.test.ts"];
/** The properties of a schema that asks about itself. */
const SELF_REFERENCE_TESTS = ["src/logic/tests/self-reference.test.ts"];
/** The properties that compare `why` across histories and fact orders. */
const TOLD_TESTS = [
  "src/logic/tests/weights.test.ts",
  "src/logic/tests/aggregates.test.ts",
  "src/logic/tests/asking.test.ts",
  "src/logic/tests/maintained.test.ts",
  "src/logic/tests/why-not.test.ts",
];
const reasoning = (file: string) => `skills/lion-reasoning/${file}`;
/** A file of the reasoning skill's eval case that a run's agent never sees. */
const rechecks = (file: string) =>
  `skills/lion-reasoning/evals/rechecks-what-changed/${file}`;
const RECHECKS_TESTS = {
  package: "metrics",
  tests: ["src/tests/reasoning-eval.test.ts"],
};
const SKILL_EVAL_TESTS = {
  package: "metrics",
  tests: ["src/tests/skill-eval.test.ts"],
};
const SKILL_EVAL = "packages/metrics/src/skill-eval.ts";
const REASONING_TESTS = {
  package: "metrics",
  tests: ["src/tests/reasoning-skill.test.ts"],
};

/** The properties of `lion worker`, checked against the lion command. */
const WORKER_TESTS = "src/tests/worker.test.ts";

/** A break in the research skill's core program, caught by the skill's properties. */
const research = (
  name: string,
  find: string,
  replace: string,
  file = "assets/core.json"
): Mutation => ({
  file: `skills/lion-research/${file}`,
  find,
  name,
  package: "metrics",
  replace,
  tests: ["src/tests/research-skill.test.ts"],
});

/** A break in the research skill's scripts, caught by the skill's properties. */
const researchScript = (
  name: string,
  file: string,
  find: string,
  replace: string
): Mutation => research(name, find, replace, `scripts/${file}`);

/** A break in the project record's rules or pages, caught by its properties. */
const record = (
  name: string,
  find: string,
  replace: string,
  file = "core.json"
): Mutation => ({
  file: `history/${file}`,
  find,
  name,
  package: "history",
  replace,
  tests: ["src/tests/record.test.ts"],
});

/** A break in the research's frame or findings, caught by the research's properties. */
const researchStep = (
  name: string,
  find: string,
  replace: string,
  file = "01-frame.src.json"
): Mutation => ({
  file: `history/research/steps/${file}`,
  find,
  name,
  package: "history",
  replace,
  tests: ["src/tests/research.test.ts"],
});

const MAINTAINED_TESTS = [
  "src/logic/tests/maintained.test.ts",
  "src/logic/tests/components.test.ts",
];
const TUPLE_SET_TESTS = ["src/logic/tests/tuple-set.test.ts"];
const BATCH_TESTS = ["src/logic/tests/batches.test.ts"];

/** A break in how derived rows follow a change, caught by the kept-database property. */
const maintained = (name: string, find: string, replace: string): Mutation => ({
  file: core("logic/maintain.ts"),
  find,
  name,
  replace,
  tests: MAINTAINED_TESTS,
});

/** Breaks in what makes the logic layer grow with its changes, not its facts. */
const SCALING: readonly Mutation[] = [
  {
    name: "a removed tuple goes back at the end of its bucket when undone",
    file: core("logic/model.ts"),
    find: "      bucket.splice(this.placeIn(bucket, slot), 0, tuple);",
    replace: "      bucket.push(tuple);",
    tests: TUPLE_SET_TESTS,
  },
  {
    name: "an added tuple stays in its bucket when undone",
    file: core("logic/model.ts"),
    find: "        rest?.pop();",
    replace: "",
    tests: TUPLE_SET_TESTS,
  },
  {
    name: "tidying a set of tuples loses them",
    file: core("logic/model.ts"),
    find: "        this.rows.push(tuple);\n        this.keys.push(keys[slot] as string);",
    replace: "",
    tests: TUPLE_SET_TESTS,
  },
  {
    name: "a refused change to facts is not taken back",
    file: core("logic/database.ts"),
    find: "          undo(log ?? []);",
    replace: "          undo([]);",
    tests: ["src/logic/tests/invariants.test.ts"],
  },
  {
    name: "answers past a full batch are dropped",
    file: core("logic/model.ts"),
    find: "          yield* on(out);\n          out = [];",
    replace: "          out = [];",
    tests: BATCH_TESTS,
  },
  {
    name: "answers short of a full batch are dropped",
    file: core("logic/model.ts"),
    find: "      }\n    }\n    yield* on(out);\n  });",
    replace: "      }\n    }\n  });",
    tests: BATCH_TESTS,
  },
  {
    name: "a failed assertion shows the first answer found",
    file: core("logic/query-options.ts"),
    find: "  rows.reduce((least, row) => (compareValues(row, least) < 0 ? row : least));",
    replace: "  rows[0];",
    tests: BATCH_TESTS,
  },
  {
    name: "why tells how a row came about before a change was followed through it",
    file: core("logic/maintain.ts"),
    find: "          model.told.delete(name);",
    replace: "",
    tests: TOLD_TESTS,
  },
  {
    name: "a refused change's message shows one of its new answers",
    file: core("logic/database.ts"),
    find: "        const answers = [...found.values()];",
    replace: "        const answers = [...found.values()].slice(0, 1);",
    tests: [
      "src/logic/tests/invariants.test.ts",
      "src/logic/tests/incremental.test.ts",
    ],
  },
  {
    ...maintained(
      "a function from the host reads nothing",
      "  isBlind(stratum) ||\n",
      ""
    ),
    tests: ["src/logic/tests/incremental.test.ts"],
  },
  maintained(
    "a computed relation survives a change to what it reads",
    "        model.relations.delete(name);\n",
    ""
  ),
  maintained(
    "an algorithm's rows survive for the rule that reads them",
    "      model.relations.delete(relation.name);\n",
    ""
  ),
  maintained(
    "a group derived again says nothing changed",
    "      gained.set(name, plus);\n      lost.set(name, minus);\n    }\n  });",
    "    }\n  });"
  ),
  maintained(
    "a forgotten group counts as unchanged",
    "    unknown.add(name);\n",
    ""
  ),
  maintained(
    "a goal that stands in a question is not followed",
    "      uses.push(use(goal, skeleton, true));\n",
    ""
  ),
  maintained(
    "a variable an exists keeps to itself is the body's",
    "arg.anonymous || own.has(arg.name) ? anything() : arg",
    "arg.anonymous ? anything() : arg"
  ),
  maintained(
    "a relation read through a schema is taken for unread",
    "        ![...loose].some(moves) &&\n",
    ""
  ),
  maintained(
    "a group nobody has read is derived again",
    "  return !adrift && names.some((name) => model.read.has(name))",
    "  return !adrift"
  ),
  maintained(
    "a group that cannot be followed is always forgotten",
    "  return !adrift && names.some((name) => model.read.has(name))",
    "  return false"
  ),
  {
    ...maintained(
      "a blind group is derived again before what it may read",
      "      ...strata.filter((stratum) => !late(stratum)),\n      ...strata.filter(late),",
      "      ...strata,"
    ),
    tests: MAINTAINED_TESTS,
  },
  maintained(
    "what the upkeep read counts as read",
    "    model.read.clear();\n",
    ""
  ),
  {
    name: "nothing a model derives counts as read",
    file: core("logic/model.ts"),
    find: "  model.read.add(name);\n",
    replace: "",
    tests: MAINTAINED_TESTS,
  },
  {
    name: "a goal-directed query's rows are forgotten on every change",
    file: core("logic/database.ts"),
    find: "    if (goals.size > MOST_GOALS) {",
    replace: "    if (goals.size > -1) {",
    tests: MAINTAINED_TESTS,
  },
  {
    name: "a goal-directed query is not told what the facts it reads gained",
    file: core("logic/database.ts"),
    find: "    gained.set(factsName(name), net.gained.get(name) ?? new TupleSet());\n",
    replace: "",
    tests: [...MAINTAINED_TESTS, CANDIDATE_TESTS],
  },
  {
    name: "a relation's first facts reach a query whose rules do not read them",
    file: core("logic/database.ts"),
    find: "  if (unread) {\n    return Effect.succeed(false);\n  }\n",
    replace: "",
    tests: MAINTAINED_TESTS,
  },
  {
    name: "a refused change is not followed back",
    file: core("logic/database.ts"),
    find: "              ? Effect.asVoid(follow(database, back(), touched))",
    replace: "              ? Effect.void",
    tests: MAINTAINED_TESTS,
  },
  {
    name: "a refused change whose rows broke a key forgets everything derived",
    file: core("logic/database.ts"),
    find: "              : followBack(database, aside, back())",
    replace: "              : Effect.sync(() => touch(database))",
    tests: MAINTAINED_TESTS,
  },
  {
    name: "a refused change forgets the goal-directed queries it did not reach",
    file: core("logic/database.ts"),
    find: "goals: new Map(goals)",
    replace: "goals",
    tests: MAINTAINED_TESTS,
  },
  {
    name: "a refused change whose rows broke a key is followed back through the groups it set aside",
    file: core("logic/maintain.ts"),
    find: "  const behind = new Set(back ? model.behind : []);",
    replace: "  const behind = new Set<string>();",
    tests: ["src/logic/tests/weights.test.ts", ...MAINTAINED_TESTS],
  },
  {
    name: "a group that reads rows breaking a key is followed through a change as if they did not",
    file: core("logic/maintain.ts"),
    find: "      model.behind.add(name);",
    replace: "",
    tests: ["src/logic/tests/weights.test.ts", ...MAINTAINED_TESTS],
  },
  {
    name: "a group that reads a group set aside is followed through a change",
    file: core("logic/maintain.ts"),
    find: "    (unread.size > 0 && readsOther(stratum, (name) => unread.has(name))) ||",
    replace: "    false ||",
    tests: ["src/logic/tests/weights.test.ts", ...MAINTAINED_TESTS],
  },
  {
    name: "a kept change whose rows broke a key keeps the groups it set aside, as they were",
    file: core("logic/database.ts"),
    find: "            forgetBehind(database.model);",
    replace: "",
    tests: ["src/logic/tests/weights.test.ts", ...MAINTAINED_TESTS],
  },
  {
    name: "a new rule forgets everything derived",
    file: core("logic/database.ts"),
    find: "    if (before === undefined || running) {\n      return Effect.void;",
    replace: "    if (true) {\n      return Effect.void;",
    tests: MAINTAINED_TESTS,
  },
  {
    name: "a relation whose rules changed keeps the rows it had",
    file: core("logic/database.ts"),
    find: "        stale.add(name);\n",
    replace: "",
    tests: MAINTAINED_TESTS,
  },
];

const WEIGHT_TESTS = [
  "src/logic/tests/weights.test.ts",
  "src/logic/tests/maintained.test.ts",
  "src/logic/tests/components.test.ts",
  ...EXISTENTIAL_TESTS,
];

/** A break in the engine that keeps rows by weight and level. */
const weighed = (
  name: string,
  find: string,
  replace: string,
  tests: readonly string[] = WEIGHT_TESTS
): Mutation => ({ file: core("logic/weights.ts"), find, name, replace, tests });

/** Breaks in rows with weights, held from a level, and what follows them. */
const WEIGHTS: readonly Mutation[] = [
  weighed(
    "a row that lost its candidates stays",
    "    homeOf(run, entry).deleteKeyed(entry.key);\n",
    ""
  ),
  weighed(
    "a row that joins gives its answers no candidates",
    "    yield* count(run, joining, 1);",
    "    yield* count(run, [], 1);"
  ),
  weighed(
    "a row that leaves keeps its answers' candidates",
    "    yield* count(run, leaving, -1);",
    "    yield* count(run, [], -1);"
  ),
  weighed(
    "a relation as it was lacks the rows it lost",
    "      yield* this.lost.lookup(positions, values);",
    ""
  ),
  weighed(
    "a relation as it was holds the rows it gained",
    "      if (!this.gained.has(tuple)) {",
    "      if (tuple) {"
  ),
  weighed(
    "a fact a group gained or lost changes no weight",
    "          weigh(run, name, tuple, valueKey(tuple), 0, by, false);",
    "          weigh(run, name, tuple, valueKey(tuple), 0, 0, false);"
  ),
  weighed(
    "what a group gained is not passed on",
    "setOf(net > 0 ? gained : lost, relation)",
    "setOf(net > 0 ? new Map() : lost, relation)"
  ),
  weighed(
    "what a group lost is not passed on",
    "setOf(net > 0 ? gained : lost, relation)",
    "setOf(net > 0 ? gained : new Map(), relation)"
  ),
  weighed(
    "a row the relation of a question gains reaches nothing",
    "      for (const batch of [moved.lost, moved.gained]) {",
    "      for (const batch of [moved.lost]) {"
  ),
  weighed(
    "a question in a rule is asked as things are for the answers a change takes away",
    "      model.view = by < 0 ? moved.was : undefined;",
    "      model.view = undefined;"
  ),
  weighed(
    "a candidate has the level of the rows it used, not one above",
    "  return from === undefined ? 0 : from + 1;",
    "  return from === undefined ? 0 : from;"
  ),
  weighed(
    "a row whose lowest candidates are gone goes, though higher ones give it",
    "    if (entry.n === 0) {\n      promote(entry);\n    }",
    "    if (entry.n === 0) {\n      entry.more = undefined;\n    }"
  ),
  weighed(
    "an answer that two goals find through one batch counts twice",
    '      if (index < delta && batch?.ids.get(name ?? "")?.has(tuple)) {',
    "      if (index < -1) {"
  ),
  weighed(
    "a better value does not end the row before it",
    "      ends.set(entry, until);",
    "      ends.delete(entry);",
    ["src/logic/tests/lattice.test.ts", "src/logic/tests/merging.test.ts"]
  ),
  weighed(
    "what an aggregate that recurses gained does not join what it had",
    "      : joined(rule, kind, running[at], kept);",
    "      : combined(rule, kind, kept);"
  ),
  weighed(
    "a group whose candidates changed is not combined again",
    "  fold.since = Math.min(fold.since, level);\n  run.folding.add(fold);",
    "  fold.since = Math.min(fold.since, level);"
  ),
  weighed(
    "an aggregate that cannot combine its candidates names the one that came last",
    "  const values = given(kind, kept).sort(compareValues);",
    "  const values = given(kind, kept).reverse();",
    ["src/logic/tests/aggregates.test.ts", ...WEIGHT_TESTS]
  ),
  weighed(
    "a running total is kept for numbers that are not whole",
    "      Number.isSafeInteger(value) && Number.isSafeInteger(kept.total);",
    "      true;"
  ),
  weighed(
    "an answer several rules with one head find counts once for each",
    "    if (!run.shared.has(rule.head)) {",
    "    if (rule.head) {",
    ["src/logic/tests/aggregates.test.ts"]
  ),
  weighed(
    "an equality rule makes no unknowns one",
    "    for (const [a, b] of pairsOf(left, right, pairs) ? pairs : []) {",
    "    for (const [a, b] of pairs) {"
  ),
  weighed(
    "a row that gives a head does not ask the answers that would invent it again",
    "      } else if (asking.placed && stageOf(asking.from) >= stageOf(level)) {",
    "      } else if (asking.placed && stageOf(asking.from) > stageOf(level)) {"
  ),
  weighed(
    "a rule that invents does so even when its head holds already",
    "      const holds = due && (yield* givenBy(run, asking, endOf(stage)));",
    "      const holds = due && (yield* givenBy(run, asking, endOf(stage))) && false;"
  ),
  weighed(
    "a rule that invents asks about rows held only after its stage",
    "            (found.placed && found.from <= last && found.until > last)",
    "            found.placed"
  ),
  weighed(
    "a key does not make an invented unknown equal to another value",
    "    for (const [a, b] of pairs) {\n      weighPair(run, a, b, level, by);\n    }",
    ""
  ),
  weighed(
    "a key keeps the unknown that sorts last",
    "  return ((free ? depthOf(a) - depthOf(b) : 0) || compareValues(a, b)) < 0;",
    "  return ((free ? depthOf(a) - depthOf(b) : 0) || compareValues(b, a)) < 0;",
    LEAST_MEMBER_TESTS
  ),
  weighed(
    "a key keeps the unknown that sorts first, though another nests fewer unknowns",
    "  return ((free ? depthOf(a) - depthOf(b) : 0) || compareValues(a, b)) < 0;",
    "  return compareValues(a, b) < 0;",
    LEAST_MEMBER_TESTS
  ),
  weighed(
    "a key keeps the unknown that nests the most unknowns",
    "  return ((free ? depthOf(a) - depthOf(b) : 0) || compareValues(a, b)) < 0;",
    "  return ((free ? depthOf(b) - depthOf(a) : 0) || compareValues(a, b)) < 0;",
    LEAST_MEMBER_TESTS
  ),
  weighed(
    "a row that holds a value its class no longer writes does not end",
    "    : Math.min(until, endIn(chase, entry.tuple));",
    "    : until;"
  ),
  weighed(
    "a row that ended gives no row with the least member in its place",
    "    const became = weigh(run, relation, tuple, key, until, 1) as Entry;",
    "    const became = weigh(run, relation, tuple, key, until, 0) as Entry;"
  ),
  weighed(
    "a row that ended is not written again when its class's least member changes",
    "      image(run, holder);\n",
    ""
  ),
  weighed(
    "the rows that ended are not read when answers are counted",
    "    : new Both(rowsOf(model, name), past);",
    "    : undefined;"
  ),
  weighed(
    "a row that comes beside a row with its key is read from the level it is held from",
    "      return from + 1;",
    "      return from;"
  ),
  weighed(
    "a row that comes or goes leaves the rows with its key read as before",
    "    if (other !== undefined && other !== entry) {\n      mark(run, other);",
    "    if (other !== undefined && other === entry) {\n      mark(run, other);"
  ),
  weighed(
    "an answer counts though its rows never held at one level",
    "  if (first >= last) {\n    return;\n  }",
    ""
  ),
  weighed(
    "two rows with one key that part take away the pairs the unknowns facts hold now say they give, not the ones they gave",
    "      (by < 0 ||\n        pairs.every(",
    "      (by < -1 ||\n        pairs.every("
  ),
  weighed(
    "two rows with one key that part take away pairs they never gave",
    "        )) &&\n      met(run.support.chase, entry, other, by);",
    "        )) &&\n      (by < 0 || met(run.support.chase, entry, other, by));"
  ),
  weighed(
    "rows that hold an unknown a fact came or went with are not paired again with the rows that have their key",
    "    repair(run, regiven);\n",
    ""
  ),
  weighed(
    "an unknown a fact holds is written as another value",
    "  !givenOf(run.model).has(value.key);",
    "  true;"
  ),
  weighed(
    "two rows a key gets that differ where nothing merges both hold",
    "    other === tuple ? [] : [clashOf(info, tuple, other)]",
    "    []",
    ["src/logic/tests/keys.test.ts", ...MERGE_TESTS]
  ),
  weighed(
    "of two rows with one key, the one that sorts first is told as the one derived",
    "      byB.size === 0 && byA.size > 0 ? [a, b, byA] : [b, a, byB];",
    "      byB.size === 0 && byA.size < 0 ? [a, b, byA] : [b, a, byB];",
    ["src/logic/tests/keys.test.ts"]
  ),
  weighed(
    "of the clashes among rows with one key, the one whose rows sort last is told",
    "  return order <= 0 ? x : y;",
    "  return order <= 0 ? y : x;",
    ["src/logic/tests/keys.test.ts"]
  ),
  weighed(
    "a key clash names the rule whose written form sorts last",
    "  [...rules].sort((x, y) => compareValues(x.source, y.source))[0];",
    "  [...rules].sort((x, y) => compareValues(x.source, y.source)).at(-1);",
    ["src/logic/tests/keys.test.ts"]
  ),
  weighed(
    "a row a key or an equality rule made is given by no rule",
    "    for (const ended of formersOf(run, relation, tuple)) {",
    "    for (const ended of NONE) {",
    ["src/logic/tests/keys.test.ts", "src/logic/tests/weights.test.ts"]
  ),
  weighed(
    "a change forgets which rows stood beside another with their key",
    "    run.support.clashing = clashing.size === 0 ? undefined : clashing;",
    "    run.support.clashing = undefined;",
    ["src/logic/tests/weights.test.ts", "src/logic/tests/keys.test.ts"]
  ),
  weighed(
    "a group reads its own rows as a question about them would",
    "    return name === undefined ? undefined : everOf(run, name);",
    "    return name === undefined || !run.support.past.has(name)\n      ? undefined\n      : everOf(run, name);",
    ["src/logic/tests/weights.test.ts", "src/logic/tests/keys.test.ts"]
  ),
  weighed(
    "why tells a row of a group that made values one as if none were",
    "    if ((support.chase?.history.size ?? 0) > 0) {",
    "    if (support.chase === null) {",
    [...EXISTENTIAL_TESTS, ...TOLD_TESTS]
  ),
  weighed(
    "why explains a row by the first answer found, not the least",
    "      const [vars] = first.sort((a, b) => compareAnswers(rule, a, b));",
    "      const [vars] = first;",
    TOLD_TESTS
  ),
  weighed(
    "why explains min, max, and shortest by the first match that gave the value",
    "          .sort(compareMatches(model.rules))[0]",
    "          .reverse()[0]",
    TOLD_TESTS
  ),
  weighed(
    "a value a head computes names the row it gives",
    "rule.aggregates.includes(position) || holdsSome(arg) || !isPattern(arg)",
    "rule.aggregates.includes(position) || holdsSome(arg)",
    TOLD_TESTS
  ),
  weighed(
    "why explains a row by an answer above the level it is held from",
    "(at === level ? [vars] : [])",
    "(at >= level ? [vars] : [])",
    TOLD_TESTS
  ),
  weighed(
    "why explains an invented row as given in the stage of its answer",
    "            ? afterStage(asking)\n",
    "            ? asking.from\n",
    [...EXISTENTIAL_TESTS, ...TOLD_TESTS]
  ),
  {
    name: "a fact that holds an unknown does not reach the groups that invent",
    file: core("logic/maintain.ts"),
    find: "  (pass.regiven.size > 0 &&",
    replace: "  (false &&",
    tests: WEIGHT_TESTS,
  },
  {
    name: "an invariant is not asked after a change to what it asks about",
    file: core("logic/database.ts"),
    find: "    if (opaque || reaches(others) || regives(change)) {",
    replace: "    if (opaque || regives(change)) {",
    tests: ["src/logic/tests/invariants.test.ts"],
  },
  {
    name: "an invariant that holds a function from the host is not asked in full",
    file: core("logic/database.ts"),
    find: "    if (opaque || reaches(others) || regives(change)) {",
    replace: "    if (reaches(others) || regives(change)) {",
    tests: ["src/logic/tests/invariants.test.ts"],
  },
  {
    name: "an invariant is not asked when a fact that holds an unknown comes or goes",
    file: core("logic/database.ts"),
    find: "    if (opaque || reaches(others) || regives(change)) {",
    replace: "    if (opaque || reaches(others)) {",
    tests: WEIGHT_TESTS,
  },
];

export const MUTATIONS: readonly Mutation[] = [
  ...WEIGHTS,
  ...SCALING,
  research(
    "a lead covers only questions written exactly as it pursues them",
    '["schema/fits?", "?q", ["schema/open", "?p"]],',
    '["schema/fits?", "?q", "?p"],'
  ),
  research(
    "a lead covers the senses the reader set aside",
    '["schema/fits?", "?q", ["schema/open", "?p"]],\n    ["not", ["set_aside", "?q", "?_", "?_", "?_"]]',
    '["schema/fits?", "?q", ["schema/open", "?p"]]'
  ),
  research(
    "a lead is done when one publisher answers it",
    '["covered", "?l", "?p", "?q"],\n    ["corroborated", "?q", "?_"]',
    '["covered", "?l", "?p", "?q"],\n    ["backing", "?q", "?_", "?_"]'
  ),
  research(
    "a lead is done when any one question it pursues is firm",
    '["not", ["and", ["pursues", "?l", "?p"], ["not", ["firm", "?l", "?p"]]]]',
    '["firm", "?l", "?_"]'
  ),
  research(
    "a lead does not wait for the reader's choice of a sense",
    '["base", "?q", "?base"],\n    ["ambiguous", "?base", "?key", "?_"]',
    '["base", "?q", "?base"],\n    ["ambiguous", "?base", "?key", "?_"],\n    ["=", 1, 2]'
  ),
  research(
    "a source that only relays pays off for a lead",
    '["not", ["attributed", "?c", "?_"]],\n    ["answer", "?q", "?_", "?c"],\n    ["covered", "?l", "?_", "?q"]',
    '["answer", "?q", "?_", "?c"],\n    ["covered", "?l", "?_", "?q"]'
  ),
  research(
    "sources read for a lead before its last payoff still count as misses",
    '["not", ["paid_off", "?l", "?s"]],\n    [\n      "not",\n      [\n        "and",\n        ["last_payoff", "?l", "?last"],\n        ["number/lessThan", "?n", "?last"]\n      ]\n    ]',
    '["not", ["paid_off", "?l", "?s"]]'
  ),
  research(
    "a lead out of patience stays live",
    '["not", ["done", "?l"]],\n    ["not", ["exhausted", "?l"]],',
    '["not", ["done", "?l"]],'
  ),
  research(
    "a lead that names no patience gets none",
    "quoted(lead.patience ?? PATIENCE)",
    "quoted(lead.patience ?? null)",
    "scripts/record.mjs"
  ),
  research(
    "the sources read for leads are all numbered from the start",
    "stepOf(notes, readBefore(basename(path)) + 1)",
    "stepOf(notes, 1)",
    "scripts/record.mjs"
  ),
  research(
    "a step's sources are numbered after the steps that come after it",
    'file.endsWith(".json") && file < name',
    'file.endsWith(".json")',
    "scripts/record.mjs"
  ),
  {
    name: "an equality rule is not kept as the invariant it stands for",
    file: core("logic/database.ts"),
    find: "    yield* addRules(database, rules, invariants);",
    replace: "    yield* addRules(database, rules, []);",
    tests: EXISTENTIAL_TESTS,
  },
  {
    name: "an equality rule merges apart from the group that invents what it meets",
    file: core("logic/strata.ts"),
    find: "          edges.get(inventor)?.add(name);",
    replace: "          edges.get(inventor)?.has(name);",
    tests: EXISTENTIAL_TESTS,
  },
  {
    name: "every invented value counts as meeting an equality rule",
    file: core("logic/strata.ts"),
    find: "      if (equated.has(column)) {",
    replace: "      if (column.length > 0) {",
    tests: EXISTENTIAL_TESTS,
  },
  {
    name: "an equality rule never runs, and only holds as its invariant",
    file: core("logic/strata.ts"),
    find: "): string | undefined => inventorsReaching(rules, rule)[0];",
    replace: "): string | undefined => undefined;",
    tests: EXISTENTIAL_TESTS,
  },

  {
    name: "a string that starts with a control character reads as an unknown",
    file: core("logic/terms.ts"),
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the text is source code that holds a template.
    find: "    return value.charCodeAt(0) === 0 ? `\\u0000${value}` : value;",
    replace: "    return value;",
    tests: EXISTENTIAL_TESTS,
  },
  {
    name: "exists shares its variables with the goal around it",
    file: core("logic/compile.ts"),
    find: "  return replaceVariables(goal, ({ name }) => renamed.get(name));",
    replace: "  return goal;",
    tests: EXISTENTIAL_TESTS,
  },
  {
    name: "a value made in a cycle of columns is allowed",
    file: core("logic/database.ts"),
    find: "      made &&\n      component.get(from) !== undefined &&",
    replace: "      false &&\n      component.get(from) !== undefined &&",
    tests: [
      ...EXISTENTIAL_TESTS,
      "src/logic/tests/logic.test.ts",
      "src/logic/tests/lattice.test.ts",
    ],
  },
  {
    name: "a goal-directed query rewrites relations that rules invent rows of",
    file: core("logic/magic.ts"),
    find: "    const plain = rule.aggregates.length === 0 && rule.invents === undefined;",
    replace: "    const plain = rule.aggregates.length === 0;",
    tests: EXISTENTIAL_TESTS,
  },
  {
    name: "what some describes keeps the values the answer gives its variables out",
    file: core("logic/model.ts"),
    find: "    ...standing(goal).filter((name) => !vars.has(name)),",
    replace: "    ...standing(goal),",
    tests: EXISTENTIAL_TESTS,
  },
  {
    name: "find does not sort what it found",
    file: core("logic/model.ts"),
    find: "      values.sort(compareValues)\n",
    replace: "      values\n",
  },
  {
    name: "find in plain code does not sort what it found",
    file: core("logic/database.ts"),
    find: "      return values.sort(compareValues);",
    replace: "      return values;",
  },
  {
    name: "a match that two alternatives find counts twice",
    file: core("logic/model.ts"),
    find: "    return distinct(found);",
    replace: "    return found;",
  },
  {
    name: "a question has no variables of its own",
    file: core("logic/compile.ts"),
    find: "    return term.variables.filter((name) => scope.has(name));",
    replace: "    return term.variables;",
  },
  {
    name: "anonymous variables of a tested goal must match each other",
    file: core("logic/model.ts"),
    find: '  const named = found.free.filter(([, name]) => !name.startsWith("_"));',
    replace: "  const named = found.free;",
  },
  {
    name: "a lambda runs before a question in its argument is asked",
    file: core("evaluation/special-forms/function.ts"),
    find: "    if (args.some(asks) && lambdaInfo(fn) !== undefined) {",
    replace: "    if (false && lambdaInfo(fn) !== undefined) {",
  },
  {
    name: "a question reads a relation's rows before they are derived",
    file: core("logic/model.ts"),
    find: "  const pending = toRead(model, atom.relation);",
    replace: "  const pending = undefined;",
  },
  {
    name: "a relation goal reads a relation's rows before they are derived",
    file: core("logic/model.ts"),
    find: "    rows === undefined ? toRead(model, literal.relation, true) : undefined;",
    replace: "    undefined as ReturnType<typeof toRead>;",
  },
  {
    name: "a copy's guard waits for the variables of a question it holds, which are the question's own",
    file: core("logic/magic.ts"),
    find: "  for (; at < body.length && !isEvaluable(guard, known, scope); at += 1) {",
    replace:
      "  for (; !guard.variables.every((name) => known.has(name)); at += 1) {",
    tests: ["src/logic/tests/goal-directed.test.ts"],
  },
  {
    name: "a query's argument is not known when a question in it has variables of its own",
    file: core("logic/magic.ts"),
    find: "    ? isQuery && isEvaluable(term, bound, scope)",
    replace: "    ? isQuery && term.variables.every((name) => bound.has(name))",
    tests: ["src/logic/tests/known-arguments.test.ts"],
  },
  {
    name: "anonymous variables are not given names of their own",
    file: core("logic/compile.ts"),
    find: "  return isBinder(goal) ? goal.map(fresh) : goal;",
    replace: "  return goal;",
  },
  {
    name: "a rule may ask about a relation that depends on its own head",
    file: core("logic/database.ts"),
    find: "  const question = asked(\n    rule.body,\n    rule.invents === undefined\n      ? rule.head.args\n      : headsOf(rule).flatMap((head) => head.args)\n  ).find(inCycle);",
    replace: "  const question = asked([], []).find(inCycle);",
  },
  {
    name: "derived rows stay as they were through a change to the facts",
    file: core("logic/database.ts"),
    find: "    if (model === undefined || running) {\n      touch(database);\n      return Effect.succeed(undefined);\n    }\n    if (goals.size",
    replace:
      "    if (true) {\n      return Effect.succeed(undefined);\n    }\n    if (goals.size",
  },
  {
    name: "a question may go through recursion when it runs",
    file: core("logic/model.ts"),
    find: '  return state === "running"\n    ? logicError(',
    replace: '  return state === "never"\n    ? logicError(',
  },
  {
    name: "an aggregate of a find combines the rule's matches",
    file: core("modules/aggregate.ts"),
    find: '      isForm(values, "find")',
    replace: '      isForm(values, "not")',
  },
  // Compiled code: what runs in direct style and what goes on in Effect.
  {
    name: "a call too deep for the stack starts again at its bottom",
    file: core("evaluation/special-forms/lambda.ts"),
    find: "  if (depth >= DEEPEST) {",
    replace: "  if (false) {",
    tests: ["src/evaluation/tests/compiled.test.ts"],
  },
  {
    name: "a call in tail position keeps nothing of its caller",
    file: core("evaluation/special-forms/cond.ts"),
    find: "        return (results[at] as Compiled)(environment, depth);",
    replace:
      "        return andThen((results[at] as Compiled)(environment, depth), depth, (kept) => kept);",
    tests: ["src/evaluation/tests/compiled.test.ts"],
  },
  {
    name: "a library function's Effect runs in the scope of the call",
    file: core("evaluation/compiled.ts"),
    find: "      : Effect.provideService(effect, LionEnvironmentService, environment)",
    replace: "      : effect",
    tests: ["src/evaluation/tests/compiled.test.ts"],
  },
  {
    name: "the compiled evaluator gives assuming no answers",
    file: core("evaluation/base-forms/array.ts"),
    find: "  assuming: (form, scope) => inEffect(evaluateAssuming)(form, scope),",
    replace: "  assuming: () => () => [],",
    tests: ["src/evaluation/tests/compiled.test.ts"],
  },
  {
    name: "compiled code goes on after a node that needed Effect",
    file: core("evaluation/compiled.ts"),
    find: "            runAll(nodes, environment, 0, at + 1, {",
    replace: "            runAll(nodes, environment, 0, nodes.length, {",
    tests: ["src/evaluation/tests/compiled.test.ts"],
  },
  {
    name: "cond does not ask a goal it tests",
    file: core("evaluation/special-forms/cond.ts"),
    find: "              toEffect(decide(Boolean(answered), at, environment, 0))",
    replace: "              toEffect(decide(true, at, environment, 0))",
  },
  {
    name: "a goal that a callback returns is not asked",
    file: core("evaluation/special-forms/function.ts"),
    find: "  return isQuestion(value)\n",
    replace: "  return false\n",
  },
  {
    name: "= does not ask a goal among its operands",
    file: core("evaluation/asking.ts"),
    find: "      : yield* Effect.forEach(operands, answer);",
    replace: "      : operands;",
  },
  {
    name: "a record does not ask a goal among its values",
    file: core("evaluation/base-forms/record.ts"),
    find: "          : Effect.all(Record.map(record, answer))",
    replace: "          : Effect.succeed(record)",
  },
  {
    name: "a fact does not ask a goal among its arguments",
    file: core("evaluation/special-forms/logic.ts"),
    find: "  call.args.some(isQuestion)",
    replace: "  call.args.some(() => false)",
  },
  {
    name: "why writes a question's own variables as ?_",
    file: core("logic/terms.ts"),
    find: "        : shownName(variable),",
    replace: '        : "?_",',
  },
  {
    name: "a rule works out a question while it is being written",
    file: core("evaluation/special-forms/function.ts"),
    find: "    return closed.slice(1).some(isLive)",
    replace: "    return closed.slice(1).some(() => false)",
  },
  {
    name: "a constant call that fails fails the rule while it is written",
    file: core("evaluation/special-forms/function.ts"),
    find: "              writing ? waiting(fn, args, callee) : Effect.fail(error)",
    replace: "              Effect.fail(error)",
  },
  {
    name: "match does not ask the goal it is given",
    file: core("evaluation/special-forms/match.ts"),
    find: "              against(answered, environment)",
    replace: "              against(true, environment)",
  },
  // Asking what would hold after some changes.
  {
    name: "assuming makes its changes in the database itself",
    file: core("logic/database.ts"),
    find: "      copy.facts.set(name, facts.clone());",
    replace: "      copy.facts.set(name, facts);",
    tests: ASSUMING_TESTS,
  },
  {
    name: "assuming checks the changes it assumes against the invariants",
    file: core("logic/database.ts"),
    find: "  copy.rules = database.rules;\n  return copy;",
    replace:
      "  copy.rules = database.rules;\n  copy.invariants = database.invariants;\n  return copy;",
    tests: [...ASSUMING_TESTS, "src/logic/tests/waiting.test.ts"],
  },
  {
    name: "assuming leaves out its changes",
    file: core("logic/database.ts"),
    find: "        yield* makeChange(copy, change);",
    replace: "        yield* Effect.void;",
    tests: ASSUMING_TESTS,
  },
  {
    name: "assuming makes a rule form written in a fact change",
    file: core("evaluation/special-forms/logic.ts"),
    find: "        if (isTaken(item)) {",
    replace: '        if (form === "retract" && isTaken(item)) {',
    tests: ASSUMING_TESTS,
  },
  {
    name: "assuming keeps the invariant an assumed equality rule holds as",
    file: core("logic/database.ts"),
    find: "    return Effect.flatMap(compileRule(head, body), (rules) =>\n      addRules(database, rules)\n    );",
    replace: "    return addRule(database, head, body);",
    tests: ASSUMING_TESTS,
  },
  {
    name: "assuming adds and takes back rules in the database itself",
    file: core("logic/database.ts"),
    find: "        yield* makeChange(copy, change);",
    replace:
      '        yield* makeChange(change.form === "fact" ? copy : database, change);',
    tests: ASSUMING_TESTS,
  },
  {
    name: "assuming in a rule makes a rule it holds without the values the rule bound",
    file: core("logic/model.ts"),
    find: "          ? Effect.succeed(bound(change) as LogicForm)",
    replace: "          ? Effect.succeed(change)",
    tests: ASSUMING_TESTS,
  },
  {
    name: "a rule that asks assuming is followed through a change as other rules are",
    file: core("logic/maintain.ts"),
    find: "      termsOf(rule).some((term) => isOpaque(term) || assumes(term))",
    replace: "      termsOf(rule).some((term) => isOpaque(term))",
    tests: ASSUMING_TESTS,
  },
  {
    name: "assuming asks its expression of the database as it is",
    file: core("logic/database.ts"),
    find: "      return yield* reading(copy, (model) => answer(model, expression));",
    replace:
      "      return yield* reading(database, (model) => answer(model, expression));",
    tests: ASSUMING_TESTS,
  },
  {
    name: "assuming in a rule asks its expression without the values the rule bound",
    file: core("logic/model.ts"),
    find: "    return yield* home.assume(changes, bound(question.parts.at(-1)));",
    replace: "    return yield* home.assume(changes, question.parts.at(-1));",
    tests: ASSUMING_TESTS,
  },
  {
    name: "assuming as a goal holds whatever its expression gives",
    file: core("logic/model.ts"),
    find: '        typeof value === "boolean"\n          ? Effect.succeed(value)\n          : logicError(\n              `As a goal,',
    replace:
      '        typeof value === "boolean"\n          ? Effect.succeed(true)\n          : logicError(\n              `As a goal,',
    tests: ASSUMING_TESTS,
  },
  // Relations that merge what a key gets.
  {
    name: "a fact of a relation that merges replaces the fact its key has",
    file: core("logic/database.ts"),
    find: "  if (key !== undefined && merge === undefined) {",
    replace: "  if (key !== undefined) {",
    tests: MERGE_TESTS,
  },
  {
    name: "a relation that merges starts from its facts as rows",
    file: core("logic/model.ts"),
    find: "  return model.base === undefined && !merges",
    replace: "  return model.base === undefined",
    tests: MERGE_TESTS,
  },
  {
    name: "a change to the facts of a relation that merges is followed as a change to its rows",
    file: core("logic/database.ts"),
    find: "      candidates.has(name) ? factsName(name) : name,",
    replace: "      name,",
    tests: [...MERGE_TESTS, CANDIDATE_TESTS],
  },
  {
    name: "a plain head of a relation that merges does not merge",
    file: core("logic/compile.ts"),
    find: "      return kind === undefined ||",
    replace: "      return true ||",
    tests: MERGE_TESTS,
  },
  // The solver: whether values meet linear constraints, and which.
  {
    name: "a strict constraint over whole numbers is read as one that is not",
    file: core("logic/solver.ts"),
    find: '  return { coefficients, constant: c.relation === ">" ? value - 1n : value };',
    replace: "  return { coefficients, constant: value };",
    tests: SOLVER_TESTS,
  },
  {
    name: "the Omega test's dark shadow is its real shadow",
    file: core("logic/solver.ts"),
    find: "  const dark = shadowOf(lower, upper, others, (a, b) => (a - 1n) * (b - 1n));",
    replace: "  const dark = shadowOf(lower, upper, others, () => 0n);",
    tests: SOLVER_TESTS,
  },
  {
    name: "the Omega test never tries the grey shadow",
    file: core("logic/solver.ts"),
    find: "    for (let i = 0n; i <= last; i += 1n) {",
    replace: "    for (let i = 0n; i < 0n; i += 1n) {",
    tests: SOLVER_TESTS,
  },
  {
    name: "a value that is not equal to another is only above it",
    file: core("logic/solver.ts"),
    find: '          { linear: times(c.linear, negate(ONE)), relation: ">" as const },',
    replace: '          { linear: c.linear, relation: ">" as const },',
    tests: SOLVER_TESTS,
  },
  {
    name: "Fourier and Motzkin's method forgets that a bound is strict",
    file: core("logic/solver.ts"),
    find: '        relation: l.relation === ">" || u.relation === ">" ? ">" : ">=",',
    replace: '        relation: ">=",',
    tests: SOLVER_TESTS,
  },
  {
    name: "an equation whose coefficients divide its constant unevenly can hold",
    file: core("logic/solver.ts"),
    find: "  if (w.constant % g !== 0n) {",
    replace: "  if (false) {",
    tests: SOLVER_TESTS,
  },
  {
    name: "number/subtract on unknowns adds",
    file: core("logic/symbolic.ts"),
    find: "              : rest.reduce((a, b) => minus(a, b), first as Linear)",
    replace:
      "              : rest.reduce((a, b) => plus(a, b), first as Linear)",
    tests: SOLVING_TESTS,
  },
  {
    name: "number/absolute of an unknown forgets the negative case",
    file: core("logic/symbolic.ts"),
    find: "        sym: numberSym(times(x, negate(ONE))),",
    replace: "        sym: numberSym(x),",
    tests: SOLVING_TESTS,
  },
  {
    name: "number/min and number/max of unknowns choose the other one",
    file: core("logic/symbolic.ts"),
    find: "              ? minus(chosen, other)\n              : minus(other, chosen);",
    replace:
      "              ? minus(other, chosen)\n              : minus(chosen, other);",
    tests: SOLVING_TESTS,
  },
  {
    name: "a cond on unknowns forgets that its earlier tests failed",
    file: core("logic/symbolic.ts"),
    find: "      before = and(before, not(holds));",
    replace: "      before = and(before, TRUE);",
    tests: SOLVING_TESTS,
  },
  {
    name: "a solver step binds none of the variables a rule head needs",
    file: core("logic/compile.ts"),
    find: "      needed.has(name) ||",
    replace: "      false ||",
    tests: SOLVING_TESTS,
  },
  {
    name: "a solver step with nothing to keep keeps every answer",
    file: core("logic/model.ts"),
    find: "    return [...out.values()];\n  }).pipe(",
    replace: "    return first ? [vars] : [...out.values()];\n  }).pipe(",
    tests: SOLVING_TESTS,
  },
  {
    name: "a goal the solver cannot decide is refused instead of waiting for values",
    file: core("logic/model.ts"),
    find: "        waiting.push({ goal, why: done.failure });\n        return undefined;",
    replace:
      "        return yield* Effect.fail(new LogicError({ message: done.failure }));",
    tests: SOLVING_TESTS,
  },
  {
    name: "the goals that wait for a solver step's values never run",
    file: core("logic/model.ts"),
    find: "      answers = yield* testEach(model, goal, answers);",
    replace: "      answers = yield* Effect.succeed(answers);",
    tests: SOLVING_TESTS,
  },
  {
    name: "a goal that waits runs on one value of each variable it needs",
    file: core("logic/model.ts"),
    find: "      ...new Set([...answered, ...leavesOfChosen(needs, chosen)]),",
    replace: "      ...new Set([...answered]),",
    tests: SOLVING_TESTS,
  },
  {
    name: "a second '=' about a variable a solver step defines is dropped",
    file: core("logic/model.ts"),
    find: "        !(typing(literal) || step.defines.some(([, , by]) => by === literal))",
    replace: '        !(typing(literal) || isForm(literal, "="))',
    tests: SOLVING_TESTS,
  },
  {
    name: "a schema made from a value the solver works out is read as if it were known",
    file: core("logic/symbolic.ts"),
    find: "      if (mentions(second, context)) {",
    replace: "      if (false) {",
    tests: SOLVING_TESTS,
  },
  {
    name: "choosing one case of each builds every way before it checks how many",
    file: core("logic/symbols.ts"),
    find: "        // Stops at the first way past the most, before making the rest.\n        if (next.length > MOST_WAYS) {",
    replace:
      "        // Stops at the first way past the most, before making the rest.\n        if (false) {",
    tests: SOLVING_TESTS,
  },
  {
    name: "a find binds only the solved values its template shows",
    file: core("logic/compile.ts"),
    find: "  const planned = plan(goal, outer);",
    replace:
      "  const planned = plan(goal, outer, new Set(termVariables(template)));",
    tests: SOLVING_TESTS,
  },
  {
    name: "a rule that aggregates binds only the solved values its head shows",
    file: core("logic/compile.ts"),
    find: "      aggregating\n        ? undefined",
    replace: "      false\n        ? undefined",
    tests: SOLVING_TESTS,
  },
  {
    name: "a variable a solver step defines takes the value of its first case only",
    file: core("logic/model.ts"),
    find: "  product(names.map((name) => choice.symbols.get(name) as Cases)).map(",
    replace:
      "  product(names.map((name) => (choice.symbols.get(name) as Cases).slice(0, 1))).map(",
    tests: SOLVING_TESTS,
  },
  // Folds and questions over lists the solver works out (build step 3).
  {
    name: "a fold on solved values steps from its first value each time",
    file: core("logic/symbolic.ts"),
    find: "        const last = way.states.at(-1) as Sym;",
    replace: "        const last = way.states[0] as Sym;",
    tests: SOLVING_TESTS,
  },
  {
    name: "array/some? and array/every? on solved values swap",
    file: core("logic/symbolic.ts"),
    find: "            truthSym(some ? holds.reduce(or, FALSE) : holds.reduce(and, TRUE))",
    replace:
      "            truthSym(some ? holds.reduce(and, TRUE) : holds.reduce(or, FALSE))",
    tests: SOLVING_TESTS,
  },
  {
    name: "a variable in takes from a solved list is only its first item",
    file: core("logic/symbolic.ts"),
    find: "      if (pinned.length > 0) {",
    replace: "      if (at === 0 && pinned.length > 0) {",
    tests: SOLVING_TESTS,
  },
  {
    name: "a variable in takes from a solved list need not be one of its items",
    file: core("logic/model.ts"),
    find: "        (!taken ||",
    replace: "        (true ||",
    tests: SOLVING_TESTS,
  },
  {
    name: "in as a test of a solved list never holds",
    file: core("logic/symbolic.ts"),
    find: "                    (f, item) => or(f, equal(syms[0] as Sym, item)),",
    replace:
      "                    (f, item) => and(f, equal(syms[0] as Sym, item)),",
    tests: SOLVING_TESTS,
  },
  {
    name: "array/reductions repeats its first value",
    file: core("modules/array.ts"),
    find: "          states.push(next);",
    replace: "          states.push(states[0]);",
    tests: ["src/modules/tests/array.test.ts"],
  },
  {
    name: "array/some? and array/every? never stop early",
    file: core("modules/array.ts"),
    find: "        if (value === stop) {",
    replace: "        if (false) {",
    tests: ["src/modules/tests/array.test.ts"],
  },
  {
    name: "why explains a solved row with values other than the row's",
    file: core("logic/model.ts"),
    find: "): LogicEffect<Vars | undefined> =>\n  Effect.gen(function* () {\n    const step = withKnown(asked, vars);",
    replace:
      "): LogicEffect<Vars | undefined> =>\n  Effect.gen(function* () {\n    const step = asked;",
    tests: SOLVING_TESTS,
  },
  {
    name: "a schema closed over a lambda is listed when it runs, never solved for",
    file: core("logic/compile.ts"),
    find: "      ? second.variables.length > 0 || !(first instanceof LogicVariable)",
    replace: "      ? true",
    tests: SOLVING_TESTS,
  },
  {
    name: "a schema computed when the solver's step runs is never listed",
    file: core("logic/model.ts"),
    find: "        unlisted(yield* term(model, literal.parts[1], vars)) === undefined",
    replace: "        false",
    tests: LISTING_TESTS,
  },
  // Proofs, inclusion, and certificates (build step 4).
  {
    name: "a lambda written where the solver runs is refused",
    file: core("logic/symbolic.ts"),
    find: "        : Effect.succeed(one(closureOf(rest, where)));",
    replace: '        : refused("the form lambda");',
    tests: SOLVING_TESTS,
  },
  {
    name: "the solver runs a library call with the wrong number of arguments",
    file: core("logic/symbolic.ts"),
    find: "  if (args.length < least || args.length > most) {",
    replace: "  if (false) {",
    tests: SOLVING_TESTS,
  },
  {
    name: "schema/includes? says yes whatever value fails the other schema",
    file: core("logic/inclusion.ts"),
    find: "        if (satisfiable(constraints, sortsOf(constraints, sorts))) {",
    replace: "        if (false) {",
    tests: ["src/logic/tests/inclusion.test.ts"],
  },
  {
    name: "schema/includes? checks only the first listed value",
    file: core("logic/inclusion.ts"),
    find: "      for (const value of values) {",
    replace: "      for (const value of values.slice(0, 1)) {",
    tests: ["src/logic/tests/inclusion.test.ts"],
  },
  {
    name: "a certificate never tightens a given constraint over whole numbers",
    file: core("logic/certificate.ts"),
    find: "      whole(line) &&",
    replace: "      false &&",
    tests: ["src/logic/tests/solver.test.ts"],
  },
  {
    name: "tightening a line rounds its constant toward zero, not down",
    file: core("logic/certificate.ts"),
    find: '    constant: relation === "=" ? constant / g : floorDiv(constant, g),',
    replace: "    constant: constant / g,",
    tests: ["src/logic/tests/solver.test.ts"],
  },
  {
    name: "adding a strict line to a certificate's sum makes it not strict",
    file: core("logic/certificate.ts"),
    find: '      strict ||= line.relation === ">";',
    replace: "      strict ||= false;",
    tests: ["src/logic/tests/solver.test.ts"],
  },
  {
    name: "the checker lets an inequality be taken away",
    file: core("logic/certificate.ts"),
    find: '          (m < 0 && (lines[at] as Whole).relation !== "=")',
    replace: "          false",
    tests: ["src/logic/tests/solver.test.ts"],
  },
  {
    name: "an equation that removes a variable keeps its sign whatever it is",
    file: core("logic/certificate.ts"),
    find: "    const sign = e < 0n ? -1n : 1n;",
    replace: "    const sign = 1n;",
    tests: ["src/logic/tests/solver.test.ts"],
  },
  {
    name: "why never shows a certificate",
    file: core("logic/explain.ts"),
    find: "      ...(certificate === undefined ? {} : { certificate }),",
    replace: "      ...{},",
    tests: SOLVING_TESTS,
  },
  // A schema that stands for each value it allows.
  {
    name: "a schema binds its value to a listed value without checking that it fits",
    file: core("logic/model.ts"),
    find: "      for (const fit of yield* match(model, schema, each, vars, false)) {",
    replace: "        for (const fit of [vars]) {",
    tests: LISTING_TESTS,
  },
  {
    name: "a listed record always has a key whose schema is optional",
    file: core("logic/listing.ts"),
    find: '        builtAs(part, "schema/optional") !== undefined',
    replace: "        false",
    tests: LISTING_TESTS,
  },
  {
    name: "schema/anyOf lists only what its first schema lists",
    file: core("logic/listing.ts"),
    find: "        : () => parts.flatMap((part) => part());",
    replace: "        : () => parts.slice(0, 1).flatMap((part) => part());",
    tests: LISTING_TESTS,
  },
  {
    name: "the empty list is not among the lists of at most so many items",
    file: core("logic/listing.ts"),
    find: "        const lists: unknown[][] = [[]];",
    replace: "        const lists: unknown[][] = [];",
    tests: LISTING_TESTS,
  },
  {
    name: "a named schema met again at the same value lists itself again",
    file: core("logic/listing.ts"),
    find: "      return () => [];",
    replace: "      return listing(named.shape, inward(path));",
    tests: LISTING_TESTS,
  },
  {
    name: "a predicate that says which values it accepts lists none",
    file: core("logic/listing.ts"),
    find: "    return () => allowed;",
    replace: "    return () => [];",
    tests: LISTING_TESTS,
  },
  {
    name: "a list may have more items than the most schema/arrayOf gives",
    file: core("logic/fit.ts"),
    find: "      (most === undefined || value.length <= (most as number))",
    replace: "      true",
    tests: [...LISTING_TESTS, "src/logic/tests/schemas.test.ts"],
  },
  {
    name: "schema/fits? never binds the value it checks",
    file: core("logic/compile.ts"),
    find: "      : unlisted(second) === undefined)",
    replace: "      : false)",
    tests: LISTING_TESTS,
  },
  {
    name: "a schema lists its values even where a relation goal could bind the value",
    file: core("logic/compile.ts"),
    find: "      (literal) => !(literal instanceof Atom || lists(literal, bound, scope))",
    replace: "      (literal) => !(literal instanceof Atom)",
    tests: LISTING_TESTS,
  },
  // Schemas, and the invariants a change to facts can break.
  {
    name: "the rest of a record or list is never checked",
    file: core("logic/fit.ts"),
    find: "      found.push(...(yield* checkRest(rest, left, at, answered, whole, shift)));",
    replace: "      found.push(answered);",
    tests: REST_TESTS,
  },
  {
    name: "the rest of a record holds the keys the record names too",
    file: core("logic/fit.ts"),
    find: "        Object.fromEntries(others.map((key) => [key, value[key]])),",
    replace: "        value,",
    tests: REST_TESTS,
  },
  {
    name: "the rest of a list holds the items the list names too",
    file: core("logic/fit.ts"),
    find: "        value.slice(parts.length),",
    replace: "        value,",
    tests: REST_TESTS,
  },
  {
    name: "a problem in the rest of a list is shown at its place in the rest",
    file: core("logic/fit.ts"),
    find: '              typeof step === "number" ? step + shift : step,',
    replace: "              step,",
    tests: REST_TESTS,
  },
  {
    name: "a variable for the rest of a known record is not a pattern",
    file: core("logic/terms.ts"),
    find: "    (others.length > 0 && !(first instanceof LogicValue));",
    replace: "    false;",
    tests: REST_TESTS,
  },
  {
    name: "a predicate that answers something other than true still fits",
    file: core("logic/fit.ts"),
    find: "        : Effect.succeed(result === true)",
    replace: "        : Effect.succeed(Boolean(result))",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a schema that asks about itself is never checked again assuming it fits",
    file: core("logic/fit.ts"),
    find: "    if (entry.refused === undefined && entry.used && answers.length > 0) {",
    replace: "    if (false) {",
    tests: SELF_REFERENCE_TESTS,
  },
  {
    name: "a schema checked again keeps assuming the value does not fit",
    file: core("logic/fit.ts"),
    find: "      entry.assumed = true;",
    replace: "      entry.assumed = false;",
    tests: SELF_REFERENCE_TESTS,
  },
  {
    name: "a schema with no consistent answer answers that the value does not fit",
    file: core("logic/fit.ts"),
    find: "      if (entry.refused === undefined && answers.length === 0) {",
    replace: "      if (false) {",
    tests: SELF_REFERENCE_TESTS,
  },
  {
    name: "a schema asked about the same value through a predicate is refused",
    file: core("logic/fit.ts"),
    find: "    if (again || sameValue(value, earlier.value)) {",
    replace: "    if (again) {",
    tests: SELF_REFERENCE_TESTS,
  },
  {
    name: "a schema asked about a value no smaller than its own does not fit, and is not refused",
    file: core("logic/fit.ts"),
    find: "    earlier.refused ??= { value };",
    replace: "    earlier.used = earlier.used;",
    tests: SELF_REFERENCE_TESTS,
  },
  {
    name: "a predicate that fails fits",
    file: core("logic/fit.ts"),
    find: "      () => Effect.succeed(false)",
    replace: "      () => Effect.succeed(true)",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a schema behind a name is not optional, and is no record to open",
    file: core("logic/fit.ts"),
    find: "    : unnamed(named.shape, seen.add(schema));",
    replace: "    : schema;",
    tests: [
      "src/logic/tests/schemas.test.ts",
      "src/logic/tests/groups.test.ts",
    ],
  },
  {
    name: "a record's missing key is no problem",
    file: core("logic/fit.ts"),
    find: "    } else if (optional === undefined) {",
    replace: "    } else if (false) {",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a schema that comes back to itself is checked forever",
    file: core("logic/fit.ts"),
    find: "  const again = at.open.has(named);",
    replace: "  const again = false && at.open.has(named);",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a schema that names itself never fits a part of the value",
    file: core("logic/fit.ts"),
    find: "  ...at,\n  open: NOT_OPEN,\n",
    replace: "  ...at,\n",
    tests: [
      "src/logic/tests/schemas.test.ts",
      "src/logic/tests/groups.test.ts",
    ],
  },
  {
    name: "a list fits a longer list",
    file: core("logic/fit.ts"),
    find: "    (rest === NOTHING_LEFT && value.length > parts.length)",
    replace: "    false",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "problems come in the order they were found",
    file: core("logic/fit.ts"),
    find: "      out.sort(byPath)",
    replace: "      out",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a part that does not fit does not stop a value from fitting",
    file: core("logic/fit.ts"),
    find: "      } else if (at.write === undefined) {\n        return NONE;\n      } else {\n        fits = false;\n      }",
    replace:
      "      } else if (at.write !== undefined) {\n        fits = false;\n      }",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a problem shows the schema where the value belongs",
    file: core("logic/fit.ts"),
    find: "      ...(value === undefined ? {} : { found: render(value) }),",
    replace: "      ...(value === undefined ? {} : { found: write(schema) }),",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a string that is a name is written like the name",
    file: core("logic/fit.ts"),
    find: "  return (schema: unknown) => expression(schema, (text) => names.has(text));",
    replace: "  return (schema: unknown) => expression(schema);",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "schema/allOf checks only its first schema",
    file: core("logic/fit.ts"),
    find: "    every(parts, at, vars, (part, answered) => check(part, value, at, answered))",
    replace:
      "    every(parts.slice(0, 1), at, vars, (part, answered) => check(part, value, at, answered))",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "schema/anyOf fits a value that fits none",
    file: core("logic/fit.ts"),
    find: "      return found.size === 0\n        ? fail(at, { schema, value })\n        : [...found.values()];",
    replace: "      return found.size === 0 ? [vars] : [...found.values()];",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "schema/arrayOf checks no item",
    file: core("logic/fit.ts"),
    find: "      ? every(value.entries(), at, vars, ([index, part], answered) =>",
    replace: "      ? every([], at, vars, ([index, part], answered) =>",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "schema/recordOf checks no value",
    file: core("logic/fit.ts"),
    find: "      ? every(Object.entries(value), at, vars, ([key, part], answered) =>",
    replace: "      ? every([], at, vars, ([key, part], answered) =>",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a record fits a record with keys it does not name",
    file: core("logic/fit.ts"),
    find: "  if (rest === NOTHING_LEFT) {\n    for (const key of others) {",
    replace:
      "  if (rest === NOTHING_LEFT) {\n    for (const key of [] as string[]) {",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "schema/fits? takes the schema for the value",
    file: core("logic/fit.ts"),
    find: "      : yield* fits(values[1], values[0]).pipe(",
    replace: "      : yield* fits(values[0], values[1]).pipe(",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "schema/assert returns a value that does not fit",
    file: core("modules/schema.ts"),
    find: "      message === undefined ? Effect.succeed(value) : logicError(message)",
    replace:
      "      message === undefined || true ? Effect.succeed(value) : logicError(message)",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "match takes a branch the value does not fit",
    file: core("evaluation/special-forms/match.ts"),
    find: "        if (fit) {",
    replace: "        if (!fit) {",
    tests: [
      "src/logic/tests/schemas.test.ts",
      "src/evaluation/tests/special-forms/match.test.ts",
    ],
  },
  {
    name: "a rule may ask through a named schema about its own head",
    file: core("logic/strata.ts"),
    find: "    return named.definition === undefined ? NONE : [named.definition];",
    replace: "    return NONE;",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a rule may ask through a built schema about its own head",
    file: core("logic/strata.ts"),
    find: "      return buildOf(term)?.args ?? NONE;",
    replace: "      return NONE;",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a schema can be declared again with another shape",
    file: core("logic/database.ts"),
    find: "    if (key === undefined || key !== logicKey(declaration.definition)) {",
    replace: "    if (key === undefined) {",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a schema can take the name of a relation",
    file: core("logic/database.ts"),
    find: "    if (database.relations.has(name)) {",
    replace: "    if (false) {",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a relation can take the name of a schema",
    file: core("logic/database.ts"),
    find: "  if (database.schemas.has(name)) {",
    replace: "  if (false) {",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a broken schema invariant does not say where the answer does not fit",
    file: core("logic/database.ts"),
    find: '    const where =\n      rows.length === 0 ? "" : yield* misfitOf(database, goal, exampleOf(rows));',
    replace: '    const where = "";',
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "the relation option schema adds no invariant",
    file: core("evaluation/special-forms/logic.ts"),
    find: "    if (schema !== undefined && rowSchema !== undefined) {",
    replace:
      "    if (false && schema !== undefined && rowSchema !== undefined) {",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a shape sees names that are redefined after it is declared",
    file: core("evaluation/special-forms/logic.ts"),
    find: "      const shape = yield* resolve(definition).pipe(declaring(name));",
    replace:
      "      const shape = yield* evaluate(form).pipe(\n        Effect.provideService(LionEnvironmentService, scope),\n        declaring(name)\n      );",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a shape may ask the database while it is declared",
    file: core("evaluation/special-forms/logic.ts"),
    find: "      const shape = yield* resolve(definition).pipe(declaring(name));",
    replace: "      const shape = yield* resolve(definition);",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a later run does not find a schema under its name",
    file: core("evaluation/evaluate.ts"),
    find: "          ...schemaBindings(database),\n",
    replace: "",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a snapshot leaves the schemas out",
    file: core("logic/snapshot.ts"),
    find: "      forms.push(...schemaForms(database, goal));",
    replace: "      forms.push();",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a snapshot writes a string that names a schema without quote",
    file: core("logic/snapshot.ts"),
    find: "      database.schemas.has(text) ||\n",
    replace: "",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a function that another built has no written form",
    file: core("logic/terms.ts"),
    find: "  if (built !== undefined) {\n    return [",
    replace: "  if (false && built !== undefined) {\n    return [",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a list that holds a function is written as a bare list",
    file: core("logic/terms.ts"),
    find: '    return ["array/make", ...item.map(inner)];',
    replace: "    return item.map(inner);",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a lambda inside a value a rule holds keeps its scope",
    file: core("evaluation/special-forms/lambda.ts"),
    find: "    return closeHolder(value, closed);",
    replace: "    return Effect.succeed(value);",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "an invariant that expects no answers is not asked about new rows",
    file: core("logic/database.ts"),
    find: '    if (invariant.assert !== "none") {\n      return Effect.succeed(false);\n    }',
    replace:
      '    if (invariant.assert === "none") {\n      return Effect.succeed(true);\n    }',
    tests: [
      "src/logic/tests/incremental.test.ts",
      "src/logic/tests/invariants.test.ts",
    ],
  },
  {
    name: "an invariant that expects some answers is asked only about new rows",
    file: core("logic/database.ts"),
    find: '    if (invariant.assert !== "none") {\n      return Effect.succeed(false);\n    }\n',
    replace: "",
    tests: [
      "src/logic/tests/incremental.test.ts",
      "src/logic/tests/invariants.test.ts",
    ],
  },
  {
    name: "a relation that rules derive counts as holding only facts",
    file: core("logic/database.ts"),
    find: "      relation.computed !== undefined ||\n      edges.has(relation.name)",
    replace: "      relation.computed !== undefined",
    tests: [
      "src/logic/tests/incremental.test.ts",
      "src/logic/tests/invariants.test.ts",
    ],
  },
  {
    name: "a question in an argument of an invariant's goal is not seen",
    file: core("logic/database.ts"),
    find: "      pending.push(...(literal as Atom).args.flatMap(mentioned));\n",
    replace: "",
    tests: [
      "src/logic/tests/incremental.test.ts",
      "src/logic/tests/invariants.test.ts",
    ],
  },
  {
    name: "what a rule reads is not what an invariant reads through it",
    file: core("logic/database.ts"),
    find: "      names.push(...(edges.get(name) ?? []));\n",
    replace: "",
    tests: [
      "src/logic/tests/incremental.test.ts",
      "src/logic/tests/invariants.test.ts",
    ],
  },
  {
    name: "what a graph algorithm reads is not what an invariant reads",
    file: core("logic/database.ts"),
    find: "    name,\n    ...(computed?.dependencies ?? []),",
    replace: "    name,",
    tests: [
      "src/logic/tests/incremental.test.ts",
      "src/logic/tests/invariants.test.ts",
    ],
  },
  {
    name: "an invariant keeps what it read before a rule was added",
    file: core("logic/database.ts"),
    find: "  if (known?.rules === database.rules) {",
    replace: "  if (known !== undefined) {",
    tests: [
      "src/logic/tests/incremental.test.ts",
      "src/logic/tests/invariants.test.ts",
    ],
  },
  {
    name: "a change says it added no rows",
    file: core("logic/database.ts"),
    find: "      const into = count > 0 ? gained : lost;",
    replace: "      const into = lost;",
    tests: [
      "src/logic/tests/incremental.test.ts",
      "src/logic/tests/invariants.test.ts",
    ],
  },
  {
    name: "a check on new rows that fails counts as passing",
    file: core("logic/database.ts"),
    find: "      Effect.orElseSucceed(() => false)",
    replace: "      Effect.orElseSucceed(() => true)",
    tests: [
      "src/logic/tests/incremental.test.ts",
      "src/logic/tests/invariants.test.ts",
    ],
  },
  {
    name: "schema/open refuses keys the record does not name",
    file: core("logic/fit.ts"),
    find: "      const left = rest.length === 0 ? ANYTHING_LEFT : rest[0];",
    replace: "      const left = rest.length === 0 ? NOTHING_LEFT : rest[0];",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a predicate that names nothing bound is only a schema nothing fits",
    file: core("logic/fit.ts"),
    find: "        !(error instanceof WaitingError || error instanceof UnboundNameError),",
    replace: "        !(error instanceof WaitingError),",
    tests: ["src/evaluation/tests/names.test.ts"],
  },
  {
    name: "a relation with several columns is a schema that nothing fits",
    file: core("logic/fit.ts"),
    find: "  if (relation !== undefined && relation.columns.length !== 1) {",
    replace: "  if (false) {",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "names that only lead to each other are followed forever",
    file: core("logic/fit.ts"),
    find: "  return named?.definition === undefined || seen.has(schema)",
    replace: "  return named?.definition === undefined",
    tests: ["src/logic/tests/groups.test.ts"],
  },
  {
    name: "a shape may call a schema that its own form declares",
    file: core("logic/fit.ts"),
    find: "    if (named.definition === undefined) {\n      return logicError(",
    replace: "    if (false) {\n      return logicError(",
    tests: ["src/logic/tests/groups.test.ts"],
  },
  {
    name: "schema/open around a name that is no record quietly fits nothing",
    file: core("logic/fit.ts"),
    find: "      return recordOf(shape) === undefined\n        ? logicError(",
    replace: "      return recordOf(shape) === null\n        ? logicError(",
    tests: ["src/logic/tests/groups.test.ts"],
  },
  {
    name: "a variable in a schema takes a new value when it has one",
    file: core("logic/fit.ts"),
    find: "    if (vars.has(term.name)) {\n      return check(vars.get(term.name), value, at, vars);\n    }\n",
    replace: "",
    tests: ["src/logic/tests/patterns.test.ts"],
  },
  {
    name: "schema/anyOf gives a rule only the answers of its first schema that fits",
    file: core("logic/fit.ts"),
    find: "        if (answers.length > 0 && at.term === undefined) {",
    replace: "        if (answers.length > 0) {",
    tests: ["src/logic/tests/patterns.test.ts"],
  },
  {
    name: "= asks a function in a pattern, as a schema does",
    file: core("logic/fit.ts"),
    find: '  if (!at.equal) {\n    if (typeof schema === "function") {',
    replace: '  if (true) {\n    if (typeof schema === "function") {',
    tests: ["src/logic/tests/patterns.test.ts"],
  },
  {
    name: "schema/open around a variable binds it instead of waiting for it",
    file: core("logic/terms.ts"),
    find: "  const isPattern =\n    ofPattern === false ||\n    patternParts(first, true) !== undefined ||\n    (others.length > 0 && !(first instanceof LogicValue));",
    replace: "  const isPattern = true;",
    tests: ["src/logic/tests/patterns.test.ts"],
  },
  {
    name: "= does not take a pattern apart",
    file: core("logic/model.ts"),
    find: "      return hasFree(pattern, vars)\n        ? yield* match(",
    replace:
      "      return false && hasFree(pattern, vars)\n        ? yield* match(",
    tests: ["src/logic/tests/patterns.test.ts"],
  },
  {
    name: "in does not take a pattern apart",
    file: core("logic/model.ts"),
    find: "    if (!hasFree(first, vars)) {\n      return undefined;\n    }",
    replace: "    if (true) {\n      return undefined;\n    }",
    tests: ["src/logic/tests/patterns.test.ts"],
  },
  {
    name: "a pattern among a relation's arguments matches every row",
    file: core("logic/model.ts"),
    find: "    for (const [position, pattern] of found.patterns) {",
    replace:
      "    for (const [position, pattern] of [] as typeof found.patterns) {",
    tests: ["src/logic/tests/patterns.test.ts"],
  },
  {
    name: "the facts of a relation whose rules aggregate are rows, not candidates",
    file: core("logic/database.ts"),
    find: "    if (relation !== undefined) {\n      rules.push(\n        made(IMPLIED,",
    replace: "    if (false) {\n      rules.push(\n        made(IMPLIED,",
    tests: [CANDIDATE_TESTS],
  },
  {
    name: "a plain rule beside rules that aggregate gives rows, not candidates",
    file: core("logic/database.ts"),
    find: "        made(MERGED, rule, merge, () => {",
    replace: "        rule ?? made(MERGED, rule, merge, () => {",
    tests: [CANDIDATE_TESTS],
  },
  {
    name: "retract leaves a rule in place",
    file: core("logic/database.ts"),
    find: "      written.filter((rule) => !gone(rule.key, rules))",
    replace: "      written",
    tests: [CANDIDATE_TESTS],
  },
  {
    name: "retract leaves an invariant in place",
    file: core("logic/database.ts"),
    find: "        (invariant) => !gone(invariant.key, invariants)",
    replace: "        () => true",
    tests: [CANDIDATE_TESTS],
  },
  {
    name: "retract takes back facts alone",
    file: core("logic/database.ts"),
    find: "    const forms = items.filter((item) => item instanceof LogicForm);",
    replace: "    const forms = items.filter(() => false);",
    tests: [CANDIDATE_TESTS, ...ASSUMING_TESTS],
  },
  {
    name: "a retract of facts and rules keeps what was derived from the facts",
    file: core("logic/database.ts"),
    find: "            touched.size > 0\n              ? Effect.sync(() => touch(database))\n              : renew(database, before)",
    replace: "            renew(database, before)",
    tests: ["src/logic/tests/invariants.test.ts"],
  },
  {
    name: "a merge takes only lattice aggregates",
    file: core("logic/database.ts"),
    find: "const MERGES = Object.keys(AGGREGATORS).map(",
    replace: "const MERGES = LATTICE_AGGREGATES.map(",
    tests: [CANDIDATE_TESTS],
  },
  {
    name: "why tells a relation's facts as a way a row could be derived",
    file: core("logic/explain.ts"),
    find: "      ({ equates, given }) => !(equates || given)",
    replace: "      ({ equates }) => !equates",
    tests: ["src/logic/tests/why-not.test.ts"],
  },
  {
    name: "a string that reads as a misspelled name is a string",
    file: core("evaluation/base-forms/primitive.ts"),
    find: "  if (isNamespacedName(name) && scope !== undefined) {",
    replace: "  if (false) {",
    tests: ["src/evaluation/tests/names.test.ts"],
  },
  {
    name: "a string is a name once something binds it, wherever it was written",
    file: core("evaluation/base-forms/primitive.ts"),
    find: "  return () => name;\n};",
    replace:
      "  return (environment) => {\n    const value = lookup(environment, name);\n    return value === UNBOUND ? name : value;\n  };\n};",
    tests: [SCOPE_TESTS],
  },
  {
    name: "a define inside a lambda binds a global",
    file: core("evaluation/special-forms/define.ts"),
    find: "      setLocalBinding(environment, id, made);",
    replace:
      "      let top = environment;\n      while (top.parent !== undefined) top = top.parent;\n      top.bindings.set(id, made);",
    tests: ["src/evaluation/tests/special-forms/define.test.ts"],
  },
  {
    name: "a body does not declare the names it defines",
    file: core("evaluation/hoisting.ts"),
    find: "  walk(body);\n  return [...new Set(names)];",
    replace: "  return [];",
    tests: [SCOPE_TESTS],
  },
  {
    name: "a binding of a form's name leaves the form a form",
    file: core("evaluation/base-forms/array.ts"),
    find: "  if (!isSpecialFormName(head) || declares(scope, head)) {",
    replace: "  if (!isSpecialFormName(head)) {",
    tests: [SCOPE_TESTS, "src/evaluation/tests/special-forms/define.test.ts"],
  },
  {
    name: "an array that names a form but has another shape is a call",
    file: core("evaluation/base-forms/array.ts"),
    find: "  if (!fitsForm(head, expression)) {",
    replace:
      "  if (!fitsForm(head, expression)) {\n    return compileFunctionCall(expression as never, scope);\n  }\n  if (false) {",
    tests: [SCOPE_TESTS],
  },
  {
    name: "a condition may be any value, true when JavaScript says so",
    file: core("evaluation/special-forms/cond.ts"),
    find: '    typeof holds === "boolean"\n      ? holds',
    replace: "    true\n      ? Boolean(holds)",
    tests: [SCOPE_TESTS],
  },
  {
    name: "set! binds a name no scope declares",
    file: core("evaluation/special-forms/set.ts"),
    find: "  if (!declares(scope, id)) {",
    replace: "  if (false) {",
    tests: [SCOPE_TESTS],
  },
  {
    name: "a misspelled name suggests no other",
    file: core("evaluation/base-forms/primitive.ts"),
    find: "    if (edits < fewest) {",
    replace: "    if (false) {",
    tests: ["src/evaluation/tests/names.test.ts"],
  },
  {
    name: "a misspelled name suggests one three letters away",
    file: core("evaluation/base-forms/primitive.ts"),
    find: "const MAX_EDITS = 2;",
    replace: "const MAX_EDITS = 3;",
    tests: ["src/evaluation/tests/names.test.ts"],
  },
  {
    name: "a rule finds a misspelled name only when it runs",
    file: core("evaluation/special-forms/lambda.ts"),
    find: "      } else if (!quoted && isNamespacedName(name)) {",
    replace: "      } else if (false) {",
    tests: ["src/evaluation/tests/names.test.ts"],
  },
  {
    name: "a rule takes a quoted module/name for a name",
    file: core("evaluation/special-forms/lambda.ts"),
    find: "      } else if (!quoted && isNamespacedName(name)) {",
    replace: "      } else if (isNamespacedName(name)) {",
    tests: ["src/evaluation/tests/names.test.ts"],
  },
  {
    name: "a name a shape uses as a string can be declared later",
    file: core("logic/database.ts"),
    find: "    if (schemaOf(schema)?.strings.has(name)) {",
    replace: "    if (false) {",
    tests: ["src/logic/tests/groups.test.ts"],
  },
  {
    name: "a string a shape quotes keeps its name from being declared",
    file: core("evaluation/special-forms/lambda.ts"),
    find: "      quoted || isLogicVariableName(name) || isSpecialFormName(name);",
    replace: "      isLogicVariableName(name) || isSpecialFormName(name);",
    tests: ["src/logic/tests/groups.test.ts"],
  },
  {
    name: "a snapshot leaves out a schema added beside one the database held",
    file: core("logic/database.ts"),
    find: "      info.group = group;",
    replace: "      info.group = names;",
    tests: ["src/logic/tests/groups.test.ts"],
  },
  {
    name: "a snapshot writes schemas that name each other in forms of their own",
    file: core("logic/snapshot.ts"),
    find: "    const group = schemaOf(schema)?.group ?? [];",
    replace: '    const group = [schemaOf(schema)?.name ?? ""];',
    tests: ["src/logic/tests/groups.test.ts"],
  },
  {
    name: "a function from the host inside a goal or a schema is not seen",
    file: core("logic/strata.ts"),
    find: "  const opaque = !isData || parts.some((part) => holdsOpaque(part, open));",
    replace: "  const opaque = !isData;",
    tests: [
      "src/logic/tests/incremental.test.ts",
      "src/logic/tests/invariants.test.ts",
    ],
  },
  {
    name: "a function from the host in a rule behind an invariant is not seen",
    file: core("logic/database.ts"),
    find: "          (rule.body.some(isOpaque) || head.args.some(isOpaque))",
    replace: "          false",
    tests: [
      "src/logic/tests/incremental.test.ts",
      "src/logic/tests/invariants.test.ts",
    ],
  },
  {
    name: "a relation call takes a function among its arguments for a value no row equals",
    file: core("logic/model.ts"),
    find: "    if (isData(value)) {\n      positions.push(position);",
    replace: "    if (true) {\n      positions.push(position);",
    tests: ["src/logic/tests/patterns.test.ts"],
  },
  {
    name: "a variable can hand a graph algorithm an input that is not data",
    file: core("logic/model.ts"),
    find: "    } else if (position < inputs) {",
    replace: "    } else if (false) {",
    tests: ["src/logic/tests/patterns.test.ts"],
  },
  {
    name: "a schema in a relation call gives one answer where it fits a row in several ways",
    file: core("logic/model.ts"),
    find: "        next.push(\n          ...(yield* match(model, pattern, tuple[position], answered, false))\n        );",
    replace:
      "        next.push(\n          ...(yield* match(model, pattern, tuple[position], answered, false)).slice(0, 1)\n        );",
    tests: ["src/logic/tests/patterns.test.ts"],
  },
  {
    name: "a relation call matches a pattern among its arguments by equality",
    file: core("logic/model.ts"),
    find: "          ...(yield* match(model, pattern, tuple[position], answered, false))",
    replace:
      "          ...(yield* match(model, pattern, tuple[position], answered, true))",
    tests: ["src/logic/tests/patterns.test.ts"],
  },
  {
    name: "a goal under not ignores a schema among a relation call's arguments",
    file: core("logic/model.ts"),
    find: "  if (found.patterns.length > 0) {\n    return Effect.map(",
    replace: "  if (false) {\n    return Effect.map(",
    tests: ["src/logic/tests/patterns.test.ts"],
  },
  {
    name: "why names a row that a relation goal did not match",
    file: core("logic/explain.ts"),
    find: "    const tuple = yield* matchedRow(telling.model, goal, vars);",
    replace:
      "    const tuple = yield* tupleOf(telling.model, goal.args, vars);",
    tests: ["src/logic/tests/patterns.test.ts"],
  },
  {
    name: "a goal-directed query fails on a schema that a variable holds",
    file: core("logic/database.ts"),
    find: "        (error) => error === UNDIRECTED,",
    replace: "        () => false,",
    tests: ["src/logic/tests/patterns.test.ts"],
  },
  {
    name: "what a predicate answers is not worked out for the rule's variables",
    file: core("logic/fit.ts"),
    find: "        result instanceof LogicValue\n          ? term(result, vars)",
    replace: "        false\n          ? term(result, vars)",
    tests: ["src/logic/tests/patterns.test.ts"],
  },
  {
    name: "a relation call cannot run until the variables in a schema among its arguments are bound",
    file: core("logic/compile.ts"),
    find: "    (arg, position) => (free(arg, true) && position >= inputs) || known(arg)",
    replace:
      "    (arg, position) => (free(arg) && position >= inputs) || known(arg)",
    tests: ["src/logic/tests/patterns.test.ts"],
  },
  {
    name: "a schema among a relation call's arguments binds nothing for the goals after it",
    file: core("logic/compile.ts"),
    find: "  return goal.parts.flatMap((part) => holes(part, goal instanceof Atom));",
    replace: "  return goal.parts.flatMap((part) => holes(part, false));",
    tests: ["src/logic/tests/patterns.test.ts"],
  },
  {
    name: "a string in a module that has other names is data",
    file: core("evaluation/base-forms/primitive.ts"),
    find: "  return inModule || nearest !== null",
    replace: "  return nearest !== null",
    tests: ["src/evaluation/tests/names.test.ts"],
  },
  {
    name: "a string a letter away from a bound name is data",
    file: core("evaluation/base-forms/primitive.ts"),
    find: "  return inModule || nearest !== null",
    replace: "  return inModule",
    tests: ["src/evaluation/tests/names.test.ts"],
  },
  {
    name: "every unbound string with a slash in it is a misspelled name",
    file: core("evaluation/base-forms/primitive.ts"),
    find: "  return inModule || nearest !== null",
    replace: "  return true",
    tests: ["src/evaluation/tests/names.test.ts"],
  },
  {
    name: "a name that is not of the form module/name is suggested for one that is",
    file: core("evaluation/base-forms/primitive.ts"),
    find: "  for (const candidate of [...names].filter(isNamespacedName).sort()) {",
    replace: "  for (const candidate of [...names].sort()) {",
    tests: ["src/evaluation/tests/names.test.ts"],
  },
  {
    name: "a function built from a variable hides the variable from the goal that holds it",
    file: core("evaluation/special-forms/lambda.ts"),
    find: "      if (!waits && copies.every((copy, at) => copy === parts[at])) {",
    replace: "      if (copies.every((copy, at) => copy === parts[at])) {",
    tests: ["src/logic/tests/patterns.test.ts"],
  },
  {
    name: "a relation call holds a lambda among its arguments as it is, and not closed",
    file: core("evaluation/special-forms/function.ts"),
    find: "    return relationOf(fn) === undefined || args.every(isHeld)",
    replace: "    return true",
    tests: ["src/logic/tests/patterns.test.ts"],
  },
  {
    name: "a predicate whose answer still waits is taken for one the value does not fit",
    file: core("logic/fit.ts"),
    find: "        ? Effect.fail(new WaitingError({ value: result }))",
    replace: "        ? Effect.succeed(false)",
    tests: ["src/logic/tests/patterns.test.ts"],
  },
  {
    name: "a schema called with two arguments checks the first",
    file: core("logic/fit.ts"),
    find: "  const schema: LionFunction = takes(\n    1,",
    replace: "  const schema: LionFunction = takes(\n    atLeast(1),",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a schema function that takes one schema takes any number",
    file: core("logic/fit.ts"),
    find: "    takes(\n      count,",
    replace: "    takes(\n      atLeast(0),",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "schema/fits?, schema/problems, and schema/assert ignore an argument too many",
    file: core("logic/fit.ts"),
    find: ') => takes(2, check, "a value and a schema");',
    replace: ') => takes(atLeast(2), check, "a value and a schema");',
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "the relation option schema takes a name nothing is declared under",
    file: core("evaluation/special-forms/logic.ts"),
    find: "    if (schema !== undefined && rowSchema === undefined) {",
    replace: "    if (false) {",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "the relation option schema takes a shape written in place",
    file: core("evaluation/special-forms/logic.ts"),
    find: '    if (!(schema === undefined || typeof schema === "string")) {',
    replace: "    if (false) {",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "a shape that waits for a logic variable is declared",
    file: core("evaluation/special-forms/logic.ts"),
    find: "      if (shape instanceof LogicValue) {",
    replace: "      if (false) {",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "the schema form takes a name that is not one",
    file: core("evaluation/special-forms/logic.ts"),
    find: "    if (misnamed !== undefined || shapes.length !== names.length) {",
    replace: "    if (shapes.length !== names.length) {",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "the schema form takes a name with no shape",
    file: core("evaluation/special-forms/logic.ts"),
    find: "    if (misnamed !== undefined || shapes.length !== names.length) {",
    replace: "    if (misnamed !== undefined) {",
    tests: ["src/logic/tests/schemas.test.ts"],
  },
  {
    name: "value/integer? is true for every number",
    file: core("modules/value.ts"),
    find: '  "integer?": is(Number.isInteger),',
    replace: '  "integer?": is((a) => typeof a === "number"),',
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "value/any? is false for null",
    file: core("modules/value.ts"),
    find: '  "any?": is(() => true),',
    replace: '  "any?": is((a) => a !== null),',
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "the analysis reads a string a scope declares as data",
    file: core("analysis/analyze.ts"),
    find: '  if (binding !== undefined) {\n    return [{ kind: "name", binding }];',
    replace:
      '  if (binding === null) {\n    return [{ kind: "name", binding }];',
    tests: [ANALYSIS_TESTS],
  },
  {
    name: "the analysis leaves out what a lambda's body defines",
    file: core("analysis/analyze.ts"),
    find: "    bodyNames(names, body, context.scope),",
    replace: "    names,",
    tests: [ANALYSIS_TESTS],
  },
  {
    name: "the analysis leaves out what the program defines at its top",
    file: core("analysis/analyze.ts"),
    find: "    new Set([...host.bindings.keys(), ...defined, ...declared]),",
    replace: "    new Set([...host.bindings.keys(), ...declared]),",
    tests: [ANALYSIS_TESTS],
  },
  {
    name: "the analysis reads a lambda's body in the scope around the lambda",
    file: core("analysis/analyze.ts"),
    find: '    form === "lambda" ? lambdaContext(expression, path, context) : context;',
    replace: "    context;",
    tests: [ANALYSIS_TESTS],
  },
  {
    name: "the analysis reads an array that starts with a bound form's name as the form",
    file: core("analysis/analyze.ts"),
    find: "  if (!isSpecialFormName(head) || declares(context.scope, head)) {",
    replace: "  if (!isSpecialFormName(head)) {",
    tests: [ANALYSIS_TESTS],
  },
  {
    name: "the analysis reads else as always holding where a scope binds it",
    file: core("analysis/analyze.ts"),
    find: '      value === "else" &&\n      !declares(context.scope, "else");',
    replace: '      value === "else";',
    tests: [ANALYSIS_TESTS],
  },
  {
    name: "the analysis binds a define in the run's top scope",
    file: core("analysis/analyze.ts"),
    find: "    return site(name, path, context.body.bindings.get(name));",
    replace: "    return site(name, path, context.top.bindings.get(name));",
    tests: [ANALYSIS_TESTS],
  },
  {
    name: "the analysis flags no malformed form",
    file: core("analysis/analyze.ts"),
    find: "  if (!fitsForm(head, expression)) {",
    replace: "  if (fitsForm(head, expression) === null) {",
    tests: [ANALYSIS_TESTS],
  },
  {
    name: "the analysis takes no string for a misspelled name",
    file: core("analysis/analyze.ts"),
    find: "  const misspelled = isNamespacedName(name)",
    replace: "  const misspelled = false",
    tests: [ANALYSIS_TESTS],
  },
  {
    name: "the analysis reads the parts a form reads as written as expressions",
    file: core("analysis/analyze.ts"),
    find: "  if (WRITTEN.has(role)) {",
    replace: '  if (WRITTEN.has(role) && role === "quoted-value") {',
    tests: [ANALYSIS_TESTS],
  },
  {
    name: "a call drops the arguments a function does not take",
    file: core("errors/evaluation.ts"),
    find: "    args.length < least || args.length > most",
    replace: "    args.length < least",
    tests: ["src/modules/tests/arity.test.ts"],
  },
  {
    name: "a call runs without the arguments a function takes",
    file: core("errors/evaluation.ts"),
    find: "    args.length < least || args.length > most",
    replace: "    args.length > most",
    tests: ["src/modules/tests/arity.test.ts"],
  },
  {
    name: "number/add takes two numbers and no more",
    file: core("modules/number.ts"),
    find: '    "+",\n    (a, b) => a + b,\n    SOME,',
    replace: '    "+",\n    (a, b) => a + b,\n    2,',
    tests: ["src/modules/tests/arity.test.ts"],
  },
  {
    name: "arithmetic on several numbers leaves out the last",
    file: core("modules/number.ts"),
    find: "      const result = values.reduce((a, b) => operate(a, b));",
    replace:
      "      const result = values.slice(0, 2).reduce((a, b) => operate(a, b));",
    tests: ["src/modules/tests/arity.test.ts"],
  },
  {
    name: "string/concat joins its strings in another order",
    file: core("modules/string.ts"),
    find: 'Effect.succeed(texts.join(""))',
    replace: 'Effect.succeed([...texts].reverse().join(""))',
    tests: ["src/modules/tests/arity.test.ts"],
  },
  {
    name: "number/toString writes a number as JSON does not",
    file: core("modules/number.ts"),
    find: "      String(n).replace(WHOLE, (digits) =>",
    replace: "      n.toFixed(1).replace(WHOLE, (digits) =>",
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "number/toString groups digits in twos",
    file: core("modules/number.ts"),
    find: "const GROUPS = /\\d(?=(\\d{3})+$)/g;",
    replace: "const GROUPS = /\\d(?=(\\d{2})+$)/g;",
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "number/toString groups the digits after the point too",
    file: core("modules/number.ts"),
    find: "const WHOLE = /\\d+/;",
    replace: "const WHOLE = /\\d+/g;",
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "string/join puts the separator before the last item too",
    file: core("modules/string.ts"),
    find: "{before}$",
    replace: "{between}$",
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "string/join puts a separator before a single item",
    file: core("modules/string.ts"),
    find: "      texts.length < 2",
    replace: "      texts.length < 1",
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "string/split leaves out the empty parts",
    file: core("modules/string.ts"),
    find: "(text, separator): string[] => text.split(separator)",
    replace:
      "(text, separator): string[] => text.split(separator).filter(Boolean)",
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "string/padStart pads the end",
    file: core("modules/string.ts"),
    find: "padStart: padding((text, length, fill) => text.padStart(length, fill))",
    replace:
      "padStart: padding((text, length, fill) => text.padEnd(length, fill))",
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "object/json-stringify writes only records and lists",
    file: core("modules/object.ts"),
    find: '      return typeof text === "string"',
    replace:
      '      return typeof text === "string" && typeof value === "object"',
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "a fact holds a function that a string names",
    file: core("logic/database.ts"),
    find: "  const at = atom.args.findIndex((arg) => !isGroundValue(arg));",
    replace:
      "  const at = atom.args.findIndex((arg) => arg instanceof LogicValue);",
    tests: ["src/logic/tests/fact-data.test.ts"],
  },
  {
    name: "a fact that holds a name does not say how to write the string",
    file: core("logic/database.ts"),
    find: "asString(name)}`;",
    replace: '""}`;',
    tests: ["src/logic/tests/fact-data.test.ts"],
  },
  {
    name: "a fact that holds a lambda is said to wait for a logic variable",
    file: core("logic/database.ts"),
    find: "termVariables(arg).length > 0",
    replace: "arg instanceof LogicValue",
    tests: ["src/logic/tests/fact-data.test.ts"],
  },
  {
    name: "a record drops the empty key",
    file: core("schemas/lion-expression.ts"),
    find: "Schema.makeFilter((key) => !Arr.contains(DISALLOWED_KEYS, key))",
    replace:
      'Schema.makeFilter((key) => key !== "" && !Arr.contains(DISALLOWED_KEYS, key))',
    tests: [
      "src/evaluation/tests/special-forms/quote.test.ts",
      "src/evaluation/tests/base-forms/record.test.ts",
      "src/logic/tests/schemas.test.ts",
    ],
  },
  {
    name: "evidence about a file that changed still speaks for the present",
    file: reasoning("assets/core.json"),
    find: '["at", "?v", "?path", "?there"],\n        ["not", ["=", "?then", "?there"]]',
    replace:
      '["at", "?v", "?path", "?there"],\n        ["=", "?then", "?nothing"]',
    ...REASONING_TESTS,
  },
  {
    name: "what was told is never overruled by what was seen",
    file: reasoning("assets/core.json"),
    find: '["in", "?kind", ["quote", ["ran", "read"]]],\n    ["not", ["=", "?said", "?seen"]]',
    replace:
      '["in", "?kind", ["quote", []]],\n    ["not", ["=", "?said", "?seen"]]',
    ...REASONING_TESTS,
  },
  {
    name: "an explanation is judged in the present after its problem is fixed",
    file: reasoning("assets/core.json"),
    find: '["judged_in", "?b", "?v"],\n    ["explains", "?b", "?p"],\n    ["occurs", "?p", "?v"]',
    replace:
      '["judged_in", "?b", "?v"],\n    ["explains", "?b", "?p"],\n    ["occurs", "?p", "?_"],\n    ["=", "?v", "now"]',
    ...REASONING_TESTS,
  },
  {
    name: "a contradicted belief's other predictions are listed as untested",
    file: reasoning("assets/core.json"),
    find: '["untested", "?b", "?q", "?value"],\n    ["holds", "?b"],',
    replace: '["untested", "?b", "?q", "?value"],',
    ...REASONING_TESTS,
  },
  {
    name: "a version improves a score when its best run beats what came before, not its worst",
    file: reasoning("assets/core.json"),
    find: '["range_in", "?v", "?q", "?_", "?after"],\n    ["sure_before", "?v", "?q", "?before", "?_"],',
    replace:
      '["range_in", "?v", "?q", "?after", "?_"],\n    ["sure_before", "?v", "?q", "?before", "?_"],',
    ...REASONING_TESTS,
  },
  {
    name: "a version improves a score when it beats the luckiest run before it",
    file: reasoning("assets/core.json"),
    find: '      "sure_before",\n      "?v",\n      "?q",\n      ["aggregate/min", "?high"],\n      ["aggregate/max", "?low"]',
    replace:
      '      "sure_before",\n      "?v",\n      "?q",\n      ["aggregate/min", "?low"],\n      ["aggregate/max", "?high"]',
    ...REASONING_TESTS,
  },
  {
    name: "a version is compared with the versions after it too",
    file: reasoning("assets/core.json"),
    find: '["first", "?u", "?m"],\n    ["number/lessThan", "?m", "?n"]',
    replace: '["first", "?u", "?m"],\n    ["not", ["=", "?m", "?n"]]',
    ...REASONING_TESTS,
  },
  {
    name: "a score counts where what it requires is not met",
    file: reasoning("assets/core.json"),
    find: '["answer_in", "?v", "?q", "?x", "?_"],\n    ["not", ["unmet", "?v", "?q", "?_", "?_"]]',
    replace: '["answer_in", "?v", "?q", "?x", "?_"]',
    ...REASONING_TESTS,
  },
  {
    name: "a requirement answered both ways counts as met",
    file: reasoning("assets/core.json"),
    find: '["answer_in", "?v", "?q", "?found", "?_"],\n    ["not", ["=", "?found", "?needed"]]',
    replace: '["answer_in", "?v", "?q", "?found", "?_"],\n    ["=", 1, 2]',
    ...REASONING_TESTS,
  },
  {
    name: "a higher-is-better score is judged as lower-is-better",
    file: reasoning("assets/core.json"),
    find: '["score_in", "?v", "?q", "?high", "?low"],\n    ["scored", "?q", "higher"],',
    replace:
      '["score_in", "?v", "?q", "?low", "?high"],\n    ["scored", "?q", "higher"],',
    ...REASONING_TESTS,
  },
  {
    name: "the best of a lower-is-better score is taken from the wrong end",
    file: reasoning("assets/core.json"),
    find: '["best", "?q", "?sure"],\n    ["scored", "?q", "lower"],\n    ["sure_ever", "?q", "?sure", "?_"]',
    replace:
      '["best", "?q", "?sure"],\n    ["scored", "?q", "lower"],\n    ["sure_ever", "?q", "?_", "?sure"]',
    ...REASONING_TESTS,
  },
  {
    name: "a version's luckiest run counts as the best it is sure to give",
    file: reasoning("assets/core.json"),
    find: '["sure_ever", "?q", ["aggregate/min", "?high"], ["aggregate/max", "?low"]]',
    replace:
      '["sure_ever", "?q", ["aggregate/min", "?low"], ["aggregate/max", "?high"]]',
    ...REASONING_TESTS,
  },
  {
    name: "a score at its best counts as worse than its best",
    file: reasoning("assets/core.json"),
    find: '["best", "?q", "?best"],\n    ["number/greaterThan", "?now", "?best"]',
    replace:
      '["best", "?q", "?best"],\n    ["number/greaterThanOrEqualTo", "?now", "?best"]',
    ...REASONING_TESTS,
  },
  {
    name: "an experiment counts for the last version its run speaks for",
    file: reasoning("assets/core.json"),
    find: '["ran_in", "?o", ["aggregate/min", "?n"]]',
    replace: '["ran_in", "?o", ["aggregate/max", "?n"]]',
    ...REASONING_TESTS,
  },
  {
    name: "misses before a direction's last payoff still count against it",
    file: reasoning("assets/core.json"),
    find: '["first", "?v", "?n"],\n    [\n      "not",\n      [\n        "and",\n        ["last_payoff", "?d", "?last"],\n        ["number/lessThan", "?n", "?last"]\n      ]\n    ]',
    replace: '["first", "?v", "?n"]',
    ...REASONING_TESTS,
  },
  {
    name: "a direction is set aside one miss early",
    file: reasoning("assets/core.json"),
    find: '["aggregate/unique", ["find", "?v", ["miss", "?d", "?v"]]]\n      ],\n      "?patience"',
    replace:
      '["aggregate/unique", ["find", "?v", ["miss", "?d", "?v"]]]\n      ],\n      ["number/subtract", "?patience", 1]',
    ...REASONING_TESTS,
  },
  {
    name: "a direction waiting for the user's decision stays live",
    file: reasoning("assets/core.json"),
    find: '["needs", "?d", "?q", "?_"],\n    ["undecided", "?q", "?_"]',
    replace:
      '["needs", "?d", "?q", "?_"],\n    ["undecided", "?q", "?_"],\n    ["=", 1, 2]',
    ...REASONING_TESTS,
  },
  {
    name: "a direction whose need is answered otherwise stays live",
    file: reasoning("assets/core.json"),
    find: '["not", ["blocked", "?d", "?_"]],\n    ["not", ["ruled_out", "?d", "?_", "?_", "?_"]]',
    replace: '["not", ["blocked", "?d", "?_"]]',
    ...REASONING_TESTS,
  },
  {
    name: "the runs of a score that differ are reported as a dispute",
    file: reasoning("assets/core.json"),
    find: '["number/greaterThan", ["array/length", "?values"], 1],\n    ["not", ["scored", "?q", "?_"]]',
    replace: '["number/greaterThan", ["array/length", "?values"], 1]',
    ...REASONING_TESTS,
  },
  {
    name: "a direction that names no patience gets none",
    file: reasoning("scripts/record.mjs"),
    find: "quoted(direction.patience ?? PATIENCE)",
    replace: "quoted(direction.patience ?? null)",
    ...REASONING_TESTS,
  },
  {
    name: "the recorder leaves out what an observation tries",
    file: reasoning("scripts/record.mjs"),
    find: '.map((direction) => ["tries", quoted(seen.id), quoted(direction)]),',
    replace:
      '.map((direction) => ["tries", quoted(seen.id), quoted(direction)])\n        .slice(0, 0),',
    ...REASONING_TESTS,
  },
  {
    name: "what an experiment was expected to do is judged in later versions too",
    file: reasoning("assets/core.json"),
    find: '    ["not", ["expects", "?_", "?b"]],\n',
    replace: "",
    ...REASONING_TESTS,
  },
  {
    name: "what an experiment was expected to do is judged in the present",
    file: reasoning("assets/core.json"),
    find: '["expects", "?_", "?b"],\n    ["judged_from", "?b", "?n"],\n    ["version", "?v", "?n"]',
    replace:
      '["expects", "?_", "?b"],\n    ["judged_from", "?b", "?n"],\n    ["version", "?v", "?_"],\n    ["=", "?v", "now"]',
    ...REASONING_TESTS,
  },
  {
    name: "a belief aims at a problem it predicts will stay",
    file: reasoning("assets/core.json"),
    find: '["problem", "?p", "?_", "?q", "?shows"],\n    ["not", ["=", "?predicted", "?shows"]]',
    replace: '["problem", "?p", "?_", "?q", "?shows"]',
    ...REASONING_TESTS,
  },
  {
    name: "an experiment targets a problem in every version, not the one its expectation was formed in",
    file: reasoning("assets/core.json"),
    find: '["version", "?v", "?n"],\n    ["aims", "?b", "?p", "?_", "?_"]',
    replace: '["version", "?v", "?_"],\n    ["aims", "?b", "?p", "?_", "?_"]',
    ...REASONING_TESTS,
  },
  {
    name: "a direction addresses only the problems it says, not those its experiments target",
    file: reasoning("assets/core.json"),
    find: '["rule", ["addresses", "?d", "?p"], ["targets", "?d", "?_", "?p", "?_"]]',
    replace:
      '["rule", ["addresses", "?d", "?p"], ["targets", "?d", "?_", "?p", "?_"], ["=", 1, 2]]',
    ...REASONING_TESTS,
  },
  {
    name: "a problem counts as fixed whatever the version answers",
    file: reasoning("assets/core.json"),
    find: '["answer_in", "?v", "?q", "?predicted", "?o"]',
    replace: '["answer_in", "?v", "?q", "?_", "?o"]',
    ...REASONING_TESTS,
  },
  {
    name: "a fix the version bears out counts as not fixed too",
    file: reasoning("assets/core.json"),
    find: '["answer_in", "?v", "?q", "?found", "?o"],\n    ["not", ["=", "?found", "?predicted"]]',
    replace: '["answer_in", "?v", "?q", "?found", "?o"]',
    ...REASONING_TESTS,
  },
  {
    name: "a direction's record speaks for a score none of its experiments ran",
    file: reasoning("assets/core.json"),
    find: '        ["experiment", "?d", "?v"],\n        ["answer_in", "?v", "?q", "?_", "?_"],\n',
    replace: '        ["experiment", "?d", "?v"],\n',
    ...REASONING_TESTS,
  },
  {
    name: "an experiment with no earlier version to beat speaks for the score",
    file: reasoning("assets/core.json"),
    find: '        ["answer_in", "?v", "?q", "?_", "?_"],\n        ["sure_before", "?v", "?q", "?_", "?_"]',
    replace: '        ["answer_in", "?v", "?q", "?_", "?_"]',
    ...REASONING_TESTS,
  },
  {
    name: "a direction that was never tried is carried over to every score",
    file: reasoning("assets/core.json"),
    find: '["carried", "?d", "?q"],\n    ["experiment", "?d", "?_"],',
    replace: '["carried", "?d", "?q"],\n    ["direction", "?d", "?_", "?_"],',
    ...REASONING_TESTS,
  },
  {
    name: "the recorder leaves out which direction a belief tries",
    file: reasoning("scripts/record.mjs"),
    find: '.map((direction) => ["expects", quoted(direction), quoted(belief.id)]),',
    replace:
      '.map((direction) => ["expects", quoted(direction), quoted(belief.id)])\n        .slice(0, 0),',
    ...REASONING_TESTS,
  },
  {
    name: "the recorder leaves out which problems a direction addresses",
    file: reasoning("scripts/record.mjs"),
    find: '.map((problem) => ["addresses", quoted(direction.id), quoted(problem)]),',
    replace:
      '.map((problem) => ["addresses", quoted(direction.id), quoted(problem)])\n        .slice(0, 0),',
    ...REASONING_TESTS,
  },
  {
    name: "a skill eval run does not say which models ran it",
    file: "packages/metrics/src/skill-eval.ts",
    find: "? Object.keys(usage).sort()",
    replace: "? []",
    package: "metrics",
    tests: ["src/tests/skill-eval.test.ts"],
  },
  {
    name: "a folder's hash ignores what its files hold",
    file: reasoning("scripts/lib.mjs"),
    find: "manifest[file]}\\n`)",
    replace: "file}\\n`)",
    ...REASONING_TESTS,
  },
  {
    name: "a path with nothing in it has a hash",
    file: reasoning("scripts/lib.mjs"),
    find: 'return listing === "" && path !== "." ? null : sha1(listing);',
    replace: "return sha1(listing);",
    ...REASONING_TESTS,
  },
  {
    name: "the present is left out when an earlier version holds the same",
    file: reasoning("scripts/lib.mjs"),
    find: "if (named.has(key) && !last) {",
    replace: "if (named.has(key)) {",
    ...REASONING_TESTS,
  },
  {
    name: "the recorder accepts a quote its source does not hold",
    file: reasoning("scripts/record.mjs"),
    find: ".filter((quote) => !hasQuote(text, String(quote)))",
    replace: ".filter(() => false)",
    ...REASONING_TESTS,
  },
  {
    name: "the recorder writes what was observed as code",
    file: reasoning("scripts/record.mjs"),
    find: "quoted(seen.value ?? null),",
    replace: "seen.value ?? null,",
    ...REASONING_TESTS,
  },
  {
    name: "a run's transcript does not say which number is its exit status",
    file: reasoning("scripts/see.mjs"),
    find: '"\\n"}[exit status ',
    replace: '"\\n"}',
    ...REASONING_TESTS,
  },
  {
    name: "a belief is judged only in the present",
    file: reasoning("assets/core.json"),
    find: '["number/greaterThanOrEqualTo", "?n", "?first"]',
    replace: '["=", "?v", "now"]',
    ...REASONING_TESTS,
  },
  {
    name: "a belief is judged by evidence from before it was formed",
    file: reasoning("assets/core.json"),
    find: '["number/greaterThanOrEqualTo", "?n", "?first"]',
    replace: '["value/number?", "?n"]',
    ...REASONING_TESTS,
  },
  {
    name: "a path git ignores is hashed from versions, which never hold it",
    file: reasoning("scripts/lib.mjs"),
    find: "if (!(isAbsolute(path) || ignored.has(path))) {",
    replace: "if (!isAbsolute(path)) {",
    ...REASONING_TESTS,
  },
  {
    name: "a folder git ignores is not known as ignored once it is deleted",
    file: reasoning("scripts/lib.mjs"),
    find: '.map((line) => (line.endsWith("/") ? line.slice(0, -1) : line))',
    replace: ".map((line) => line)",
    ...REASONING_TESTS,
  },
  {
    name: "only the first part of a quote is looked for",
    file: reasoning("scripts/record.mjs"),
    find: "return [seen.quote]\n      .flat()",
    replace: "return [[seen.quote].flat()[0]]",
    ...REASONING_TESTS,
  },
  {
    name: "a question the user must decide is settled by any source",
    file: reasoning("assets/core.json"),
    find: '["not", ["observed", "?_", "?of", "?_", "?q", "?_"]]',
    replace: '["not", ["observed", "?_", "?_", "?_", "?q", "?_"]]',
    ...REASONING_TESTS,
  },
  {
    name: "the user's own answer counts as one the agent presumed",
    file: reasoning("assets/core.json"),
    find: '["not", ["=", "?source", "?of"]]',
    replace: '["value/any?", "?source"]',
    ...REASONING_TESTS,
  },
  {
    name: "the recorder leaves out the questions to ask",
    file: reasoning("scripts/record.mjs"),
    find: "...(notes.ask ?? []).map((asked) => [",
    replace: "...[].map((asked) => [",
    ...REASONING_TESTS,
  },
  {
    name: "why leaves out the arithmetic a rule did",
    file: core("logic/explain.ts"),
    find: "        { check: instantiate(goal, vars) },",
    replace:
      '        isForm(goal, "=", "in") ? {} : { check: instantiate(goal, vars) },',
    tests: ["src/logic/tests/explain.test.ts"],
  },
  {
    name: "why shows a check without the answer's values in it",
    file: core("logic/explain.ts"),
    find: "        { check: instantiate(goal, vars) },",
    replace: "        { check: instantiate(goal, NO_VARS) },",
    tests: ["src/logic/tests/explain.test.ts"],
  },
  {
    name: "a number read with a separator keeps the separator",
    file: core("modules/lib/numerals.ts"),
    find: 'const digits = separator === "" ? whole : whole.split(separator).join("");',
    replace: "const digits = whole;",
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "a separator is read between any digits",
    file: core("modules/lib/numerals.ts"),
    find: "{3})+(?!",
    replace: "{1,3})+(?!",
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "a minus sign after a lowercase letter is a sign",
    file: core("modules/lib/numerals.ts"),
    find: "p{L}",
    replace: "p{Lu}",
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "the minus sign − is not a sign",
    file: core("modules/lib/numerals.ts"),
    find: "[-−])?(?<whole>",
    replace: "[-])?(?<whole>",
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "a number read as text keeps -0",
    file: core("modules/lib/numerals.ts"),
    find: "  return n + 0;",
    replace: "  return n;",
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "a number read as text keeps a number JSON cannot hold",
    file: core("modules/lib/numerals.ts"),
    find: "  if (!Number.isFinite(n) || (rest",
    replace: "  if ((rest",
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "number/fromString reads text with space around the number",
    file: core("modules/lib/numerals.ts"),
    find: '"u").exec(text);',
    replace: '"u").exec(text.trim());',
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "number/fromString reads the number at the start of longer text",
    file: core("modules/lib/numerals.ts"),
    find: ")})$`",
    replace: ")})`",
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "object/set keeps a key the record already holds",
    file: core("modules/object.ts"),
    find: "    Record.set(record, key, value)",
    replace: "    key in record ? record : Record.set(record, key, value)",
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "object/remove removes every key",
    file: core("modules/object.ts"),
    find: "    Record.remove(record, key)",
    replace: "    ({})",
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "a record may hold the key __proto__",
    file: core("schemas/lion-expression.ts"),
    find: 'const DISALLOWED_KEYS = ["__proto__"] as const;',
    replace: "const DISALLOWED_KEYS = [] as string[];",
    tests: ["src/modules/tests/models.test.ts"],
  },
  research(
    "a value a publisher repeats in its latest word counts as restated",
    '["not", ["said_at", "?q", "?before", "?publisher", "?last", "?_"]]',
    '["value/integer?", "?last"]'
  ),
  research(
    "an answer its publisher restated still has its backing",
    '["not", ["restated", "?q", "?publisher", "?v", "?_"]]',
    '["value/integer?", 1]'
  ),
  research(
    "a restatement counts the publisher's earliest word as its last",
    '["aggregate/max", "?published"]',
    '["aggregate/min", "?published"]'
  ),
  research(
    "an answer its publisher withdrew is still disputed",
    '["answer", "?q", "?v", "?_"],\n    ["not", ["withdrawn", "?q", "?v"]]',
    '["answer", "?q", "?v", "?_"]'
  ),
  research(
    "an answer its publisher withdrew is second-hand",
    '["not", ["firsthand", "?q", "?v", "?_"]],\n    ["not", ["withdrawn", "?q", "?v"]]',
    '["not", ["firsthand", "?q", "?v", "?_"]]'
  ),
  research(
    "a figure is checked against its quote without the separator",
    '["string/numbers", "?words", ","]',
    '["string/numbers", "?words"]'
  ),
  research(
    "a context field's figure is checked against the quote too",
    '["not", ["context", "?field"]],\n    ["=", "?value"',
    '["=", "?value"'
  ),
  research(
    "a question's base keeps its readings",
    '["lambda", ["rest", "key"], ["object/remove", "rest", "key"]]',
    '["lambda", ["rest", "key"], "rest"]'
  ),
  research(
    "a reading the reader decided is still ambiguous",
    '["number/greaterThan", ["array/length", "?values"], 1],\n    ["not", ["decided", "?key", "?_", "?_"]]',
    '["number/greaterThan", ["array/length", "?values"], 1]'
  ),
  research(
    "a question that does not state a reading is set aside",
    '["not", ["=", "?stated", null]],\n    ["not", ["=", "?stated", "?chosen"]]',
    '["not", ["=", "?stated", "?chosen"]]'
  ),
  research(
    "a quote is shown one character short of where it ends",
    "[from[at], to[at + wanted.length - 1]]",
    "[from[at], to[at + wanted.length - 2]]",
    "scripts/check-quotes.mjs"
  ),
  research(
    "spacing at the start of a saved text counts when a quote is looked for",
    '(out === "" || out.endsWith(" "))',
    'out.endsWith(" ")',
    "scripts/check-quotes.mjs"
  ),
  research(
    "the page carries the text of a source whose quote was not found",
    "    if (at !== undefined) {\n      texts[claim.source] = text;",
    "    texts[claim.source] = text;\n    if (at !== undefined) {",
    "scripts/build-explorer.mjs"
  ),
  research(
    "two blocks with one title share one entry of the page check",
    "count === 1 ? name",
    "count >= 1 ? name",
    "scripts/build-explorer.mjs"
  ),
  research(
    "the eval's grader passes a check that expects nothing whatever it finds",
    "    return Array.isArray(value) && value.length === 0;",
    "    return Array.isArray(value);",
    "evals/verifies-company-figures/grade.mjs"
  ),
  research(
    "the eval's grader finds a page's figure without looking at its wording",
    "wordingOf(page).includes(wanted)",
    "true",
    "evals/verifies-company-figures/grade.mjs"
  ),
  research(
    "a question the reader's choice set aside is still meant",
    '["base", "?q", "?base"],\n    ["not", ["set_aside", "?q", "?_", "?_", "?_"]]',
    '["base", "?q", "?base"]'
  ),
  {
    name: "a number's exponent is read only after a lowercase e",
    file: core("modules/lib/numerals.ts"),
    find: "[eE][+-]",
    replace: "[e][+-]",
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "string/slice and array/slice ignore where to stop",
    file: core("modules/lib/shared.ts"),
    find: "value.slice(start, end)",
    replace: "value.slice(start)",
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "a negative position of a slice counts from the start",
    file: core("modules/lib/shared.ts"),
    find: "(value, start, end) => value.slice(start, end)",
    replace: "(value, start, end) => value.slice(Math.max(start, 0), end)",
    tests: ["src/modules/tests/models.test.ts"],
  },
  ...[
    [
      "a library function runs on arguments its guard says no to",
      "lib/shared.ts",
      "(fits(input) ? then(input as A) : decoded(input))",
      "then(input as A)",
    ],
    [
      "no schema has a guard, so every library call runs the decoder",
      "lib/guard.ts",
      'const kind = ast._tag === "Arrays" ? listGuard(ast) : KINDS[ast._tag];',
      "const kind = undefined as Guard | undefined;",
    ],
    [
      "a schema that transforms gets a guard",
      "lib/guard.ts",
      "  if (ast.encoding !== undefined) {\n    return undefined;\n  }\n",
      "",
    ],
    [
      "a guard ignores the checks of its schema",
      "lib/guard.ts",
      "kind(value) && checks.every((check) => passes(check, value, ast))",
      "kind(value)",
    ],
    [
      "a guard ignores the checks in a group",
      "lib/guard.ts",
      "check.checks.every((each) => passes(each, value, ast))",
      "true",
    ],
    [
      "a check that throws escapes the guard",
      "lib/guard.ts",
      "    } catch {\n      return false;\n    }",
      "    } finally {\n    }",
    ],
    [
      "a list's guard accepts a list with too few items",
      "lib/guard.ts",
      "      value.length < items.length ||\n",
      "",
    ],
    [
      "a list's guard accepts a list with too many items",
      "lib/guard.ts",
      "(rest === undefined && value.length > items.length)",
      "false",
    ],
    [
      "a list's guard checks only its first item",
      "lib/guard.ts",
      "if (!(items[at] ?? (rest as Guard))(value[at])) {",
      "if (at === 0 && !(items[at] ?? (rest as Guard))(value[at])) {",
    ],
    [
      "a call that leaves an argument out is checked as one that gives them all",
      "lib/shared.ts",
      "(runs[args.length - least] as (typeof runs)[number])(args)",
      "(runs.at(-1) as (typeof runs)[number])(args)",
    ],
    [
      "a call that gives every argument is checked as one that leaves some out",
      "lib/shared.ts",
      "(runs[args.length - least] as (typeof runs)[number])(args)",
      "(runs[0] as (typeof runs)[number])(args)",
    ],
    [
      "a list's guard never looks at its items",
      "lib/guard.ts",
      "const looks = [...items, rest].some((guard) => guard && guard !== ANY);",
      "const looks = false;",
    ],
    [
      "a list with an optional item gets a guard",
      "lib/guard.ts",
      "    ast.rest.length > 1 ||\n    ast.elements.some((element) => element.context?.isOptional)",
      "    ast.rest.length > 1",
    ],
  ].map(
    ([name, file, find, replace]): Mutation => ({
      name: name as string,
      file: core(`modules/${file}`),
      find: find as string,
      replace: replace as string,
      tests: ["src/modules/tests/guard.test.ts"],
    })
  ),
  record(
    "a release reaches its commit's parents but not theirs",
    '    ["parent", "?hash", "?older"]',
    '    ["parent", "?hash", "?older"],\n    ["release_at", "?r", "?hash"]'
  ),
  record(
    "a claim ships in every release that has its commits, not the oldest",
    '    ["not", ["and", ["covers", "?earlier", "?c"], ["before", "?earlier", "?r"]]]',
    '    ["value/string?", "?r"]'
  ),
  record(
    "a claim that names its commits is also made by the commit that added its file",
    '    ["written_in", "?x", "?path"],\n    ["not", ["names", "?x", "?_"]],',
    '    ["written_in", "?x", "?path"],'
  ),
  record(
    "a claim that quotes a commit is made by the commit that added its file",
    '    ["not", ["names", "?x", "?_"]],\n    ["commit_of", "?s", "?hash"]',
    '    ["not", ["names", "?x", "?_"]],\n    ["commit_of", "?s", "?_"],\n    ["written_in", "?x", "?path"],\n    ["added", "?path", "?hash"]'
  ),
  record(
    "an answer appears in every release that shipped a claim of it",
    '        ["shipped_in", "?c2", "?earlier"],\n        ["before", "?earlier", "?r"]',
    '        ["shipped_in", "?c2", "?earlier"],\n        ["before", "?earlier", "?earlier"]'
  ),
  record(
    "a decision record with no decision claim passes",
    '    ["undecided_record", "?id"],\n    ["record", "?id", "?path", "?_"],',
    '    ["undecided_record", "?id"],\n    ["record", "?id", "?path", "?_"],\n    ["=", "?id", "never"],'
  ),
  record(
    "the pages order sections as they come, not breaking first",
    '    "SECTIONS",\n    [\n      "quote",\n      [\n        "Breaking",\n        "Added",',
    '    "SECTIONS",\n    [\n      "quote",\n      [\n        "Added",\n        "Breaking",',
    "outputs.json"
  ),
  record(
    "an item shows the words of its earliest claim",
    '["at", "rows", ["number/subtract", ["array/length", "rows"], 1]]',
    '["at", "rows", 0]',
    "outputs.json"
  ),
  record(
    "the timeline lists every item of a release under every section",
    '      ["items", "section"],\n      [\n        "sorted",\n        [\n          "array/flat-map",\n          "items",\n          [\n            "lambda",\n            ["item"],\n            [\n              "cond",\n              [\n                ["string/equals?", ["at", "item", 1], "section"],',
    '      ["items", "section"],\n      [\n        "sorted",\n        [\n          "array/flat-map",\n          "items",\n          [\n            "lambda",\n            ["item"],\n            [\n              "cond",\n              [\n                true,',
    "outputs.json"
  ),
  record(
    "an assertion no later word replaced still counts as replaced",
    '    ["answer", "?q", "?v", "?c"],\n    ["not", ["firsthand", "?q", "?v", "Lion repository"]]',
    '    ["answer", "?q", "?v", "?c"],\n    ["not", ["firsthand", "?q", "?_", "Lion repository"]]'
  ),
  record(
    "a replaced assertion still counts as stated",
    '    ["firsthand", "?q", "?v", "Lion repository"],\n    ["not", ["firsthand", "?q", "?_", "Lion at HEAD"]]',
    '    ["not", ["firsthand", "?q", "?_", "Lion at HEAD"]]'
  ),
  record(
    "a fix commit needs no entry",
    '["quote", ["feat", "fix"]]',
    '["quote", ["feat"]]'
  ),
  record(
    "a quote must keep the line breaks of its commit message",
    '["words", "?message"]',
    '"?message"'
  ),
  record(
    "a release that repeats the last version counts as a rise",
    '      "number/greaterThanOrEqualTo",\n      ["versionRank", "?earlier"],',
    '      "number/greaterThan",\n      ["versionRank", "?earlier"],'
  ),
  record(
    "the changelog lists releases oldest first",
    '["number/subtract", 0, "?time"]',
    '"?time"',
    "outputs.json"
  ),
  record(
    "a draft release counts as a release",
    '    ["not", ["draft", "?r"]],\n    ["made_by", "?r", "?hash"]',
    '    ["made_by", "?r", "?hash"]'
  ),
  record(
    "the timeline writes < in text as it is",
    '"<", "&lt;"',
    '"<", "<"',
    "outputs.json"
  ),
  record(
    "the timeline writes code as prose",
    '"<code>",',
    '"",',
    "outputs.json"
  ),
  record(
    "the timeline writes a link's text as markup",
    '["escape", "label"]',
    '"label"',
    "outputs.json"
  ),
  {
    name: "a renamed file of the record is traced to the commit that renamed it",
    file: "packages/history/src/git.ts",
    find: "added.set(second, added.get(first) ?? commit);",
    replace: "added.set(second, commit);",
    package: "history",
    tests: ["src/tests/git.test.ts"],
  },
  {
    name: "a new file of the record that only looks like a removed one is its rename",
    file: "packages/history/src/git.ts",
    find: '    "--reverse",\n    "-M100%",',
    replace: '    "--reverse",\n    "-M",',
    package: "history",
    tests: ["src/tests/git.test.ts"],
  },
  {
    name: "a file of the record renamed in the index belongs to the working tree",
    file: "packages/history/src/git.ts",
    find: "      added.set(second, added.get(first) ?? WORKING_TREE);",
    replace: "      added.delete(second);",
    package: "history",
    tests: ["src/tests/git.test.ts"],
  },
  researchStep(
    "a rule that no longer holds still predicts behavior",
    '    ["predicted", "?r", "?case", "?v", "?c"],\n    ["in_force", "?r"],',
    '    ["predicted", "?r", "?case", "?v", "?c"],\n    ["value/string?", "?r"],'
  ),
  researchStep(
    "a library function that follows JavaScript breaks the precedent assumption",
    '        ["=", "?follows", "javascript"],',
    '        ["=", "?follows", "json"],'
  ),
  researchStep(
    "a rule's earlier prediction stands after a later statement predicts otherwise",
    '        ["number/lessThan", "?t", "?t2"]',
    '        ["number/lessThan", "?t2", "?t2"]'
  ),
  researchStep(
    "a rule's exception does not excuse its conflicts",
    '    ["not", ["excepted", "?r", "?case"]],\n    ["not", ["excepted", "?o", "?case"]]',
    '    ["value/string?", "?r"],\n    ["value/string?", "?o"]'
  ),
  researchStep(
    "a removal counts as decided by any decided claim",
    '    ["removed", "?f", "?c", "?s"],\n    ["not", ["decided_claim", "?c"]]',
    '    ["removed", "?f", "?c", "?s"],\n    ["not", ["decided_claim", "?_"]]',
    "05-links.src.json"
  ),
  {
    file: "history/research/steps/05-links.src.json",
    find: '["not", ["and", ["commit_of", "?s", "?h"], ["made_by", "?_", "?h"]]]',
    name: "a commit a claim was made by still counts as unread",
    package: "history",
    replace:
      '["not", ["and", ["commit_of", "?s", "?h"], ["made_by", "?_", "none"]]]',
    tests: ["src/tests/record.test.ts"],
  },
  researchStep(
    "a broken chain of figures ignores the measurements between",
    '        ["number/lessThan", "?t1", "?t3"],\n        ["number/lessThan", "?t3", "?t2"]',
    '        ["number/lessThan", "?t1", "?t3"],\n        ["number/lessThan", "?t3", "?t1"]'
  ),
  researchStep(
    "drift compares the repository's word with its own",
    '    ["firsthand", "?q", "?w", "Lion at HEAD"],',
    '    ["firsthand", "?q", "?w", "Lion repository"],'
  ),
  researchStep(
    "a commit is read when any commit has a claim",
    '    ["not", ["claim", "?_", "?s", "?_", "?_"]],',
    '    ["not", ["claim", "?_", "?_", "?_", "?_"]],',
    "05-links.src.json"
  ),
  researchStep(
    "an accepted finding is still open",
    '    ["not", ["accepted", "?a", "?w", "?_"]],',
    '    ["value/string?", "?a"],',
    "06-findings.src.json"
  ),
  researchStep(
    "a known finding is still reported as new",
    '    ["not", ["known", "?a", "?w", "?_"]]',
    '    ["value/string?", "?a"]',
    "06-findings.src.json"
  ),
  researchStep(
    "an accepted finding the model no longer finds is not stale",
    '    ["accepted", "?a", "?w", "?_"],\n    ["not", ["violated", "?a", "?w"]]',
    '    ["accepted", "?a", "?w", "?_"],\n    ["violated", "?a", "?w"]',
    "06-findings.src.json"
  ),
  researchStep(
    "a run that sees a feature gone is taken for the commit that removed it",
    '    ["source", "?s", "?_", "?_", "Lion repository", "?_", "?last"]',
    '    ["source", "?s", "?_", "?_", "?_", "?_", "?last"]'
  ),
  researchScript(
    "the quote finder keeps searching the first text it indexed",
    "check-quotes.mjs",
    "  if (text !== lastText) {",
    "  if (lastText === undefined) {"
  ),
  researchScript(
    "the page check leaves out a lookup's answer",
    "build-explorer.mjs",
    "        isRecord(block.example) && block.answer !== undefined",
    "        false"
  ),
  researchScript(
    "the page runs an engine other than its lion command's worker",
    "build-explorer.mjs",
    'lion(["worker"], "buffer")',
    'lion(["--version"], "buffer")'
  ),
  researchScript(
    "the page is built though its lion command gave no engine",
    "build-explorer.mjs",
    "  if (made.status !== 0) {",
    "  if (made.status === null) {"
  ),
  researchScript(
    "the scripts run the published lion command though LION_CLI names another",
    "lion.mjs",
    '  return words.length > 0 && words[0] !== "" ? words : undefined;',
    "  return undefined;"
  ),
  {
    name: "a page's worker runs programs on a new database, not the one it loaded",
    file: "packages/cli/src/worker.ts",
    find: "run(request.program as never, stdlib, { database })",
    replace:
      "run(request.program as never, stdlib, { database: new LogicDatabase() })",
    package: "cli",
    tests: [WORKER_TESTS],
  },
  {
    name: "a page's worker answers a program that failed as if it gave null",
    file: "packages/cli/src/worker.ts",
    find: "  return Exit.isSuccess(exit)",
    replace: "  return true",
    package: "cli",
    tests: [WORKER_TESTS],
  },
  {
    name: "a probe reads a file outside the repository",
    file: "packages/history/src/repo.ts",
    find: '  return from.startsWith("..") || isAbsolute(from) ? undefined : full;',
    replace: "  return from === undefined ? undefined : full;",
    package: "history",
    tests: ["src/tests/probes.test.ts"],
  },
  {
    name: "a probe's command runs again each time a probe asks for it",
    file: "packages/history/src/repo.ts",
    find: "    ran.set(name, gave);",
    replace: "",
    package: "history",
    tests: ["src/tests/probes.test.ts"],
  },
  {
    name: "a probe's command that fails is given as one that passed",
    file: "packages/history/src/repo.ts",
    find: "      exit: result.status,",
    replace: "      exit: 0,",
    package: "history",
    tests: ["src/tests/probes.test.ts"],
  },
  {
    name: "a build runs its probes without the repository's functions",
    file: "packages/history/src/probes.ts",
    find: "      observe(probe, environment)",
    replace: "      observe(probe)",
    package: "history",
    tests: ["src/tests/probes.test.ts"],
  },
  {
    name: "a build's probes cannot run the commands its folder declares",
    file: "packages/history/src/probes.ts",
    find: "  ...repositoryFunctions(repository, readCommands(repository, folder)),",
    replace: "  ...repositoryFunctions(repository),",
    package: "history",
    tests: ["src/tests/probes.test.ts"],
  },
  {
    name: "a probe lists the files git and installed packages keep",
    file: "packages/history/src/repo.ts",
    find: "    .filter((entry) => !SKIPPED.has(entry.name))",
    replace: "    .filter((entry) => entry.name !== undefined)",
    package: "history",
    tests: ["src/tests/probes.test.ts"],
  },
  {
    name: "a feature's probe that gives no true or false still says something",
    file: "packages/history/src/probes.ts",
    find: '  return typeof value === "boolean"',
    replace: "  return value !== null",
    package: "history",
    tests: ["src/tests/probes.test.ts"],
  },
  {
    name: "a second probe of one question answers it again",
    file: "packages/history/src/probes.ts",
    find: "      return fresh;",
    replace: "      return true;",
    package: "history",
    tests: ["src/tests/probes.test.ts"],
  },
  {
    name: "a probe is told every name is a special form",
    file: "packages/history/src/probes.ts",
    find: "    (SPECIAL_FORM_NAMES as readonly string[]).includes(name)",
    replace:
      "    (SPECIAL_FORM_NAMES as readonly string[]).includes(name) || true",
    package: "history",
    tests: ["src/tests/probes.test.ts"],
  },
  {
    name: "the package's page keeps the sections about the repository",
    file: "packages/site-runtime/src/package-readme.ts",
    find: "      keeping = LANGUAGE.includes(title);",
    replace: "      keeping = true;",
    package: "site-runtime",
    tests: ["src/tests/package-readme.test.ts"],
  },
  {
    name: "the package's page reads a fenced block as prose",
    file: "packages/site-runtime/src/package-readme.ts",
    find: "    const code = fenced || fence;",
    replace: "    const code = false;",
    package: "site-runtime",
    tests: ["src/tests/package-readme.test.ts"],
  },
  {
    name: "the package's page changes a link inside a code span",
    file: "packages/site-runtime/src/package-readme.ts",
    find: "      index % 2 === 0\n",
    replace: "      index % 2 < 2\n",
    package: "site-runtime",
    tests: ["src/tests/package-readme.test.ts"],
  },
  {
    name: "the package's page keeps a link to a section it left out",
    file: "packages/site-runtime/src/package-readme.ts",
    find: "    return anchors.has(target.slice(1)) ? target",
    replace: "    return target.length > 0 ? target",
    package: "site-runtime",
    tests: ["src/tests/package-readme.test.ts"],
  },
  {
    name: "the package's page keeps a link to a file as a path",
    file: "packages/site-runtime/src/package-readme.ts",
    find: "/blob/main/",
    replace: "/",
    package: "site-runtime",
    tests: ["src/tests/package-readme.test.ts"],
  },
  {
    name: "the package's page takes an address for a file of the repository",
    file: "packages/site-runtime/src/package-readme.ts",
    find: "  if (ADDRESS.test(target)) {",
    replace: '  if (target === "") {',
    package: "site-runtime",
    tests: ["src/tests/package-readme.test.ts"],
  },
  {
    name: "the package's page keeps punctuation in a heading's anchor",
    file: "packages/site-runtime/src/package-readme.ts",
    find: '.replace(NOT_IN_ANCHOR, "")',
    replace: "",
    package: "site-runtime",
    tests: ["src/tests/package-readme.test.ts"],
  },
  {
    name: "a question about rows that break a key reads them",
    file: core("logic/model.ts"),
    find: "  return problem === undefined ? undefined : logicError(problem);",
    replace: "  return undefined;",
    tests: ["src/logic/tests/keys.test.ts", "src/logic/tests/weights.test.ts"],
  },
  {
    name: "a lookup of some of a tuple's values reads it as a lookup of its key",
    file: core("logic/model.ts"),
    find: "      positions.length === this.width &&",
    replace: "      positions.length <= this.width &&",
    tests: TUPLE_SET_TESTS,
  },
  {
    name: "a set of tuples of several widths reads a lookup of the first one's every value by key",
    file: core("logic/model.ts"),
    find: "        : Number.NaN;",
    replace: "        : this.width;",
    tests: TUPLE_SET_TESTS,
  },
  {
    name: "a fact form that repeats a key writes every row it gives the key",
    file: core("logic/database.ts"),
    find: "    return kept === undefined || valueKey(kept) === valueKey(tuple);",
    replace: "    return true;",
    tests: [
      "src/logic/tests/keys.test.ts",
      "src/logic/tests/maintained.test.ts",
    ],
  },
  {
    name: "a fact form that repeats a key writes only the first row it gives the key",
    file: core("logic/database.ts"),
    find: "      last.set(id, tuple);",
    replace: "      last.set(id, last.get(id) ?? tuple);",
    tests: ["src/logic/tests/keys.test.ts"],
  },
  {
    name: "why compares no values of the answers that give a row",
    file: core("logic/model.ts"),
    find: "    names = [...new Set(rule.body.flatMap(termVariables))];",
    replace: "    names = [];",
    tests: TOLD_TESTS,
  },
  {
    name: "why lists an aggregate's matches in the order they were found",
    file: core("logic/explain.ts"),
    find: "        : [...derivation.matches].sort(compareMatches(telling.model.rules));",
    replace: "        : derivation.matches;",
    tests: TOLD_TESTS,
  },
  {
    name: "why explains a row a key made again by the first answer found",
    file: core("logic/model.ts"),
    find: "        all.sort((a, b) => compareAnswers(rule, a, b)),",
    replace: "        all,",
    tests: [...TOLD_TESTS, ...EXISTENTIAL_TESTS],
  },
  {
    name: "why tells a fact that does not hold as nothing",
    file: core("logic/explain.ts"),
    find: "      : yield* missing(telling, atom, NO_VARS);",
    replace: "      : null;",
    tests: WHY_NOT_TESTS,
  },
  {
    name: "why leaves out what stopped a rule",
    file: core("logic/explain.ts"),
    find: "      const but = yield* missing(telling, body[at], vars);",
    replace: "      const but = { absent: instantiate(body[at], NO_VARS) };",
    tests: WHY_NOT_TESTS,
  },
  {
    name: "why leaves out a rule that gave another row",
    file: core("logic/explain.ts"),
    find: "        out.push(...(yield* gave(telling, route.rule, route.head, full)));",
    replace: "",
    tests: WHY_NOT_TESTS,
  },
  {
    name: "why tries a rule whose head cannot give the fact",
    file: core("logic/explain.ts"),
    find: "      if (next === undefined) {\n        return undefined;\n      }\n      start = next;",
    replace: "      start = next ?? start;",
    tests: WHY_NOT_TESTS,
  },
  {
    name: "why explains an absent goal each time the tree comes to it",
    file: core("logic/explain.ts"),
    find: "    if (!hasRoutes(goal) || telling.told.has(key)) {",
    replace: "    if (!hasRoutes(goal) || telling.looking.has(key)) {",
    tests: WHY_NOT_TESTS,
  },
  {
    name: "why tells the ways of an absent fact in the order rows were added",
    file: core("logic/explain.ts"),
    find: "      stopped.sort(([a], [b]) => (a < b ? -1 : Number(a > b)));",
    replace: "",
    tests: WHY_NOT_TESTS,
  },
  {
    name: "why names the row that was added first, of those a goal matched",
    file: core("logic/explain.ts"),
    find: "      if (first === undefined || compareValues(tuple, first) < 0) {",
    replace: "      if (first === undefined) {",
    tests: WHY_NOT_TESTS,
  },
  {
    name: "why writes an unknown in a premise as a quoted list",
    file: core("logic/terms.ts"),
    find: "        ? write(vars.get(variable.name), DISPLAY)",
    replace: "        ? DISPLAY.data(vars.get(variable.name))",
    tests: WHY_NOT_TESTS,
  },
  {
    name: "why never says that a goal is assumed",
    file: core("logic/explain.ts"),
    find: "  assumed ? { ...node, assumed: true } : node;",
    replace: "  node;",
    tests: WHY_NOT_TESTS,
  },
  {
    name: "a goal is not assumed when a row that holds an unknown could match it",
    file: core("logic/explain.ts"),
    find: "    return calls.some((call) => couldMatch(telling, call, vars));",
    replace: "    return false;",
    tests: WHY_NOT_TESTS,
  },
  {
    name: "a goal is not assumed when only a rule could come to give it",
    file: core("logic/explain.ts"),
    find: "    for (const route of open ? [] : yield* routes(telling.model, goal, vars)) {",
    replace: "    for (const route of [] as Route[]) {",
    tests: WHY_NOT_TESTS,
  },
  {
    name: "a row with an unknown where a goal asks for a value cannot match it",
    file: core("logic/explain.ts"),
    find: "!isData(value) || isOpen(tuple[at]) || sameValue(tuple[at], value)",
    replace: "!isData(value) || sameValue(tuple[at], value)",
    tests: WHY_NOT_TESTS,
  },
  {
    name: "a check that computes with an unknown is not assumed",
    file: core("logic/explain.ts"),
    find: "        !comparesValues(goal) &&",
    replace: "        false &&",
    tests: WHY_NOT_TESTS,
  },
  {
    name: "a count of matches that hold an unknown is not assumed",
    file: core("logic/explain.ts"),
    find: '  return opens(telling, new LogicForm("and", rule.body), group);',
    replace: "  return Effect.succeed(group.size < 0);",
    tests: WHY_NOT_TESTS,
  },
  {
    name: "a run with no skill is told where a skill is",
    file: SKILL_EVAL,
    find: "  skill === undefined",
    replace: '  skill === "never"',
    ...SKILL_EVAL_TESTS,
  },
  {
    name: "the skill eval ignores an option it does not have",
    file: SKILL_EVAL,
    find: '(word) => word.startsWith("--") && !known.includes(word.slice(2))',
    replace: '(word) => word.startsWith("--") && known.length < 0',
    ...SKILL_EVAL_TESTS,
  },
  {
    name: "a skill's name is read from its body as well as its front matter",
    file: SKILL_EVAL,
    find: "const front = FRONT_MATTER.exec(skillMd)?.[1];",
    replace: "const front = skillMd;",
    ...SKILL_EVAL_TESTS,
  },
  {
    name: "a case's sessions run in the order of their names as text",
    file: SKILL_EVAL,
    find: ".sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));",
    replace: ".sort();",
    ...SKILL_EVAL_TESTS,
  },
  {
    name: "a later session gets the earlier message only where the template first asks for it",
    file: SKILL_EVAL,
    find: 'template.split("{{earlier}}").join(earlier.trim());',
    replace: 'template.replace("{{earlier}}", earlier.trim());',
    ...SKILL_EVAL_TESTS,
  },
  {
    name: "a run's sessions together forget the models of all but the last",
    file: SKILL_EVAL,
    find: "models: [...new Set([...a.models, ...b.models])].sort(),",
    replace: "models: [...b.models],",
    ...SKILL_EVAL_TESTS,
  },
  {
    name: "a run fails only when its last session failed",
    file: SKILL_EVAL,
    find: "error: a.error || b.error,",
    replace: "error: b.error,",
    ...SKILL_EVAL_TESTS,
  },
  {
    name: "a session's message is whatever its result message holds",
    file: SKILL_EVAL,
    find: 'return typeof message === "string" ? message : undefined;',
    replace: "return message === undefined ? undefined : String(message);",
    ...SKILL_EVAL_TESTS,
  },
  {
    name: "the eval service scores a prompt's comments",
    file: rechecks("world.mjs"),
    find: '.replaceAll(/<!--[\\s\\S]*?-->/g, "")',
    replace: '.replaceAll(/<!--never-->/g, "")',
    ...RECHECKS_TESTS,
  },
  {
    name: "the eval service scores a prompt's blank lines",
    file: rechecks("world.mjs"),
    find: '.filter((line) => line !== "")',
    replace: ".filter(() => true)",
    ...RECHECKS_TESTS,
  },
  {
    name: "the changes between the sessions leave times that say which prompts changed",
    file: rechecks("world.mjs"),
    find: 'utimesSync(join(dir, "prompts",',
    replace: '(() => undefined)(join(dir, "prompts",',
    ...RECHECKS_TESTS,
  },
  {
    name: "the lines that went wrong after the first session include those wrong before it",
    file: rechecks("world.mjs"),
    find: "changed: wrong.filter((line) => !wrongAtFirst.includes(line)),",
    replace: "changed: wrong,",
    ...RECHECKS_TESTS,
  },
  {
    name: "the grade passes a report of a line that came right after the first session",
    file: rechecks("grade.mjs"),
    find: "ok: !reported.has(line),",
    replace: "ok: true,",
    ...RECHECKS_TESTS,
  },
  {
    name: "the grade passes an entry that names no line of RESULTS.md",
    file: rechecks("grade.mjs"),
    find: "ok: right.length === 0 && unnamed.length === 0,",
    replace: "ok: right.length === 0,",
    ...RECHECKS_TESTS,
  },
  // A scope as it was written, the head of a call, code that eval runs, and
  // the forms that hold rule forms.
  {
    name: "a scope declares the names eval binds after code was compiled in it",
    file: core("evaluation/environment.ts"),
    find: "    has: (name) => bindings.has(name) && !isLater(name),",
    replace: "    has: (name) => bindings.has(name),",
    tests: [SCOPE_TESTS],
  },
  {
    name: "a logic form's parts are compiled in the scope it runs in",
    file: core("evaluation/special-forms/logic.ts"),
    find: "      toEffect(compile(expression, scope ?? environment)(environment, 0))",
    replace: "      toEffect(compile(expression, environment)(environment, 0))",
    tests: [SCOPE_TESTS],
  },
  {
    name: "a form that waits keeps every name its environment binds",
    file: core("evaluation/special-forms/lambda.ts"),
    find: "  scope === undefined || readsAsName(scope, name)",
    replace: "  true",
    tests: [SCOPE_TESTS],
  },
  {
    name: "a form that waits again, once a ?name is bound, waits for a new variable",
    file: core("evaluation/base-forms/primitive.ts"),
    find: "  isLogicVariableName(name) || declares(scope, name);",
    replace: "  declares(scope, name);",
  },
  {
    name: "code that eval runs does not declare what it defines",
    file: core("evaluation/special-forms/eval.ts"),
    find: "    predeclare(bodyOf(environment).bindings, definedIn(program, scope));\n",
    replace: "",
    tests: [SCOPE_TESTS],
  },
  {
    name: "a call's head that no scope declares is data",
    file: core("evaluation/base-forms/primitive.ts"),
    find: "    return value === UNBOUND\n      ? reference(environment, depth)\n      : read(name, value);",
    replace: "    return reference(environment, depth);",
    tests: [SCOPE_TESTS],
  },
  {
    name: "a fact form evaluates a rule form among its facts",
    file: core("evaluation/special-forms/logic.ts"),
    find: "    if (held !== undefined) {",
    replace: "    if (false) {",
    tests: [CANDIDATE_TESTS],
  },
  {
    name: "a sum rounds at every value",
    file: core("logic/aggregates.ts"),
    find: "    const low = small - (high - big);",
    replace: "    const low = 0;",
    tests: ["src/logic/tests/aggregates.test.ts"],
  },
  {
    name: "a sum whose partial sums overflow adds its values in order",
    file: core("logic/aggregates.ts"),
    find: "  return Number.isFinite(high) ? high : exactSum(values as readonly number[]);",
    replace:
      "  return Number.isFinite(high)\n    ? high\n    : (values as readonly number[]).reduce((a, b) => a + b, 0);",
    tests: [
      "src/modules/tests/finite-numbers.test.ts",
      "src/logic/tests/aggregates.test.ts",
    ],
  },
  {
    name: "the analysis reads the head of a call as data",
    file: core("analysis/analyze.ts"),
    find: '  return meaning[0].kind === "data" ? [{ kind: "unbound" }] : meaning;',
    replace: "  return meaning;",
    tests: [ANALYSIS_TESTS],
  },
  {
    name: "a change of assuming cannot state rows with exists",
    file: core("evaluation/special-forms/logic.ts"),
    find: "            ? Effect.succeed(heldRows(value as LogicForm, goal))",
    replace: "            ? notACall(value)",
    tests: ASSUMING_TESTS,
  },
  {
    name: "a library function's wrong argument fails with the decoder's words",
    file: core("modules/lib/shared.ts"),
    find: "        (values) => operate(...values),\n        refuse\n",
    replace: "        (values) => operate(...values)\n",
    tests: [
      "src/modules/tests/guard.test.ts",
      "src/evaluation/tests/failures.test.ts",
    ],
  },
  {
    name: "a wrong argument names the argument after it",
    file: core("errors/evaluation.ts"),
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the text is source code that holds a template.
    find: "as argument ${at + 1} but got",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the text is source code that holds a template.
    replace: "as argument ${at + 2} but got",
    tests: [
      "src/modules/tests/guard.test.ts",
      "src/evaluation/tests/failures.test.ts",
    ],
  },
  {
    name: "a failure leaving a named function does not say so",
    file: core("evaluation/special-forms/lambda.ts"),
    find: "      : Effect.mapError(result.effect, (error) => leaving(error, name))",
    replace: "      : result.effect",
    tests: ["src/evaluation/tests/failures.test.ts"],
  },
  {
    name: "a function that called in tail position is named as a caller",
    file: core("evaluation/special-forms/lambda.ts"),
    find: "  if (!(result instanceof Pending) || result instanceof Called) {",
    replace: "  if (!(result instanceof Pending)) {",
    tests: ["src/evaluation/tests/failures.test.ts"],
  },
  {
    name: "a lambda ignores arguments past its parameters",
    file: core("evaluation/special-forms/lambda.ts"),
    find: "  if (args.length !== parameters.length) {",
    replace: "  if (args.length < parameters.length) {",
    tests: ["src/evaluation/tests/special-forms/lambda.test.ts"],
  },
  {
    name: "a callback gives a function every argument host code passes",
    file: core("modules/func.ts"),
    find: "      const args = given.slice(0, most);",
    replace: "      const args = given;",
    tests: ["src/modules/tests/func.test.ts"],
  },
  {
    name: "a function func/partial built does not say how many it takes",
    file: core("modules/func.ts"),
    find: "      count === undefined\n        ? made",
    replace: "      count !== undefined\n        ? made",
    tests: ["src/modules/tests/func.test.ts"],
  },
  {
    name: "integer arithmetic past the exact integers rounds without a word",
    file: core("modules/number.ts"),
    find: "      if (whole === BigInt(result)) {",
    replace: "      if (whole !== undefined) {",
    tests: ["src/modules/tests/finite-numbers.test.ts"],
  },
  {
    name: "a sum of integers past the exact integers rounds without a word",
    file: core("logic/aggregates.ts"),
    find: "  sum: { check: summable, fold: sum, selects: false },",
    replace: "  sum: { check: onlyNumbers, fold: sum, selects: false },",
    tests: ["src/modules/tests/finite-numbers.test.ts"],
  },
  {
    name: "text that writes an integer past the exact integers reads it rounded",
    file: core("evaluation/reading.ts"),
    find: "    if (isInteger && !readsAsWritten(written)) {",
    replace: "    if (false) {",
    tests: ["src/evaluation/tests/reading.test.ts"],
  },
  {
    name: "number/fromString reads an integer past the exact integers rounded",
    file: core("modules/lib/numerals.ts"),
    find: '(rest === "" && !readsAsWritten(written))',
    replace: "false",
    tests: ["src/modules/tests/finite-numbers.test.ts"],
  },
  {
    name: "object/get reads a key a record inherits",
    file: core("modules/object.ts"),
    find: "      if (Object.hasOwn(obj, key)) {",
    replace: "      if (key in obj) {",
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "object/get ignores the value given for a missing key",
    file: core("modules/object.ts"),
    find: "      if (missing.length > 0) {",
    replace: "      if (missing.length > 1) {",
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "the solver says every record has every key",
    file: core("logic/symbolic.ts"),
    find: "    return Effect.succeed(one(truthSym(fields.has(key.value) ? TRUE : FALSE)));",
    replace: "    return Effect.succeed(one(truthSym(TRUE)));",
    tests: ["src/logic/tests/solving.test.ts"],
  },
  {
    name: "the solver reads a missing key as null",
    file: core("logic/symbolic.ts"),
    find: "    const found = fields.get(key.value) ?? missing;",
    replace: "    const found = fields.get(key.value) ?? fromValue(null);",
    tests: ["src/logic/tests/solving.test.ts"],
  },
  {
    name: "set! changes a binding made outside a rule while it runs",
    file: core("evaluation/special-forms/set.ts"),
    find: "  return scope === undefined || since === undefined || (scope.made ?? 0) > since",
    replace: "  return true",
    tests: ["src/evaluation/tests/ordered-effects.test.ts"],
  },
  {
    name: "set! is refused even for a binding the call made for itself",
    file: core("evaluation/special-forms/set.ts"),
    find: "(scope.made ?? 0) > since",
    replace: "(scope.made ?? 0) > Number.POSITIVE_INFINITY",
    tests: ["src/evaluation/tests/ordered-effects.test.ts"],
  },
  {
    name: "a call's scope is not newer than a rule that runs it",
    file: core("evaluation/special-forms/lambda.ts"),
    find: "    made: makingScope(),",
    replace: "    made: 0,",
    tests: ["src/evaluation/tests/ordered-effects.test.ts"],
  },
  {
    name: "the goals that contradict each other keep one more than they need",
    file: core("logic/model.ts"),
    find: "        if (!(yield* none(without(dropped)))) {\n          dropped.delete(literal);",
    replace:
      "        if (yield* none(without(dropped))) {\n          dropped.delete(literal);",
    tests: ["src/logic/tests/contradiction.test.ts"],
  },
  {
    name: "the goals a proof denies are dropped last",
    file: core("logic/model.ts"),
    find: "    for (const literal of [...denied, ...others]) {",
    replace: "    for (const literal of asked.parts) {",
    tests: ["src/logic/tests/contradiction.test.ts"],
  },
  {
    name: "why tells only the step of a rule body, not an exists the solver decides",
    file: core("logic/explain.ts"),
    find: '  isForm(goal, "and", "exists") && !hasRoutes(goal)',
    replace: "  false",
    tests: ["src/logic/tests/contradiction.test.ts"],
  },
  {
    name: "a match's last pair is its fallback",
    file: core("evaluation/special-forms/match.ts"),
    find: "  const hasFallback = !isMatchCase(last);",
    replace: "  const hasFallback = true;",
    tests: ["src/logic/tests/host-functions.test.ts"],
  },
  {
    name: "the analysis warns of no case a match cannot reach",
    file: core("analysis/analyze.ts"),
    find: "      return at <= 0 || earlier < 0",
    replace: "      return true",
    tests: ["src/analysis/tests/match-cases.test.ts"],
  },
  {
    name: "the analysis warns of a case only one before the one that covers it",
    file: core("analysis/analyze.ts"),
    find: "        .slice(0, Math.max(at, 0))",
    replace: "        .slice(0, Math.max(at - 1, 0))",
    tests: ["src/analysis/tests/match-cases.test.ts"],
  },
  {
    name: "a schema does not include itself",
    file: core("logic/inclusion.ts"),
    find: "  inner === outer || sameWritten(inner, outer)",
    replace: "  inner === outer",
    tests: [
      "src/analysis/tests/match-cases.test.ts",
      "src/logic/tests/inclusion.test.ts",
    ],
  },
  {
    name: "a contract does not check its argument",
    file: core("evaluation/special-forms/lambda.ts"),
    find: "      if (schema !== undefined) {\n        const result = applyIn(",
    replace: "      if (false) {\n        const result = applyIn(",
    tests: ["src/evaluation/tests/contracts.test.ts"],
  },
  {
    name: "a contract is checked inside the body, naming the function first",
    file: core("evaluation/special-forms/lambda.ts"),
    find: "  if (!(result instanceof Pending) || result instanceof Called) {",
    replace: "  if (!(result instanceof Pending)) {",
    tests: ["src/evaluation/tests/failures.test.ts"],
  },
  {
    name: "a match on a contract is not checked to cover it",
    file: core("analysis/analyze.ts"),
    find: "  return covered === false",
    replace: "  return covered === undefined",
    tests: ["src/analysis/tests/match-cases.test.ts"],
  },
  {
    name: "a promise runs its expression at every force",
    file: core("evaluation/special-forms/delay.ts"),
    find: "    if (this.given !== undefined) {\n      return Effect.succeed(this.given.value);",
    replace:
      "    if (this.given === null) {\n      return Effect.succeed(this.given.value);",
    tests: ["src/evaluation/tests/delay.test.ts"],
  },
  {
    name: "a promise forced while it is being forced runs again",
    file: core("evaluation/special-forms/delay.ts"),
    find: "    if (this.running) {",
    replace: "    if (this.running && this.given !== undefined) {",
    tests: ["src/evaluation/tests/delay.test.ts"],
  },
];
