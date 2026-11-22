/**
 * The solver decides whether values meet linear constraints, and finds some
 * that do. Each property checks it against brute force: every whole point
 * of a box, or a grid of fractions, and checks every example it gives
 * against the constraints.
 */

import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Schema } from "effect";
import { type Certificate, checks, refute } from "@/logic/certificate";
import {
  type Constraint,
  constant,
  fromNumber,
  type Linear,
  meets,
  plus,
  type Relation,
  type Sort,
  satisfiable,
  solve,
  times,
  toNumber,
  type Values,
  variable,
} from "@/logic/solver";
import { isWhole, type Rational, ratio, toNearest } from "@/numbers/exact";
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

  it.prop(
    "gives certificates that whole-number arithmetic checks, for constraints that have no solution, and none for constraints that have one",
    { generated: constraints(5), whole: element([true, false]) },
    ({ generated: { constraints: list, names }, whole }) => {
      const kept = list.filter((c) => c.relation !== "!=");
      const bounded = [...kept, ...box(names, 3)];
      const sorts = sortsOf(names, whole ? "integer" : "real");
      const certificate = refute(bounded, sorts);
      const solvable = satisfiable(bounded, sorts);
      if (certificate !== undefined) {
        expect(checks(certificate)).toBe(true);
        expect(solvable).toBe(false);
        expect(sameConstraints(certificate, bounded)).toBe(true);
      }
      // Over numbers that may be any number, eliminating them refutes
      // every set of constraints that has no solution: Farkas' lemma.
      if (!(whole || solvable)) {
        expect(certificate).toBeDefined();
      }
    },
    OPTIONS
  );

  it.prop(
    "gives a certificate for every set of constraints on one whole number that has no solution",
    {
      bounds: Arbitrary.array(
        Arbitrary.all([
          Arbitrary.map(
            Arbitrary.all([int(1, 5), element([1, -1])]),
            ([k, sign]) => k * sign
          ),
          int(-9, 9),
          element<Relation>([">=", ">", "="]),
        ]),
        { minLength: 1, maxLength: 4 }
      ),
    },
    ({ bounds }) => {
      // k·x + c, compared with 0: tightened to whole numbers, then
      // eliminated, one variable leaves nothing out.
      const list = bounds.map(
        ([k, c, relation]): Constraint => ({
          linear: linearOf([k], ["x"], c),
          relation,
        })
      );
      const sorts = sortsOf(["x"], "integer");
      const certificate = refute(list, sorts);
      if (satisfiable(list, sorts)) {
        expect(certificate).toBeUndefined();
      } else {
        expect(certificate).toBeDefined();
        expect(checks(certificate as Certificate)).toBe(true);
      }
    },
    OPTIONS
  );

  it.prop(
    "checks no certificate missing its last step, or that multiplies an inequality by a negative number",
    { generated: constraints(5) },
    ({ generated: { constraints: list, names } }) => {
      const kept = list.filter((c) => c.relation !== "!=");
      const certificate = refute(
        [...kept, ...box(names, 3)],
        sortsOf(names, "real")
      );
      if (certificate === undefined) {
        return;
      }
      // Every line before the last holds somewhere, so without it nothing is
      // proved.
      expect(
        checks({ ...certificate, steps: certificate.steps.slice(0, -1) })
      ).toBe(false);
      // An inequality may be added, never taken away.
      const steps = certificate.steps.map((step) => ({
        ...step,
        from: step.from.map(
          ([at, m]) =>
            [
              at,
              at < certificate.constraints.length &&
              certificate.constraints[at]?.relation !== "="
                ? -Math.abs(toNearest(m)) - 1
                : m,
            ] as const
        ),
      }));
      if (
        steps.some((step, at) =>
          step.from.some(
            ([, m], i) => m !== certificate.steps[at]?.from[i]?.[1]
          )
        )
      ) {
        expect(checks({ ...certificate, steps })).toBe(false);
      }
    },
    OPTIONS
  );
});

/** Whether a certificate's constraints are the given ones, each multiplied by a positive number. */
const sameConstraints = (
  certificate: Certificate,
  list: readonly Constraint[]
) =>
  certificate.constraints.length === list.length &&
  certificate.constraints.every((line, at) => {
    const given = list[at] as Constraint;
    const names = new Set([
      ...Object.keys(line.sum),
      ...[...given.linear.coefficients]
        .filter(([, k]) => k.n !== 0n)
        .map(([n]) => n),
    ]);
    // The scale that takes the given constant, or a coefficient, to the line's.
    const pairs: [Rational, number][] = [
      [given.linear.constant, toNearest(line.constant)],
      ...[...names].map((name): [Rational, number] => [
        given.linear.coefficients.get(name) ?? ratio(0n),
        toNearest(line.sum[name] ?? 0),
      ]),
    ];
    const scale = pairs.find(([k]) => k.n !== 0n);
    if (scale === undefined) {
      return pairs.every(([, n]) => n === 0);
    }
    const factor = scale[1] / toNearest(toNumber(scale[0]));
    return (
      factor > 0 &&
      line.relation === given.relation &&
      pairs.every(
        ([k, n]) => Math.abs(toNearest(toNumber(k)) * factor - n) < 1e-9
      )
    );
  });
