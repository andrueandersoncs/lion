import { Console, Effect } from "effect";
import { takes } from "@/errors/evaluation";
import { writeJson } from "@/evaluation/reading";

export const module = {
  log: takes(1, (message: string) =>
    Console.log(message).pipe(Effect.map(() => message))
  ),

  /** Logs a value as JSON text; a fraction no decimal writes, such as 1/3, has none. */
  "log-json": takes(1, (message: unknown) =>
    Effect.flatMap(writeJson(message, 2), (text) =>
      Console.log(text).pipe(Effect.map(() => text))
    )
  ),
};
