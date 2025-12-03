import { describe, it, expect } from "bun:test";
import { evaluate } from "./evaluate";
import type { LionValue } from "./evaluate";

// Standard library functions for testing
const stdlib: Record<string, LionValue> = {
  "+": (...args: unknown[]) => (args as number[]).reduce((a, b) => a + b, 0),
  "-": (...args: unknown[]) => {
    const nums = args as number[];
    if (nums.length === 0) return 0;
    if (nums.length === 1) return -nums[0]!;
    return nums.slice(1).reduce((a, b) => a - b, nums[0]!);
  },
  "*": (...args: unknown[]) => (args as number[]).reduce((a, b) => a * b, 1),
  "/": (...args: unknown[]) => {
    const nums = args as number[];
    if (nums.length === 0) return 1;
    if (nums.length === 1) return 1 / nums[0]!;
    return nums.slice(1).reduce((a, b) => a / b, nums[0]!);
  },
  "=": (...args: unknown[]) => args.every((arg) => arg === args[0]),
  "<": (a: unknown, b: unknown) => (a as number) < (b as number),
  ">": (a: unknown, b: unknown) => (a as number) > (b as number),
  "<=": (a: unknown, b: unknown) => (a as number) <= (b as number),
  ">=": (a: unknown, b: unknown) => (a as number) >= (b as number),
  not: (a: unknown) => !a,
  and: (...args: unknown[]) => args.every(Boolean),
  or: (...args: unknown[]) => args.some(Boolean),
  if: (cond: unknown, then: unknown, else_: unknown) => (cond ? then : else_),
  list: (...args: unknown[]) => args,
  first: (arr: unknown) => (arr as unknown[])[0],
  rest: (arr: unknown) => (arr as unknown[]).slice(1),
  length: (arr: unknown) => (arr as unknown[]).length,
  concat: (...args: unknown[]) => (args as unknown[][]).flat(),
  identity: (x: unknown) => x,
  get: (obj: unknown, key: unknown) => (obj as Record<string, unknown>)[key as string],
  keys: (obj: unknown) => Object.keys(obj as Record<string, unknown>),
  values: (obj: unknown) => Object.values(obj as Record<string, unknown>),
};

