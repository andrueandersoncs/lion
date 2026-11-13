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

/** A short record key. */
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
            Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 7 }))
          ),
          (pick): unknown => {
            const values: readonly unknown[] = [
              n,
              n / 4,
              n + 0.5,
              String(n),
              n > 0,
              null,
              [n],
              { n },
            ];
            return values[pick];
          }
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

/** Whole numbers, fractions, and numbers JSON writes with an exponent. */
const anyNumber = Arbitrary.flatMap(
  Arbitrary.schema(
    Schema.Int.check(
      Schema.isBetween({ minimum: -1_000_000, maximum: 1_000_000 })
    )
  ),
  (n) =>
    Arbitrary.map(
      Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 }))
      ),
      (pick) => [n, n / 8, n / 3, n * 1e18, n / 1e12, -0][pick] as number
    )
);

/** Values that are not numbers. */
const notANumber = Arbitrary.schema(
  Schema.Union([
    Schema.String,
    Schema.Boolean,
    Schema.Null,
    Schema.Array(Schema.Int),
    Schema.Record(Name, Schema.Int),
  ])
);

/** Values that are not strings. */
const notAString = Arbitrary.schema(
  Schema.Union([
    Schema.Int,
    Schema.Boolean,
    Schema.Null,
    Schema.Array(Schema.Int),
    Schema.Record(Name, Schema.Int),
  ])
);

describe("number/toString", () => {
  it.effect.prop(
    "is the number as JSON writes it, and reads back as the number",
    { n: anyNumber },
    ({ n }) =>
      Effect.gen(function* () {
        const written = yield* evaluate(["number/toString", n]);
        expect(written).toBe(JSON.stringify(n));
        expect(JSON.parse(written as string) === n).toBe(true);
        expect(yield* evaluate(["object/json-stringify", n])).toBe(written);
      })
  );

  it.effect.prop(
    "builds text from a number a rule has bound",
    { n: anyNumber, label: text },
    ({ n, label }) =>
      Effect.gen(function* () {
        const built = [
          "string/concat",
          quote(label),
          ["number/toString", "?n"],
        ];
        expect(
          yield* evaluate([
            "begin",
            ["relation", "reading", ["n"]],
            ["relation", "line", ["n", "text"]],
            ["fact", ["reading", n]],
            ["rule", ["line", "?n", built], ["reading", "?n"]],
            {
              rule: ["find", "?text", ["line", "?_", "?text"]],
              query: [
                "find",
                "?text",
                ["and", ["=", "?n", n], ["=", "?text", built]],
              ],
            },
          ])
        ).toEqual({ rule: [label + String(n)], query: [label + String(n)] });
      })
  );

  it.effect.prop("takes only a number", { value: notANumber }, ({ value }) =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(
        evaluate(["number/toString", quote(value)])
      );
      expect(result._tag).toBe("Failure");
    })
  );
});

/** JSON data, nested a level or two. */
const nestedJson = Arbitrary.schema(
  Schema.Union([
    Schema.Null,
    Schema.Boolean,
    Schema.Int,
    Schema.String,
    Schema.Array(Schema.Union([Schema.Int, Schema.String, Schema.Null])),
    Schema.Record(
      Name,
      Schema.Union([Schema.Int, Schema.String, Schema.Array(Schema.Int)])
    ),
  ])
);

describe("object/json-stringify", () => {
  it.effect.prop(
    "writes any JSON value as JSON.stringify does, so it reads back",
    {
      value: nestedJson,
      space: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 4 }))
      ),
    },
    ({ value, space }) =>
      Effect.gen(function* () {
        const written = yield* evaluate([
          "object/json-stringify",
          quote(value),
        ]);
        expect(written).toBe(JSON.stringify(value));
        // JSON writes -0 as 0, so that is what reads back.
        expect(JSON.parse(written as string)).toEqual(
          JSON.parse(JSON.stringify(value))
        );
        expect(
          yield* evaluate(["object/json-stringify", quote(value), null, space])
        ).toBe(JSON.stringify(value, null, space));
      })
  );
});

/** A few keys, the empty one among them, so records often share them. */
const KEYS = ["a", "b", "", "a b"] as const;

const someKey = Arbitrary.map(
  Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: KEYS.length - 1 }))
  ),
  (at) => KEYS[at] as string
);

const someRecord = Arbitrary.map(
  Arbitrary.array(Arbitrary.all([someKey, nestedJson]), { maxLength: 4 }),
  (entries) => Object.fromEntries(entries)
);

