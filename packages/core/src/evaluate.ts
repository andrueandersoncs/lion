export type JsonPrimitive = string | number | boolean | null;

export type LionExpression = JsonPrimitive | LionExpression[] | { [key: string]: LionExpression };

export type LionValue = JsonPrimitive | LionValue[] | { [key: string]: LionValue };

export const evaluate = (environment: Record<string, LionValue>, expression: LionExpression): LionValue => {
  // Array-based expressions are evaluated like function calls
  if (Array.isArray(expression)) {
    const [name, ...args] = expression;

    // Some expressions have "special forms" that need to be evaluated differently
    switch (name) {
      // Quote expressions do not evaluate their arguments
      case "quote": {
        return args[0];
      }
      default: {
      }
    }

    return expression.map((item) => evaluate(environment, item));
  }

  if (typeof expression === "object" && expression !== null) {
    return Object.fromEntries(Object.entries(expression).map(([key, value]) => [key, evaluate(environment, value)]));
  }

  if (typeof expression === "string") {
    const value = environment[expression];
    if (value !== undefined) {
      return value;
    }
  }

  return expression;
};
