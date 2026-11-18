import { andThen, type Compiled } from "@/evaluation/compiled";
import { setGlobalBinding } from "@/evaluation/environment";
import { compile } from "@/evaluation/evaluate";
import type { DefineFormSchema } from "@/schemas/evaluation";

/** Binds a name in the outermost scope to a value, and gives the value. */
export const compileDefine = ([
  _,
  id,
  expression,
]: typeof DefineFormSchema.Type): Compiled => {
  const value = compile(expression);
  return (environment, depth) =>
    andThen(value(environment, depth), depth, (made) => {
      setGlobalBinding(environment, id, made);
      return made;
    });
};