describe("object/set and object/remove", () => {
  it.effect.prop(
    "give a new record with the key set or gone, and leave the one given alone",
    { record: someRecord, key: someKey, value: nestedJson },
    ({ record, key, value }) =>
      Effect.gen(function* () {
        const { [key]: _, ...without } = record;
        const results = yield* evaluate([
          "begin",
          ["define", "r", quote(record)],
          {
            set: ["object/set", "r", quote(key), quote(value)],
            removed: ["object/remove", "r", quote(key)],
            // Removing what was set gives what removing alone gives.
            undone: [
              "object/remove",
              ["object/set", "r", quote(key), quote(value)],
              quote(key),
            ],
            // Setting a key back to its value gives the record again.
            restored:
              key in record
                ? [
                    "object/set",
                    ["object/remove", "r", quote(key)],
                    quote(key),
                    quote(record[key]),
                  ]
                : "r",
            waits: waiting("object/set", "r", quote(key), quote(value)),
            r: "r",
          },
        ]);
        expect(results).toEqual({
          set: { ...record, [key]: value },
          removed: without,
          undone: without,
          restored: record,
          waits: [{ ...record, [key]: value }],
          r: record,
        });
      })
  );

  it.effect.prop(
    "take only a record, and a key a record can hold",
    { record: someRecord, value: notAString },
    ({ record, value }) =>
      Effect.gen(function* () {
        // A list is not a record; a record of whole numbers is one.
        const notRecord =
          typeof value === "object" && value !== null && !Array.isArray(value)
            ? 0
            : value;
        for (const program of [
          ["object/set", quote(record), quote("__proto__"), 1],
          ["object/remove", quote(record), quote("__proto__")],
          ["object/set", quote(record), quote(value), 1],
          ["object/remove", quote(record), quote(value)],
          ["object/set", quote(notRecord), "a", 1],
          ["object/remove", quote(notRecord), "a"],
        ]) {
          const result = yield* Effect.exit(evaluate(program));
          expect(result._tag, JSON.stringify(program)).toBe("Failure");
        }
      })
  );
});

/** A list of strings: none, one, two, or more. */
const texts = Arbitrary.array(text, { maxLength: 5 });

/**
 * What `string/join` gives, written out one item at a time: the separator
 * before every item but the first, and `last` in its place before the last.
 */
const joined = (items: readonly string[], separator: string, last: string) => {
  let out = "";
  for (const [at, item] of items.entries()) {
    if (at > 0) {
      out += at === items.length - 1 ? last : separator;
    }
    out += item;
  }
  return out;
};

/** The same call where it waits for the logic variable that is its subject. */
const waiting = (fn: string, subject: unknown, ...rest: unknown[]) => [
  "find",
  "?r",
  ["and", ["=", "?x", subject], ["=", "?r", [fn, "?x", ...rest]]],
];

describe("string/join and string/split", () => {
  it.effect.prop(
    "join a list with a separator, and with another before the last item",
    { items: texts, separator: text, last: text },
    ({ items, separator, last }) =>
      Effect.gen(function* () {
        const list = quote(items);
        const two = ["string/join", list, quote(separator)];
        const three = ["string/join", list, quote(separator), quote(last)];
        expect(yield* evaluate(two)).toBe(items.join(separator));
        expect(yield* evaluate(three)).toBe(joined(items, separator, last));
        // Without a third string, the separator stands before the last too.
        expect(yield* evaluate([...two, quote(separator)])).toBe(
          items.join(separator)
        );
        expect(
          yield* evaluate(
            waiting("string/join", list, quote(separator), quote(last))
          )
        ).toEqual([joined(items, separator, last)]);
      })
  );

  it.effect.prop(
    "split text as JavaScript does, and join puts it back together",
    { pair: textAndPart },
    ({ pair: [whole, part] }) =>
      Effect.gen(function* () {
        const split = ["string/split", quote(whole), quote(part)];
        expect(yield* evaluate(split)).toEqual(whole.split(part));
        expect(yield* evaluate(["string/join", split, quote(part)])).toBe(
          whole
        );
        expect(
          yield* evaluate(waiting("string/split", quote(whole), quote(part)))
        ).toEqual([whole.split(part)]);
      })
  );

  it.effect.prop(
    "join takes only strings",
    { items: texts, value: notAString, at: small },
    ({ items, value, at }) =>
      Effect.gen(function* () {
        const mixed = items.toSpliced(Math.abs(at) % (items.length + 1), 0, "");
        for (const program of [
          ["string/join", quote(mixed.map((item) => item || value)), ","],
          ["string/join", quote(items), quote(value)],
          ["string/join", quote(items), ",", quote(value)],
          // A list of whole numbers may be empty, and that is a list of strings.
          ["string/join", quote(Array.isArray(value) ? 0 : value), ","],
        ]) {
          const result = yield* Effect.exit(evaluate(program));
          expect(result._tag, JSON.stringify(program)).toBe("Failure");
        }
      })
  );
});

