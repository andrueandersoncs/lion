/**
 * Why a schema cannot stand for each value it allows, or give the solver the
 * shape of its values. A listing and the solver meet the same schemas, so a
 * reason is told in one way wherever it is met.
 */
import { show } from "@/logic/terms";

/** A schema met again inside its own values. */
export const namesItself = (name: string) =>
  `"${name}" names itself inside its values, so it allows values of any size`;

/** A predicate, such as a lambda, which says nothing a listing or the solver can use. */
export const isPredicate = (schema: unknown) =>
  `${show(schema)} is a predicate, which says neither which values it accepts nor what kind they are`;

/** `schema/open` without the schema of its rest. */
export const openWithoutRest = (schema: unknown) =>
  `${show(schema)} allows any other keys or items; give it the schema of the rest`;

/** `schema/arrayOf` without the most items a list may have. */
export const listWithoutMost = (schema: unknown, item: unknown) =>
  `${show(schema)} allows lists of any length; give it the most items a list may have, as in ["schema/arrayOf", ${show(item)}, 3]`;

/**
 * What `schema/open` says of a shape that is not one, when it is called
 * and when a listing or the solver meets a name that stands for one.
 */
export const notRecord = (found: unknown) =>
  `expects a record or a list of schemas, or a schema that names one, but found ${show(found)}`;

/** The shape `schema/open` is given, when it is not one. */
export const notAShape = (shape: unknown) => `schema/open ${notRecord(shape)}`;
