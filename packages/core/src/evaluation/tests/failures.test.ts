/**
 * A failure says where it came from. A library function given an argument
 * it does not take names itself, the argument, what it takes there, and
 * what it got, in the form of the message for the wrong number of
 * arguments, wherever the call stands. A failure that leaves the body of a
 * function a `define` named says so, innermost first, and a function that
 * made its call in tail position has no frame left to say it, as in Scheme.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Cause, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { element } from "@/logic/tests/programs";
import { stdlib } from "@/modules";

/** The message a program fails with; null when it runs. */
const failure = (program: unknown) =>
  run(program, stdlib).pipe(
    Effect.as<string | null>(null),
    Effect.catchCause((cause) =>
      Effect.succeed(
        String((Cause.squash(cause) as { readonly message?: unknown }).message)
      )
    )
  );

/** Library functions, and what each takes at every argument. */
const TAKEN = {
  "number/add": "a number",
  "number/subtract": "a number",
  "number/lessThan": "a number",
  "string/concat": "a string",
  "string/length": "a string",
} as const;

type Taker = keyof typeof TAKEN;

/** How many arguments each is called with. */
const COUNT: Record<Taker, number> = {
  "number/add": 3,
  "number/subtract": 2,
  "number/lessThan": 2,
  "string/concat": 2,
  "string/length": 1,
};

/** A value of the kind each takes, which the call goes on with. */
const FITTING: Record<Taker, unknown> = {
  "number/add": 1,
  "number/subtract": 1,
  "number/lessThan": 1,
  "string/concat": "a",
  "string/length": "a",
};

/** Values none of them takes, or that only some do. */
const wrong = element<unknown>([
  "seven",
  "",
  true,
  null,
  4,
  2.5,
  ["quote", [1, 2]],
  ["quote", { a: 1 }],
]);

/** What the value is once evaluated, as a message shows it. */
const shown = (value: unknown) =>
  JSON.stringify(Array.isArray(value) ? value[1] : value);

/** Whether a function takes the evaluated value at every argument. */
const takes = (fn: Taker, value: unknown) =>
  TAKEN[fn] === "a number"
    ? typeof value === "number"
    : typeof value === "string";

/**
 * The places a call can stand: plain code, and where it waits for a logic
 * variable bound to its first argument, in a query, a rule, and a find.
 */
const PLACES: Record<string, (call: readonly unknown[]) => unknown> = {
  "plain code": (call) => call,
  query: ([fn, first, ...rest]) => [
    "query",
    ["and", ["=", "?x", first], ["=", "?r", [fn, "?x", ...rest]]],
  ],
  rule: ([fn, first, ...rest]) => [
    "begin",
    ["relation", "given", ["x"]],
    ["relation", "result", ["x", "r"]],
    ["fact", ["given", first]],
    [
      "rule",
      ["result", "?x", "?r"],
      ["given", "?x"],
      ["=", "?r", [fn, "?x", ...rest]],
    ],
    ["query", ["result", "?x", "?r"]],
  ],
  find: ([fn, first, ...rest]) => [
    "find",
    "?r",
    ["and", ["=", "?x", first], ["=", "?r", [fn, "?x", ...rest]]],
  ],
};

describe("an argument a library function does not take", () => {
  it.effect.prop(
    "fails naming the function, the argument, what it takes, and what it got, wherever the call stands",
    {
      fn: element(Object.keys(TAKEN) as Taker[]),
      value: wrong,
      at: Arbitrary.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2 }))
      ),
    },
    ({ fn, value, at }) =>
      Effect.gen(function* () {
        const count = COUNT[fn];
        const position = at % count;
        const args = Array.from({ length: count }, (_, index) =>
          index === position ? value : FITTING[fn]
        );
        for (const [place, write] of Object.entries(PLACES)) {
          const message = yield* failure(write([fn, ...args]));
          if (takes(fn, Array.isArray(value) ? value[1] : value)) {
            expect(message, place).toBeNull();
          } else {
            expect(message, place).toBe(
              `"${fn}" takes ${TAKEN[fn]} as argument ${position + 1} but got ${shown(value)}.`
            );
          }
        }
      })
  );
});

/** A frame of the chain: a named function, or one with no name. */
interface Frame {
  readonly named: boolean;
  /** Whether it calls the next function in tail position. */
  readonly tail: boolean;
}

const frames = Arbitrary.array(
  Arbitrary.all({
    named: element([true, true, false] as const),
    tail: element([true, false] as const),
  }),
  { maxLength: 5 }
);

/**
 * A chain of functions, each calling the one before it, the first calling
 * `number/add` on its argument; the last is called with "seven". A named
 * function is bound by `define`. One with no name is bound as a parameter,
 * which names nothing.
 */
const chain = (all: readonly Frame[]) => {
  const last = all.length - 1;
  const body = (at: number) => {
    if (at === 0) {
      return ["number/add", "x", 1];
    }
    const call = [`f${at - 1}`, "x"];
    return (all[at] as Frame).tail ? call : ["array/make", call];
  };
  const build = (at: number): unknown => {
    const rest = at === last ? [`f${last}`, "seven"] : build(at + 1);
    const lambda = ["lambda", ["x"], body(at)];
    return (all[at] as Frame).named
      ? ["begin", ["define", `f${at}`, lambda], rest]
      : [["lambda", [`f${at}`], rest], lambda];
  };
  return build(0);
};

describe("a failure that leaves functions", () => {
  it.effect.prop(
    "names each named function it leaves, innermost first, but not one that called in tail position",
    {
      failing: element([true, false] as const),
      callers: frames,
    },
    ({ failing, callers }) =>
      Effect.gen(function* () {
        const all: Frame[] = [{ named: failing, tail: false }, ...callers];
        const left = all
          .map((frame, at) => ({ ...frame, name: `f${at}` }))
          .filter((frame, at) => frame.named && (at === 0 || !frame.tail))
          .map((frame) => `"${frame.name}"`);
        const said =
          '"number/add" takes a number as argument 1 but got "seven".';
        expect(yield* failure(chain(all))).toBe(
          left.length === 0
            ? said
            : `${said} (in ${left.join(", called from ")})`
        );
      })
  );
});