describe("string/padStart and string/padEnd", () => {
  it.effect.prop(
    "make text as long as asked, as JavaScript does",
    {
      value: text,
      fill: text,
      length: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: -2, maximum: 12 }))
      ),
    },
    ({ value, fill, length }) =>
      Effect.gen(function* () {
        const rest = [length, quote(fill)];
        expect(
          yield* evaluate({
            start: ["string/padStart", quote(value), ...rest],
            end: ["string/padEnd", quote(value), ...rest],
            waits: waiting("string/padStart", quote(value), ...rest),
          })
        ).toEqual({
          start: value.padStart(length, fill),
          end: value.padEnd(length, fill),
          waits: [value.padStart(length, fill)],
        });
      })
  );
});

/** Separators with nothing in them that the text of a number has. */
const SEPARATORS = [",", " ", "_", "'", "$", "$&", ", "];

const separator = Arbitrary.map(
  Arbitrary.schema(
    Schema.Int.check(
      Schema.isBetween({ minimum: 0, maximum: SEPARATORS.length - 1 })
    )
  ),
  (at) => SEPARATORS[at] as string
);

/** Text with the characters a pattern reads as its own taken as they are. */
const literal = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

describe("number/toString with a separator", () => {
  it.effect.prop(
    "groups the whole part in threes, and is the number without them",
    { n: anyNumber, between: separator },
    ({ n, between }) =>
      Effect.gen(function* () {
        const grouped = (yield* evaluate([
          "number/toString",
          n,
          quote(between),
        ])) as string;
        // Taking the separators out leaves the number as JSON writes it.
        expect(grouped.split(between).join("")).toBe(String(n));
        // One to three digits, then groups of three; the rest is untouched.
        expect(grouped).toMatch(
          new RegExp(
            `^-?\\d{1,3}(${literal(between)}\\d{3})*(\\.\\d+)?(e[+-]\\d+)?$`
          )
        );
        expect(yield* evaluate(["number/toString", n, quote("")])).toBe(
          String(n)
        );
        expect(
          yield* evaluate(waiting("number/toString", n, quote(between)))
        ).toEqual([grouped]);
      })
  );

  it.effect.prop(
    "takes only a string as the separator",
    { n: anyNumber, value: notAString },
    ({ n, value }) =>
      Effect.gen(function* () {
        const result = yield* Effect.exit(
          evaluate(["number/toString", n, quote(value)])
        );
        expect(result._tag).toBe("Failure");
      })
  );
});

/** One of the given items. */
const oneOf = <A>(items: readonly A[]) =>
  Arbitrary.map(
    Arbitrary.schema(
      Schema.Int.check(
        Schema.isBetween({ minimum: 0, maximum: items.length - 1 })
      )
    ),
    (at) => items[at] as A
  );

/**
 * The number JSON reads in the text, or null. The reader also takes zeros
 * before the digits, and "−" as the minus sign, which JSON does not.
 */
const UNICODE_MINUS = /^−/;
const LEADING_ZEROS = /^(-?)0+(?=\d)/;
const LETTERS = /^[A-Za-z]{1,6}$/;

const asJson = (written: string): number | null => {
  if (written !== written.trim()) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(
      written.replace(UNICODE_MINUS, "-").replace(LEADING_ZEROS, "$1")
    );
    return typeof value === "number" && Number.isFinite(value)
      ? value + 0
      : null;
  } catch {
    return null;
  }
};

const digits = Arbitrary.map(
  Arbitrary.array(oneOf(["0", "1", "7", "9"]), { minLength: 1, maxLength: 3 }),
  (picked) => picked.join("")
);

/**
 * Text of a number, built from its parts, often with an exponent too large
 * for JSON, and sometimes with a character put in that may break it.
 */
const numberish = Arbitrary.map(
  Arbitrary.all({
    sign: oneOf(["", "", "-", "−", "+"]),
    whole: oneOf(["", "0", "00"]),
    digits,
    fraction: oneOf(["", ".", ".5", ".05"]),
    e: oneOf(["", "e", "E"]),
    eSign: oneOf(["", "+", "-"]),
    exponent: oneOf(["", "1", "21", "400", "999"]),
    stray: oneOf(["", "", "", " ", "a", ",", ".", "-", "e"]),
    at: Arbitrary.schema(
      Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 12 }))
    ),
  }),
  ({ sign, whole, digits: run, fraction, e, eSign, exponent, stray, at }) => {
    const written = `${sign}${whole}${run}${fraction}${e === "" ? "" : `${e}${eSign}${exponent}`}`;
    const cut = at % (written.length + 1);
    return written.slice(0, cut) + stray + written.slice(cut);
  }
);

