/**
 * Machine-applicable RFC 6902 JSON Patch quick-fixes derived from Lion static
 * analysis (`analyze`) and Lion-written lints (`lint`).
 *
 * Designed for agent loops and IDEs: instead of burning an LLM retry turn to
 * fix deterministic mistakes (misspelled `module/name`, bare list pattern
 * `["?a", "?b"]`, multi-goal `query`/`find` missing `and`, bare logic variable
 * in a ground `fact`), callers can inspect or apply the returned patches directly.
 */
import { Effect } from "effect";
import { analyze, flattenAnalysis } from "@/analysis/analyze";
import { lint } from "@/analysis/lint";
import { stdlib } from "@/modules";
import type { LionExpressionType } from "@/schemas/lion-expression";

/** A single RFC 6902 JSON Patch operation. */
export interface JsonPatchOp {
  readonly op: "replace" | "add" | "remove";
  readonly path: string;
  readonly value?: unknown;
}

/** A suggested auto-fix alongside the diagnostic that motivated it. */
export interface AutoFix {
  readonly at: string;
  readonly message: string;
  readonly patch: readonly JsonPatchOp[];
  readonly severity: "error" | "warning";
}

const DID_YOU_MEAN = /Did you mean "([^"]+)"\?/;
const BARE_CALL_SUGGESTION = /Did you mean "([^"]+)"/;

const decodePointer = (pointer: string): readonly string[] =>
  pointer === ""
    ? []
    : pointer
        .split("/")
        .slice(1)
        .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));

