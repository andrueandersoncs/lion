/**
 * The solver decides whether values meet linear constraints, and finds some
 * that do. Each property checks it against brute force: every whole point
 * of a box, or a grid of fractions, and checks every example it gives
 * against the constraints.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Schema } from "effect";
import {
  type Constraint,
  constant,
  fromNumber,
  isWhole,
  type Linear,
  meets,
  plus,
  type Rational,
  type Relation,
  ratio,
  type Sort,
  satisfiable,
  solve,
  times,
  toNumber,
  type Values,
  variable,
} from "@/logic/solver";
import { element } from "./programs";

const OPTIONS = { timeout: 120_000, arbitrary: { runs: 400 } };

const NAMES = ["x", "y", "z"] as const;

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

interface Generated {
  readonly constraints: readonly Constraint[];
  readonly names: readonly string[];
}

const linearOf = (
  coefficients: readonly number[],
  names: readonly string[],
  offset: number
): Linear =>
  coefficients.reduce<Linear>(
    (sum, c, at) =>
      plus(sum, times(variable(names[at] as string), ratio(BigInt(c)))),
    constant(ratio(BigInt(offset)))
  );

/**
 * Constraints over one to three variables, with coefficients up to `most`
 * either way, so that larger ones reach the Omega test's dark and grey
 * shadows and its equations with no unit coefficient.
 */
const constraints = (most: number) =>
  Arbitrary.flatMap(int(1, 3), (size) => {
    const names = NAMES.slice(0, size);
    const one = Arbitrary.map(
      Arbitrary.all([
        Arbitrary.array(int(-most, most), { minLength: size, maxLength: size }),
        int(-8, 8),
        element<Relation>([">=", ">=", ">", "=", "!="]),
      ]),
      ([coefficients, offset, relation]): Constraint => ({
        linear: linearOf(coefficients, names, offset),
        relation,
      })
    );
    return Arbitrary.map(
      Arbitrary.array(one, { minLength: 1, maxLength: 5 }),
      (list): Generated => ({ constraints: list, names })
    );
  });

/** Every whole point of the box from -bound to bound in each variable. */
const points = (names: readonly string[], bound: number): Values[] => {
  let out: Map<string, Rational>[] = [new Map()];
  for (const name of names) {
    out = out.flatMap((point) =>
      Array.from({ length: 2 * bound + 1 }, (_, at) =>
        new Map(point).set(name, ratio(BigInt(at - bound)))
      )
    );
  }
  return out;
};

/** Every point of a grid of quarters from -bound to bound. */
const grid = (names: readonly string[], bound: number): Values[] => {
  let out: Map<string, Rational>[] = [new Map()];
  for (const name of names) {
    out = out.flatMap((point) =>
      Array.from({ length: 8 * bound + 1 }, (_, at) =>
        new Map(point).set(name, ratio(BigInt(at - 4 * bound), 4n))
      )
    );
  }
  return out;
};

const box = (names: readonly string[], bound: number): Constraint[] =>
  names.flatMap((name) => [
    {
      linear: plus(variable(name), constant(ratio(BigInt(bound)))),
      relation: ">=" as const,
    },
    {
      linear: plus(
        times(variable(name), ratio(-1n)),
        constant(ratio(BigInt(bound)))
      ),
      relation: ">=" as const,
    },
  ]);

const sortsOf = (names: readonly string[], sort: Sort) =>
  new Map(names.map((name) => [name, sort]));

const meetsAll = (list: readonly Constraint[], values: Values) =>
  list.every((c) => meets(c, values));