describe("number/fromString", () => {
  it.effect.prop(
    "reads back what number/toString writes, with or without a separator",
    { n: anyNumber, between: separator },
    ({ n, between }) =>
      Effect.gen(function* () {
        const written = (yield* evaluate([
          "number/toString",
          n,
          quote(between),
        ])) as string;
        expect(
          yield* evaluate({
            grouped: ["number/fromString", quote(written), quote(between)],
            plain: ["number/fromString", ["number/toString", n]],
            waits: waiting("number/fromString", quote(written), quote(between)),
          })
        ).toEqual({ grouped: n + 0, plain: n + 0, waits: [n + 0] });
      })
  );

  it.effect.prop(
    "reads a number as JSON does, and any other text as null",
    { written: numberish },
    ({ written }) =>
      Effect.gen(function* () {
        expect(yield* evaluate(["number/fromString", quote(written)])).toBe(
          asJson(written)
        );
      }),
    { arbitrary: { runs: 400 } }
  );

  it.effect.prop(
    "reads a separator only between groups of three digits",
    {
      n: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1e9 }))
      ),
      between: separator,
      how: oneOf(["none", "threes", "anywhere"] as const),
      marks: Arbitrary.array(Arbitrary.schema(Schema.Boolean), {
        minLength: 9,
        maxLength: 9,
      }),
    },
    ({ n, between, how, marks }) =>
      Effect.gen(function* () {
        const digits = String(n).split("");
        // A group ends after the digit with a multiple of three after it.
        const ends = (at: number) =>
          at < digits.length - 1 && (digits.length - 1 - at) % 3 === 0;
        const after = digits.map((_, at) =>
          how === "threes"
            ? ends(at)
            : how === "anywhere" &&
              at < digits.length - 1 &&
              (marks[at] ?? false)
        );
        const written = digits
          .map((digit, at) => digit + (after[at] ? between : ""))
          .join("");
        const grouped =
          after.every((mark) => !mark) ||
          after.every((mark, at) => mark === ends(at));
        expect(
          yield* evaluate(["number/fromString", quote(written), quote(between)])
        ).toBe(grouped ? n : null);
      })
  );

  it.effect.prop(
    "takes only strings, as string/numbers does",
    { value: notAString },
    ({ value }) =>
      Effect.gen(function* () {
        for (const program of [
          ["number/fromString", quote(value)],
          ["number/fromString", "1", quote(value)],
          ["string/numbers", quote(value)],
          ["string/numbers", "1", quote(value)],
        ]) {
          const result = yield* Effect.exit(evaluate(program));
          expect(result._tag, JSON.stringify(program)).toBe("Failure");
        }
      })
  );
});

/** What stands between numbers in prose, none of which joins two into one. */
const GAPS = ["; ", " and ", " / ", " (", " = "] as const;

describe("string/numbers", () => {
  it.effect.prop(
    "finds each number written in text, in order, as it was written",
    {
      numbers: Arbitrary.array(anyNumber, { maxLength: 5 }),
      gaps: Arbitrary.array(oneOf(GAPS), { minLength: 6, maxLength: 6 }),
      between: separator,
    },
    ({ numbers, gaps, between }) =>
      Effect.gen(function* () {
        const written = (yield* evaluate([
          "array/map",
          quote(numbers),
          ["lambda", ["n"], ["number/toString", "n", quote(between)]],
        ])) as string[];
        const prose = written
          .map((part, at) => `${gaps[at] ?? ""}${part}`)
          .join("")
          .concat(gaps.at(-1) ?? "");
        const found = numbers.map((n) => n + 0);
        expect(
          yield* evaluate({
            found: ["string/numbers", quote(prose), quote(between)],
            waits: waiting("string/numbers", quote(prose), quote(between)),
          })
        ).toEqual({ found, waits: [found] });
      })
  );

  it.effect.prop(
    "takes a minus sign as one only where no letter, digit, or point is before it",
    {
      a: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 9999 }))
      ),
      b: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 9999 }))
      ),
      word: Arbitrary.schema(Schema.String.check(Schema.isPattern(LETTERS))),
      sign: oneOf(["-", "−"]),
    },
    ({ a, b, word, sign }) =>
      Effect.gen(function* () {
        const prose = `${a}${sign}${b} ${word}${sign}${b} ${a}.${sign}${b} (${sign}${b}) ${sign}${a}`;
        expect(yield* evaluate(["string/numbers", quote(prose)])).toEqual([
          a,
          b,
          b,
          a,
          b,
          -b + 0,
          -a + 0,
        ]);
      })
  );
});
