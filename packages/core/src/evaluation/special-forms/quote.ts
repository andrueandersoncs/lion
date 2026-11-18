import type { Compiled } from "@/evaluation/compiled";
import type { QuoteFormSchema } from "@/schemas/evaluation";

/** Gives what it quotes, as it is written. */
export const compileQuote =
  ([_, args]: typeof QuoteFormSchema.Type): Compiled =>
  () =>
    args;
