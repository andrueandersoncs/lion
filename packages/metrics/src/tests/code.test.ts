/**
 * The code measures, checked against generated functions whose shape says
 * what each measure must be.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary } from "effect";
import { add, type CodeMetrics, measureSource } from "../code.ts";
import { element, oneOf } from "./generators.ts";

/** One line that does one thing. */
const LEAVES = {
  and: "flag = flag && count > 0;",
  choice: "count = flag ? count : 0;",
  fallback: "count = count ?? 0;",
  kind: "flag = value instanceof Error;",
  or: "flag = flag || count > 0;",
  plain: "count += 1;",
};

/**
 * A construct with a body. Each is one decision. `bonus` says whether the
 * decision weighs more when nested: a `case` does not, since the `switch`
 * around it is what nests.
 */
const BLOCKS = {
  catch: {
    bonus: true,
    close: ["}"],
    open: ["try {", "  count += 1;", "} catch {"],
  },
  do: { bonus: true, close: ["} while (flag);"], open: ["do {"] },
  for: {
    bonus: true,
    close: ["}"],
    open: ["for (let at = 0; at < 2; at += 1) {"],
  },
  forIn: { bonus: true, close: ["}"], open: ["for (const key in items) {"] },
  forOf: { bonus: true, close: ["}"], open: ["for (const item of items) {"] },
  if: { bonus: true, close: ["}"], open: ["if (flag) {"] },
  switch: {
    bonus: false,
    close: ["  }", "}"],
    open: ["switch (count) {", "  case 0: {"],
  },
  while: { bonus: true, close: ["}"], open: ["while (flag) {"] },
};

type LeafKind = keyof typeof LEAVES;
type BlockKind = keyof typeof BLOCKS;

/** A statement of a generated function. */
type Statement =
  | { readonly kind: LeafKind }
  | { readonly body: readonly Statement[]; readonly kind: BlockKind }
  | { readonly body: readonly Statement[]; readonly kind: "function" };

const leaf: Arbitrary.Arbitrary<Statement> = Arbitrary.map(
  element(Object.keys(LEAVES) as LeafKind[]),
  (kind) => ({ kind })
);

const statement = (depth: number): Arbitrary.Arbitrary<Statement> =>
  depth === 0
    ? leaf
    : oneOf(
        leaf,
        Arbitrary.all({
          body: Arbitrary.array(statement(depth - 1), { maxLength: 3 }),
          kind: element([
            ...(Object.keys(BLOCKS) as BlockKind[]),
            "function" as const,
          ]),
        })
      );

/** The bodies of the top-level functions of one file. */
const file = Arbitrary.array(Arbitrary.array(statement(3), { maxLength: 4 }), {
  maxLength: 4,
});

/** A function of a written file: its name and the paths through it. */
interface Written {
  readonly name: string;
  readonly paths: number;
}

/** What writing some code adds up to. */
interface Shape {
  /** Decisions that belong to the function being written. */
  readonly decisions: number;
  /** The functions that are complete, in the order they end. */
  readonly ended: readonly Written[];
  readonly lines: readonly string[];
  readonly metrics: CodeMetrics;
}

const NOTHING: CodeMetrics = {
  cognitive: 0,
  cyclomatic: 0,
  dispatch: 0,
  functions: 0,
  lines: 0,
};

const EMPTY: Shape = { decisions: 0, ended: [], lines: [], metrics: NOTHING };

const join = (a: Shape, b: Shape): Shape => ({
  decisions: a.decisions + b.decisions,
  ended: [...a.ended, ...b.ended],
  lines: [...a.lines, ...b.lines],
  metrics: add(a.metrics, b.metrics),
});

const indented = (lines: readonly string[], indent: string) =>
  lines.map((line) => `${indent}${line}`);

/** Names functions in the order they are written. */
interface Names {
  next: number;
}

const writeAll = (
  body: readonly Statement[],
  indent: string,
  depth: number,
  names: Names
): Shape =>
  body
    .map((item) => writeStatement(item, indent, depth, names))
    .reduce(join, EMPTY);

