import { Effect } from "effect";

export const object = {
  get: (obj: unknown, key: unknown) => Effect.succeed((obj as Record<string, unknown>)[key as string]),
  keys: (obj: unknown) => Effect.succeed(Object.keys(obj as Record<string, unknown>)),
  values: (obj: unknown) => Effect.succeed(Object.values(obj as Record<string, unknown>)),
};
