/** How the tools print: numbers, changes, aligned tables, and arguments. */

/** A count with thousands separators, or `n/a` when there is none. */
export const count = (value: number | undefined): string =>
  value === undefined ? "n/a" : value.toLocaleString("en-US");

/**
 * How a number changed, such as `+273 (+4.7%)` or `−17 (−19.5%)`. A number
 * that stayed the same is `0`, and a change from or to nothing is blank.
 */
export const change = (
  before: number | undefined,
  after: number | undefined
): string => {
  if (before === undefined || after === undefined) {
    return "";
  }
  const difference = after - before;
  if (difference === 0) {
    return "0";
  }
  const sign = difference > 0 ? "+" : "−";
  const amount = `${sign}${count(Math.abs(difference))}`;
  if (before === 0) {
    return amount;
  }
  const percent = ((Math.abs(difference) / before) * 100).toFixed(1);
  return `${amount} (${sign}${percent}%)`;
};

/**
 * Lines rows up in columns: the first column starts at the left, and the
 * others end at the right, as numbers read best.
 */
export const table = (rows: readonly (readonly string[])[]): string => {
  const widths: number[] = [];
  for (const row of rows) {
    for (const [column, cell] of row.entries()) {
      widths[column] = Math.max(widths[column] ?? 0, cell.length);
    }
  }
  return rows
    .map((row) =>
      row
        .map((cell, column) =>
          column === 0
            ? cell.padEnd(widths[column] ?? 0)
            : cell.padStart(widths[column] ?? 0)
        )
        .join("  ")
        .trimEnd()
    )
    .join("\n");
};

/** The command line of a tool: its flags, its options, and the rest. */
export interface Arguments {
  /** True when `--name` is given. */
  readonly flag: (name: string) => boolean;
  /** The word after `--name`, when it is given. */
  readonly option: (name: string) => string | undefined;
  /** The words that are neither a flag nor an option's value. */
  readonly rest: readonly string[];
}

/** Reads a command line whose options are those in `options`. */
export const readArguments = (
  words: readonly string[],
  options: readonly string[]
): Arguments => {
  const rest: string[] = [];
  const flags = new Set<string>();
  const values = new Map<string, string>();
  for (let at = 0; at < words.length; at += 1) {
    const word = words[at] ?? "";
    const name = word.startsWith("--") ? word.slice(2) : undefined;
    if (name === undefined) {
      rest.push(word);
    } else if (options.includes(name)) {
      values.set(name, words[at + 1] ?? "");
      at += 1;
    } else {
      flags.add(name);
    }
  }
  return {
    flag: (name) => flags.has(name),
    option: (name) => values.get(name),
    rest,
  };
};
