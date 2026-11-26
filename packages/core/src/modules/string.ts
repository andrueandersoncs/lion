import { Effect, Schema, String as Str } from "effect";
import { atLeast, logicError } from "@/errors/evaluation";
import {
  base64DecodeUtf8,
  base64EncodeUtf8,
  sha256Sync,
} from "@/modules/lib/encoding";
import { numbersIn } from "@/modules/lib/numerals";
import { combining, over, overEffect, slicing } from "@/modules/lib/shared";

// Like the rest of the library, each function takes its subject first:
// ["string/startsWith", text, prefix]. indexOf returns -1 when the text does
// not contain the search string, as JavaScript does.
const onTwo = <A>(operate: (text: string, other: string) => A) =>
  over([Schema.String, Schema.String], operate);

/** Text made as long as `length` with copies of `fill`, as JavaScript pads. */
const padding = (pad: (text: string, length: number, fill: string) => string) =>
  over([Schema.String, Schema.Int, Schema.String], pad);

const SAFE_FLAGS = /^[ims]*$/;
const SINGLE_QUOTES = /[‘’‚‛′]/g;
const DOUBLE_QUOTES = /[“”„‟″]/g;
const DASHES = /[\u2010-\u2015\u2212]/g;
const ELLIPSIS = /…/g;
const WHITESPACE = /\s+/g;

/** Compiles a Unicode RegExp with only the stateless flags `i`, `m`, `s`. */
const compilePattern = (
  name: string,
  pattern: string,
  flags: string,
  global: boolean
) => {
  if (!SAFE_FLAGS.test(flags)) {
    return logicError(
      `${name} accepts only flags from "i", "m", "s", but found ${JSON.stringify(flags)}.`
    );
  }
  const uniqueFlags = [...new Set(flags)].join("");
  const effective = `${global ? "g" : ""}u${uniqueFlags}`;
  try {
    return Effect.succeed(new RegExp(pattern, effective));
  } catch (error) {
    return logicError(
      `${name}: invalid pattern ${JSON.stringify(pattern)}: ${error instanceof Error ? error.message : String(error)}.`
    );
  }
};

/** Converts a RegExp match into pure JSON data (null for unmatched optional groups). */
const matchRecord = (found: RegExpMatchArray) => ({
  match: found[0] ?? "",
  index: found.index ?? 0,
  groups: found.slice(1).map((group) => group ?? null),
  named: Object.fromEntries(
    Object.entries(found.groups ?? {}).map(([key, value]) => [
      key,
      value ?? null,
    ])
  ),
});

/**
 * Canonical text normalization for quote verification and entity matching:
 * NFKC, typographic quotes/dashes/ellipsis to ASCII, collapsed single spaces,
 * and trimmed ends.
 */
const normalizeText = (text: string) =>
  text
    .normalize("NFKC")
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(DASHES, "-")
    .replace(ELLIPSIS, "...")
    .replace(WHITESPACE, " ")
    .trim();

