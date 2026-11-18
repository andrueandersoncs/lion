import { andThen, type Compiled, runAll } from "@/evaluation/compiled";
import { compile } from "@/evaluation/evaluate";
import type { BeginFormSchema } from "@/schemas/evaluation";

/**
 * Evaluates its expressions in order and gives the last one's value, or an
 * empty list when it has none. The last runs in the place of the form, so
 * a call there is in tail position.
 */
export const compileBegin = ([
  _,
  ...args
]: typeof BeginFormSchema.Type): Compiled => {
  const body = args.map(compile);
  const last = body.pop();
  if (last === undefined) {
    return () => [];
  }
  if (body.length === 0) {
    return last;
  }
  return (environment, depth) =>
    andThen(runAll(body, environment, depth), depth, (_done, now) =>
      last(environment, now)
    );
};
