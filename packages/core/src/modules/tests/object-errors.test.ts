/**
 * When an object function fails, its error says what went wrong, so the
 * editor, the docs, and the command line can show more than the error's name.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { stdlib } from "@/modules";

const quote = (value: unknown) => ["quote", value];

/** Runs a program that must fail, and returns its error. */
const failure = (program: unknown) =>
  run(program, stdlib).pipe(
    Effect.flip,
    Effect.map((error) => error as { _tag?: unknown; message?: unknown })
  );

const KEY = /^[a-z]{1,6}$/;

const key = Arbitrary.schema(Schema.String.check(Schema.isPattern(KEY)));

const keys = Arbitrary.filter(
  Arbitrary.array(key, { minLength: 1, maxLength: 4 }),
  (list) => new Set(list).size === list.length
);

const notAnObject = Arbitrary.schema(
  Schema.Union([Schema.Int, Schema.Boolean, Schema.Null, Schema.String])
);

describe("object function errors", () => {
  it.effect.prop(
    "name a missing key",
    { present: keys, missing: key },
    ({ present, missing }) =>
      Effect.gen(function* () {
        if (present.includes(missing)) {
          return;
        }
        const record = Object.fromEntries(present.map((k) => [k, 1]));
        const error = yield* failure([
          "object/get-path",
          quote(record),
          quote(`${present[0]}.${missing}`),
        ]);
        expect(error._tag).toBe("PathTraversalError");
        expect(String(error.message)).toContain(missing);
        const top = yield* failure([
          "object/get-path",
          quote(record),
          quote(missing),
        ]);
        expect(top._tag).toBe("KeyNotFoundError");
        expect(String(top.message)).toContain(`"${missing}"`);
      })
  );

  it.effect.prop(
    "give the index and length of an index past the end",
    { list: Arbitrary.array(key, { maxLength: 4 }), extra: key },
    ({ list, extra }) =>
      Effect.gen(function* () {
        const index = list.length + extra.length;
        const error = yield* failure([
          "object/get-path",
          quote({ items: list }),
          quote(`items.${index}`),
        ]);
        expect(error._tag).toBe("IndexOutOfBoundsError");
        expect(String(error.message)).toContain(String(index));
        expect(String(error.message)).toContain(String(list.length));
      })
  );

  it.effect.prop(
    "describe a value that is not an object, a method, or a class",
    { value: notAnObject, name: key },
    ({ value, name }) =>
      Effect.gen(function* () {
        const cases = [
          ["object/get", quote(value), quote(name)],
          ["object/call-method", quote({}), quote(name)],
          ["object/new", quote(value)],
        ];
        for (const program of cases) {
          const error = yield* failure(program);
          expect(String(error.message).length).toBeGreaterThan(0);
        }
        const method = yield* failure([
          "object/call-method",
          quote({}),
          quote(name),
        ]);
        expect(String(method.message)).toContain(`"${name}"`);
      })
  );
});