/** A function, top-level or nested: nesting starts over inside it. */
const writeFunction = (
  body: readonly Statement[],
  indent: string,
  names: Names
): Shape => {
  const name = `f${names.next}`;
  names.next += 1;
  const inner = writeAll(body, `${indent}  `, 0, names);
  return {
    decisions: 0,
    ended: [...inner.ended, { name, paths: inner.decisions + 1 }],
    lines: [
      `${indent}const ${name} = (value: unknown, items: unknown[]) => {`,
      `${indent}  let count = 0;`,
      `${indent}  let flag = true;`,
      ...inner.lines,
      `${indent}  return count;`,
      `${indent}};`,
    ],
    metrics: add(inner.metrics, {
      ...NOTHING,
      cyclomatic: 1,
      functions: 1,
      lines: 5,
    }),
  };
};

const writeStatement = (
  item: Statement,
  indent: string,
  depth: number,
  names: Names
): Shape => {
  if (item.kind === "function") {
    return writeFunction(item.body, indent, names);
  }
  if ("body" in item) {
    const { bonus, close, open } = BLOCKS[item.kind];
    const last = open.at(-1) ?? "";
    const inside = " ".repeat(last.length - last.trimStart().length + 2);
    const inner = writeAll(item.body, `${indent}${inside}`, depth + 1, names);
    return {
      decisions: inner.decisions + 1,
      ended: inner.ended,
      lines: [
        ...indented(open, indent),
        ...inner.lines,
        ...indented(close, indent),
      ],
      metrics: add(inner.metrics, {
        ...NOTHING,
        cognitive: 1 + (bonus ? depth : 0),
        cyclomatic: 1,
        lines: open.length + close.length,
      }),
    };
  }
  const decides = item.kind !== "plain" && item.kind !== "kind";
  return {
    decisions: decides ? 1 : 0,
    ended: [],
    lines: [`${indent}${LEAVES[item.kind]}`],
    metrics: {
      ...NOTHING,
      cognitive: decides ? 1 + (item.kind === "choice" ? depth : 0) : 0,
      cyclomatic: decides ? 1 : 0,
      dispatch: item.kind === "kind" ? 1 : 0,
      lines: 1,
    },
  };
};

/** Writes a file, and works out its measures from the shape it has. */
const written = (bodies: readonly (readonly Statement[])[]): Shape => {
  const names = { next: 0 };
  return bodies
    .map((body) => writeFunction(body, "", names))
    .reduce(join, EMPTY);
};

/** Lines that hold no code, though they read like it. */
const NOISE = [
  "",
  "// if (flag && other) { value instanceof Error ? 1 : 2 }",
  "/* for (const item of items) { count += 1; } */",
  "  /** const hidden = () => flag || other; */",
];

/** Puts a line of noise before each line of code that asks for one. */
const withNoise = (lines: readonly string[], noise: readonly number[]) =>
  lines.flatMap((line, at) => {
    const pick = noise.length === 0 ? 0 : (noise[at % noise.length] ?? 0);
    return pick === 0 ? [line] : [NOISE[pick - 1] ?? "", line];
  });

const measures = ({
  cognitive,
  cyclomatic,
  dispatch,
  functions,
  lines,
}: CodeMetrics): CodeMetrics => ({
  cognitive,
  cyclomatic,
  dispatch,
  functions,
  lines,
});

const noise = Arbitrary.array(element([0, 0, 1, 2, 3, 4]), { maxLength: 7 });

describe("measureSource", () => {
  it.prop(
    "counts what the code's shape says, whatever comments and blank lines surround it",
    { bodies: file, noise },
    ({ bodies, noise: lineNoise }) => {
      const shape = written(bodies);
      const source = withNoise(shape.lines, lineNoise).join("\n");
      expect(measures(measureSource("file.ts", source))).toEqual(shape.metrics);
    }
  );

  it.prop(
    "measures two files the same apart as joined",
    { first: file, second: file },
    ({ first, second }) => {
      const one = written(first).lines.join("\n");
      const other = written(second).lines.join("\n");
      const apart = add(
        measureSource("first.ts", one),
        measureSource("second.ts", other)
      );
      const joined = measureSource("joined.ts", `${one}\n${other}`);
      expect(measures(joined)).toEqual(measures(apart));
    }
  );

  it.prop(
    "names the first function to end with the most paths through it",
    { bodies: file },
    ({ bodies }) => {
      const shape = written(bodies);
      const most = Math.max(0, ...shape.ended.map(({ paths }) => paths));
      const first = shape.ended.find(({ paths }) => paths === most);
      const { worst } = measureSource("file.ts", shape.lines.join("\n"));
      expect(worst).toEqual({ cyclomatic: most, name: first?.name ?? "" });
    }
  );
});
