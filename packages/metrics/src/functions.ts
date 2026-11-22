/**
 * The named functions of a script, as V8 names them, and the ones a change
 * touches. V8 gives a function its own name, or else the name of the
 * variable, property, or method it is written as; an anonymous function
 * passed to a call has none. A changed line belongs to the innermost named
 * function around it, which a test reaches whenever it reaches the
 * anonymous ones inside, since they are made when it runs. A changed line
 * no named function holds changes the whole file.
 */
import ts from "typescript";

/** A named function and the lines it spans, from 1, both ends included. */
export interface Named {
  readonly end: number;
  readonly name: string;
  readonly start: number;
}

/** The text of a property's or method's name, as V8 reads it. */
const keyOf = (name: ts.PropertyName): string | undefined => {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) {
    return name.text;
  }
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return;
};

/** The name V8 gives a function written at this node, or none. */
const nameOf = (node: ts.Node): string | undefined => {
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)) &&
    node.name !== undefined
  ) {
    return keyOf(node.name);
  }
  if (!(ts.isArrowFunction(node) || ts.isFunctionExpression(node))) {
    return;
  }
  if (ts.isFunctionExpression(node) && node.name !== undefined) {
    return node.name.text;
  }
  const { parent } = node;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  if (ts.isPropertyAssignment(parent)) {
    return keyOf(parent.name);
  }
  return;
};

const KINDS: Record<string, ts.ScriptKind> = {
  js: ts.ScriptKind.JS,
  mjs: ts.ScriptKind.JS,
  ts: ts.ScriptKind.TS,
  tsx: ts.ScriptKind.TSX,
};

/** The kind of script a path names, or none for a file that is no script. */
export const scriptKind = (path: string): ts.ScriptKind | undefined =>
  KINDS[path.slice(path.lastIndexOf(".") + 1)];

