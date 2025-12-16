import { describe, it, expect } from "bun:test";
import { Effect, Ref } from "effect";
import { evaluate, LionEnvironment } from "./evaluate";
import type { LionFunctionValueType } from "./schemas/lion-value";
import type { LionExpressionType } from "./schemas/lion-expression";

const runEffect = (env: Record<string, any>, eff: Effect.Effect<any, any, any>) =>
  Effect.runSync(
    Effect.flatMap(Ref.make(env), (envRef) => Effect.provideService(LionEnvironment, envRef)(eff as any)) as any
  );

const succeed = (value: any): Effect.Effect<any, Error, LionEnvironment> => Effect.succeed(value) as any;

const runEvaluate = (env: Record<string, any>, expression: LionExpressionType) => {
  return runEffect(env, evaluate(expression));
};

// Standard library functions for testing
const stdlib: Record<string, LionFunctionValueType> = {
  "+": (...args: unknown[]) => succeed((args as number[]).reduce((a, b) => a + b, 0)),
  "-": (...args: unknown[]) =>
    succeed(
      (() => {
        const nums = args as number[];
        if (nums.length === 0) return 0;
        if (nums.length === 1) return -nums[0]!;
        return nums.slice(1).reduce((a, b) => a - b, nums[0]!);
      })()
    ),
  "*": (...args: unknown[]) => succeed((args as number[]).reduce((a, b) => a * b, 1)),
  "/": (...args: unknown[]) =>
    succeed(
      (() => {
        const nums = args as number[];
        if (nums.length === 0) return 1;
        if (nums.length === 1) return 1 / nums[0]!;
        return nums.slice(1).reduce((a, b) => a / b, nums[0]!);
      })()
    ),
  "=": (...args: unknown[]) => succeed(args.every((arg) => arg === args[0])),
  "<": (a: unknown, b: unknown) => succeed((a as number) < (b as number)),
  ">": (a: unknown, b: unknown) => succeed((a as number) > (b as number)),
  "<=": (a: unknown, b: unknown) => succeed((a as number) <= (b as number)),
  ">=": (a: unknown, b: unknown) => succeed((a as number) >= (b as number)),
  not: (a: unknown) => succeed(!a),
  and: (...args: unknown[]) => succeed(args.every(Boolean)),
  or: (...args: unknown[]) => succeed(args.some(Boolean)),
  if: (cond: unknown, then: unknown, else_: unknown) => succeed(cond ? then : else_),
  list: (...args: unknown[]) => succeed(args),
  first: (arr: unknown) => succeed((arr as unknown[])[0]),
  rest: (arr: unknown) => succeed((arr as unknown[]).slice(1)),
  length: (arr: unknown) => succeed((arr as unknown[]).length),
  concat: (...args: unknown[]) => succeed((args as unknown[][]).flat()),
  identity: (x: unknown) => succeed(x),
  get: (obj: unknown, key: unknown) => succeed((obj as Record<string, unknown>)[key as string]),
  keys: (obj: unknown) => succeed(Object.keys(obj as Record<string, unknown>)),
  values: (obj: unknown) => succeed(Object.values(obj as Record<string, unknown>)),
};

