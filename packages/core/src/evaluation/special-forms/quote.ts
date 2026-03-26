import { Effect } from "effect";
import type { QuoteFormSchema } from "@/schemas/evaluation";

export const evaluateQuote = ([_, args]: typeof QuoteFormSchema.Type) =>
  Effect.succeed(args);
