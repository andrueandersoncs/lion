import { type SchemaAST, SchemaIssue } from "effect";

/** What a schema takes, as one value and as many. */
interface Taken {
  readonly many: string;
  readonly one: string;
}

const taken = (one: string, many = one): Taken => ({ many, one });

const ANY = taken("any value", "any values");

const KINDS: Partial<Record<SchemaAST.AST["_tag"], Taken>> = {
  Any: ANY,
  Unknown: ANY,
  String: taken("a string", "strings"),
  Number: taken("a number", "numbers"),
  Boolean: taken("a boolean", "booleans"),
  Null: taken("null"),
  Objects: taken("a record", "records"),
  Declaration: taken("a function", "functions"),
};

/** What a declared schema takes, as a schema that names its own kind says it. */
const DESCRIBED = new WeakMap<SchemaAST.AST, Taken>();

/** A schema whose values a message calls `one`, and `many` in the plural. */
export const describedAs = <S extends { readonly ast: SchemaAST.AST }>(
  schema: S,
  one: string,
  many: string
): S => {
  DESCRIBED.set(schema.ast, taken(one, many));
  return schema;
};

const INTEGER = "an integer";

/** How a check that says what a value is starts. */
const A_VALUE = "a value ";

/** What the checks on a schema add to what its kind takes. */
const checked = (kind: Taken, ast: SchemaAST.AST): Taken => {
  const said = (ast.checks ?? [])
    .map((check) => check.annotations?.expected)
    .filter((expected): expected is string => typeof expected === "string");
  const base = said.includes(INTEGER) ? taken(INTEGER, "integers") : kind;
  // "a value greater than 0" says of an integer "an integer greater than 0".
  const more = said
    .filter((expected) => expected !== INTEGER)
    .map((expected) =>
      expected.startsWith(A_VALUE)
        ? [expected.slice(A_VALUE.length)]
        : [`that is ${expected}`, `that are each ${expected}`]
    );
  const one = more.map(([each]) => ` ${each}`).join(" and");
  const many = more.map(([each, all = each]) => ` ${all}`).join(" and");
  return taken(`${base.one}${one}`, `${base.many}${many}`);
};

/** What a schema takes, said as a library function's message says it. */
const takenBy = (ast: SchemaAST.AST): Taken => {
  const described = DESCRIBED.get(ast);
  if (described !== undefined) {
    return checked(described, ast);
  }
  if (ast._tag === "Arrays") {
    const [rest] = ast.rest;
    return ast.elements.length === 0 && rest !== undefined
      ? checked(
          taken(
            rest._tag === "Any" || rest._tag === "Unknown"
              ? "a list"
              : `a list of ${takenBy(rest).many}`,
            "lists"
          ),
          ast
        )
      : checked(taken("a list", "lists"), ast);
  }
  if (ast._tag === "Union") {
    const parts = ast.types.map(takenBy);
    return taken(
      parts.map((part) => part.one).join(" or "),
      parts.map((part) => part.many).join(" or ")
    );
  }
  if (ast._tag === "Literal") {
    return taken(JSON.stringify(ast.literal));
  }
  if (ast._tag === "Suspend") {
    return takenBy(ast.thunk());
  }
  return checked(KINDS[ast._tag] ?? taken("another kind of value"), ast);
};

/** What a schema takes, as "a number" or "a list of strings". */
export const expected = (ast: SchemaAST.AST) => takenBy(ast).one;

const FORMATTER = SchemaIssue.makeFormatterStandardSchemaV1();

/** The argument an issue of a list of arguments is about, from 0. */
export const argumentOf = (issue: SchemaIssue.Issue): number | undefined => {
  const [first] = FORMATTER(issue).issues;
  const at = first?.path?.[0];
  return typeof at === "number" ? at : undefined;
};
