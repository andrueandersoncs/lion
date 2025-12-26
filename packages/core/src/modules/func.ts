import { Effect } from "effect";

export const func = {
  identity: (x: unknown) => Effect.succeed(x),
};
