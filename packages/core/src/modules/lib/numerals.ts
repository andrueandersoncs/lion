/** Text with the characters a pattern reads as its own taken as they are. */
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");

/**
 * How a number is written: as JSON writes it, with "−" also a minus sign,
 * and, given a separator, a whole part that may be in groups of three digits
 * with the separator between them, as `number/toString` writes one. A minus
 * sign counts only where no letter, digit, or point stands right before it,
 * so "2023-24" holds 2023 and 24, and "COVID-19" holds 19.
 */
const numeral = (separator: string) => {
  const grouped =
    separator === "" ? "" : `\\d{1,3}(?:${literal(separator)}\\d{3})+(?!\\d)|`;
  return `(?<sign>(?<![\\p{L}\\p{N}.])[-−])?(?<whole>${grouped}\\d+)(?<rest>(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)`;
};

/** The number a written numeral stands for, unless JSON cannot hold it. */
const valued = (separator: string, found: RegExpExecArray) => {
  const { rest = "", sign, whole = "" } = found.groups ?? {};
  const digits = separator === "" ? whole : whole.split(separator).join("");
  const n = Number(`${sign === undefined ? "" : "-"}${digits}${rest}`);
  // Adding zero turns -0 into 0, as JSON writes both.
  return Number.isFinite(n) ? n + 0 : undefined;
};

/** The text as a number, when all of it is one; otherwise null. */
export const readNumber = (text: string, separator: string): number | null => {
  const found = new RegExp(`^(?:${numeral(separator)})$`, "u").exec(text);
  return (found && valued(separator, found)) ?? null;
};

/** Every number written in the text, in order. */
export const numbersIn = (text: string, separator: string): number[] =>
  Array.from(text.matchAll(new RegExp(numeral(separator), "gu")), (found) =>
    valued(separator, found)
  ).filter((n) => n !== undefined);
