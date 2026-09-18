import {
  type ChoiceCriteria,
  choice,
  type EntryType,
  noul,
  type Questions,
  type RequestOptions,
  type ScoreCriteria,
  type SystemOneRequest,
  score,
  TypeSafeClient,
  type TypeSafeClientConfig,
} from "@typesafe-ai/sdk";
import { Effect } from "effect";

const attempt = <A>(evaluate: () => A): Effect.Effect<A, unknown> =>
  Effect.try({
    try: evaluate,
    catch: (cause) => cause,
  });

const attemptPromise = <A>(
  evaluate: () => PromiseLike<A>
): Effect.Effect<A, unknown> =>
  Effect.tryPromise({
    try: evaluate,
    catch: (cause) => cause,
  });

/**
 * Creates the unqualified functions exposed to Lion expressions.
 *
 * Network calls are represented as Effects so Lion waits for the TypeSafe API
 * instead of returning an unresolved promise.
 */
export const makeTypeSafeModule = (config: TypeSafeClientConfig = {}) => {
  const client = new TypeSafeClient(config);

  return {
    symbol: Symbol("typesafe"),
    noul: (instructions?: EntryType, criteria?: Parameters<typeof noul>[1]) =>
      attempt(() => noul(instructions, criteria)),
    choice: <T extends ChoiceCriteria>(instructions: EntryType, criteria: T) =>
      attempt(() => choice(instructions, criteria)),
    score: <T extends ScoreCriteria>(instructions: EntryType, criteria: T) =>
      attempt(() => score(instructions, criteria)),
    "system-one": <Q extends Questions>(
      request: SystemOneRequest<Q>,
      options?: RequestOptions
    ) => attemptPromise(() => client.systemOne(request, options)),
    models: (options?: RequestOptions) =>
      attemptPromise(() => client.models.list(options)),
  } as const;
};

/** Creates ready-to-spread Lion environment bindings under `typesafe/*`. */
export const makeTypeSafeBindings = (
  config: TypeSafeClientConfig = {},
  namespace = "typesafe"
): Record<string, unknown> => {
  const module = makeTypeSafeModule(config);

  return Object.fromEntries(
    Object.entries(module).map(([name, value]) => [
      `${namespace}/${name}`,
      value,
    ])
  );
};
