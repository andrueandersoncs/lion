import type { SchemaAST } from "effect";

/** Whether a value fits a schema, said without saying why. */
export type Guard = (value: unknown) => boolean;

const ANY: Guard = () => true;

/** The options the decoder runs with when it is given none. */
const OPTIONS: SchemaAST.ParseOptions = {};

const KINDS: Partial<Record<SchemaAST.AST["_tag"], Guard>> = {
  Any: ANY,
  Unknown: ANY,
  String: (value) => typeof value === "string",
  Number: (value) => typeof value === "number",
  Boolean: (value) => typeof value === "boolean",
};

/** Whether a value passes a check, as the decoder runs it. */
const passes = (
  check: SchemaAST.Check<unknown>,
  value: unknown,
  ast: SchemaAST.AST
): boolean =>
  check._tag === "FilterGroup"
    ? check.checks.every((each) => passes(each, value, ast))
    : check.run(value, ast, OPTIONS) === undefined;

/**
 * A list with the given items first, each fitting its own guard, and then
 * any number fitting `rest`, or none when there is no `rest`. When every
 * guard accepts anything, the items are not looked at.
 */
const listOf = (items: readonly Guard[], rest: Guard | undefined): Guard => {
  const looks = [...items, rest].some((guard) => guard && guard !== ANY);
  return (value) => {
    if (
      !Array.isArray(value) ||
      value.length < items.length ||
      (rest === undefined && value.length > items.length)
    ) {
      return false;
    }
    for (let at = 0; looks && at < value.length; at += 1) {
      if (!(items[at] ?? (rest as Guard))(value[at])) {
        return false;
      }
    }
    return true;
  };
};

/** The guard of a list's AST, or undefined for one the decoder rebuilds. */
const listGuard = (ast: SchemaAST.Arrays): Guard | undefined => {
  if (
    ast.rest.length > 1 ||
    ast.elements.some((element) => element.context?.isOptional)
  ) {
    return undefined;
  }
  const items = ast.elements.map(guardOf);
  const rest = ast.rest[0] === undefined ? undefined : guardOf(ast.rest[0]);
  if (items.includes(undefined) || (ast.rest.length === 1 && !rest)) {
    return undefined;
  }
  return listOf(items as Guard[], rest);
};

/**
 * A guard compiled from a schema's AST: true for exactly the values the
 * schema's decoder accepts, for a schema whose decoder gives back a value
 * equal to the one it was given. That is a schema with no transformation,
 * made of strings, numbers, booleans, anything, and lists of those, each
 * with any checks. Undefined for any other schema, such as a record, which
 * the decoder copies key by key, or a schema that transforms.
 *
 * A check that throws makes the guard false, so the decoder runs it again
 * and reports what it threw as the decoder does.
 */
export const guardOf = (ast: SchemaAST.AST): Guard | undefined => {
  if (ast.encoding !== undefined) {
    return undefined;
  }
  const kind = ast._tag === "Arrays" ? listGuard(ast) : KINDS[ast._tag];
  const checks = ast.checks;
  if (kind === undefined || checks === undefined) {
    return kind;
  }
  return (value) => {
    try {
      return kind(value) && checks.every((check) => passes(check, value, ast));
    } catch {
      return false;
    }
  };
};
