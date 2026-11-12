/**
 * Implementation complexity, read from source text with the TypeScript
 * compiler: how much code there is, and how much it branches.
 */
import ts from "typescript";

/** The measures of one file, or of several files added up. */
export interface CodeMetrics {
  /**
   * Each decision point counts once, plus once more for every branch or
   * loop it sits inside, so nested logic weighs more than flat logic.
   */
  readonly cognitive: number;
  /** Decision points, plus one for each function: the paths through the code. */
  readonly cyclomatic: number;
  /** `instanceof` tests: the places that ask what kind of value they hold. */
  readonly dispatch: number;
  readonly functions: number;
  /** Lines that hold code. Blank lines and comments do not count. */
  readonly lines: number;
}

/** The function of a file with the most paths through it. */
export interface Worst {
  readonly cyclomatic: number;
  readonly name: string;
}

export interface FileMetrics extends CodeMetrics {
  readonly path: string;
  readonly worst: Worst;
}

/** The measures, in the order reports show them. */
export const MEASURES = [
  "lines",
  "functions",
  "cyclomatic",
  "cognitive",
  "dispatch",
] as const;

export const NO_CODE: CodeMetrics = {
  cognitive: 0,
  cyclomatic: 0,
  dispatch: 0,
  functions: 0,
  lines: 0,
};

/** The measures of two pieces of code taken together. */
export const add = (a: CodeMetrics, b: CodeMetrics): CodeMetrics => ({
  cognitive: a.cognitive + b.cognitive,
  cyclomatic: a.cyclomatic + b.cyclomatic,
  dispatch: a.dispatch + b.dispatch,
  functions: a.functions + b.functions,
  lines: a.lines + b.lines,
});

export const total = (files: readonly CodeMetrics[]): CodeMetrics =>
  files.reduce(add, NO_CODE);

const { SyntaxKind } = ts;

const FUNCTIONS: ReadonlySet<ts.SyntaxKind> = new Set([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.FunctionExpression,
  SyntaxKind.ArrowFunction,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.Constructor,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
]);

/** Statements and expressions that choose between paths. */
const DECISIONS: ReadonlySet<ts.SyntaxKind> = new Set([
  SyntaxKind.IfStatement,
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement,
  SyntaxKind.CaseClause,
  SyntaxKind.CatchClause,
  SyntaxKind.ConditionalExpression,
]);

/** Operators that skip their right side, which makes them decisions too. */
const SHORT_CIRCUITS: ReadonlySet<ts.SyntaxKind> = new Set([
  SyntaxKind.AmpersandAmpersandToken,
  SyntaxKind.BarBarToken,
  SyntaxKind.QuestionQuestionToken,
]);

/** Constructs whose bodies read as one level deeper. */
const NESTS: ReadonlySet<ts.SyntaxKind> = new Set([
  SyntaxKind.IfStatement,
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement,
  SyntaxKind.SwitchStatement,
  SyntaxKind.CatchClause,
  SyntaxKind.ConditionalExpression,
]);

const operatorOf = (node: ts.Node) =>
  ts.isBinaryExpression(node) ? node.operatorToken.kind : SyntaxKind.Unknown;

const isDecision = (node: ts.Node) =>
  DECISIONS.has(node.kind) || SHORT_CIRCUITS.has(operatorOf(node));

/** The name a function is known by, for reports. */
const nameOf = (node: ts.Node, source: ts.SourceFile): string => {
  const own = (node as ts.FunctionDeclaration).name;
  if (own !== undefined) {
    return own.getText(source);
  }
  const { parent } = node;
  return ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)
    ? parent.name.getText(source)
    : "(anonymous)";
};

interface Tally {
  cognitive: number;
  decisions: number;
  dispatch: number;
  functions: number;
  worst: Worst;
}

/** The decision points of the function being read. */
interface Scope {
  decisions: number;
}

const visit = (
  node: ts.Node,
  source: ts.SourceFile,
  tally: Tally,
  scope: Scope | undefined,
  depth: number
): void => {
  const isFunction = FUNCTIONS.has(node.kind);
  const inner = isFunction ? { decisions: 0 } : scope;
  if (isFunction) {
    tally.functions += 1;
  }
  if (isDecision(node)) {
    tally.decisions += 1;
    tally.cognitive += 1 + (NESTS.has(node.kind) ? depth : 0);
    if (inner !== undefined) {
      inner.decisions += 1;
    }
  }
  if (operatorOf(node) === SyntaxKind.InstanceOfKeyword) {
    tally.dispatch += 1;
  }
  // Nesting starts over inside a function: its body reads on its own.
  const below = isFunction ? 0 : depth + (NESTS.has(node.kind) ? 1 : 0);
  ts.forEachChild(node, (child) => visit(child, source, tally, inner, below));
  if (isFunction && inner !== undefined) {
    const cyclomatic = inner.decisions + 1;
    if (cyclomatic > tally.worst.cyclomatic) {
      tally.worst = { cyclomatic, name: nameOf(node, source) };
    }
  }
};

/** Counts the lines that hold at least one token. */
const codeLines = (source: ts.SourceFile): number => {
  const lines = new Set<number>();
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    source.text
  );
  for (
    let token = scanner.scan();
    token !== SyntaxKind.EndOfFileToken;
    token = scanner.scan()
  ) {
    const first = source.getLineAndCharacterOfPosition(
      scanner.getTokenStart()
    ).line;
    const last = source.getLineAndCharacterOfPosition(
      scanner.getTokenEnd()
    ).line;
    for (let line = first; line <= last; line += 1) {
      lines.add(line);
    }
  }
  return lines.size;
};

/** Measures one source file. */
export const measureSource = (path: string, text: string): FileMetrics => {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const tally: Tally = {
    cognitive: 0,
    decisions: 0,
    dispatch: 0,
    functions: 0,
    worst: { cyclomatic: 0, name: "" },
  };
  visit(source, source, tally, undefined, 0);
  return {
    path,
    cognitive: tally.cognitive,
    cyclomatic: tally.decisions + tally.functions,
    dispatch: tally.dispatch,
    functions: tally.functions,
    lines: codeLines(source),
    worst: tally.worst,
  };
};
