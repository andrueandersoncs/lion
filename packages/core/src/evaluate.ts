export type JsonPrimitive = string | number | boolean | null;

export type LionExpression = JsonPrimitive | LionExpression[] | { [key: string]: LionExpression };

export const isLionExpression = (expression: unknown): expression is LionExpression => {
  if (
    typeof expression === "string" ||
    typeof expression === "number" ||
    typeof expression === "boolean" ||
    expression === null
  ) {
    return true;
  }

  if (Array.isArray(expression)) {
    return expression.every(isLionExpression);
  }

  if (typeof expression === "object" && expression !== null) {
    return Object.values(expression).every(isLionExpression);
  }

  return false;
};

export type LionValue = JsonPrimitive | LionValue[] | { [key: string]: LionValue } | ((...args: unknown[]) => unknown);

export const isLionValue = (value: unknown): value is LionValue => {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isLionValue);
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value).every(isLionValue);
  }

  if (typeof value === "function") {
    return true;
  }

  return false;
};

export const evaluate = (environment: Record<string, LionValue>, expression: LionExpression): LionValue => {
  if (Array.isArray(expression)) {
    if (expression.length === 0) {
      return [];
    }

    const [name, ...args] = expression;

    switch (name) {
      case "quote": {
        const [arg] = args;

        if (arg === undefined) {
          return (...args: unknown[]) => args[0];
        }

        return arg;
      }
      case "eval": {
        const [arg] = args;

        // Automatic currying
        if (arg === undefined) {
          return (...args: unknown[]) => {
            const arg = args[0];
            if (!isLionExpression(arg)) throw new Error("Invalid expression");
            const value = evaluate(environment, arg);
            if (!isLionExpression(value)) throw new Error("Invalid expression");
            return evaluate(environment, value);
          };
        }

        if (!isLionExpression(arg)) throw new Error("Invalid expression");
        const value = evaluate(environment, arg);
        if (!isLionExpression(value)) throw new Error("Invalid expression");
        return evaluate(environment, value);
      }
      default: {
        // The default is applicative-order evaluation: evaluate all arguments first before calling the function
        const values = expression.map(evaluate.bind(undefined, environment));
        const [fn, ...args] = values;

        if (typeof fn === "function") {
          const result = fn(...args);
          if (!isLionValue(result)) throw new Error("Invalid value");
          return result;
        }

        // If execution reaches this point, the expression is just a regular list of values
        return values;
      }
    }
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
