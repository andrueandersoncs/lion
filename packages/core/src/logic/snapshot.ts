/**
 * Snapshots write a logic database out as a Lion program: its relations,
 * facts, rules, and invariants as `relation`, `fact`, `rule`, and `invariant`
 * forms. Evaluating the program into an empty database rebuilds it, so a
 * snapshot is both the save format and ordinary Lion that can be read,
 * edited, and run. Invariants come last, so loading never checks them
 * against a half-built database.
 */
import { Effect } from "effect";
import { LogicError } from "@/errors/evaluation";
import { run } from "@/evaluation/evaluate";
import { keyColumns, LogicDatabase } from "@/logic/database";
import {
  Aggregate,
  Atom,
  Conjunction,
  DeferredCall,
  Disjunction,
  isGroundValue,
  isLogicVariableName,
  LogicVariable,
  Membership,
  Negation,
  render,
  Unification,
} from "@/logic/terms";

export interface SnapshotOptions {
  /**
   * Names bound where the snapshot will be evaluated. A string equal to one
   * of them is written inside `quote`, so it stays a string when loaded.
   */
  readonly isBound?: (name: string) => boolean;
}

class Unwritable extends Error {}

const writer = (database: LogicDatabase, options: SnapshotOptions) => {
  const relations = new Set(database.relations.keys());
  // Strings that evaluate to something else are quoted: logic variable
  // names, relation names, and names bound in the environment. Namespaced
  // names such as "number/add" are quoted too, since every module binds them.
  const evaluatesToItself = (text: string) =>
    !(
      isLogicVariableName(text) ||
      relations.has(text) ||
      text.includes("/") ||
      (options.isBound?.(text) ?? false)
    );

  const value = (item: unknown): unknown => {
    if (!isGroundValue(item)) {
      throw new Unwritable(
        `${JSON.stringify(render(item)) ?? String(item)} is not JSON data`
      );
    }
    if (typeof item === "string") {
      return evaluatesToItself(item) ? item : ["quote", item];
    }
    return typeof item === "object" && item !== null ? ["quote", item] : item;
  };

  const term = (item: unknown): unknown => {
    if (item instanceof LogicVariable) {
      return render(item);
    }
    if (item instanceof DeferredCall) {
      return [item.name, ...item.args.map(term)];
    }
    if (item instanceof Aggregate) {
      return [`aggregate/${item.kind}`, term(item.arg)];
    }
    return value(item);
  };

  const goal = (item: unknown): unknown => {
    if (item instanceof Atom) {
      const { computed, name } = item.relation;
      if (computed === undefined) {
        return [name, ...item.args.map(term)];
      }
      const inputs = computed.inputs.map((input, index) =>
        computed.inputKinds[index] === "relation" ? input : value(input)
      );
      return [computed.callee, ...inputs, ...item.args.map(term)];
    }
    if (item instanceof Negation) {
      return ["not", goal(item.atom)];
    }
    if (item instanceof Conjunction) {
      return ["and", ...item.goals.map(goal)];
    }
    if (item instanceof Disjunction) {
      return ["or", ...item.goals.map(goal)];
    }
    if (item instanceof Unification) {
      return ["=", term(item.left), term(item.right)];
    }
    if (item instanceof Membership) {
      return ["in", term(item.element), term(item.list)];
    }
    return typeof item === "boolean" ? item : term(item);
  };

  return { goal, value };
};

/**
 * Writes a database as a Lion program that rebuilds it. Fails when a rule or
 * invariant holds a value that is not JSON data, such as a function.
 */
export const saveDatabase = (
  database: LogicDatabase,
  options: SnapshotOptions = {}
): Effect.Effect<unknown[], LogicError> =>
  Effect.try({
    try: () => {
      const { goal, value } = writer(database, options);
      const forms: unknown[] = [];
      for (const relation of database.relations.values()) {
        forms.push(
          relation.key === undefined
            ? ["relation", relation.name, relation.columns]
            : [
                "relation",
                relation.name,
                relation.columns,
                { key: keyColumns(relation) },
              ]
        );
      }
      for (const [name, facts] of database.facts) {
        if (facts.size > 0) {
          forms.push([
            "fact",
            ...[...facts.values()].map((tuple) => [name, ...tuple.map(value)]),
          ]);
        }
      }
      // Alternatives of one `or` share their source, so each rule form is
      // written once.
      const written = new Set<unknown>();
      for (const rule of database.rules) {
        if (!written.has(rule.source)) {
          written.add(rule.source);
          const [head, ...body] = rule.definition ?? [];
          forms.push(["rule", goal(head), ...body.map(goal)]);
        }
      }
      for (const invariant of database.invariants) {
        forms.push([
          "invariant",
          goal(invariant.goal),
          { assert: invariant.assert },
        ]);
      }
      return ["begin", ...forms];
    },
    catch: (error) =>
      new LogicError({
        message: `Cannot snapshot the database: ${error instanceof Unwritable ? error.message : String(error)}.`,
      }),
  });

/** Evaluates a snapshot, or any Lion program, into a new database. */
export const loadDatabase = (
  program: unknown,
  environment: Record<string, unknown>
) => {
  const database = new LogicDatabase();
  return run(program, environment, { database }).pipe(Effect.as(database));
};
