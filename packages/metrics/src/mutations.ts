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
const reasoning = (file: string) => `skills/lion-reasoning/${file}`;
const REASONING_TESTS = {
  package: "metrics",
  tests: ["src/tests/reasoning-skill.test.ts"],
};

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

const MAINTAINED_TESTS = ["src/logic/tests/maintained.test.ts"];
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
    find: "    return changed ? () => undo(log ?? []) : undefined;",
    replace: "    return changed ? () => undo([]) : undefined;",
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
  maintained(
    "rows a change reached stay",
    "      model.relations.get(name)?.delete(row);\n",
    ""
  ),
  maintained(
    "what a change reached is not derived again",
    "        : deriveHeads(model, rule, (sink) => each(model, body, sink), added);",
    "        : Effect.void;"
  ),
  maintained(
    "lost rows are not put back for the search",
    "        rowsOf(model, name).add(row, back);\n",
    ""
  ),
  maintained(
    "a change reaches a row that is a fact",
    "    : rows.filter((row) => !facts?.has(row));",
    "    : rows;"
  ),
  maintained(
    "a row that becomes a fact keeps its derivation",
    "        model.derivations.get(name)?.delete(key);\n",
    ""
  ),
  maintained(
    "a rule that invents into a relation with a key is followed",
    "(rule.invents === undefined || inventsAlone(stratum)) &&",
    "true &&"
  ),
  maintained(
    "a fact does not reach the row a rule invented in its place",
    "    uses.push(use(goal, skeleton, true));\n  }\n",
    "  }\n"
  ),
  maintained(
    "nothing is invented again for what a change reached",
    "        : inventFor(model, rule, (sink) => each(model, body, sink), added);",
    "        : Effect.void;"
  ),
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
    "new rows do not go through the rules",
    "    yield* rounds(model, rules, derive, start, (more) =>",
    "    yield* rounds(model, rules, derive, new Map(), (more) =>"
  ),
  maintained(
    "what a group gained is not passed on",
    "minus.add(row);\n      }\n    }\n    gained.set(name, plus);",
    "minus.add(row);\n      }\n    }\n    gained.set(name, new TupleSet());"
  ),
  maintained(
    "what a group lost is not passed on",
    "    lost.set(name, minus);\n  }\n};",
    "    lost.set(name, new TupleSet());\n  }\n};"
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
    "a row a change reached does not reach the rows it gave",
    "          rowsIn(next, relation).add(row);\n",
    ""
  ),
  maintained(
    "a goal that stands in a question is not followed",
    "      uses.push(use(goal, skeleton, true));\n",
    ""
  ),
  maintained(
    "a row the relation of a question gains reaches nothing",
    "(use.asked || gains)",
    "gains"
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
    "a row another rule gave is not derived again",
    "    names.add(positions.map((position) => row[position]));\n",
    ""
  ),
  maintained(
    "a head value a find gave names its row",
    'rule.aggregates.includes(position) || asks(arg) || isForm(arg, "some")',
    'rule.aggregates.includes(position) || isForm(arg, "some")'
  ),
  maintained(
    "an aggregate that recurses starts every group over",
    "      ...(recursive ? { start } : {}),\n",
    ""
  ),
  maintained(
    "what an aggregate that recurses gained does not join it",
    "          ? changedEach(model, rule.body, news, sink)\n",
    "          ? Effect.void\n"
  ),
  maintained(
    "a group a change reached is not combined again",
    "    addAll(added, yield* combined(model, rules, groups, first));",
    "    yield* Effect.void;"
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
    tests: MAINTAINED_TESTS,
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
    find: "    undone: Effect.suspend(() => follow(database, back(), touched)),",
    replace: "    undone: Effect.void,",
    tests: MAINTAINED_TESTS,
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

export const MUTATIONS: readonly Mutation[] = [
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
    name: "an equality rule makes no unknowns one",
    file: core("logic/model.ts"),
    find: "    for (const vars of answers) {\n      const [left, right] = yield* tupleOf(model, rule.head.args, vars);\n      unify(model, left, right, inventions);\n    }",
    replace:
      "    for (const vars of answers.slice(0, 0)) {\n      const [left, right] = yield* tupleOf(model, rule.head.args, vars);\n      unify(model, left, right, inventions);\n    }",
    tests: EXISTENTIAL_TESTS,
  },
  {
    name: "an equality rule is not kept as the invariant it stands for",
    file: core("evaluation/special-forms/logic.ts"),
    find: "    yield* addRules(yield* database, rules, invariants);",
    replace: "    yield* addRules(yield* database, rules, []);",
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
    name: "a rule that invents does so even when its head holds already",
    file: core("logic/model.ts"),
    find: "      if ((yield* matches(model, check, vars)).length === 0) {",
    replace: "      if (check.length >= 0) {",
    tests: EXISTENTIAL_TESTS,
  },
  {
    name: "a key does not make an invented unknown equal to another value",
    file: core("logic/model.ts"),
    find: "    if (inventions !== undefined && unify(model, other, tuple, inventions)) {",
    replace: "    if (inventions !== undefined && false) {",
    tests: EXISTENTIAL_TESTS,
  },
  {
    name: "a key keeps the unknown that sorts last",
    file: core("logic/model.ts"),
    find: "      (free(other) && !occurs(other, value) && compareValues(value, other) < 0);",
    replace:
      "      (free(other) && !occurs(other, value) && compareValues(value, other) > 0);",
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
    name: "rules that invent run before the others have finished",
    file: core("logic/model.ts"),
    find: "      yield* rounds(model, rules, run, delta, settle);",
    replace:
      "      yield* (triggers.length > 0 ? Effect.void : rounds(model, rules, run, delta, settle));",
    tests: EXISTENTIAL_TESTS,
  },
  {
    name: "why keeps the explanations rows had before a key made unknowns one",
    file: core("logic/model.ts"),
    find: "        if (inventions !== undefined && inventions.equal.size > 0) {",
    replace:
      "        if (inventions !== undefined && inventions.equal.size < 0) {",
    tests: EXISTENTIAL_TESTS,
  },
  {
    name: "a key makes an unknown equal to a value that holds it",
    file: core("logic/model.ts"),
    find: "      !free(value) ||\n      occurs(value, other) ||",
    replace: "      !free(value) ||",
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
    name: "relations that depend on each other wait for each other's rows",
    file: core("logic/model.ts"),
    find: '  if (state === "done" || (reading && state === "running")) {',
    replace: '  if (state === "done") {',
  },
  {
    name: "a group derives every relation its rules read before it runs",
    file: core("logic/model.ts"),
    find: "    yield* evaluate(model, stratum);",
    replace:
      "    for (const relation of stratum.rules.flatMap((rule) => rule.body.flatMap(mentioned))) {\n      if (!members.has(relation.name)) {\n        yield* ensure(model, relation);\n      }\n    }\n    yield* evaluate(model, stratum);",
    tests: ["src/logic/tests/goal-directed.test.ts"],
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
    find: "    if (model === undefined || running) {\n      touch(database);\n      return Effect.void;\n    }\n    if (goals.size",
    replace:
      "    if (true) {\n      return Effect.void;\n    }\n    if (goals.size",
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
  {
    name: "cond does not ask a goal it tests",
    file: core("evaluation/special-forms/cond.ts"),
    find: "        holds = yield* answer(holds);",
    replace: "        holds = true;",
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
    find: "            : Effect.all(Record.map(record, answer))",
    replace: "            : Effect.succeed(record)",
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
    find: "    return run(args).pipe(Effect.catch(unlessWriting));",
    replace: "    return run(args);",
  },
  {
    name: "match does not ask the goal it is given",
    file: core("evaluation/special-forms/match.ts"),
    find: "      value = yield* answer(value);",
    replace: "      value = true;",
  },
  // Schemas, and the invariants a change to facts can break.
  {
    name: "a predicate that answers something other than true still fits",
    file: core("logic/fit.ts"),
    find: "        : Effect.succeed(result === true)",
    replace: "        : Effect.succeed(Boolean(result))",
    tests: ["src/logic/tests/schemas.test.ts"],
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
    find: "  return at.open.has(named)",
    replace: "  return false && at.open.has(named)",
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
    find: "  Array.isArray(value) && value.length === parts.length",
    replace: "  Array.isArray(value) && value.length >= parts.length",
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
    find: "  for (const key of open ? [] : Object.keys(value)) {",
    replace: "  for (const key of [] as string[]) {",
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
    find: "      if (yield* fits(schema, value)) {",
    replace: "      if (!(yield* fits(schema, value))) {",
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
    name: "an invariant is not asked after a change to what it asks about",
    file: core("logic/database.ts"),
    find: "    if (opaque || reaches(others)) {",
    replace: "    if (opaque) {",
    tests: [
      "src/logic/tests/incremental.test.ts",
      "src/logic/tests/invariants.test.ts",
    ],
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
    find: "  for (const key of open ? [] : Object.keys(value)) {",
    replace: "  for (const key of Object.keys(value)) {",
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
    find: "      recordOf(record) === undefined\n        ? logicError(",
    replace: "      recordOf(record) === null\n        ? logicError(",
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
    find: "  const isPattern =\n    ofPattern === false || patternParts(term.args[0], true) !== undefined;",
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
    name: "a string that reads as a misspelled name is a string",
    file: core("evaluation/base-forms/primitive.ts"),
    find: "        return isNamespacedName(name)\n          ? nameOrString(environment, name)\n          : Effect.succeed(name);",
    replace: "        return Effect.succeed(name);",
    tests: ["src/evaluation/tests/names.test.ts"],
  },
  {
    name: "a misspelled name suggests no other",
    file: core("evaluation/base-forms/primitive.ts"),
    find: "      if (edits < fewest) {",
    replace: "      if (false) {",
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
    find: "        quoted || isLogicVariableName(name) || isSpecialFormName(name);",
    replace: "        isLogicVariableName(name) || isSpecialFormName(name);",
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
    name: "an invariant that holds a function from the host is not asked in full",
    file: core("logic/database.ts"),
    find: "    if (opaque || reaches(others)) {",
    replace: "    if (reaches(others)) {",
    tests: [
      "src/logic/tests/incremental.test.ts",
      "src/logic/tests/invariants.test.ts",
    ],
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
    file: core("logic/model.ts"),
    find: "        const tuple = yield* matchedRow(model, literal, vars);",
    replace: "        const tuple = yield* tupleOf(model, literal.args, vars);",
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
    find: "      (arg, position) => (free(arg, true) && position >= inputs) || known(arg)",
    replace:
      "      (arg, position) => (free(arg) && position >= inputs) || known(arg)",
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
    find: "      return inModule || nearest !== null",
    replace: "      return nearest !== null",
    tests: ["src/evaluation/tests/names.test.ts"],
  },
  {
    name: "a string a letter away from a bound name is data",
    file: core("evaluation/base-forms/primitive.ts"),
    find: "      return inModule || nearest !== null",
    replace: "      return inModule",
    tests: ["src/evaluation/tests/names.test.ts"],
  },
  {
    name: "every unbound string with a slash in it is a misspelled name",
    file: core("evaluation/base-forms/primitive.ts"),
    find: "      return inModule || nearest !== null",
    replace: "      return true",
    tests: ["src/evaluation/tests/names.test.ts"],
  },
  {
    name: "a name that is not of the form module/name is suggested for one that is",
    file: core("evaluation/base-forms/primitive.ts"),
    find: "      for (const candidate of [...names].filter(isNamespacedName).sort()) {",
    replace: "      for (const candidate of [...names].sort()) {",
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
    find: "    return args.every(isHeld) || relationOf(fn) === undefined",
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
    name: "the editor takes only the first name of a schema form for a definition",
    file: core("analysis/analyze.ts"),
    find: '    form === "schema" ? expression.filter((_, at) => at % 2) : [name];',
    replace: "    [name];",
    tests: ["src/analysis/analyze.test.ts"],
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
    find: '  add: arithmetic("add", "+", (a, b) => a + b, SOME),',
    replace: '  add: arithmetic("add", "+", (a, b) => a + b),',
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
    find: "          texts.length < 2",
    replace: "          texts.length < 1",
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
    file: core("logic/model.ts"),
    find: "        out.push({ check: instantiate(literal, vars) });",
    replace:
      '        if (!isForm(literal, "=", "in")) out.push({ check: instantiate(literal, vars) });',
    tests: ["src/logic/tests/explain.test.ts"],
  },
  {
    name: "why shows a check without the answer's values in it",
    file: core("logic/model.ts"),
    find: "        out.push({ check: instantiate(literal, vars) });",
    replace: "        out.push({ check: instantiate(literal, NO_VARS) });",
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
    find: "Number.isFinite(n) ? n + 0 : undefined",
    replace: "Number.isFinite(n) ? n : undefined",
    tests: ["src/modules/tests/models.test.ts"],
  },
  {
    name: "a number read as text keeps a number JSON cannot hold",
    file: core("modules/lib/numerals.ts"),
    find: "Number.isFinite(n) ? n + 0 : undefined",
    replace: "n + 0",
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
    find: "([value, start]) => value.slice(start))",
    replace: "([value, start]) => value.slice(Math.max(start, 0)))",
    tests: ["src/modules/tests/models.test.ts"],
  },
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
];
