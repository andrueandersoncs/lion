/**
 * Lossless JSON wire encoding for Lion values, including exact non-terminating
 * rationals (such as 1/3) and arbitrary-precision integers (such as 2^53 + 1).
 *
 * Standard JSON values stay plain JSON. Any `Exact` number encodes as
 * `{"$lion/rational": ["n", "d"]}`. A plain user object whose sole key is one
 * of those wire tags is wrapped in `{"$lion/escaped": ...}`, guaranteeing a
 * total bijection over all Lion data values across plain `JSON.stringify` /
 * `JSON.parse` in any language.
 */
import { Effect } from "effect";
import { LogicError } from "@/errors/evaluation";
import { readJson } from "@/evaluation/reading";
import { DIGITS, Exact, fromRational, ratio } from "@/numbers/exact";

const RATIONAL_TAG = "$lion/rational";
const ESCAPED_TAG = "$lion/escaped";
const INTEGER_TEXT = /^-?\d+$/;

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Exact);

const isWireTaggedRecord = (record: Record<string, unknown>): boolean => {
  const keys = Object.keys(record);
  return (
    keys.length === 1 && (keys[0] === RATIONAL_TAG || keys[0] === ESCAPED_TAG)
  );
};

/**
 * Converts a Lion value into a plain JSON-safe value where every `Exact`
 * number is represented losslessly as `{"$lion/rational": ["n", "d"]}`.
 */
export const encodeWire = (value: unknown): unknown => {
  if (value instanceof Exact) {
    return { [RATIONAL_TAG]: [value.n.toString(), value.d.toString()] };
  }
  if (Array.isArray(value)) {
    return value.map(encodeWire);
  }
  if (isPlainRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = encodeWire(item);
    }
    return isWireTaggedRecord(out) ? { [ESCAPED_TAG]: out } : out;
  }
  return value;
};

const decodeRationalPair = (
  pair: unknown
): Effect.Effect<unknown, LogicError> => {
  if (
    !Array.isArray(pair) ||
    pair.length !== 2 ||
    typeof pair[0] !== "string" ||
    typeof pair[1] !== "string" ||
    !INTEGER_TEXT.test(pair[0]) ||
    !INTEGER_TEXT.test(pair[1])
  ) {
    return Effect.fail(
      new LogicError({
        message:
          "Wire rational expects a two-string numerator and denominator pair.",
      })
    );
  }
  const [nText, dText] = pair;
  if (nText.length > DIGITS + 1 || dText.length > DIGITS + 1) {
    return Effect.fail(
      new LogicError({
        message: `Wire rational exceeds the limit of ${DIGITS} digits.`,
      })
    );
  }
  const d = BigInt(dText);
  if (d === 0n) {
    return Effect.fail(
      new LogicError({
        message: "Wire rational denominator cannot be zero.",
      })
    );
  }
  return Effect.succeed(fromRational(ratio(BigInt(nText), d)));
};

/**
 * Decodes a wire-encoded JSON value back into a Lion value, restoring
 * `{"$lion/rational": ["n", "d"]}` to exact Lion numbers and unwrapping
 * escaped records.
 */
export const decodeWire = (
  value: unknown
): Effect.Effect<unknown, LogicError> =>
  Effect.suspend(() => {
    if (Array.isArray(value)) {
      return Effect.forEach(value, decodeWire);
    }
    if (!isPlainRecord(value)) {
      return Effect.succeed(value);
    }
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === RATIONAL_TAG) {
      return decodeRationalPair(value[RATIONAL_TAG]);
    }
    if (keys.length === 1 && keys[0] === ESCAPED_TAG) {
      const inner = value[ESCAPED_TAG];
      if (!isPlainRecord(inner)) {
        return Effect.fail(
          new LogicError({
            message: "Wire escaped value must be a JSON record.",
          })
        );
      }
      return decodeRecordEntries(inner);
    }
    return decodeRecordEntries(value);
  });

const decodeRecordEntries = (
  record: Record<string, unknown>
): Effect.Effect<Record<string, unknown>, LogicError> =>
  Effect.map(
    Effect.forEach(Object.entries(record), ([key, item]) =>
      Effect.map(decodeWire(item), (decoded) => [key, decoded] as const)
    ),
    (entries) => Object.fromEntries(entries)
  );

/** Serializes any Lion data value (including non-terminating rationals) to JSON text. */
export const stringifyWire = (
  value: unknown,
  space?: number | string
): string =>
  JSON.stringify(encodeWire(value === undefined ? null : value), null, space);

/** Parses wire JSON text back into an exact Lion value. */
export const parseWire = (text: string): Effect.Effect<unknown, LogicError> =>
  Effect.flatMap(readJson(text), decodeWire);
