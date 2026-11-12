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

export const MUTATIONS: readonly Mutation[] = [
  {
    name: "find does not sort what it found",
    file: core("logic/model.ts"),
    find: "    return values.sort(compareValues);",
    replace: "    return values;",
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
    find: "    return args.some(asks) && lambdaInfo(fn) !== undefined",
    replace: "    return false && lambdaInfo(fn) !== undefined",
  },
  {
    name: "the relations a find's template asks about are not derived first",
    file: core("logic/database.ts"),
    find: "      for (const relation of mentioned(question.parts[0])) {",
    replace: "      for (const relation of mentioned(undefined)) {",
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
    find: "  const question = asked(rule.body, rule.head.args).find(inCycle);",
    replace: "  const question = asked([], []).find(inCycle);",
  },
  {
    name: "derived rows survive a change to the facts",
    file: core("logic/database.ts"),
    find: "  database.model = undefined;",
    replace: "  database.model = database.model;",
  },
  {
    name: "a question may go through recursion when it runs",
    file: core("logic/model.ts"),
    find: '    if (state === "running") {',
    replace: '    if (state === "never") {',
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
    file: core("evaluation/special-forms/logic.ts"),
    find: "      : yield* Effect.forEach(operands, answer);",
    replace: "      : operands;",
  },
  {
    name: "a record does not ask a goal among its values",
    file: core("evaluation/base-forms/record.ts"),
    find: "          writing ? suspend(expression) : Effect.all(Record.map(record, answer))",
    replace: "          writing ? suspend(expression) : Effect.succeed(record)",
  },
  {
    name: "a fact does not ask a goal among its arguments",
    file: core("evaluation/special-forms/logic.ts"),
    find: "        value.args.some(isQuestion)",
    replace: "        value.args.some(() => false)",
  },
  {
    name: "why writes a question's own variables as ?_",
    file: core("logic/terms.ts"),
    find: "        : variableName(variable),",
    replace: '        : "?_",',
  },
  {
    name: "a rule works out a question while it is being written",
    file: core("evaluation/special-forms/function.ts"),
    find: "    return closed.some(isLive)",
    replace: "    return closed.some(() => false)",
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
];
