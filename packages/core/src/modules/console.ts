import { Console, Effect } from "effect";
import { takes } from "@/errors/evaluation";

export const module = {
  log: takes(1, (message: string) =>
    Console.log(message).pipe(Effect.map(() => message))
  ),

  "log-json": takes(1, (message: unknown) =>
    Console.log(JSON.stringify(message, null, 2)).pipe(
      Effect.map(() => JSON.stringify(message, null, 2))
    )
  ),
};