describe("the solver", () => {
  it.prop(
    "agrees with every whole point of a box, and its example meets every constraint",
    { generated: constraints(7) },
    ({ generated: { constraints: list, names } }) => {
      const bounded = [...list, ...box(names, 4)];
      const sorts = sortsOf(names, "integer");
      const found = points(names, 4).some((point) => meetsAll(bounded, point));
      const values = solve(bounded, sorts);
      expect(values !== undefined).toBe(found);
      expect(satisfiable(bounded, sorts)).toBe(found);
      if (values !== undefined) {
        expect(meetsAll(bounded, values)).toBe(true);
        expect([...values.values()].every(isWhole)).toBe(true);
      }
    },
    OPTIONS
  );

  it.prop(
    "solves equations none of whose coefficients is one, as every whole point of a box does",
    {
      generated: Arbitrary.flatMap(int(2, 3), (size) => {
        const names = NAMES.slice(0, size);
        const coefficient = Arbitrary.map(
          Arbitrary.all([int(2, 7), element([1, -1])]),
          ([k, sign]) => k * sign
        );
        const equation = Arbitrary.map(
          Arbitrary.all([
            Arbitrary.array(coefficient, { minLength: size, maxLength: size }),
            int(-12, 12),
          ]),
          ([coefficients, offset]): Constraint => ({
            linear: linearOf(coefficients, names, offset),
            relation: "=",
          })
        );
        return Arbitrary.map(
          Arbitrary.array(equation, { minLength: 1, maxLength: 2 }),
          (list): Generated => ({ constraints: list, names })
        );
      }),
    },
    ({ generated: { constraints: list, names } }) => {
      const bounded = [...list, ...box(names, 5)];
      const sorts = sortsOf(names, "integer");
      const found = points(names, 5).some((point) => meetsAll(bounded, point));
      expect(satisfiable(bounded, sorts)).toBe(found);
      const values = solve(bounded, sorts);
      expect(values !== undefined).toBe(found);
      if (values !== undefined) {
        expect(meetsAll(bounded, values)).toBe(true);
      }
    },
    OPTIONS
  );

  it.prop(
    "decides narrow bands, where whole numbers and other numbers part, as every whole point of a box does",
    {
      bands: Arbitrary.array(
        Arbitrary.all([
          Arbitrary.map(
            Arbitrary.all([int(2, 6), element([1, -1])]),
            ([k, sign]) => k * sign
          ),
          Arbitrary.map(
            Arbitrary.all([int(2, 6), element([1, -1])]),
            ([k, sign]) => k * sign
          ),
          int(-10, 10),
          int(0, 2),
        ]),
        { minLength: 2, maxLength: 3 }
      ),
    },
    ({ bands }) => {
      // low ≤ a·x + b·y ≤ low + width, for each band.
      const names = ["x", "y"];
      const list = bands.flatMap(([a, b, low, width]): Constraint[] => [
        { linear: linearOf([a, b], names, -low), relation: ">=" },
        { linear: linearOf([-a, -b], names, low + width), relation: ">=" },
      ]);
      const bounded = [...list, ...box(names, 6)];
      const sorts = sortsOf(names, "integer");
      const found = points(names, 6).some((point) => meetsAll(bounded, point));
      expect(satisfiable(bounded, sorts)).toBe(found);
    },
    OPTIONS
  );

  it.prop(
    "finds whole values wherever a box holds some, with no box to bound them",
    { generated: constraints(5) },
    ({ generated: { constraints: list, names } }) => {
      const sorts = sortsOf(names, "integer");
      const values = solve(list, sorts);
      if (points(names, 6).some((point) => meetsAll(list, point))) {
        expect(values).toBeDefined();
      }
      if (values !== undefined) {
        expect(meetsAll(list, values)).toBe(true);
        expect([...values.values()].every(isWhole)).toBe(true);
      }
    },
    OPTIONS
  );

  it.prop(
    "finds values that may be any number wherever whole values or a grid of quarters do",
    { generated: constraints(4) },
    ({ generated: { constraints: list, names } }) => {
      const values = solve(list, sortsOf(names, "real"));
      const whole = solve(list, sortsOf(names, "integer"));
      if (
        whole !== undefined ||
        grid(names, 2).some((point) => meetsAll(list, point))
      ) {
        expect(values).toBeDefined();
      }
      if (values !== undefined) {
        expect(meetsAll(list, values)).toBe(true);
      }
    },
    OPTIONS
  );

  it.prop(
    "keeps a whole variable whole beside one that may be any number",
    { generated: constraints(4), which: int(0, 2) },
    ({ generated: { constraints: list, names }, which }) => {
      const sorts = new Map(
        names.map((name, at): [string, Sort] => [
          name,
          at === which % names.length ? "integer" : "real",
        ])
      );
      const values = solve(list, sorts);
      if (solve(list, sortsOf(names, "integer")) !== undefined) {
        expect(values).toBeDefined();
      }
      if (values !== undefined) {
        expect(meetsAll(list, values)).toBe(true);
        for (const [name, sort] of sorts) {
          if (sort === "integer") {
            expect(isWhole(values.get(name) as Rational)).toBe(true);
          }
        }
      }
    },
    OPTIONS
  );

  it.prop(
    "reads a JSON number as the exact number it stands for",
    { value: Schema.Number.check(Schema.isFinite()) },
    ({ value }) => {
      // JSON writes -0 as 0, so the two are one number here.
      expect(toNumber(fromNumber(value)) === value).toBe(true);
    },
    OPTIONS
  );
});
