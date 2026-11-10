import { markPure } from "@/logic/terms";
import { module as aggregate } from "./aggregate.ts";
import { module as array } from "./array.ts";
import { module as boolean } from "./boolean.ts";
import { module as console } from "./console.ts";
import { module as func } from "./func.ts";
import { module as graph } from "./graph.ts";
import { module as number } from "./number.ts";
import { module as object } from "./object.ts";
import { module as string } from "./string.ts";
import { module as value } from "./value.ts";

export const namespaceEntries = (
  namespace: string,
  record: Record<string, unknown>
) => {
  const result: Record<string, unknown> = {};

  for (const entry of Object.entries(record)) {
    const [key, value] = entry;
    result[`${namespace}/${key}`] = value;
  }

  return result;
};

// Pure modules can be used inside rules: called with a logic variable, their
// functions wait until the variable is bound instead of running. Aggregates
// called with a logic variable become aggregates for a rule head instead, and
// graph algorithms build goals over computed relations.
export const stdlib = {
  ...namespaceEntries("aggregate", aggregate),
  ...namespaceEntries("array", markPure(array)),
  ...namespaceEntries("boolean", markPure(boolean)),
  ...namespaceEntries("console", console),
  ...namespaceEntries("func", func),
  ...namespaceEntries("graph", graph),
  ...namespaceEntries("number", markPure(number)),
  ...namespaceEntries("object", object),
  ...namespaceEntries("string", markPure(string)),
  ...namespaceEntries("value", markPure(value)),
};
