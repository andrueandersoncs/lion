/**
 * Standard library functions that mirror a JavaScript operation must agree
 * with it on every input, take their subject first as the rest of the
 * library does, and return plain Lion values.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";

/** Strings are names in Lion, so string data is quoted. */
const quote = (value: unknown) => ["quote", value];

const evaluate = (program: unknown) => run(program, stdlib);

const text = Arbitrary.schema(Schema.String);

/** A string, with a second that is often part of it so searches can hit. */
const textAndPart = Arbitrary.flatMap(text, (whole) =>
  Arbitrary.map(
    Arbitrary.all([
      Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 }))
      ),
      Arbitrary.schema(
        Schema.Int.check(
          Schema.isBetween({ minimum: 0, maximum: whole.length })
        )
      ),
      Arbitrary.schema(
        Schema.Int.check(
          Schema.isBetween({ minimum: 0, maximum: whole.length })
        )
      ),
      text,
    ]),
    ([kind, a, b, other]): [string, string] => {
      const start = Math.min(a, b);
      const end = Math.max(a, b);
      const parts = [
        whole.slice(start, end),
        whole.slice(0, end),
        whole.slice(start),
        other,
      ];
      return [whole, parts[kind] ?? other];
    }
  )
);

const small = Arbitrary.schema(
  Schema.Int.check(Schema.isBetween({ minimum: -1000, maximum: 1000 }))
);

const json = Arbitrary.array(
  Arbitrary.schema(Schema.Union([Schema.Int, Schema.String, Schema.Null])),
  { maxLength: 6 }
);

describe("string functions agree with JavaScript, text first", () => {
  it.effect.prop(
    "startsWith, endsWith, includes, indexOf, length, and concat",
    { pair: textAndPart },
    ({ pair: [whole, part] }) =>
      Effect.gen(function* () {
        const results = yield* evaluate({
          startsWith: ["string/startsWith", quote(whole), quote(part)],
          endsWith: ["string/endsWith", quote(whole), quote(part)],
          includes: ["string/includes", quote(whole), quote(part)],
          indexOf: ["string/indexOf", quote(whole), quote(part)],
          length: ["string/length", quote(whole)],
          concat: ["string/concat", quote(whole), quote(part)],
        });
        expect(results).toEqual({
          startsWith: whole.startsWith(part),
          endsWith: whole.endsWith(part),
          includes: whole.includes(part),
          indexOf: whole.indexOf(part),
          length: whole.length,
          concat: whole + part,
        });
      })
  );
});

describe("array/head and array/tail", () => {
  it.effect.prop(
    "split any list into its first item, or null, and the rest",
    { list: json },
    ({ list }) =>
      Effect.gen(function* () {
        const [head, tail] = (yield* evaluate([
          "array/make",
          ["array/head", quote(list)],
          ["array/tail", quote(list)],
        ])) as [unknown, unknown[]];
        expect(head).toEqual(list.length > 0 ? list[0] : null);
        expect(tail).toEqual(list.slice(1));
        if (list.length > 0) {
          expect([head, ...tail]).toEqual(list);
        }
      })
  );
});

describe("func/apply", () => {
  it.effect.prop(
    "returns what calling the function returns",
    { a: small, b: small },
    ({ a, b }) =>
      Effect.gen(function* () {
        const subtract = ["lambda", ["x", "y"], ["number/subtract", "x", "y"]];
        expect(
          yield* evaluate(["func/apply", "number/add", null, a, b])
        ).toEqual(yield* evaluate(["number/add", a, b]));
        expect(yield* evaluate(["func/apply", subtract, null, a, b])).toEqual(
          a - b
        );
      })
  );
});

const NAME = /^[a-z]{1,6}$/;

/** A record key: Lion rejects empty keys and __proto__. */
const Name = Schema.String.check(Schema.isPattern(NAME));

const name = Arbitrary.schema(Name);

/** A JSON value: a primitive, a list, or a record. */
const jsonValue = Arbitrary.schema(
  Schema.Union([
    Schema.Null,
    Schema.Boolean,
    Schema.Int,
    Schema.String,
    Schema.Array(Schema.Int),
    Schema.Record(Name, Schema.Int),
  ])
);

const isRecord = (value: unknown) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

