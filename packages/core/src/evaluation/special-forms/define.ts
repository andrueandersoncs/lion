import { andThen, type Compiled } from "@/evaluation/compiled";
import { type Scope, setLocalBinding } from "@/evaluation/environment";
import { compile } from "@/evaluation/evaluate";
import { nameLambda } from "@/evaluation/special-forms/lambda";
import type { DefineFormSchema } from "@/schemas/evaluation";

/**
 * Binds a name in the body the form stands in, a lambda's or the program's,
 * to a value, and gives the value. The body declares the name from its
 * start, so the name means this definition everywhere in it. A Lion
 * function with no name yet takes the name, as Racket names the function a
 * `define` binds, so its failures say which function they left.
 */
export const compileDefine = (
  [_, id, expression]: typeof DefineFormSchema.Type,
  scope: Scope | undefined
): Compiled => {
  const value = compile(expression, scope);
  return (environment, depth) =>
    andThen(value(environment, depth), depth, (made) => {
      setLocalBinding(environment, id, made);
      nameLambda(made, id);
      return made;
    });
};
