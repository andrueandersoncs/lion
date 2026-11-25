import { Effect, Schema } from "effect";
import { logicError } from "@/errors/evaluation";
import { database } from "@/evaluation/asking";
import {
  andThen,
  type Compiled,
  Pending,
  toEffect,
} from "@/evaluation/compiled";
import { type Scope, setLocalBinding } from "@/evaluation/environment";
import { compile } from "@/evaluation/evaluate";
import { nameLambda, suspend } from "@/evaluation/special-forms/lambda";
import { definePersistent } from "@/logic/database";
import { parseDefineOptions } from "@/logic/query-options";
import { logicKey, show } from "@/logic/terms";
import {
  type DefineFormSchema,
  ValidIdentifierSchema,
} from "@/schemas/evaluation";

const isIdentifier = Schema.is(ValidIdentifierSchema);

/**
 * Binds a name in the body the form stands in, a lambda's or the program's,
 * to a value, and gives the value. The body declares the name from its
 * start, so the name means this definition everywhere in it. A Lion
 * function with no name yet takes the name, as Racket names the function a
 * `define` binds, so its failures say which function they left.
 *
 * With `{"persist": true}` as an optional fourth argument, the definition is
 * also stored in the logic database so later runs and snapshots keep it.
 */
export const compileDefine = (
  [_, id, expression, options]: typeof DefineFormSchema.Type,
  scope: Scope | undefined
): Compiled => {
  const value = compile(expression, scope);
  if (options === undefined) {
    return (environment, depth) =>
      andThen(value(environment, depth), depth, (made) => {
        setLocalBinding(environment, id, made);
        nameLambda(made, id);
        return made;
      });
  }
  return (environment, depth) =>
    new Pending(
      Effect.gen(function* () {
        const { persist } = yield* parseDefineOptions(options);
        if (persist && !isIdentifier(id)) {
          return yield* logicError(
            `A persisted definition's name must be a string that is not the name of a special form, but found ${show(id)}.`
          );
        }
        const made = yield* toEffect(value(environment, depth));
        setLocalBinding(environment, id, made);
        nameLambda(made, id);
        if (persist) {
          const store = yield* database;
          const definition =
            logicKey(made) === undefined
              ? yield* suspend(expression, environment, undefined, scope)
              : made;
          yield* definePersistent(store, id, made, definition);
        }
        return made;
      })
    );
};
