import { Array as Arr, Effect, Option, pipe } from "effect";
import { evaluate } from "@/evaluation/evaluate";
import type { BeginFormSchema } from "@/schemas/evaluation";

export const evaluateBegin = ([_, ...args]: typeof BeginFormSchema.Type) =>
  pipe(
    Arr.map(args, evaluate),
    Effect.all,
    Effect.map(Arr.last),
    Effect.map(Option.getOrElse(() => []))
  );
