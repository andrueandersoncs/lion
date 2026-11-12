import { Effect, flow, Record, Schema } from "effect";

const show = (value: unknown) => {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

// Each error describes itself, so a failure reads as more than its tag.

class NotAnObjectError extends Schema.TaggedError<NotAnObjectError>()(
  "NotAnObjectError",
  { actual: Schema.Unknown }
) {
  override get message() {
    return `Expected an object, but found ${show(this.actual)}.`;
  }
}

class KeyNotFoundError extends Schema.TaggedError<KeyNotFoundError>()(
  "KeyNotFoundError",
  { key: Schema.String }
) {
  override get message() {
    return `There is no key "${this.key}".`;
  }
}

class NotAFunctionError extends Schema.TaggedError<NotAFunctionError>()(
  "NotAFunctionError",
  { key: Schema.String, actual: Schema.Unknown }
) {
  override get message() {
    return `"${this.key}" is not a method; it is ${show(this.actual)}.`;
  }
}

class NotAConstructorError extends Schema.TaggedError<NotAConstructorError>()(
  "NotAConstructorError",
  { actual: Schema.Unknown }
) {
  override get message() {
    return `Expected a class to construct, but found ${show(this.actual)}.`;
  }
}

class PathTraversalError extends Schema.TaggedError<PathTraversalError>()(
  "PathTraversalError",
  {
    path: Schema.String,
    key: Schema.String,
    current: Schema.Unknown,
  }
) {
  override get message() {
    return `Cannot follow "${this.path}" at "${this.key}": ${show(this.current)} has no such key.`;
  }
}

class EmptyPathError extends Schema.TaggedError<EmptyPathError>()(
  "EmptyPathError",
  { path: Schema.String }
) {
  override get message() {
    return `The path "${this.path}" does not end in a method name.`;
  }
}

class MethodNotFoundError extends Schema.TaggedError<MethodNotFoundError>()(
  "MethodNotFoundError",
  {
    path: Schema.String,
    methodKey: Schema.String,
    actual: Schema.Unknown,
  }
) {
  override get message() {
    return `"${this.path}" does not end in a method: "${this.methodKey}" is ${show(this.actual)}.`;
  }
}

class IndexOutOfBoundsError extends Schema.TaggedError<IndexOutOfBoundsError>()(
  "IndexOutOfBoundsError",
  {
    index: Schema.Number,
    length: Schema.Number,
  }
) {
  override get message() {
    return `Index ${this.index} is past the end of a list of length ${this.length}.`;
  }
}

class NotAnArrayError extends Schema.TaggedError<NotAnArrayError>()(
  "NotAnArrayError",
  { actual: Schema.Unknown }
) {
  override get message() {
    return `A numeric path segment needs a list, but found ${show(this.actual)}.`;
  }
}

class InvalidPathError extends Schema.TaggedError<InvalidPathError>()(
  "InvalidPathError",
  { path: Schema.Unknown }
) {
  override get message() {
    return `A path must be a string such as "a.b.0", but found ${show(this.path)}.`;
  }
}

const NUMERIC_KEY_REGEX = /^\d+$/;

const isNumericKey = (key: string): boolean => NUMERIC_KEY_REGEX.test(key);

const getValueAtKey = (current: unknown, key: string): unknown => {
  if (Array.isArray(current) && isNumericKey(key)) {
    return current[Number.parseInt(key, 10)];
  }
  return (current as Record<string, unknown>)[key];
};

const validateKeyExists = (current: unknown, key: string) =>
  Effect.gen(function* () {
    if (!Array.isArray(current) && isNumericKey(key)) {
      return yield* new NotAnArrayError({ actual: current });
    }
    const index = isNumericKey(key) ? Number.parseInt(key, 10) : -1;
    if (Array.isArray(current) && index >= 0) {
      if (index >= current.length) {
        return yield* new IndexOutOfBoundsError({
          index,
          length: current.length,
        });
      }
    } else if (!(key in (current as object))) {
      return yield* new KeyNotFoundError({ key });
    }
  });

/**
 * Follows every key of a path but the last, through objects. The last key
 * names a method, which can belong to any value but null.
 */
const traversePath = (
  obj: unknown,
  path: string,
  keys: readonly string[]
): Effect.Effect<unknown, PathTraversalError> =>
  Effect.gen(function* () {
    let current: unknown = obj;
    for (const key of keys.slice(0, -1)) {
      if (
        typeof current !== "object" ||
        current === null ||
        !(key in current)
      ) {
        return yield* new PathTraversalError({ path, key, current });
      }
      current = getValueAtKey(current, key);
    }
    return current;
  });

/** Only null and undefined have no methods. */
const hasNoMethods = (value: unknown): value is null | undefined =>
  value === null || value === undefined;

type Method = (...args: unknown[]) => unknown;

/** The method under a key, with the value it belongs to. */
const methodOf = (obj: unknown, key: unknown) =>
  Effect.gen(function* () {
    if (hasNoMethods(obj)) {
      return yield* new NotAnObjectError({ actual: obj });
    }
    const method = (obj as Record<string, unknown>)[key as string];
    if (typeof method !== "function") {
      return yield* new NotAFunctionError({
        key: key as string,
        actual: method,
      });
    }
    return [method as Method, obj] as const;
  });

/** The method at the end of a dot path, with the value it belongs to. */
const methodAt = (obj: unknown, path: unknown) =>
  Effect.gen(function* () {
    if (hasNoMethods(obj)) {
      return yield* new NotAnObjectError({ actual: obj });
    }
    if (typeof path !== "string") {
      return yield* new InvalidPathError({ path });
    }
    const keys = path.split(".");
    const target = yield* traversePath(obj, path, keys);
    const methodKey = keys.at(-1) ?? "";
    if (methodKey === "") {
      return yield* new EmptyPathError({ path });
    }
    if (hasNoMethods(target)) {
      return yield* new NotAnObjectError({ actual: target });
    }
    const method = (target as Record<string, unknown>)[methodKey];
    if (typeof method !== "function") {
      return yield* new MethodNotFoundError({
        path,
        methodKey,
        actual: method,
      });
    }
    return [method as Method, target] as const;
  });

const bound = ([method, target]: readonly [Method, unknown]) =>
  method.bind(target);

const applied =
  (args: readonly unknown[]) =>
  ([method, target]: readonly [Method, unknown]) =>
    method.apply(target, args as unknown[]);

export const module = {
  symbol: Symbol("object"),

  /** The value under a key, or null when there is none. */
  get: (obj: unknown, key: string) =>
    Effect.gen(function* () {
      if (typeof obj !== "object" || obj === null) {
        return yield* new NotAnObjectError({ actual: obj });
      }
      return (obj as Record<string, unknown>)[key] ?? null;
    }),

  "get-path": (obj: unknown, path: string) =>
    Effect.gen(function* () {
      if (typeof obj !== "object" || obj === null) {
        return yield* new NotAnObjectError({ actual: obj });
      }
      if (typeof path !== "string") {
        return yield* new InvalidPathError({ path });
      }
      const keys = path.split(".");
      let current: unknown = obj;
      for (const key of keys) {
        if (typeof current !== "object" || current === null) {
          return yield* new PathTraversalError({
            path,
            key: String(key),
            current,
          });
        }
        yield* validateKeyExists(current, key);
        current = getValueAtKey(current, key);
      }
      return current;
    }),

  "json-stringify": (
    obj: unknown,
    replacer: Parameters<typeof JSON.stringify>[1],
    space: number
  ) =>
    Effect.gen(function* () {
      if (typeof obj !== "object" || obj === null) {
        return yield* new NotAnObjectError({ actual: obj });
      }
      return JSON.stringify(obj, replacer, space);
    }),

  keys: flow(
    (obj: unknown) => obj,
    Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Unknown)),
    Effect.map(Record.keys)
  ),

  values: flow(
    (obj: unknown) => obj,
    Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Unknown)),
    Effect.map(Record.values)
  ),

  "new": (classRef: unknown, ...args: unknown[]) =>
    Effect.gen(function* () {
      if (typeof classRef !== "function") {
        return yield* new NotAConstructorError({ actual: classRef });
      }
      return new (classRef as new (...args: unknown[]) => unknown)(
        ...(args as unknown[])
      );
    }),

  // The method functions work on any value but null, such as a string.
  "get-method": flow(methodOf, Effect.map(bound)),

  "call-method": (obj: unknown, key: unknown, ...args: unknown[]) =>
    Effect.map(methodOf(obj, key), applied(args)),

  "get-method-path": flow(methodAt, Effect.map(bound)),

  "call-method-path": (obj: unknown, path: unknown, ...args: unknown[]) =>
    Effect.map(methodAt(obj, path), applied(args)),
};
