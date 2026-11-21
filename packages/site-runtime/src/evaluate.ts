// Evaluates a Lion program from source text and formats the outcome the way
// the live examples on lionlang.dev show it. The Web Worker uses it for the
// page, and the docs build uses it to write each example's result, so a
// published result always matches what the page computes.
import { run } from "@lionlang/core/evaluation/evaluate";
import { readJson } from "@lionlang/core/evaluation/reading";
import { stdlib } from "@lionlang/core/modules";
import { NotJson } from "@lionlang/core/numbers/exact";
import { Cause, Console, Effect, Exit, Scheduler } from "effect";

export interface EvaluateRequest {
  readonly id: number;
  readonly source: string;
}

export type EvaluateResponse =
  | {
      readonly id: number;
      readonly ok: true;
      readonly value: string;
      readonly logs: readonly string[];
      readonly ms: number;
    }
  | {
      readonly id: number;
      readonly ok: false;
      readonly error: string;
      readonly logs: readonly string[];
      /** How long the program ran. A program that did not run has no time. */
      readonly ms?: number;
    };

const MAX_OUTPUT_LENGTH = 4000;
const MAX_LOG_LINES = 50;
const COMPACT_LENGTH = 60;
const INLINE_WIDTH = 64;
const FUNCTION_MARKER = "\u0000function\u0000";

const truncate = (text: string) =>
  text.length > MAX_OUTPUT_LENGTH
    ? `${text.slice(0, MAX_OUTPUT_LENGTH)}\n… (${text.length - MAX_OUTPUT_LENGTH} more characters)`
    : text;

const replacer = (_key: string, value: unknown) => {
  if (typeof value === "function") {
    return FUNCTION_MARKER;
  }
  return value === undefined ? null : value;
};

// JSON escapes the marker's control characters, so match its encoded form.
const showFunctions = (json: string) =>
  json.replaceAll(JSON.stringify(FUNCTION_MARKER), "<function>");

const stringify = (value: unknown) => {
  const json = JSON.stringify(value, replacer);
  return json === undefined ? undefined : showFunctions(json);
};

const raw = JSON as {
  readonly isRawJSON?: (value: unknown) => boolean;
  readonly rawJSON?: (text: string) => unknown;
};

/** Reads JSON text back with each number's digits as they are written. */
const digits = (_key: string, value: unknown, context?: { source?: string }) =>
  typeof value === "number" &&
  context?.source !== undefined &&
  raw.rawJSON !== undefined
    ? raw.rawJSON(context.source)
    : value;

/**
 * Indents arrays and objects, keeping any part that fits within the width on
 * one line so nested results such as `why` explanations stay readable.
 */
const pretty = (value: unknown, indent = ""): string => {
  const compact = JSON.stringify(value);
  if (
    value === null ||
    typeof value !== "object" ||
    raw.isRawJSON?.(value) === true ||
    indent.length + compact.length <= INLINE_WIDTH
  ) {
    return compact;
  }
  const inner = `${indent}  `;
  const lines = Array.isArray(value)
    ? value.map((item) => inner + pretty(item, inner))
    : Object.entries(value).map(
        ([key, item]) =>
          `${inner}${JSON.stringify(key)}: ${pretty(item, inner)}`
      );
  const [open, close] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  return `${open}\n${lines.join(",\n")}\n${indent}${close}`;
};

/** Renders a Lion value as JSON, compact when short and indented otherwise. */
export const formatValue = (value: unknown): string => {
  if (typeof value === "function") {
    return "<function>";
  }
  if (value === undefined) {
    return "undefined";
  }
  try {
    const json = JSON.stringify(value, replacer);
    if (json === undefined) {
      return String(value);
    }
    return truncate(
      showFunctions(
        json.length <= COMPACT_LENGTH
          ? json
          : pretty(JSON.parse(json, digits as Parameters<typeof JSON.parse>[1]))
      )
    );
  } catch (error) {
    // A fraction no decimal writes, such as 1/3, has no JSON text.
    if (error instanceof NotJson) {
      throw error;
    }
    // Cyclic host values cannot be serialized.
    return truncate(String(value));
  }
};

const hasTag = (
  error: unknown,
  tag: string
): error is Record<string, unknown> =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === tag;

/** Turns an evaluation failure into a one-paragraph message for the page. */
export const describeError = (error: unknown): string => {
  if (hasTag(error, "InvalidFunctionCallError")) {
    return `InvalidFunctionCallError: ${stringify(error.expression)} is not a valid call. The first element must be a special form or evaluate to a function.`;
  }
  if (error instanceof Error) {
    const name = hasTag(error, "SchemaError") ? "SchemaError" : error.name;
    return `${name}: ${error.message}`;
  }
  return String(error);
};

const makeConsole = (logs: string[]): Console.Console => {
  const write = (...args: readonly unknown[]) => {
    if (logs.length < MAX_LOG_LINES) {
      logs.push(
        args
          .map((arg) => (typeof arg === "string" ? arg : formatValue(arg)))
          .join(" ")
      );
    }
  };
  const ignore = () => undefined;
  return {
    assert: (condition, ...args) => {
      if (!condition) {
        write(...args);
      }
    },
    clear: ignore,
    count: ignore,
    countReset: ignore,
    debug: write,
    dir: write,
    dirxml: write,
    error: write,
    group: write,
    groupCollapsed: write,
    groupEnd: ignore,
    info: write,
    log: write,
    table: write,
    time: ignore,
    timeEnd: ignore,
    timeLog: ignore,
    trace: write,
    warn: write,
  };
};

/**
 * Parses and evaluates a program with the standard library, capturing
 * `console` output. The evaluator never yields to the scheduler: in a browser
 * each yield waits on a clamped setTimeout, which made long logic queries
 * spend most of their time idle. The page owns timeouts instead.
 */
export const evaluateSource = async ({
  id,
  source,
}: EvaluateRequest): Promise<EvaluateResponse> => {
  const logs: string[] = [];
  const started = performance.now();
  const read = await Effect.runPromiseExit(readJson(source));
  if (Exit.isFailure(read)) {
    return {
      id,
      ok: false,
      error: describeError(Cause.squash(read.cause)),
      logs,
    };
  }
  const program = read.value;
  const exit = await Effect.runPromiseExit(
    run(program, stdlib).pipe(
      Effect.provideService(Console.Console, makeConsole(logs)),
      Effect.provideService(Scheduler.PreventSchedulerYield, true)
    )
  );
  const ms = performance.now() - started;
  if (Exit.isSuccess(exit)) {
    try {
      return { id, ok: true, value: formatValue(exit.value), logs, ms };
    } catch (error) {
      return { id, ok: false, error: describeError(error), logs, ms };
    }
  }
  return {
    id,
    ok: false,
    error: describeError(Cause.squash(exit.cause)),
    logs,
    ms,
  };
};
