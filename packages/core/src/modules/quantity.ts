import { Effect, Schema } from "effect";
import { ArithmeticError, atLeast } from "@/errors/evaluation";
import { combining, overEffect } from "@/modules/lib/shared";
import { module as number } from "@/modules/number";

/**
 * Numbers that carry their units, checked when the program runs, as Pint
 * checks them. A quantity is JSON data: a record of a `value` and a `unit`,
 * the unit a record from each base unit's name to its whole exponent, so
 * `{"value": 15, "unit": {"m": 1, "s": -1}}` is 15 metres a second. A plain
 * number is a quantity with no unit, and a result with no unit left is its
 * plain number. Units are equal when their records are; converting is
 * multiplying by a quantity such as `{"value": 1000, "unit": {"m": 1, "km": -1}}`.
 */

/** A unit: each base unit's name and its whole exponent, none of them 0. */
type Unit = Readonly<Record<string, number>>;

interface Quantity {
  readonly unit: Unit;
  readonly value: number;
}

const QuantitySchema = Schema.Union([
  Schema.Number,
  Schema.Struct({
    value: Schema.Number,
    unit: Schema.Record(Schema.String, Schema.Int),
  }),
]);

const UnitSchema = Schema.Record(Schema.String, Schema.Int);

/** A quantity of a number or a quantity record, its unit without 0s. */
const quantityOf = (given: number | Quantity): Quantity =>
  typeof given === "number"
    ? { value: given, unit: {} }
    : { value: given.value, unit: normal(given.unit) };

/** A unit without the base units whose exponent is 0, in the order of names. */
const normal = (unit: Unit): Unit =>
  Object.fromEntries(
    Object.entries(unit)
      .filter(([, exponent]) => exponent !== 0)
      .sort(([a], [b]) => (a < b ? -1 : 1))
  );

/** The unit of a product: the exponents of each base unit added. */
const times = (a: Unit, b: Unit, by = 1): Unit => {
  const out: Record<string, number> = { ...a };
  for (const [name, exponent] of Object.entries(b)) {
    out[name] = (out[name] ?? 0) + by * exponent;
  }
  return normal(out);
};

const sameUnit = (a: Unit, b: Unit) =>
  JSON.stringify(normal(a)) === JSON.stringify(normal(b));

/** A quantity as the value it gives: a plain number when no unit is left. */
const given = (value: number, unit: Unit): number | Quantity =>
  Object.keys(unit).length === 0 ? value : { value, unit };

/** How a quantity reads in a message: its value and its unit. */
const said = (quantity: Quantity) =>
  Object.keys(quantity.unit).length === 0
    ? String(quantity.value)
    : `${quantity.value} ${JSON.stringify(quantity.unit)}`;

/** Runs a number function on values, as the number module checks them. */
const numbers = (
  fn: (...args: unknown[]) => unknown,
  values: readonly number[]
) => fn(...values) as Effect.Effect<number, unknown>;

/**
 * Adding or subtracting quantities: they must have one unit, and the result
 * has it, as Pint refuses to add a length to a time.
 */
const sameUnits = (name: string, fn: (...args: unknown[]) => unknown) =>
  combining(
    QuantitySchema,
    (items) => {
      const quantities = items.map(quantityOf);
      const [first] = quantities as [Quantity, ...Quantity[]];
      const other = quantities.find((each) => !sameUnit(each.unit, first.unit));
      return other === undefined
        ? Effect.map(
            numbers(
              fn,
              quantities.map((each) => each.value)
            ),
            (value) => given(value, first.unit)
          )
        : Effect.fail(
            new ArithmeticError({
              message: `quantity/${name}: ${said(first)} and ${said(other)} have different units.`,
            })
          );
    },
    name === "add" ? atLeast(1) : 2
  );

export const module = {
  symbol: Symbol("quantity"),

  add: sameUnits("add", number.add),
  subtract: sameUnits("subtract", number.subtract),

  /** The product: the values multiplied, the units' exponents added. */
  multiply: combining(
    QuantitySchema,
    (items) => {
      const quantities = items.map(quantityOf);
      const unit = quantities.reduce(
        (all: Unit, each) => times(all, each.unit),
        {}
      );
      return Effect.map(
        numbers(
          number.multiply,
          quantities.map((each) => each.value)
        ),
        (value) => given(value, unit)
      );
    },
    atLeast(1)
  ),

  /** The quotient: the values divided, the divisor's exponents taken away. */
  divide: overEffect([QuantitySchema, QuantitySchema], (a, b) => {
    const [top, bottom] = [quantityOf(a), quantityOf(b)];
    return Effect.map(
      numbers(number.divide, [top.value, bottom.value]),
      (value) => given(value, times(top.unit, bottom.unit, -1))
    );
  }),

  /** A quantity to a whole power: each exponent multiplied by it. */
  power: overEffect([QuantitySchema, Schema.Int], (a, exponent) => {
    const base = quantityOf(a);
    const unit = Object.fromEntries(
      Object.entries(base.unit).map(([name, each]) => [name, each * exponent])
    );
    return Effect.map(numbers(number.power, [base.value, exponent]), (value) =>
      given(value, normal(unit))
    );
  }),

  /**
   * The number a quantity is in a unit, when it has that unit, so a program
   * compares or prints quantities as numbers once their units are checked.
   */
  in: overEffect([QuantitySchema, UnitSchema], (a, unit) => {
    const quantity = quantityOf(a);
    return sameUnit(quantity.unit, unit)
      ? Effect.succeed(quantity.value)
      : Effect.fail(
          new ArithmeticError({
            message: `quantity/in: ${said(quantity)} is not in ${JSON.stringify(normal(unit))}.`,
          })
        );
  }),
};