describe("evaluate", () => {
  describe("primitives", () => {
    it("should return numbers as-is", () => {
      expect(evaluate({}, 42)).toBe(42);
      expect(evaluate({}, 0)).toBe(0);
      expect(evaluate({}, -3.14)).toBe(-3.14);
    });

    it("should return booleans as-is", () => {
      expect(evaluate({}, true)).toBe(true);
      expect(evaluate({}, false)).toBe(false);
    });

    it("should return null as-is", () => {
      expect(evaluate({}, null)).toBe(null);
    });

    it("should return strings not in environment as-is", () => {
      expect(evaluate({}, "hello")).toBe("hello");
      expect(evaluate({}, "unknown-var")).toBe("unknown-var");
    });
  });

  describe("variable lookup", () => {
    it("should look up variables from the environment", () => {
      const env = { x: 10, name: "Alice" };
      expect(evaluate(env, "x")).toBe(10);
      expect(evaluate(env, "name")).toBe("Alice");
    });

    it("should return undefined variables as strings", () => {
      const env = { x: 10 };
      expect(evaluate(env, "y")).toBe("y");
    });

    it("should look up nested values", () => {
      const env = { data: { nested: 42 } };
      expect(evaluate(env, "data")).toEqual({ nested: 42 });
    });

    it("should look up functions from the environment", () => {
      const env = { double: (x: unknown) => (x as number) * 2 };
      const fn = evaluate(env, "double");
      expect(typeof fn).toBe("function");
    });
  });

  describe("empty arrays", () => {
    it("should return empty array for empty expression", () => {
      expect(evaluate({}, [])).toEqual([]);
    });
  });

  describe("quote special form", () => {
    it("should return the argument unevaluated", () => {
      expect(evaluate(stdlib, ["quote", ["+", 1, 2]])).toEqual(["+", 1, 2]);
    });

    it("should quote primitives", () => {
      expect(evaluate(stdlib, ["quote", 42])).toBe(42);
      expect(evaluate(stdlib, ["quote", "hello"])).toBe("hello");
    });

    it("should quote nested structures", () => {
      const nested = ["list", ["quote", 1], ["quote", 2]];
      expect(evaluate(stdlib, ["quote", nested])).toEqual(nested);
    });

    it("should return a curried function when called with no arguments", () => {
      const quoteFn = evaluate(stdlib, ["quote"]);
      expect(typeof quoteFn).toBe("function");
      expect((quoteFn as Function)(["+", 1, 2])).toEqual(["+", 1, 2]);
    });
  });

  describe("eval special form", () => {
    it("should evaluate a quoted expression", () => {
      const env = { ...stdlib, expr: ["+", 1, 2] };
      expect(evaluate(env, ["eval", "expr"])).toBe(3);
    });

    it("should double-evaluate nested quotes", () => {
      expect(evaluate(stdlib, ["eval", ["quote", ["+", 1, 2]]])).toBe(3);
    });

    it("should return a curried function when called with no arguments", () => {
      const evalFn = evaluate(stdlib, ["eval"]);
      expect(typeof evalFn).toBe("function");
    });

    it("should throw for invalid expressions in eval", () => {
      // Functions are valid LionValues but not valid LionExpressions
      const env = { ...stdlib, fn: () => () => {} };
      expect(() => evaluate(env, ["eval", ["fn"]])).toThrow("Invalid expression");
    });
  });

  describe("function application", () => {
    it("should apply arithmetic functions", () => {
      expect(evaluate(stdlib, ["+", 1, 2])).toBe(3);
      expect(evaluate(stdlib, ["+", 1, 2, 3, 4])).toBe(10);
      expect(evaluate(stdlib, ["-", 10, 3])).toBe(7);
      expect(evaluate(stdlib, ["*", 3, 4])).toBe(12);
      expect(evaluate(stdlib, ["/", 10, 2])).toBe(5);
    });

    it("should apply comparison functions", () => {
      expect(evaluate(stdlib, ["=", 1, 1])).toBe(true);
      expect(evaluate(stdlib, ["=", 1, 2])).toBe(false);
      expect(evaluate(stdlib, ["<", 1, 2])).toBe(true);
      expect(evaluate(stdlib, [">", 1, 2])).toBe(false);
      expect(evaluate(stdlib, ["<=", 2, 2])).toBe(true);
      expect(evaluate(stdlib, [">=", 2, 2])).toBe(true);
    });

    it("should apply logical functions", () => {
      expect(evaluate(stdlib, ["not", true])).toBe(false);
      expect(evaluate(stdlib, ["not", false])).toBe(true);
      expect(evaluate(stdlib, ["and", true, true])).toBe(true);
      expect(evaluate(stdlib, ["and", true, false])).toBe(false);
      expect(evaluate(stdlib, ["or", false, true])).toBe(true);
      expect(evaluate(stdlib, ["or", false, false])).toBe(false);
    });

    it("should apply conditional function", () => {
      expect(evaluate(stdlib, ["if", true, 1, 2])).toBe(1);
      expect(evaluate(stdlib, ["if", false, 1, 2])).toBe(2);
    });

    it("should apply list functions", () => {
      expect(evaluate(stdlib, ["list", 1, 2, 3])).toEqual([1, 2, 3]);
      expect(evaluate(stdlib, ["first", ["list", 1, 2, 3]])).toBe(1);
      expect(evaluate(stdlib, ["rest", ["list", 1, 2, 3]])).toEqual([2, 3]);
      expect(evaluate(stdlib, ["length", ["list", 1, 2, 3]])).toBe(3);
      expect(evaluate(stdlib, ["concat", ["list", 1, 2], ["list", 3, 4]])).toEqual([1, 2, 3, 4]);
    });

    it("should evaluate arguments before applying function", () => {
      expect(evaluate(stdlib, ["+", ["+", 1, 2], ["+", 3, 4]])).toBe(10);
      expect(evaluate(stdlib, ["*", ["+", 1, 1], ["+", 2, 2]])).toBe(8);
    });

    it("should look up variables in arguments", () => {
      const env = { ...stdlib, x: 5, y: 3 };
      expect(evaluate(env, ["+", "x", "y"])).toBe(8);
      expect(evaluate(env, ["*", "x", ["+", "y", 1]])).toBe(20);
    });
  });

  describe("non-function lists", () => {
    it("should return list of evaluated values when first element is not a function", () => {
      expect(evaluate({}, [1, 2, 3])).toEqual([1, 2, 3]);
      expect(evaluate({}, ["a", "b", "c"])).toEqual(["a", "b", "c"]);
    });

    it("should evaluate nested expressions in non-function lists", () => {
      expect(evaluate(stdlib, [1, ["+", 1, 2], 3])).toEqual([1, 3, 3]);
    });

    it("should handle mixed types in lists", () => {
      expect(evaluate({}, [1, "hello", true, null])).toEqual([1, "hello", true, null]);
    });
  });

  describe("object evaluation", () => {
    it("should evaluate values in objects", () => {
      expect(evaluate({}, { a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    });

    it("should evaluate expressions in object values", () => {
      expect(evaluate(stdlib, { sum: ["+", 1, 2], product: ["*", 3, 4] })).toEqual({
        sum: 3,
        product: 12,
      });
    });

    it("should look up variables in object values", () => {
      const env = { ...stdlib, x: 10 };
      expect(evaluate(env, { value: "x", doubled: ["*", "x", 2] })).toEqual({
        value: 10,
        doubled: 20,
      });
    });

    it("should handle nested objects", () => {
      expect(
        evaluate(stdlib, {
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
      expect(evaluate(env, ["get", "obj", "name"])).toBe("Alice");
      expect(evaluate(env, ["keys", "obj"])).toEqual(["name", "age"]);
      expect(evaluate(env, ["values", "obj"])).toEqual(["Alice", 30]);
    });
  });

  describe("nested expressions", () => {
    it("should handle deeply nested arithmetic", () => {
      expect(evaluate(stdlib, ["+", ["+", ["+", 1, 2], 3], 4])).toBe(10);
    });

    it("should handle complex nested expressions", () => {
      const env = { ...stdlib, x: 2, y: 3 };
      expect(evaluate(env, ["if", ["<", "x", "y"], ["*", "x", "y"], ["+", "x", "y"]])).toBe(6);
    });

    it("should handle nested function results", () => {
      expect(evaluate(stdlib, ["first", ["rest", ["list", 1, 2, 3]]])).toBe(2);
    });

    it("should handle mixed nesting of arrays and objects", () => {
      const result = evaluate(stdlib, {
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
      expect(evaluate(stdlib, ["+", 0, 0])).toBe(0);
      expect(evaluate(stdlib, ["+", -1, -2])).toBe(-3);
      expect(evaluate(stdlib, ["*", -2, 3])).toBe(-6);
    });

    it("should handle empty list operations", () => {
      expect(evaluate(stdlib, ["list"])).toEqual([]);
      expect(evaluate(stdlib, ["length", ["list"]])).toBe(0);
    });

    it("should handle single element operations", () => {
      expect(evaluate(stdlib, ["+", 5])).toBe(5);
      expect(evaluate(stdlib, ["list", 42])).toEqual([42]);
    });

    it("should preserve null values", () => {
      const env = { ...stdlib, nullVal: null };
      expect(evaluate(env, "nullVal")).toBe(null);
      expect(evaluate(env, { value: null })).toEqual({ value: null });
    });

    it("should handle boolean expressions", () => {
      expect(evaluate(stdlib, ["and", [">", 5, 3], ["<", 2, 4]])).toBe(true);
      expect(evaluate(stdlib, ["or", ["<", 5, 3], [">", 2, 4]])).toBe(false);
    });
  });

  describe("error handling", () => {
    it("should throw when function returns invalid value", () => {
      const env = {
        badFn: () => undefined,
      };
      expect(() => evaluate(env, ["badFn"])).toThrow("Invalid value");
    });

    it("should throw when eval receives non-expression", () => {
      const env = {
        ...stdlib,
        getFn: () => () => {},
      };
      expect(() => evaluate(env, ["eval", ["getFn"]])).toThrow("Invalid expression");
    });
  });

  describe("higher-order functions", () => {
    it("should support functions that return functions", () => {
      const env = {
        ...stdlib,
        makeAdder: (n: unknown) => (x: unknown) => (n as number) + (x as number),
      };
      const add5 = evaluate(env, ["makeAdder", 5]) as Function;
      expect(add5(3)).toBe(8);
    });

    it("should support passing functions as arguments", () => {
      const env = {
        ...stdlib,
        apply: (fn: unknown, arg: unknown) => (fn as Function)(arg),
        double: (x: unknown) => (x as number) * 2,
      };
      expect(evaluate(env, ["apply", "double", 5])).toBe(10);
    });
  });
});
