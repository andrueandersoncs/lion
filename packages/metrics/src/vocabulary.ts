/**
 * What a Lion programmer has to know by name: the special forms, the
 * standard library, the kinds of error, and the messages that say a program
 * broke a rule.
 */
import ts from "typescript";
import type { Lion } from "./lion.ts";
import type { Source } from "./sources.ts";

export interface Vocabulary {
  /** Error classes the evaluator exports. */
  readonly errors: number;
  /** Special forms; undefined for a version that does not list them. */
  readonly forms: number | undefined;
  /** Functions of the standard library. */
  readonly functions: number;
  /**
   * Distinct messages the evaluator can answer a program with instead of a
   * value. Nearly every one states a rule the program broke, so the count
   * follows how many rules there are to break.
   */
  readonly messages: number;
}

/** A message has several words; shorter text is a name, a key, or a tag. */
const MESSAGE_WORDS = 4;
const WHITESPACE = /\s+/;

const isMessage = (text: string) =>
  text.trim().split(WHITESPACE).length >= MESSAGE_WORDS;

/** The text of a string or template, with `…` where a value goes. */
const literalText = (node: ts.Node): string | undefined => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return ts.isTemplateExpression(node)
    ? [
        node.head.text,
        ...node.templateSpans.map((span) => span.literal.text),
      ].join("…")
    : undefined;
};

const collect = (node: ts.Node, found: Set<string>): void => {
  const text = literalText(node);
  if (text !== undefined && isMessage(text)) {
    found.add(text);
  }
  ts.forEachChild(node, (child) => collect(child, found));
};

/** The distinct messages written in some source files, sorted. */
export const messagesIn = (sources: readonly Source[]): string[] => {
  const found = new Set<string>();
  for (const { path, text } of sources) {
    collect(
      ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true),
      found
    );
  }
  return [...found].sort();
};

/** Counts the vocabulary of one version from its evaluator and its source. */
export const vocabularyOf = (
  lion: Lion,
  sources: readonly Source[]
): Vocabulary => ({
  errors: lion.errors.length,
  forms: lion.forms?.length,
  functions: Object.values(lion.stdlib).filter(
    (value) => typeof value === "function"
  ).length,
  messages: messagesIn(sources).length,
});