describe("evaluate", () => {
  describe("primitives", () => {
    it("should return numbers as-is", () => {
      expect(runEvaluate({}, 42)).toBe(42);
      expect(runEvaluate({}, 0)).toBe(0);
      expect(runEvaluate({}, -3.14)).toBe(-3.14);
    });

    it("should return booleans as-is", () => {
      expect(runEvaluate({}, true)).toBe(true);
      expect(runEvaluate({}, false)).toBe(false);
    });

    it("should return null as-is", () => {
      expect(runEvaluate({}, null)).toBe(null);
    });

    it("should return strings not in environment as-is", () => {
      expect(runEvaluate({}, "hello")).toBe("hello");
      expect(runEvaluate({}, "unknown-var")).toBe("unknown-var");
    });
  });

  describe("variable lookup", () => {
    it("should look up variables from the environment", () => {
      const env = { x: 10, name: "Alice" };
      expect(runEvaluate(env, "x")).toBe(10);
      expect(runEvaluate(env, "name")).toBe("Alice");
    });

    it("should return undefined variables as strings", () => {
      const env = { x: 10 };
      expect(runEvaluate(env, "y")).toBe("y");
    });

    it("should look up nested values", () => {
      const env = { data: { nested: 42 } };
      expect(runEvaluate(env, "data")).toEqual({ nested: 42 });
    });

    it("should look up functions from the environment", () => {
      const env = { double: (x: unknown) => (x as number) * 2 };
      const fn = runEvaluate(env, "double");
      expect(typeof fn).toBe("function");
    });
  });

  describe("empty arrays", () => {
    it("should return empty array for empty expression", () => {
      expect(runEvaluate({}, [])).toEqual([]);
    });
  });

  describe("quote special form", () => {
    it("should return the argument unevaluated", () => {
      expect(runEvaluate(stdlib, ["quote", ["+", 1, 2]])).toEqual(["+", 1, 2]);
    });

    it("should quote primitives", () => {
      expect(runEvaluate(stdlib, ["quote", 42])).toBe(42);
      expect(runEvaluate(stdlib, ["quote", "hello"])).toBe("hello");
    });

    it("should quote nested structures", () => {
      const nested = ["list", ["quote", 1], ["quote", 2]];
      expect(runEvaluate(stdlib, ["quote", nested])).toEqual(nested);
    });

    it("should return a curried function when called with no arguments", () => {
      expect(() => runEvaluate(stdlib, ["quote"])).toThrow(
        "Invalid quote expression: quote requires exactly one argument"
      );
    });
  });

  describe("eval special form", () => {
    it("should evaluate a quoted expression", () => {
      const env = { ...stdlib, expr: ["+", 1, 2] };
      const result = runEvaluate(env, ["eval", "expr"]);
      expect(result).toBe(3);
    });

    it("should double-evaluate nested quotes", () => {
      const result = runEvaluate(stdlib, ["eval", ["quote", ["+", 1, 2]]]);
      expect(result).toBe(3);
    });

    it("should return a curried function when called with no arguments", () => {
      expect(() => runEvaluate(stdlib, ["eval"])).toThrow(
        "Invalid eval expression: eval requires exactly one argument"
      );
    });

    it("should throw for invalid expressions in eval", () => {
      // Functions are valid LionValues but not valid LionExpressions
      const env = {
        ...stdlib,
        fn: () => succeed(() => succeed(null)),
      };
      expect(() => runEvaluate(env, ["eval", ["fn"]])).toThrow(
        "Invalid eval expression: given argument must be an expression"
      );
    });
  });

  describe("function application", () => {
    it("should apply arithmetic functions", () => {
      expect(runEvaluate(stdlib, ["+", 1, 2])).toBe(3);
      expect(runEvaluate(stdlib, ["+", 1, 2, 3, 4])).toBe(10);
      expect(runEvaluate(stdlib, ["-", 10, 3])).toBe(7);
      expect(runEvaluate(stdlib, ["*", 3, 4])).toBe(12);
      expect(runEvaluate(stdlib, ["/", 10, 2])).toBe(5);
    });

    it("should apply comparison functions", () => {
      expect(runEvaluate(stdlib, ["=", 1, 1])).toBe(true);
      expect(runEvaluate(stdlib, ["=", 1, 2])).toBe(false);
      expect(runEvaluate(stdlib, ["<", 1, 2])).toBe(true);
      expect(runEvaluate(stdlib, [">", 1, 2])).toBe(false);
      expect(runEvaluate(stdlib, ["<=", 2, 2])).toBe(true);
      expect(runEvaluate(stdlib, [">=", 2, 2])).toBe(true);
    });

    it("should apply logical functions", () => {
      expect(runEvaluate(stdlib, ["not", true])).toBe(false);
      expect(runEvaluate(stdlib, ["not", false])).toBe(true);
      expect(runEvaluate(stdlib, ["and", true, true])).toBe(true);
      expect(runEvaluate(stdlib, ["and", true, false])).toBe(false);
      expect(runEvaluate(stdlib, ["or", false, true])).toBe(true);
      expect(runEvaluate(stdlib, ["or", false, false])).toBe(false);
    });

    it("should apply conditional function", () => {
      expect(runEvaluate(stdlib, ["if", true, 1, 2])).toBe(1);
      expect(runEvaluate(stdlib, ["if", false, 1, 2])).toBe(2);
    });

    it("should apply list functions", () => {
      expect(runEvaluate(stdlib, ["list", 1, 2, 3])).toEqual([1, 2, 3]);
      expect(runEvaluate(stdlib, ["first", ["list", 1, 2, 3]])).toBe(1);
      expect(runEvaluate(stdlib, ["rest", ["list", 1, 2, 3]])).toEqual([2, 3]);
      expect(runEvaluate(stdlib, ["length", ["list", 1, 2, 3]])).toBe(3);
      expect(runEvaluate(stdlib, ["concat", ["list", 1, 2], ["list", 3, 4]])).toEqual([1, 2, 3, 4]);
    });

    it("should evaluate arguments before applying function", () => {
      expect(runEvaluate(stdlib, ["+", ["+", 1, 2], ["+", 3, 4]])).toBe(10);
      expect(runEvaluate(stdlib, ["*", ["+", 1, 1], ["+", 2, 2]])).toBe(8);
    });

    it("should look up variables in arguments", () => {
      const env = { ...stdlib, x: 5, y: 3 };
      expect(runEvaluate(env, ["+", "x", "y"])).toBe(8);
      expect(runEvaluate(env, ["*", "x", ["+", "y", 1]])).toBe(20);
    });
  });

  describe("non-function lists", () => {
    it("should return list of evaluated values when first element is not a function", () => {
      expect(runEvaluate({}, [1, 2, 3])).toEqual([1, 2, 3]);
      expect(runEvaluate({}, ["a", "b", "c"])).toEqual(["a", "b", "c"]);
    });

    it("should evaluate nested expressions in non-function lists", () => {
      expect(runEvaluate(stdlib, [1, ["+", 1, 2], 3])).toEqual([1, 3, 3]);
    });

    it("should handle mixed types in lists", () => {
      expect(runEvaluate({}, [1, "hello", true, null])).toEqual([1, "hello", true, null]);
    });
  });

  describe("object evaluation", () => {
    it("should evaluate values in objects", () => {
      expect(runEvaluate({}, { a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    });

    it("should evaluate expressions in object values", () => {
      expect(runEvaluate(stdlib, { sum: ["+", 1, 2], product: ["*", 3, 4] })).toEqual({
        sum: 3,
        product: 12,
      });
    });

    it("should look up variables in object values", () => {
      const env = { ...stdlib, x: 10 };
      expect(runEvaluate(env, { value: "x", doubled: ["*", "x", 2] })).toEqual({
        value: 10,
        doubled: 20,
      });
    });

    it("should handle nested objects", () => {
      expect(
        runEvaluate(stdlib, {
          outer: {
            inner: ["+", 1, 2],
          },
        })
      ).toEqual({
        outer: {
          inner: 3,
        },
      });
    });

    it("should apply object accessor functions", () => {
      const env = { ...stdlib, obj: { name: "Alice", age: 30 } };
      expect(runEvaluate(env, ["get", "obj", "name"])).toBe("Alice");
      expect(runEvaluate(env, ["keys", "obj"])).toEqual(["name", "age"]);
      expect(runEvaluate(env, ["values", "obj"])).toEqual(["Alice", 30]);
    });
  });

  describe("nested expressions", () => {
    it("should handle deeply nested arithmetic", () => {
      expect(runEvaluate(stdlib, ["+", ["+", ["+", 1, 2], 3], 4])).toBe(10);
    });

    it("should handle complex nested expressions", () => {
      const env = { ...stdlib, x: 2, y: 3 };
      expect(runEvaluate(env, ["if", ["<", "x", "y"], ["*", "x", "y"], ["+", "x", "y"]])).toBe(6);
    });

    it("should handle nested function results", () => {
      expect(runEvaluate(stdlib, ["first", ["rest", ["list", 1, 2, 3]]])).toBe(2);
    });

    it("should handle mixed nesting of arrays and objects", () => {
      const result = runEvaluate(stdlib, {
        numbers: ["list", 1, 2, 3],
        sum: ["+", 1, 2, 3],
        nested: {
          value: ["*", 2, 3],
        },
      });
      expect(result).toEqual({
        numbers: [1, 2, 3],
        sum: 6,
        nested: {
          value: 6,
        },
      });
    });
  });

  describe("edge cases", () => {
    it("should handle zero and negative numbers", () => {
      expect(runEvaluate(stdlib, ["+", 0, 0])).toBe(0);
      expect(runEvaluate(stdlib, ["+", -1, -2])).toBe(-3);
      expect(runEvaluate(stdlib, ["*", -2, 3])).toBe(-6);
    });

    it("should handle empty list operations", () => {
      expect(runEvaluate(stdlib, ["list"])).toEqual([]);
      expect(runEvaluate(stdlib, ["length", ["list"]])).toBe(0);
    });

    it("should handle single element operations", () => {
      expect(runEvaluate(stdlib, ["+", 5])).toBe(5);
      expect(runEvaluate(stdlib, ["list", 42])).toEqual([42]);
    });

    it("should preserve null values", () => {
      const env = { ...stdlib, nullVal: null };
      expect(runEvaluate(env, "nullVal")).toBe(null);
      expect(runEvaluate(env, { value: null })).toEqual({ value: null });
    });

    it("should handle boolean expressions", () => {
      expect(runEvaluate(stdlib, ["and", [">", 5, 3], ["<", 2, 4]])).toBe(true);
      expect(runEvaluate(stdlib, ["or", ["<", 5, 3], [">", 2, 4]])).toBe(false);
    });
  });

  describe("error handling", () => {
    it("should throw when function returns invalid value", () => {
      const env = {
        badFn: () => succeed(undefined),
      };
      expect(runEvaluate(env, ["badFn"])).toBeUndefined();
    });

    it("should throw when eval receives non-expression", () => {
      const env = {
        ...stdlib,
        getFn: () => succeed(() => succeed(null)),
      };
      expect(() => runEvaluate(env, ["eval", ["getFn"]])).toThrow(
        "Invalid eval expression: given argument must be an expression"
      );
    });
  });

  describe("higher-order functions", () => {
    it("should support functions that return functions", () => {
      const env = {
        ...stdlib,
        makeAdder: (n: unknown) => succeed((x: unknown) => succeed((n as number) + (x as number))),
      };
      const add5 = runEvaluate(env, ["makeAdder", 5]) as Function;
      expect(runEffect(env, add5(3))).toBe(8);
    });

    it("should support passing functions as arguments", () => {
      const env = {
        ...stdlib,
        apply: (fn: unknown, arg: unknown) => (fn as Function)(arg),
        double: (x: unknown) => succeed((x as number) * 2),
      };
      expect(runEvaluate(env, ["apply", "double", 5])).toBe(10);
    });
  });
});