export const module = {
  symbol: Symbol("string"),

  "equals?": onTwo((a, b) => a === b),
  lessThan: onTwo((a, b) => a < b),
  greaterThan: onTwo((a, b) => a > b),
  lessThanOrEqualTo: onTwo((a, b) => a <= b),
  greaterThanOrEqualTo: onTwo((a, b) => a >= b),
  length: over([Schema.String], Str.length),
  /** Zero or more strings, joined in order: none is "", as `(string-append)` is in Scheme. */
  concat: combining(
    Schema.String,
    (texts) => Effect.succeed(texts.join("")),
    atLeast(0),
    ""
  ),
  startsWith: onTwo((text, search) => text.startsWith(search)),
  endsWith: onTwo((text, search) => text.endsWith(search)),
  includes: onTwo((text, search) => text.includes(search)),
  indexOf: onTwo((text, search) => text.indexOf(search)),
  /**
   * A list of strings with the separator between them. With a third string,
   * that one stands before the last item instead, as `#:before-last` does in
   * Racket: "a, b and c".
   */
  join: over(
    [Schema.Array(Schema.String), Schema.String, Schema.String],
    (texts, between, before = between) =>
      texts.length < 2
        ? texts.join("")
        : `${texts.slice(0, -1).join(between)}${before}${texts.at(-1)}`,
    2
  ),
  /** The parts of the text between each separator: what `join` joins back. */
  split: onTwo((text, separator): string[] => text.split(separator)),
  /** The text's Unicode characters in order, keeping astral characters whole. */
  chars: over([Schema.String], (text): string[] => Array.from(text)),
  /** The text with leading and trailing whitespace removed. */
  trim: over([Schema.String], (text) => text.trim()),
  /** The text converted to lower case. */
  toLowerCase: over([Schema.String], (text) => text.toLowerCase()),
  /** The text converted to upper case. */
  toUpperCase: over([Schema.String], (text) => text.toUpperCase()),
  /** The text with every occurrence of `search` replaced literally by `replacement`. */
  replaceAll: over(
    [Schema.String, Schema.String, Schema.String],
    (text, search, replacement) => text.replaceAll(search, () => replacement)
  ),
  /** The text from `start` up to `end`, as `array/slice` cuts a list. */
  slice: slicing(Schema.String),
  padStart: padding((text, length, fill) => text.padStart(length, fill)),
  padEnd: padding((text, length, fill) => text.padEnd(length, fill)),
  /**
   * Whether the text matches a Unicode regular expression, with optional flags
   * from `"i"`, `"m"`, `"s"`.
   */
  "matches?": overEffect(
    [Schema.String, Schema.String, Schema.String],
    (text, pattern, flags = "") =>
      Effect.map(
        compilePattern("string/matches?", pattern, flags, false),
        (re) => re.test(text)
      ),
    2
  ),
  /**
   * The first match of a Unicode regular expression as
   * `{"match", "index", "groups", "named"}`, or null when nothing matches.
   */
  match: overEffect(
    [Schema.String, Schema.String, Schema.String],
    (text, pattern, flags = "") =>
      Effect.map(
        compilePattern("string/match", pattern, flags, false),
        (re) => {
          const found = re.exec(text);
          return found === null ? null : matchRecord(found);
        }
      ),
    2
  ),
  /** Every non-overlapping match of a Unicode regular expression in order. */
  matchAll: overEffect(
    [Schema.String, Schema.String, Schema.String],
    (text, pattern, flags = "") =>
      Effect.map(
        compilePattern("string/matchAll", pattern, flags, true),
        (re) => Array.from(text.matchAll(re), matchRecord)
      ),
    2
  ),
  /**
   * Canonical text for quote verification and entity matching: NFKC,
   * typographic quotes/dashes/ellipsis normalized to ASCII, whitespace
   * collapsed to single spaces and trimmed.
   */
  normalize: over([Schema.String], normalizeText),
  /**
   * Every number written in the text, in order, each read as
   * `number/fromString` reads it: "$1,250.5M, down -3%" holds 1250.5 and -3
   * with the separator ",".
   */
  numbers: over(
    [Schema.String, Schema.String],
    (text, between = "") => numbersIn(text, between),
    1
  ),
  /** Deterministic lowercase hex SHA-256 digest of a UTF-8 string. */
  sha256: over([Schema.String], sha256Sync),
  /** Standard Base64 encoding of a UTF-8 string. */
  "base64-encode": over([Schema.String], base64EncodeUtf8),
  /** Decodes a Base64 string back to UTF-8, failing if malformed. */
  "base64-decode": overEffect([Schema.String], (encoded) => {
    const decoded = base64DecodeUtf8(encoded);
    return decoded === undefined
      ? logicError(
          `string/base64-decode expects valid Base64 UTF-8 text, but found ${JSON.stringify(encoded)}.`
        )
      : Effect.succeed(decoded);
  }),
};
