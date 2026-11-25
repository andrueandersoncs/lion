/**
 * `@lionlang/ui`: Pure JSON UI bindings and stateful/streaming sessions for Lion.
 */
import { run } from "@lionlang/core/evaluation/evaluate";
import { readJson } from "@lionlang/core/evaluation/reading";
import { LogicDatabase } from "@lionlang/core/logic/database";
import { stdlib } from "@lionlang/core/modules";
import { Effect } from "effect";
import {
  isPropsRecord,
  isUiNode,
  normalizeChildren,
  UI_KINDS,
  type UiKind,
  type UiNode,
  type UiProps,
} from "./types.ts";

const makeNode = (
  kind: UiKind,
  props: UiProps,
  children: readonly unknown[]
): UiNode => ({
  $ui: kind,
  props,
  children: normalizeChildren(children),
});

const element =
  (kind: UiKind) =>
  (...args: readonly unknown[]): UiNode => {
    if (args.length > 0 && isPropsRecord(args[0])) {
      return makeNode(kind, args[0], args.slice(1));
    }
    return makeNode(kind, {}, args);
  };

const whyElement = (...args: readonly unknown[]): UiNode => {
  if (args.length >= 2 && isPropsRecord(args[0])) {
    return makeNode("why", { ...args[0], data: args[1] }, args.slice(2));
  }
  return makeNode("why", { data: args[0] ?? null }, []);
};

const proofElement = (...args: readonly unknown[]): UiNode => {
  if (args.length >= 2 && isPropsRecord(args[0])) {
    return makeNode("proof", { ...args[0], data: args[1] }, args.slice(2));
  }
  return makeNode("proof", { data: args[0] ?? null }, []);
};

/**
 * Creates the `ui/*` bindings to spread into a Lion environment:
 *
 * ```ts
 * const env = { ...stdlib, ...makeUiBindings() };
 * ```
 */
export const makeUiBindings = (
  namespace = "ui"
): Record<string, (...args: readonly unknown[]) => unknown> => {
  const bindings: Record<string, (...args: readonly unknown[]) => unknown> = {
    [`${namespace}/node?`]: (value: unknown) => isUiNode(value),
  };

  for (const kind of UI_KINDS) {
    if (kind === "why") {
      bindings[`${namespace}/why`] = whyElement;
    } else if (kind === "proof") {
      bindings[`${namespace}/proof`] = proofElement;
    } else {
      bindings[`${namespace}/${kind}`] = element(kind);
    }
  }

  return bindings;
};

export interface UiSessionOptions {
  /** Extra host bindings merged on top of `stdlib` and `makeUiBindings()`. */
  readonly environment?: Readonly<Record<string, unknown>>;
}

export interface UiSession {
  readonly database: LogicDatabase;
  /** Runs an interactive control action (with `value` bound) and returns the updated view. */
  readonly dispatch: (
    action: unknown,
    value?: unknown
  ) => Effect.Effect<unknown, unknown>;
  /** Resets the database and evaluates an initial program (JSON value or JSON text). */
  readonly load: (program: unknown) => Effect.Effect<unknown, unknown>;
  /** Re-evaluates `["view"]` against the current database. */
  readonly render: () => Effect.Effect<UiNode | unknown, unknown>;
  /** Streams one Lion form (e.g. a `fact`, `rule`, or `define`) into the database and re-renders. */
  readonly step: (chunk: unknown) => Effect.Effect<unknown, unknown>;
}

const decodeInput = (input: unknown) =>
  typeof input === "string" ? readJson(input) : Effect.succeed(input);

export const createUiSession = (options: UiSessionOptions = {}): UiSession => {
  const baseEnv: Record<string, unknown> = {
    ...stdlib,
    ...makeUiBindings(),
    ...options.environment,
  };
  let database = new LogicDatabase();
  let lastResult: unknown = null;

  const hasView = () => database.definitions.has("view");

  const renderCurrent = (): Effect.Effect<unknown, unknown> =>
    Effect.suspend(() =>
      hasView()
        ? run(["view"], baseEnv, { database }).pipe(
            Effect.tap((value) =>
              Effect.sync(() => {
                lastResult = value;
              })
            )
          )
        : Effect.succeed(lastResult)
    );

  const load = (input: unknown): Effect.Effect<unknown, unknown> =>
    Effect.gen(function* () {
      const program = yield* decodeInput(input);
      database = new LogicDatabase();
      const result = yield* run(program, baseEnv, { database });
      if (isUiNode(result)) {
        lastResult = result;
        return result;
      }
      if (hasView()) {
        return yield* renderCurrent();
      }
      lastResult = result;
      return result;
    });

  const step = (input: unknown): Effect.Effect<unknown, unknown> =>
    Effect.gen(function* () {
      const form = yield* decodeInput(input);
      const result = yield* run(form, baseEnv, { database });
      if (hasView()) {
        return yield* renderCurrent();
      }
      lastResult = result;
      return result;
    });

  const dispatch = (
    action: unknown,
    value?: unknown
  ): Effect.Effect<unknown, unknown> =>
    Effect.gen(function* () {
      const form = yield* decodeInput(action);
      const env = value === undefined ? baseEnv : { ...baseEnv, value };
      yield* run(form, env, { database });
      return yield* renderCurrent();
    });

  return {
    get database() {
      return database;
    },
    dispatch,
    load,
    render: renderCurrent,
    step,
  };
};
