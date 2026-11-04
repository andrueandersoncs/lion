// Web Worker that evaluates Lion programs for the live examples on
// lionlang.dev. The page owns timeouts: it terminates this worker when a
// program runs too long, so nothing here needs to guard against runaway code.
import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";
import { Cause, Console, Effect, Exit } from "effect";

interface EvaluateRequest {
  readonly id: number;
  readonly source: string;
}

type EvaluateResponse =
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
      readonly ms: number;
    };

const MAX_OUTPUT_LENGTH = 4000;
const MAX_LOG_LINES = 50;
const COMPACT_LENGTH = 60;
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

const stringify = (value: unknown, indent?: number) =>
  JSON.stringify(value, replacer, indent)?.replaceAll(
    `"${FUNCTION_MARKER}"`,
    "<function>"
  );

/** Renders a Lion value as JSON, compact when short and indented otherwise. */
const formatValue = (value: unknown): string => {
  if (typeof value === "function") {
    return "<function>";
  }
  if (value === undefined) {
    return "undefined";
  }
  try {
    const compact = stringify(value) ?? String(value);
    return truncate(
      compact.length <= COMPACT_LENGTH
        ? compact
        : (stringify(value, 2) ?? compact)
    );
  } catch {
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
const describeError = (error: unknown): string => {
  if (hasTag(error, "InvalidFunctionCallError")) {
    return `InvalidFunctionCallError: ${stringify(error.expression)} is not a valid call. The first element must be a special form or evaluate to a function.`;
  }
  if (hasTag(error, "ArgumentMismatchError")) {
    return "ArgumentMismatchError: a lambda was called with fewer arguments than it has parameters.";
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

const evaluateSource = async ({
  id,
  source,
}: EvaluateRequest): Promise<EvaluateResponse> => {
  const logs: string[] = [];
  const started = performance.now();
  let program: unknown;
  try {
    program = JSON.parse(source);
  } catch (error) {
    return {
      id,
      ok: false,
      error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      logs,
      ms: 0,
    };
  }
  const exit = await Effect.runPromiseExit(
    run(program, stdlib).pipe(
      Effect.provideService(Console.Console, makeConsole(logs))
    )
  );
  const ms = performance.now() - started;
  return Exit.isSuccess(exit)
    ? { id, ok: true, value: formatValue(exit.value), logs, ms }
    : {
        id,
        ok: false,
        error: describeError(Cause.squash(exit.cause)),
        logs,
        ms,
      };
};

self.addEventListener("message", (event: MessageEvent<EvaluateRequest>) => {
  evaluateSource(event.data).then(
    (response) => self.postMessage(response),
    (error: unknown) =>
      self.postMessage({
        id: event.data.id,
        ok: false,
        error: describeError(error),
        logs: [],
        ms: 0,
      } satisfies EvaluateResponse)
  );
});