const valueAtPointer = (root: unknown, pointer: string): unknown =>
  decodePointer(pointer).reduce<unknown>((current, key) => {
    if (Array.isArray(current)) {
      return current[Number(key)];
    }
    if (typeof current === "object" && current !== null) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, root);

const updateArrayAt = (
  items: readonly unknown[],
  head: string,
  tail: readonly string[],
  op: "replace" | "add" | "remove",
  value: unknown
): unknown[] => {
  const index = head === "-" ? items.length : Number(head);
  const copy = [...items];
  if (tail.length > 0) {
    copy[index] = setAtPointer(copy[index], tail, op, value);
    return copy;
  }
  if (op === "remove") {
    copy.splice(index, 1);
  } else if (op === "add") {
    copy.splice(index, 0, value);
  } else {
    copy[index] = value;
  }
  return copy;
};

const updateRecordAt = (
  obj: Record<string, unknown>,
  head: string,
  tail: readonly string[],
  op: "replace" | "add" | "remove",
  value: unknown
): Record<string, unknown> => {
  const record = { ...obj };
  if (tail.length > 0) {
    record[head] = setAtPointer(record[head], tail, op, value);
    return record;
  }
  if (op === "remove") {
    delete record[head];
  } else {
    record[head] = value;
  }
  return record;
};

const setAtPointer = (
  root: unknown,
  segments: readonly string[],
  op: "replace" | "add" | "remove",
  value: unknown
): unknown => {
  if (segments.length === 0) {
    return op === "remove" ? undefined : value;
  }
  const [head, ...tail] = segments as [string, ...string[]];
  if (Array.isArray(root)) {
    return updateArrayAt(root, head, tail, op, value);
  }
  if (typeof root === "object" && root !== null) {
    return updateRecordAt(
      root as Record<string, unknown>,
      head,
      tail,
      op,
      value
    );
  }
  return root;
};

/** Pure immutable RFC 6902 patch applier for Lion JSON programs. */
export const applyJsonPatches = (
  program: unknown,
  patches: readonly JsonPatchOp[]
): unknown =>
  patches.reduce(
    (current, patch) =>
      setAtPointer(current, decodePointer(patch.path), patch.op, patch.value),
    program
  );

const fixForLint = (
  program: unknown,
  at: string,
  warning: string
): AutoFix | undefined => {
  const target = valueAtPointer(program, at);
  if (
    warning.includes('write ["array/make"') &&
    Array.isArray(target) &&
    target.length > 0
  ) {
    return {
      at,
      message: warning,
      patch: [{ op: "replace", path: at, value: ["array/make", ...target] }],
      severity: "warning",
    };
  }
  if (
    warning.includes('wrap multiple goals in ["and", ...]') &&
    Array.isArray(target) &&
    (target[0] === "query" || target[0] === "find")
  ) {
    const head = target[0];
    if (head === "query" && target.length >= 3) {
      const last = target.at(-1);
      const hasOptions =
        typeof last === "object" && last !== null && !Array.isArray(last);
      const goals = hasOptions ? target.slice(1, -1) : target.slice(1);
      const fixed = hasOptions
        ? ["query", ["and", ...goals], last]
        : ["query", ["and", ...goals]];
      return {
        at,
        message: warning,
        patch: [{ op: "replace", path: at, value: fixed }],
        severity: "warning",
      };
    }
    if (head === "find" && target.length >= 4) {
      const fixed = ["find", target[1], ["and", ...target.slice(2)]];
      return {
        at,
        message: warning,
        patch: [{ op: "replace", path: at, value: fixed }],
        severity: "warning",
      };
    }
  }
  if (
    warning.includes("unquoted logic variable") &&
    typeof target === "string"
  ) {
    return {
      at,
      message: warning,
      patch: [{ op: "replace", path: at, value: ["quote", target] }],
      severity: "warning",
    };
  }
  return undefined;
};

export interface SuggestFixesOptions {
  /** Relations already declared in a persisted database (for lint checks). */
  readonly declared?: readonly string[];
  /** Environment bindings visible to the program (defaults to `stdlib`). */
  readonly environment?: Readonly<Record<string, unknown>>;
}

const fixFromNode = (
  node: ReturnType<typeof flattenAnalysis>[number]
): readonly AutoFix[] => {
  if (typeof node.value !== "string") {
    return [];
  }
  const out: AutoFix[] = [];
  const errMatch =
    node.diagnostic === undefined ? null : DID_YOU_MEAN.exec(node.diagnostic);
  if (errMatch?.[1] !== undefined && node.diagnostic !== undefined) {
    out.push({
      at: node.pointer,
      message: node.diagnostic,
      patch: [{ op: "replace", path: node.pointer, value: errMatch[1] }],
      severity: "error",
    });
  }
  const warnMatch =
    node.warning === undefined ? null : BARE_CALL_SUGGESTION.exec(node.warning);
  if (warnMatch?.[1] !== undefined && node.warning !== undefined) {
    out.push({
      at: node.pointer,
      message: node.warning,
      patch: [{ op: "replace", path: node.pointer, value: warnMatch[1] }],
      severity: "warning",
    });
  }
  return out;
};

/**
 * Analyzes and lints `program`, returning deterministic RFC 6902 JSON Patch
 * quick-fixes for fixable errors and warnings.
 */
export const suggestFixes = (
  program: unknown,
  options: SuggestFixesOptions = {}
): Effect.Effect<readonly AutoFix[]> =>
  Effect.map(lint(program, options.declared ?? []), (lints) => {
    const fixes: AutoFix[] = [];
    const seen = new Set<string>();
    const push = (fix: AutoFix) => {
      const key = `${fix.at}:${JSON.stringify(fix.patch)}`;
      if (!seen.has(key)) {
        seen.add(key);
        fixes.push(fix);
      }
    };

    const tree = analyze(
      program as LionExpressionType,
      options.environment ?? stdlib
    );
    for (const node of flattenAnalysis(tree)) {
      for (const fix of fixFromNode(node)) {
        push(fix);
      }
    }

    for (const item of lints) {
      const fix = fixForLint(program, item.at, item.warning);
      if (fix !== undefined) {
        push(fix);
      }
    }

    return fixes.sort((a, b) => a.at.localeCompare(b.at));
  });
