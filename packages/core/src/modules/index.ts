import { nameFunctions } from "@/logic/terms";
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

// Every function waits when it is called with a logic variable, so all of
// them work inside rules and queries. Aggregates and graph algorithms take
// logic variables as they are: they build aggregates and goals from them.
export const stdlib = {
  ...namespaceEntries("aggregate", aggregate),
  ...namespaceEntries("array", array),
  ...namespaceEntries("boolean", boolean),
  ...namespaceEntries("console", console),
  ...namespaceEntries("func", func),
  ...namespaceEntries("graph", graph),
  ...namespaceEntries("number", number),
  ...namespaceEntries("object", object),
  ...namespaceEntries("string", string),
  ...namespaceEntries("value", value),
};

nameFunctions(stdlib);
