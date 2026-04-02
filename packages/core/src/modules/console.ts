import { Console, Effect } from "effect";

export const module = {
  log: (message: string) =>
    Console.log(message).pipe(Effect.map(() => message)),
  
  "log-json": (message: unknown) =>
    Console.log(JSON.stringify(message, null, 2)).pipe(
      Effect.map(() => JSON.stringify(message, null, 2))
    ),
};
