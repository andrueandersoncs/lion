import { func } from "./func.ts";
import { list } from "./list.ts";
import { logic } from "./logic.ts";
import { math } from "./math.ts";
import { object } from "./object.ts";

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

export const stdlib = {
  ...namespaceEntries("math", math),
  ...namespaceEntries("logic", logic),
  ...namespaceEntries("list", list),
  ...namespaceEntries("object", object),
  ...namespaceEntries("func", func),
};