describe("value/object? and value/array?", () => {
  it.effect.prop(
    "tell records and lists apart, as JSON does",
    { value: jsonValue },
    ({ value }) =>
      Effect.gen(function* () {
        expect(
          yield* evaluate({
            object: ["value/object?", quote(value)],
            array: ["value/array?", quote(value)],
          })
        ).toEqual({ object: isRecord(value), array: Array.isArray(value) });
      })
  );
});

const record = Arbitrary.schema(Schema.Record(Name, Schema.Int));

/** What JavaScript property access gives, with undefined as null. */
const property = (data: Record<string, unknown>, key: string) =>
  (data as Record<string, unknown>)[key] ?? null;

describe("value/integer? and value/any?", () => {
  const whole = Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: -1000, maximum: 1000 }))
  );

  it.effect.prop(
    "say what Number.isInteger says, and true",
    {
      // Whole numbers, fractions, and values that are not numbers at all.
      value: Arbitrary.flatMap(whole, (n) =>
        Arbitrary.map(
          Arbitrary.schema(
            Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 6 }))
          ),
          (pick): unknown =>
            [n, n / 4, n + 0.5, String(n), n > 0, null, [n], { n }][pick] ?? n
        )
      ),
    },
    ({ value }) =>
      Effect.gen(function* () {
        expect(yield* evaluate(["value/integer?", quote(value)])).toBe(
          Number.isInteger(value)
        );
        expect(yield* evaluate(["value/any?", quote(value)])).toBe(true);
        // As schemas, they fit the same values.
        expect(
          yield* evaluate(["schema/fits?", quote(value), "value/integer?"])
        ).toBe(Number.isInteger(value));
        expect(
          yield* evaluate(["schema/fits?", quote(value), "value/any?"])
        ).toBe(true);
      })
  );
});

describe("object/get", () => {
  it.effect.prop(
    "returns the value under a key, or null when there is none",
    {
      // Present keys come from the record; absent ones from fresh names.
      pair: Arbitrary.flatMap(record, (data) =>
        Arbitrary.map(
          Arbitrary.all([
            name,
            Arbitrary.schema(
              Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 9 }))
            ),
          ]),
          ([fresh, at]): [Record<string, number>, string] => [
            data,
            Object.keys(data)[at] ?? fresh,
          ]
        )
      ),
    },
    ({ pair: [data, key] }) =>
      Effect.gen(function* () {
        const result = yield* evaluate(["object/get", quote(data), quote(key)]);
        expect(result).toBe(property(data, key));
      })
  );
});

const STRING_METHODS = ["toUpperCase", "toLowerCase", "trim", "toString"];

describe("method functions", () => {
  it.effect.prop(
    "call a method on any value that has it, as JavaScript does",
    {
      value: text,
      method: Arbitrary.map(
        Arbitrary.schema(
          Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 }))
        ),
        (at) => STRING_METHODS[at] ?? "trim"
      ),
    },
    ({ value, method }) =>
      Effect.gen(function* () {
        const expected = (value as unknown as Record<string, () => string>)[
          method
        ]?.call(value);
        expect(
          yield* evaluate({
            call: ["object/call-method", quote(value), quote(method)],
            get: [["object/get-method", quote(value), quote(method)]],
            callPath: [
              "object/call-method-path",
              quote({ s: value }),
              quote(`s.${method}`),
            ],
            getPath: [
              [
                "object/get-method-path",
                quote({ s: value }),
                quote(`s.${method}`),
              ],
            ],
          })
        ).toEqual({
          call: expected,
          get: expected,
          callPath: expected,
          getPath: expected,
        });
      })
  );

  it.effect.prop(
    "fail with NotAnObjectError, not a crash, on null",
    { method: name },
    ({ method }) =>
      Effect.gen(function* () {
        for (const program of [
          ["object/call-method", null, quote(method)],
          ["object/get-method", null, quote(method)],
          ["object/call-method-path", quote({ s: null }), quote(`s.${method}`)],
          ["object/get-method-path", quote({ s: null }), quote(`s.${method}`)],
        ]) {
          const error = (yield* run(program, stdlib).pipe(Effect.flip)) as {
            _tag?: unknown;
          };
          expect(error._tag).toBe("NotAnObjectError");
        }
      })
  );
});
