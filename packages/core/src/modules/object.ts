import { Effect, flow, Record, Schema } from "effect";

class NotAnObjectError extends Schema.TaggedError<NotAnObjectError>(
  "NotAnObjectError"
)("NotAnObjectError", { actual: Schema.Unknown }) {}

class KeyNotFoundError extends Schema.TaggedError<KeyNotFoundError>(
  "KeyNotFoundError"
)("KeyNotFoundError", { key: Schema.String }) {}

class NotAFunctionError extends Schema.TaggedError<NotAFunctionError>(
  "NotAFunctionError"
)("NotAFunctionError", { key: Schema.String, actual: Schema.Unknown }) {}

class NotAConstructorError extends Schema.TaggedError<NotAConstructorError>(
  "NotAConstructorError"
)("NotAConstructorError", { actual: Schema.Unknown }) {}

class PathTraversalError extends Schema.TaggedError<PathTraversalError>(
  "PathTraversalError"
)("PathTraversalError", {
  path: Schema.String,
  key: Schema.String,
  current: Schema.Unknown,
}) {}

class EmptyPathError extends Schema.TaggedError<EmptyPathError>(
  "EmptyPathError"
)("EmptyPathError", { path: Schema.String }) {}

class MethodNotFoundError extends Schema.TaggedError<MethodNotFoundError>(
  "MethodNotFoundError"
)("MethodNotFoundError", {
  path: Schema.String,
  methodKey: Schema.String,
  actual: Schema.Unknown,
}) {}

class IndexOutOfBoundsError extends Schema.TaggedError<IndexOutOfBoundsError>(
  "IndexOutOfBoundsError"
)("IndexOutOfBoundsError", {
  index: Schema.Number,
  length: Schema.Number,
}) {}

class NotAnArrayError extends Schema.TaggedError<NotAnArrayError>(
  "NotAnArrayError"
)("NotAnArrayError", { actual: Schema.Unknown }) {}

class InvalidPathError extends Schema.TaggedError<InvalidPathError>(
  "InvalidPathError"
)("InvalidPathError", { path: Schema.Unknown }) {}

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

const traversePath = (
  obj: object,
  path: string,
  keys: string[]
): Effect.Effect<object, PathTraversalError> =>
  Effect.gen(function* () {
    let current: unknown = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (key === undefined) {
        return yield* new PathTraversalError({
          path,
          key: String(i),
          current,
        });
      }
      if (typeof current !== "object" || current === null) {
        return yield* new PathTraversalError({
          path,
          key: String(key),
          current,
        });
      }
      if (!(key in current)) {
        return yield* new PathTraversalError({
          path,
          key: String(key),
          current,
        });
      }
      current = getValueAtKey(current, key);
    }
    return current as object;
  });

const getMethodFromObject = (
  obj: object,
  methodKey: string,
  path: string
): Effect.Effect<
  (...args: unknown[]) => unknown,
  EmptyPathError | PathTraversalError | MethodNotFoundError
> =>
  Effect.gen(function* () {
    if (methodKey === undefined || methodKey === "") {
      return yield* new EmptyPathError({ path });
    }
    if (typeof obj !== "object" || obj === null) {
      return yield* new PathTraversalError({
        path,
        key: String(methodKey),
        current: obj,
      });
    }
    const method = (obj as Record<string, unknown>)[methodKey];
    if (typeof method !== "function") {
      return yield* new MethodNotFoundError({
        path,
        methodKey: String(methodKey),
        actual: method,
      });
    }
    return method as (...args: unknown[]) => unknown;
  });

export const module = {
  symbol: Symbol("object"),

  get: (obj: unknown, key: string) =>
    Effect.gen(function* () {
      if (typeof obj !== "object" || obj === null) {
        return yield* new NotAnObjectError({ actual: obj });
      }
      return (obj as Record<string, unknown>)[key];
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
    Schema.decodeUnknown(
      Schema.Record({ key: Schema.String, value: Schema.Unknown })
    ),
    Effect.map(Record.keys)
  ),

  values: flow(
    (obj: unknown) => obj,
    Schema.decodeUnknown(
      Schema.Record({ key: Schema.String, value: Schema.Unknown })
    ),
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

  "get-method": (obj: unknown, key: unknown) =>
    Effect.gen(function* () {
      if (typeof obj !== "object" || obj === null) {
        return yield* new NotAnObjectError({ actual: obj });
      }
      const method = (obj as Record<string, unknown>)[key as string];
      if (typeof method !== "function") {
        return yield* new NotAFunctionError({
          key: key as string,
          actual: method,
        });
      }
      return method.bind(obj);
    }),

  // FIXME: technically any value can have a method through its prototype chain
  "call-method": (obj: unknown, key: unknown, ...args: unknown[]) =>
    Effect.gen(function* () {
      const method = (obj as Record<string, unknown>)[key as string];
      if (typeof method !== "function") {
        return yield* new NotAFunctionError({
          key: key as string,
          actual: method,
        });
      }
      return method.apply(obj, args);
    }),

  "get-method-path": (obj: unknown, path: string) =>
    Effect.gen(function* () {
      if (typeof obj !== "object" || obj === null) {
        return yield* new NotAnObjectError({ actual: obj });
      }
      if (typeof path !== "string") {
        return yield* new InvalidPathError({ path });
      }
      const keys = path.split(".");
      const targetObj = yield* traversePath(obj, path, keys);
      const methodKey = keys.at(-1) ?? "";
      const method = yield* getMethodFromObject(targetObj, methodKey, path);
      return method.bind(targetObj);
    }),

  "call-method-path": (obj: unknown, path: string, ...args: unknown[]) =>
    Effect.gen(function* () {
      if (typeof obj !== "object" || obj === null) {
        return yield* new NotAnObjectError({ actual: obj });
      }
      if (typeof path !== "string") {
        return yield* new InvalidPathError({ path });
      }
      const keys = (path as string).split(".");
      const targetObj = yield* traversePath(obj, path as string, keys);
      const methodKey = keys.at(-1) ?? "";
      const method = yield* getMethodFromObject(
        targetObj,
        methodKey,
        path as string
      );
      return method.apply(targetObj, args);
    }),
};
