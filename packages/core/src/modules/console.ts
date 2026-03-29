import { Console, Effect } from "effect";

export const console = {
  log: (message: string) =>
    Console.log(message).pipe(Effect.map(() => message)),
};
