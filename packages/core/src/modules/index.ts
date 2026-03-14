import { func } from "./func.ts";
import { list } from "./list.ts";
import { logic } from "./logic.ts";
import { math } from "./math.ts";
import { object } from "./object.ts";

export const generateFunctionLabels = (
  label: string,
  module: Record<string, unknown>
) => {
  const labeledValues: Record<string, unknown> = {};

  for (const entry of Object.entries(module)) {
    const [key, value] = entry;
    labeledValues[`${label}/${key}`] = value;
  }

  return labeledValues;
};

export const stdlib = {
  ...generateFunctionLabels("math", math),
  ...generateFunctionLabels("logic", logic),
  ...generateFunctionLabels("list", list),
  ...generateFunctionLabels("object", object),
  ...generateFunctionLabels("func", func),
};