/** Every named function of a script, in the order they start. */
export const functionsOf = (path: string, text: string): Named[] => {
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(path) ?? ts.ScriptKind.TS
  );
  const line = (at: number) =>
    source.getLineAndCharacterOfPosition(at).line + 1;
  const found: Named[] = [];
  const visit = (node: ts.Node) => {
    const name = nameOf(node);
    if (name !== undefined) {
      found.push({
        end: line(node.getEnd()),
        name,
        start: line(node.getStart(source)),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

/** The innermost named function that holds a line, or none. */
export const holding = (
  functions: readonly Named[],
  line: number
): string | undefined => {
  let best: Named | undefined;
  for (const named of functions) {
    if (
      named.start <= line &&
      line <= named.end &&
      (best === undefined || named.end - named.start < best.end - best.start)
    ) {
      best = named;
    }
  }
  return best?.name;
};

const BUNDLED = /\$\d+$/;
const ACCESSOR = /^(?:get|set|bound) /;

/**
 * A name as V8 reports it, read as the parse names the function: without
 * the suffix a bundler adds to keep names apart, the word an accessor or a
 * bound function starts with, or the object a property is written in, as
 * `module.add` is the property `add`.
 */
export const plainName = (name: string): string => {
  const bare = name.replace(ACCESSOR, "").replace(BUNDLED, "");
  return bare.slice(bare.lastIndexOf(".") + 1);
};

/** A hunk of a diff: where its lines start, and how many, in the old file and the new. */
export interface Hunk {
  readonly after: readonly [start: number, count: number];
  readonly before: readonly [start: number, count: number];
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;

/** The hunks of what `git diff -U0` printed for one file. */
export const hunksOf = (diff: string): Hunk[] =>
  [...diff.matchAll(HUNK)].map((found) => ({
    after: [Number(found[3]), found[4] === undefined ? 1 : Number(found[4])],
    before: [Number(found[1]), found[2] === undefined ? 1 : Number(found[2])],
  }));

const linesOf = ([start, count]: readonly [number, number]) =>
  Array.from({ length: count }, (_, at) => start + at);

/** What one line of a script holds, for a change to it. */
type LineIs =
  | { readonly kind: "nothing" }
  | { readonly kind: "whole" }
  | { readonly kind: "functions"; readonly names: readonly string[] };

const NOTHING: LineIs = { kind: "nothing" };
const WHOLE: LineIs = { kind: "whole" };
const DOLLAR = /\$/g;

/** A pattern that finds a name as a word of its own. */
const wordIn = (name: string) =>
  new RegExp(`\\b${name.replace(DOLLAR, "\\$")}\\b`);

const COMMENT = /^\s*(?:\/\/|\/\*|\*|$)/;

/** A script parsed once: its named functions, and what each top-level statement is. */
const parsed = (path: string, text: string) => {
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(path) ?? ts.ScriptKind.TS
  );
  const line = (at: number) =>
    source.getLineAndCharacterOfPosition(at).line + 1;
  const functions = functionsOf(path, text);
  const lines = text.split("\n");
  const statementAt = (at: number) =>
    source.statements.find(
      (statement) =>
        line(statement.getStart(source)) <= at && at <= line(statement.getEnd())
    );
  const isExported = (statement: ts.Statement) =>
    ts
      .getModifiers(statement as ts.HasModifiers)
      ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true;
  const declaredBy = (statement: ts.VariableStatement) =>
    statement.declarationList.declarations.flatMap((d) =>
      ts.isIdentifier(d.name) ? [d.name.text] : []
    );
  /** A statement that declares only functions, which are named functions, not constants. */
  const onlyFunctions = (statement: ts.VariableStatement) =>
    statement.declarationList.declarations.every(
      (d) =>
        d.initializer !== undefined &&
        (ts.isArrowFunction(d.initializer) ||
          ts.isFunctionExpression(d.initializer))
    );
  const constants = source.statements
    .filter(ts.isVariableStatement)
    .filter((statement) => !onlyFunctions(statement));
  const mentions = (node: ts.Node, names: ReadonlySet<string>) =>
    lines
      .slice(line(node.getStart(source)) - 1, line(node.getEnd()))
      .some((row) => [...names].some((name) => wordIn(name).test(row)));
  /**
   * What a changed top-level constant of the file's own touches: the named
   * functions that mention it, or a constant that does, and so on, or the
   * whole file once an exported one does.
   */
  const throughConstants = (first: ts.VariableStatement): LineIs => {
    const names = new Set(declaredBy(first));
    const seen = new Set<ts.Statement>([first]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const statement of constants) {
        if (!seen.has(statement) && mentions(statement, names)) {
          if (isExported(statement)) {
            return WHOLE;
          }
          seen.add(statement);
          for (const name of declaredBy(statement)) {
            names.add(name);
          }
          grew = true;
        }
      }
    }
    return {
      kind: "functions",
      names: functions
        .filter((named) =>
          lines
            .slice(named.start - 1, named.end)
            .some((row) => [...names].some((name) => wordIn(name).test(row)))
        )
        .map((named) => named.name),
    };
  };
  return (at: number): LineIs => {
    const name = holding(functions, at);
    if (name !== undefined) {
      return { kind: "functions", names: [name] };
    }
    if (COMMENT.test(lines[at - 1] ?? "")) {
      return NOTHING;
    }
    const statement = statementAt(at);
    if (
      statement === undefined ||
      ts.isImportDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)
    ) {
      return NOTHING;
    }
    if (!ts.isVariableStatement(statement) || isExported(statement)) {
      return WHOLE;
    }
    return throughConstants(statement);
  };
};

/**
 * The named functions a change to one file touches, or `"whole"` when the
 * file is no script, is new or gone, or a changed line may change more than
 * named functions do: one in a top-level statement that is exported, or is
 * not a constant. A line of an import, a type, or a comment touches nothing
 * that runs, and a changed constant of the file's own touches the named
 * functions that mention it. Removed lines are read in the old file and
 * added lines in the new, so a function that is renamed touches both names.
 */
export const touchedBy = (
  path: string,
  before: string | undefined,
  after: string | undefined,
  hunks: readonly Hunk[]
): readonly string[] | "whole" => {
  if (
    scriptKind(path) === undefined ||
    before === undefined ||
    after === undefined
  ) {
    return "whole";
  }
  const sides = [
    {
      at: parsed(path, before),
      lines: hunks.flatMap((h) => linesOf(h.before)),
    },
    { at: parsed(path, after), lines: hunks.flatMap((h) => linesOf(h.after)) },
  ];
  const names = new Set<string>();
  for (const { at, lines } of sides) {
    for (const line of lines) {
      const is = at(line);
      if (is.kind === "whole") {
        return "whole";
      }
      if (is.kind === "functions") {
        for (const name of is.names) {
          names.add(name);
        }
      }
    }
  }
  return [...names].sort();
};
