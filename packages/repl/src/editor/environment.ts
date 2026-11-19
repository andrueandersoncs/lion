import { stdlib } from "@lionlang/core/modules";
import { makeTypeSafeBindings } from "@lionlang/typesafe-ai";

/** True when a program names a TypeSafe function, so a run binds them. */
export const usesTypeSafeBindings = (value: unknown): boolean => {
  if (typeof value === "string") {
    return value.startsWith("typesafe/");
  }
  if (Array.isArray(value)) {
    return value.some(usesTypeSafeBindings);
  }
  if (value && typeof value === "object") {
    return Object.values(value).some(usesTypeSafeBindings);
  }
  return false;
};

export const sourceUsesTypeSafeBindings = (sourceText: string): boolean => {
  try {
    return usesTypeSafeBindings(JSON.parse(sourceText));
  } catch {
    return false;
  }
};

export const renderResult = (value: unknown): string => {
  const seen = new WeakSet<object>();
  let visited = 0;
  try {
    const result = JSON.stringify(
      value,
      (_key, item: unknown) => {
        visited += 1;
        if (visited > 2000) {
          return "[truncated]";
        }
        if (typeof item === "bigint") {
          return `${item}n`;
        }
        if (typeof item === "function") {
          return `[function ${item.name || "anonymous"}]`;
        }
        if (item && typeof item === "object") {
          if (seen.has(item)) {
            return "[circular]";
          }
          seen.add(item);
        }
        return item;
      },
      2
    );
    return result ?? String(value);
  } catch (error) {
    return error instanceof Error ? error.message : String(value);
  }
};

/**
 * What a run in the editor binds: the standard library, the TypeSafe
 * functions when the program names one, and a console that writes to the
 * run's transcript.
 */
export const makeEvaluationEnvironment = (
  usesJev: boolean,
  apiKey: string | null,
  transcript: string[]
): Record<string, unknown> => ({
  ...stdlib,
  ...(usesJev
    ? makeTypeSafeBindings({
        apiKey: apiKey ?? "",
        baseURL: "/api/typesafe",
        dangerouslyAllowBrowser: true,
        logLevel: "off",
      })
    : {}),
  "console/log": (message: string) => {
    transcript.push(message);
    return message;
  },
  "console/log-json": (message: unknown) => {
    const rendered = renderResult(message);
    transcript.push(rendered);
    return rendered;
  },
});

const ANALYSIS_ENVIRONMENTS = new Map<boolean, Record<string, unknown>>();

/**
 * What a run of a program would bind, for reading the program as the run
 * reads it. Nothing in it runs, so the TypeSafe functions need no key.
 */
export const analysisEnvironment = (value: unknown) => {
  const usesJev = usesTypeSafeBindings(value);
  const known = ANALYSIS_ENVIRONMENTS.get(usesJev);
  if (known !== undefined) {
    return known;
  }
  const environment = makeEvaluationEnvironment(usesJev, "unused", []);
  ANALYSIS_ENVIRONMENTS.set(usesJev, environment);
  return environment;
};
