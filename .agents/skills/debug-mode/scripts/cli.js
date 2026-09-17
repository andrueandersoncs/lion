// @bun
// node_modules/effect/dist/Pipeable.js
var pipeArguments = (self, args) => {
  switch (args.length) {
    case 0:
      return self;
    case 1:
      return args[0](self);
    case 2:
      return args[1](args[0](self));
    case 3:
      return args[2](args[1](args[0](self)));
    case 4:
      return args[3](args[2](args[1](args[0](self))));
    case 5:
      return args[4](args[3](args[2](args[1](args[0](self)))));
    case 6:
      return args[5](args[4](args[3](args[2](args[1](args[0](self))))));
    case 7:
      return args[6](args[5](args[4](args[3](args[2](args[1](args[0](self)))))));
    case 8:
      return args[7](args[6](args[5](args[4](args[3](args[2](args[1](args[0](self))))))));
    case 9:
      return args[8](args[7](args[6](args[5](args[4](args[3](args[2](args[1](args[0](self)))))))));
    default: {
      let ret = self;
      for (let i = 0, len = args.length;i < len; i++) {
        ret = args[i](ret);
      }
      return ret;
    }
  }
};
var Prototype = {
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var Class = /* @__PURE__ */ function() {
  function PipeableBase() {}
  PipeableBase.prototype = Prototype;
  return PipeableBase;
}();

// node_modules/effect/dist/Function.js
var dual = function(arity, body) {
  if (typeof arity === "function") {
    return function() {
      return arity(arguments) ? body.apply(this, arguments) : (self) => body(self, ...arguments);
    };
  }
  switch (arity) {
    case 0:
    case 1:
      throw new RangeError(`Invalid arity ${arity}`);
    case 2:
      return function(a, b) {
        if (arguments.length >= 2) {
          return body(a, b);
        }
        return function(self) {
          return body(self, a);
        };
      };
    case 3:
      return function(a, b, c) {
        if (arguments.length >= 3) {
          return body(a, b, c);
        }
        return function(self) {
          return body(self, a, b);
        };
      };
    default:
      return function() {
        if (arguments.length >= arity) {
          return body.apply(this, arguments);
        }
        const args = arguments;
        return function(self) {
          return body(self, ...args);
        };
      };
  }
};
var identity = (a) => a;
var constant = (value) => () => value;
var constTrue = /* @__PURE__ */ constant(true);
var constFalse = /* @__PURE__ */ constant(false);
var constUndefined = /* @__PURE__ */ constant(undefined);
var constVoid = constUndefined;
var compose = /* @__PURE__ */ dual(2, (ab, bc) => (a) => bc(ab(a)));
function pipe(a, ...args) {
  return pipeArguments(a, args);
}
function flow(ab, bc, cd, de, ef, fg, gh, hi, ij) {
  switch (arguments.length) {
    case 1:
      return ab;
    case 2:
      return function() {
        return bc(ab.apply(this, arguments));
      };
    case 3:
      return function() {
        return cd(bc(ab.apply(this, arguments)));
      };
    case 4:
      return function() {
        return de(cd(bc(ab.apply(this, arguments))));
      };
    case 5:
      return function() {
        return ef(de(cd(bc(ab.apply(this, arguments)))));
      };
    case 6:
      return function() {
        return fg(ef(de(cd(bc(ab.apply(this, arguments))))));
      };
    case 7:
      return function() {
        return gh(fg(ef(de(cd(bc(ab.apply(this, arguments)))))));
      };
    case 8:
      return function() {
        return hi(gh(fg(ef(de(cd(bc(ab.apply(this, arguments))))))));
      };
    case 9:
      return function() {
        return ij(hi(gh(fg(ef(de(cd(bc(ab.apply(this, arguments)))))))));
      };
  }
  return;
}
function memoize(f) {
  const cache = new WeakMap;
  return (a) => {
    const cached = cache.get(a);
    if (cached !== undefined)
      return cached;
    const result = f(a);
    cache.set(a, result);
    return result;
  };
}
function memoizeIdempotent(f) {
  const cache = new WeakMap;
  return (a) => {
    const cached = cache.get(a);
    if (cached !== undefined)
      return cached;
    const result = f(a);
    cache.set(a, result);
    cache.set(result, result);
    return result;
  };
}

// node_modules/effect/dist/internal/equal.js
var getAllObjectKeys = (obj) => {
  const keys = new Set(Reflect.ownKeys(obj));
  if (obj.constructor === Object)
    return keys;
  if (obj instanceof Error) {
    keys.delete("stack");
  }
  const proto = Object.getPrototypeOf(obj);
  let current = proto;
  while (current !== null && current !== Object.prototype) {
    const ownKeys = Reflect.ownKeys(current);
    for (let i = 0;i < ownKeys.length; i++) {
      keys.add(ownKeys[i]);
    }
    current = Object.getPrototypeOf(current);
  }
  if (keys.has("constructor") && typeof obj.constructor === "function" && proto === obj.constructor.prototype) {
    keys.delete("constructor");
  }
  return keys;
};
var byReferenceInstances = /* @__PURE__ */ new WeakSet;

// node_modules/effect/dist/Predicate.js
function isString(input) {
  return typeof input === "string";
}
function isNumber(input) {
  return typeof input === "number";
}
function isBoolean(input) {
  return typeof input === "boolean";
}
function isSymbol(input) {
  return typeof input === "symbol";
}
function isPropertyKey(u) {
  return isString(u) || isNumber(u) || isSymbol(u);
}
function isFunction(input) {
  return typeof input === "function";
}
function isUndefined(input) {
  return input === undefined;
}
function isNotUndefined(input) {
  return input !== undefined;
}
function isNotNull(input) {
  return input !== null;
}
function isNullish(input) {
  return input === null || input === undefined;
}
function isNotNullish(input) {
  return input != null;
}
function isUnknown(_) {
  return true;
}
function isObject(input) {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
function isObjectKeyword(input) {
  return typeof input === "object" && input !== null || isFunction(input);
}
var hasProperty = /* @__PURE__ */ dual(2, (self, property) => isObjectKeyword(self) && (property in self));
var isTagged = /* @__PURE__ */ dual(2, (self, tag) => hasProperty(self, "_tag") && self["_tag"] === tag);
function isError(input) {
  return input instanceof Error;
}

// node_modules/effect/dist/Hash.js
var symbol = "~effect/Hash";
var hash = (self) => {
  switch (typeof self) {
    case "number":
      return number(self);
    case "bigint":
      return string(self.toString(10));
    case "string":
      return string(self);
    case "undefined":
      return string("undefined");
    case "function":
    case "object": {
      if (self === null) {
        return string("null");
      } else if (self instanceof Date) {
        if (Number.isNaN(self.getTime())) {
          return string("Invalid Date");
        }
        return string(self.toISOString());
      } else if (self instanceof RegExp) {
        return string(self.toString());
      } else {
        if (byReferenceInstances.has(self)) {
          return random(self);
        }
        if (hashCache.has(self)) {
          return hashCache.get(self);
        }
        const h = withVisitedTracking(self, () => {
          if (isHash(self)) {
            return self[symbol]();
          } else if (typeof self === "function") {
            return random(self);
          } else if (self instanceof DataView) {
            return array(new Uint8Array(self.buffer, self.byteOffset, self.byteLength));
          } else if (Array.isArray(self) || ArrayBuffer.isView(self)) {
            return array(self);
          } else if (self instanceof Map) {
            return hashMap(self);
          } else if (self instanceof Set) {
            return hashSet(self);
          }
          return structure(self);
        });
        hashCache.set(self, h);
        return h;
      }
    }
    default:
      return string(String(self));
  }
};
var random = (self) => {
  if (!randomHashCache.has(self)) {
    randomHashCache.set(self, number(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)));
  }
  return randomHashCache.get(self);
};
var combine = /* @__PURE__ */ dual(2, (self, b) => self * 53 ^ b);
var optimize = (n) => n & 3221225471 | n >>> 1 & 1073741824;
var isHash = (u) => hasProperty(u, symbol);
var number = (n) => {
  if (n !== n || n === Infinity || n === -Infinity) {
    return string(String(n));
  }
  let h = n | 0;
  if (h !== n) {
    h ^= n * 4294967295;
  }
  while (n > 4294967295) {
    h ^= n /= 4294967295;
  }
  return optimize(h);
};
var string = (str) => {
  let h = 5381, i = str.length;
  while (i) {
    h = h * 33 ^ str.charCodeAt(--i);
  }
  return optimize(h);
};
var structureKeys = (o, keys) => {
  let h = 12289;
  for (const key of keys) {
    h ^= combine(hash(key), hash(o[key]));
  }
  return optimize(h);
};
var structure = (o) => structureKeys(o, getAllObjectKeys(o));
var iterableWith = (seed, f) => (iter) => {
  let h = seed;
  for (const element of iter) {
    h ^= f(element);
  }
  return optimize(h);
};
var array = /* @__PURE__ */ iterableWith(6151, hash);
var hashMap = /* @__PURE__ */ iterableWith(/* @__PURE__ */ string("Map"), ([k, v]) => combine(hash(k), hash(v)));
var hashSet = /* @__PURE__ */ iterableWith(/* @__PURE__ */ string("Set"), hash);
var randomHashCache = /* @__PURE__ */ new WeakMap;
var hashCache = /* @__PURE__ */ new WeakMap;
var visitedObjects = /* @__PURE__ */ new WeakSet;
function withVisitedTracking(obj, fn) {
  if (visitedObjects.has(obj)) {
    return string("[Circular]");
  }
  visitedObjects.add(obj);
  const result = fn();
  visitedObjects.delete(obj);
  return result;
}

// node_modules/effect/dist/Equal.js
var symbol2 = "~effect/Equal";
function equals() {
  if (arguments.length === 1) {
    return (self) => compareBoth(self, arguments[0]);
  }
  return compareBoth(arguments[0], arguments[1]);
}
function compareBoth(self, that) {
  if (self === that)
    return true;
  if (self == null || that == null)
    return false;
  const selfType = typeof self;
  if (selfType !== typeof that) {
    return false;
  }
  if (selfType === "number" && self !== self && that !== that) {
    return true;
  }
  if (selfType !== "object" && selfType !== "function") {
    return false;
  }
  if (byReferenceInstances.has(self) || byReferenceInstances.has(that)) {
    return false;
  }
  return withCache(self, that, compareObjects);
}
function withVisitedTracking2(self, that, fn) {
  const hasLeft = visitedLeft.has(self);
  const hasRight = visitedRight.has(that);
  if (hasLeft && hasRight) {
    return true;
  }
  if (hasLeft || hasRight) {
    return false;
  }
  visitedLeft.add(self);
  visitedRight.add(that);
  const result = fn();
  visitedLeft.delete(self);
  visitedRight.delete(that);
  return result;
}
var visitedLeft = /* @__PURE__ */ new WeakSet;
var visitedRight = /* @__PURE__ */ new WeakSet;
function compareObjects(self, that) {
  if (hash(self) !== hash(that)) {
    return false;
  } else if (self instanceof Date) {
    if (!(that instanceof Date))
      return false;
    const selfTime = self.getTime();
    const thatTime = that.getTime();
    return selfTime === thatTime || Number.isNaN(selfTime) && Number.isNaN(thatTime);
  } else if (self instanceof RegExp) {
    if (!(that instanceof RegExp))
      return false;
    return self.toString() === that.toString();
  }
  const selfIsEqual = isEqual(self);
  const thatIsEqual = isEqual(that);
  if (selfIsEqual !== thatIsEqual)
    return false;
  const bothEquals = selfIsEqual && thatIsEqual;
  if (typeof self === "function" && !bothEquals) {
    return false;
  }
  return withVisitedTracking2(self, that, () => {
    if (bothEquals) {
      return self[symbol2](that);
    } else if (Array.isArray(self)) {
      if (!Array.isArray(that) || self.length !== that.length) {
        return false;
      }
      return compareArrays(self, that);
    } else if (ArrayBuffer.isView(self)) {
      const selfIsDataView = self instanceof DataView;
      if (!ArrayBuffer.isView(that) || self.byteLength !== that.byteLength || selfIsDataView !== that instanceof DataView) {
        return false;
      }
      if (selfIsDataView) {
        const thatDataView = that;
        return compareTypedArrays(new Uint8Array(self.buffer, self.byteOffset, self.byteLength), new Uint8Array(thatDataView.buffer, thatDataView.byteOffset, thatDataView.byteLength));
      }
      return compareTypedArrays(self, that);
    } else if (self instanceof Map) {
      if (!(that instanceof Map) || self.size !== that.size) {
        return false;
      }
      return compareMaps(self, that);
    } else if (self instanceof Set) {
      if (!(that instanceof Set) || self.size !== that.size) {
        return false;
      }
      return compareSets(self, that);
    }
    return compareRecords(self, that);
  });
}
function withCache(self, that, f) {
  let selfMap = equalityCache.get(self);
  if (!selfMap) {
    selfMap = new WeakMap;
    equalityCache.set(self, selfMap);
  } else if (selfMap.has(that)) {
    return selfMap.get(that);
  }
  const result = f(self, that);
  selfMap.set(that, result);
  let thatMap = equalityCache.get(that);
  if (!thatMap) {
    thatMap = new WeakMap;
    equalityCache.set(that, thatMap);
  }
  thatMap.set(self, result);
  return result;
}
var equalityCache = /* @__PURE__ */ new WeakMap;
function compareArrays(self, that) {
  for (let i = 0;i < self.length; i++) {
    if (!compareBoth(self[i], that[i])) {
      return false;
    }
  }
  return true;
}
function compareTypedArrays(self, that) {
  if (self.length !== that.length) {
    return false;
  }
  for (let i = 0;i < self.length; i++) {
    if (self[i] !== that[i]) {
      return false;
    }
  }
  return true;
}
function compareRecords(self, that) {
  const selfKeys = getAllObjectKeys(self);
  const thatKeys = getAllObjectKeys(that);
  if (selfKeys.size !== thatKeys.size) {
    return false;
  }
  for (const key of selfKeys) {
    if (!thatKeys.has(key) || !compareBoth(self[key], that[key])) {
      return false;
    }
  }
  return true;
}
function makeCompareMap(keyEquivalence, valueEquivalence) {
  return function compareMaps(self, that) {
    const thatEntries = Array.from(that);
    for (const [selfKey, selfValue] of self) {
      let found = false;
      for (let i = 0;i < thatEntries.length; i++) {
        const [thatKey, thatValue] = thatEntries[i];
        if (keyEquivalence(selfKey, thatKey) && valueEquivalence(selfValue, thatValue)) {
          thatEntries[i] = thatEntries[thatEntries.length - 1];
          thatEntries.pop();
          found = true;
          break;
        }
      }
      if (!found) {
        return false;
      }
    }
    return true;
  };
}
var compareMaps = /* @__PURE__ */ makeCompareMap(compareBoth, compareBoth);
function makeCompareSet(equivalence) {
  return function compareSets(self, that) {
    const thatValues = Array.from(that);
    for (const selfValue of self) {
      let found = false;
      for (let i = 0;i < thatValues.length; i++) {
        const thatValue = thatValues[i];
        if (equivalence(selfValue, thatValue)) {
          thatValues[i] = thatValues[thatValues.length - 1];
          thatValues.pop();
          found = true;
          break;
        }
      }
      if (!found) {
        return false;
      }
    }
    return true;
  };
}
var compareSets = /* @__PURE__ */ makeCompareSet(compareBoth);
var isEqual = (u) => hasProperty(u, symbol2);

// node_modules/effect/dist/Equivalence.js
var make = (isEquivalent) => (self, that) => self === that || isEquivalent(self, that);
var isStrictEquivalent = (x, y) => x === y;
var strictEqual = () => isStrictEquivalent;
function Tuple(elements) {
  return make((self, that) => {
    if (self.length !== that.length) {
      return false;
    }
    for (let i = 0;i < self.length; i++) {
      if (!elements[i](self[i], that[i])) {
        return false;
      }
    }
    return true;
  });
}
function Array_(item) {
  return make((self, that) => {
    if (self.length !== that.length)
      return false;
    for (let i = 0;i < self.length; i++) {
      if (!item(self[i], that[i]))
        return false;
    }
    return true;
  });
}

// node_modules/effect/dist/internal/array.js
var isArrayNonEmpty = (self) => self.length > 0;

// node_modules/effect/dist/internal/count.js
var normalize = (n) => n > 0 ? Math.floor(n) : 0;

// node_modules/effect/dist/internal/record.js
function assignProperty(self, key, value) {
  if (key === "__proto__") {
    Object.defineProperty(self, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true
    });
  } else {
    self[key] = value;
  }
}
function assignProperties(self, source) {
  for (const key of Reflect.ownKeys(source)) {
    if (Object.prototype.propertyIsEnumerable.call(source, key)) {
      assignProperty(self, key, source[key]);
    }
  }
}

// node_modules/effect/dist/Redactable.js
var symbolRedactable = /* @__PURE__ */ Symbol.for("~effect/Redactable");
var isRedactable = (u) => hasProperty(u, symbolRedactable);
function redact(u) {
  if (isRedactable(u))
    return getRedacted(u);
  return u;
}
function getRedacted(redactable) {
  return redactable[symbolRedactable](globalThis[currentFiberTypeId]?.context ?? emptyContext);
}
var currentFiberTypeId = "~effect/Fiber/currentFiber";
var emptyMap = /* @__PURE__ */ new Map;
var emptyContext = {
  "~effect/Context": {},
  base: emptyMap,
  depth: 0,
  mapUnsafe: emptyMap,
  pipe() {
    return pipeArguments(this, arguments);
  }
};

// node_modules/effect/dist/Formatter.js
function format(input, options) {
  const space = options?.space ?? 0;
  const ancestors = new WeakSet;
  const gap = !space ? "" : typeof space === "number" ? " ".repeat(space) : space;
  const ind = (d) => gap.repeat(d);
  const wrap = (v, body) => {
    const ctor = v?.constructor;
    return ctor && ctor !== Object.prototype.constructor && ctor.name ? `${ctor.name}(${body})` : body;
  };
  const ownKeys = (o) => {
    try {
      return Reflect.ownKeys(o);
    } catch {
      return ["[ownKeys threw]"];
    }
  };
  function recur(v, d = 0) {
    try {
      return recurUnsafe(v, d);
    } catch {
      if (typeof v === "object" && v !== null || typeof v === "function")
        ancestors.delete(v);
      return "[inspection threw]";
    }
  }
  function recurUnsafe(v, d = 0) {
    if (typeof v === "string")
      return JSON.stringify(v);
    if (typeof v === "number" || v == null || typeof v === "boolean" || typeof v === "symbol")
      return String(v);
    if (typeof v === "bigint")
      return String(v) + "n";
    if (typeof v === "object" || typeof v === "function") {
      if (ancestors.has(v))
        return CIRCULAR;
      ancestors.add(v);
      let output;
      if (symbolRedactable in v) {
        output = recur(getRedacted(v), d);
      } else if (Array.isArray(v)) {
        output = !gap || v.length <= 1 ? `[${v.map((x) => recur(x, d)).join(",")}]` : `[
${ind(d + 1)}${v.map((x) => recur(x, d + 1)).join(`,
` + ind(d + 1))}
${ind(d)}]`;
      } else if (v instanceof Date) {
        output = formatDate(v);
      } else if (!options?.ignoreToString && hasProperty(v, "toString") && typeof v["toString"] === "function" && v["toString"] !== Object.prototype.toString && v["toString"] !== Array.prototype.toString) {
        const s = safeToString(v);
        output = v instanceof Error && v.cause !== undefined ? `${s} (cause: ${recur(v.cause, d)})` : s;
      } else if (Symbol.iterator in v) {
        output = `${v.constructor.name}(${recur(Array.from(v), d)})`;
      } else {
        const keys = ownKeys(v);
        if (!gap || keys.length <= 1) {
          const body = `{${keys.map((k) => `${formatPropertyKey(k)}:${recur(safeGet(v, k), d)}`).join(",")}}`;
          output = wrap(v, body);
        } else {
          const body = `{
${keys.map((k) => `${ind(d + 1)}${formatPropertyKey(k)}: ${recur(safeGet(v, k), d + 1)}`).join(`,
`)}
${ind(d)}}`;
          output = wrap(v, body);
        }
      }
      ancestors.delete(v);
      return output;
    }
    return String(v);
  }
  return recur(input, 0);
}
var CIRCULAR = "[Circular]";
function formatPropertyKey(name) {
  return typeof name === "string" ? JSON.stringify(name) : String(name);
}
function formatPath(path) {
  return path.map((key) => `[${formatPropertyKey(key)}]`).join("");
}
function formatDate(date) {
  try {
    return date.toISOString();
  } catch {
    return "Invalid Date";
  }
}
function safeToString(input) {
  try {
    const s = input.toString();
    return typeof s === "string" ? s : String(s);
  } catch {
    return "[toString threw]";
  }
}
function safeGet(input, key) {
  try {
    return input[key];
  } catch {
    return "[property access threw]";
  }
}
function formatJson(input, options) {
  const ancestors = [];
  return JSON.stringify(input, function(key, value) {
    const original = Object.getOwnPropertyDescriptor(this, key)?.value;
    const redacted = hasProperty(original, symbolRedactable) ? redact(original) : redact(value);
    if (typeof redacted === "bigint") {
      return format(redacted);
    }
    if (typeof redacted !== "object" || redacted === null) {
      return redacted;
    }
    while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
      ancestors.pop();
    }
    if (ancestors.includes(redacted)) {
      return;
    }
    ancestors.push(redacted);
    return redacted;
  }, options?.space) ?? "null";
}

// node_modules/effect/dist/Inspectable.js
var NodeInspectSymbol = /* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom");
var toJson = (input) => {
  try {
    input = redact(input);
    if (hasProperty(input, "toJSON") && isFunction(input["toJSON"]) && input["toJSON"].length === 0) {
      return input.toJSON();
    } else if (Array.isArray(input)) {
      return input.map(toJson);
    }
    return input;
  } catch {
    return "[toJSON threw]";
  }
};
var toStringUnknown = (u, whitespace = 2) => {
  if (typeof u === "string") {
    return u;
  }
  try {
    return typeof u === "object" ? formatJson(u, {
      space: whitespace
    }) : format(u, {
      space: whitespace
    });
  } catch {
    return String(u);
  }
};
var BaseProto = {
  toJSON() {
    return toJson(this);
  },
  [NodeInspectSymbol]() {
    return this.toJSON();
  },
  toString() {
    return format(this.toJSON());
  }
};

class Class2 {
  [NodeInspectSymbol]() {
    return this.toJSON();
  }
  toString() {
    return format(this.toJSON());
  }
}

// node_modules/effect/dist/internal/stackTraceLimit.js
var isStackTraceLimitWritable = () => {
  const desc = Object.getOwnPropertyDescriptor(Error, "stackTraceLimit");
  if (desc === undefined) {
    return Object.isExtensible(Error);
  }
  return Object.hasOwn(desc, "writable") ? desc.writable === true : desc.set !== undefined;
};
var canWriteStackTraceLimit = /* @__PURE__ */ isStackTraceLimitWritable();
var getStackTraceLimit = () => Error.stackTraceLimit;
var setStackTraceLimit = (value) => {
  if (canWriteStackTraceLimit) {
    Error.stackTraceLimit = value;
  }
};

// node_modules/effect/dist/Utils.js
class SingleShotGen {
  called = false;
  self;
  constructor(self) {
    this.self = self;
  }
  next(a) {
    return this.called ? {
      value: a,
      done: true
    } : (this.called = true, {
      value: this.self,
      done: false
    });
  }
  [Symbol.iterator]() {
    return new SingleShotGen(this.self);
  }
}
var pickInternalCall = () => {
  const InternalTypeId = "~effect/Utils/internal";
  const standard = {
    [InternalTypeId]: (body) => {
      return body();
    }
  };
  const forced = {
    [InternalTypeId]: (body) => {
      try {
        return body();
      } finally {}
    }
  };
  const isNotOptimizedAway = getStackTraceLimit() !== 0 && standard[InternalTypeId](() => new Error().stack)?.includes(InternalTypeId) === true;
  return isNotOptimizedAway ? standard[InternalTypeId] : forced[InternalTypeId];
};
var internalCall = /* @__PURE__ */ pickInternalCall();

// node_modules/effect/dist/internal/core.js
var EffectTypeId = `~effect/Effect`;
var ExitTypeId = `~effect/Exit`;
var effectVariance = {
  _A: identity,
  _E: identity,
  _R: identity
};
var identifier = `${EffectTypeId}/identifier`;
var args = `${EffectTypeId}/args`;
var evaluate = `${EffectTypeId}/evaluate`;
var contA = `${EffectTypeId}/successCont`;
var contE = `${EffectTypeId}/failureCont`;
var contAll = `${EffectTypeId}/ensureCont`;
var Yield = /* @__PURE__ */ Symbol.for("effect/Effect/Yield");
var PipeInspectableProto = {
  pipe() {
    return pipeArguments(this, arguments);
  },
  toJSON() {
    return {
      ...this
    };
  },
  toString() {
    return format(this.toJSON(), {
      ignoreToString: true,
      space: 2
    });
  },
  [NodeInspectSymbol]() {
    return this.toJSON();
  }
};
var StructuralProto = {
  [symbol]() {
    return structureKeys(this, Object.keys(this));
  },
  [symbol2](that) {
    const selfKeys = Object.keys(this);
    const thatKeys = Object.keys(that);
    if (selfKeys.length !== thatKeys.length)
      return false;
    for (let i = 0;i < selfKeys.length; i++) {
      if (selfKeys[i] !== thatKeys[i] || !equals(this[selfKeys[i]], that[selfKeys[i]])) {
        return false;
      }
    }
    return true;
  }
};
var EffectProto = {
  [EffectTypeId]: effectVariance,
  ...PipeInspectableProto,
  [Symbol.iterator]() {
    return new SingleShotGen(this);
  },
  toJSON() {
    return {
      _id: "Effect",
      op: this[identifier],
      ...args in this ? {
        args: this[args]
      } : undefined
    };
  }
};
var isEffect = (u) => hasProperty(u, EffectTypeId);
var isExit = (u) => hasProperty(u, ExitTypeId);
var CauseTypeId = "~effect/Cause";
var CauseReasonTypeId = "~effect/Cause/Reason";
var isCause = (self) => hasProperty(self, CauseTypeId);
class CauseImpl {
  constructor(failures) {
    this[CauseTypeId] = CauseTypeId;
    this.reasons = failures;
  }
  pipe() {
    return pipeArguments(this, arguments);
  }
  toJSON() {
    return {
      _id: "Cause",
      failures: this.reasons.map((f) => f.toJSON())
    };
  }
  toString() {
    return `Cause(${format(this.reasons)})`;
  }
  [NodeInspectSymbol]() {
    return this.toJSON();
  }
  [symbol2](that) {
    return isCause(that) && this.reasons.length === that.reasons.length && this.reasons.every((e, i) => equals(e, that.reasons[i]));
  }
  [symbol]() {
    return array(this.reasons);
  }
}
var annotationsMap = /* @__PURE__ */ new WeakMap;

class ReasonBase {
  [CauseReasonTypeId];
  annotations;
  _tag;
  constructor(_tag, annotations, originalError) {
    this[CauseReasonTypeId] = CauseReasonTypeId;
    this._tag = _tag;
    if (annotations !== constEmptyAnnotations && typeof originalError === "object" && originalError !== null && annotations.size > 0) {
      const prevAnnotations = annotationsMap.get(originalError);
      if (prevAnnotations) {
        annotations = new Map([...prevAnnotations, ...annotations]);
      }
      annotationsMap.set(originalError, annotations);
    }
    this.annotations = annotations;
  }
  annotate(annotations, options) {
    if (annotations.mapUnsafe.size === 0)
      return this;
    const newAnnotations = new Map(this.annotations);
    annotations.mapUnsafe.forEach((value, key) => {
      if (options?.overwrite !== true && newAnnotations.has(key))
        return;
      newAnnotations.set(key, value);
    });
    const self = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    self.annotations = newAnnotations;
    return self;
  }
  pipe() {
    return pipeArguments(this, arguments);
  }
  toString() {
    return format(this);
  }
  [NodeInspectSymbol]() {
    return this.toString();
  }
}
var constEmptyAnnotations = /* @__PURE__ */ new Map;

class Fail extends ReasonBase {
  constructor(error, annotations = constEmptyAnnotations) {
    super("Fail", annotations, error);
    this.error = error;
  }
  toString() {
    return `Fail(${format(this.error)})`;
  }
  toJSON() {
    return {
      _tag: "Fail",
      error: this.error
    };
  }
  [symbol2](that) {
    return isFailReason(that) && equals(this.error, that.error) && equals(this.annotations, that.annotations);
  }
  [symbol]() {
    return combine(string(this._tag))(combine(hash(this.error))(hash(this.annotations)));
  }
}
var causeFromReasons = (reasons) => new CauseImpl(reasons);
var causeEmpty = /* @__PURE__ */ new CauseImpl([]);
var causeFail = (error) => new CauseImpl([new Fail(error)]);

class Die extends ReasonBase {
  constructor(defect, annotations = constEmptyAnnotations) {
    super("Die", annotations, defect);
    this.defect = defect;
  }
  toString() {
    return `Die(${format(this.defect)})`;
  }
  toJSON() {
    return {
      _tag: "Die",
      defect: this.defect
    };
  }
  [symbol2](that) {
    return isDieReason(that) && equals(this.defect, that.defect) && equals(this.annotations, that.annotations);
  }
  [symbol]() {
    return combine(string(this._tag))(combine(hash(this.defect))(hash(this.annotations)));
  }
}
var causeDie = (defect) => new CauseImpl([new Die(defect)]);
var causeAnnotate = /* @__PURE__ */ dual((args) => isCause(args[0]), (self, annotations, options) => {
  if (annotations.mapUnsafe.size === 0)
    return self;
  return new CauseImpl(self.reasons.map((f) => f.annotate(annotations, options)));
});
var isFailReason = (self) => self._tag === "Fail";
var isDieReason = (self) => self._tag === "Die";
var isInterruptReason = (self) => self._tag === "Interrupt";
function defaultEvaluate(_fiber) {
  return exitDie(`Effect.evaluate: Not implemented`);
}
var makePrimitiveProto = (options) => ({
  ...EffectProto,
  [identifier]: options.op,
  [evaluate]: options[evaluate] ?? defaultEvaluate,
  [contA]: options[contA],
  [contE]: options[contE],
  [contAll]: options[contAll]
});
var makePrimitive = (options) => {
  const Proto = makePrimitiveProto(options);
  const PrimitiveImpl = function(value) {
    this[args] = value;
  };
  PrimitiveImpl.prototype = Proto;
  return function(value) {
    return new PrimitiveImpl(value);
  };
};
var makeExit = (options) => {
  const Proto = {
    [ExitTypeId]: ExitTypeId,
    _tag: options.op,
    get [options.prop]() {
      return this[args];
    },
    ...makePrimitiveProto(options),
    toString() {
      return `${options.op}(${format(this[args])})`;
    },
    toJSON() {
      return {
        _id: "Exit",
        _tag: options.op,
        [options.prop]: this[args]
      };
    },
    [symbol2](that) {
      return isExit(that) && that._tag === this._tag && equals(this[args], that[args]);
    },
    [symbol]() {
      return combine(string(options.op), hash(this[args]));
    }
  };
  const ExitPrimitive = function(value) {
    this[args] = value;
  };
  ExitPrimitive.prototype = Proto;
  return function(value) {
    return new ExitPrimitive(value);
  };
};
var exitSucceed = /* @__PURE__ */ makeExit({
  op: "Success",
  prop: "value",
  [evaluate](fiber) {
    const cont = fiber.getCont(contA);
    return cont ? cont[contA](this[args], fiber, this) : fiber.yieldWith(this);
  }
});
var StackTraceKey = {
  key: "effect/Cause/StackTrace"
};
var InterruptorStackTrace = {
  key: "effect/Cause/InterruptorStackTrace"
};
var exitFailCause = /* @__PURE__ */ makeExit({
  op: "Failure",
  prop: "cause",
  [evaluate](fiber) {
    let cause = this[args];
    let annotated = false;
    if (fiber.cache.stackFrame) {
      cause = causeAnnotate(cause, {
        mapUnsafe: new Map([[StackTraceKey.key, fiber.cache.stackFrame]])
      });
      annotated = true;
    }
    let cont = fiber.getCont(contE);
    while (fiber.interruptible && fiber._interruptedCause && cont) {
      cont = fiber.getCont(contE);
    }
    return cont ? cont[contE](cause, fiber, annotated ? undefined : this) : fiber.yieldWith(annotated ? exitFailCause(cause) : this);
  }
});
var exitFail = (e) => exitFailCause(causeFail(e));
var exitDie = (defect) => exitFailCause(causeDie(defect));
var withFiber = /* @__PURE__ */ makePrimitive({
  op: "WithFiber",
  [evaluate](fiber) {
    return this[args](fiber);
  }
});
var withFiberSucceed = /* @__PURE__ */ makePrimitive({
  op: "WithFiberSucceed",
  [evaluate](fiber) {
    const value = this[args](fiber);
    const cont = fiber.getCont(contA);
    return cont ? cont[contA](value, fiber) : fiber.yieldWith(exitSucceed(value));
  }
});
var YieldableError = /* @__PURE__ */ function() {

  class YieldableError extends globalThis.Error {
  }
  const proto = /* @__PURE__ */ makePrimitiveProto({
    op: "YieldableError",
    [evaluate]() {
      return exitFail(this);
    }
  });
  delete proto.toString;
  Object.assign(YieldableError.prototype, proto);
  return YieldableError;
}();
var Error2 = /* @__PURE__ */ function() {
  const plainArgsSymbol = /* @__PURE__ */ Symbol.for("effect/Data/Error/plainArgs");
  return class Base extends YieldableError {
    constructor(args) {
      super(args?.message, args?.cause ? {
        cause: args.cause
      } : undefined);
      if (args) {
        assignProperties(this, args);
        Object.defineProperty(this, plainArgsSymbol, {
          value: args,
          enumerable: false
        });
      }
    }
    toJSON() {
      return {
        ...this[plainArgsSymbol],
        ...this
      };
    }
  };
}();
var TaggedError = (tag) => {

  class Base extends Error2 {
    _tag = tag;
  }
  Base.prototype.name = tag;
  return Base;
};
var NoSuchElementErrorTypeId = "~effect/Cause/NoSuchElementError";
var isNoSuchElementError = (u) => hasProperty(u, NoSuchElementErrorTypeId);
var DoneTypeId = "~effect/Cause/Done";
var isDone = (u) => hasProperty(u, DoneTypeId);
var DoneVoid = {
  [DoneTypeId]: DoneTypeId,
  _tag: "Done",
  value: undefined
};
var Done = (value) => {
  if (value === undefined)
    return DoneVoid;
  return {
    [DoneTypeId]: DoneTypeId,
    _tag: "Done",
    value
  };
};
var doneVoid = /* @__PURE__ */ exitFail(DoneVoid);
var done = (value) => {
  if (value === undefined)
    return doneVoid;
  return exitFail(Done(value));
};

// node_modules/effect/dist/internal/option.js
var TypeId = "~effect/Option";
var CommonProto = {
  [TypeId]: {
    _A: (_) => _
  },
  ...PipeInspectableProto,
  [Symbol.iterator]() {
    return new SingleShotGen(this);
  }
};
var SomeProto = /* @__PURE__ */ Object.defineProperty(/* @__PURE__ */ Object.assign(/* @__PURE__ */ Object.create(CommonProto), {
  _tag: "Some",
  _op: "Some",
  [symbol2](that) {
    return isOption(that) && isSome(that) && equals(this.value, that.value);
  },
  [symbol]() {
    return combine(hash(this._tag))(hash(this.value));
  },
  toString() {
    return `some(${format(this.value)})`;
  },
  toJSON() {
    return {
      _id: "Option",
      _tag: this._tag,
      value: toJson(this.value)
    };
  }
}), "valueOrUndefined", {
  get() {
    return this.value;
  }
});
var NoneHash = /* @__PURE__ */ hash("None");
var NoneProto = /* @__PURE__ */ Object.assign(/* @__PURE__ */ Object.create(CommonProto), {
  _tag: "None",
  _op: "None",
  valueOrUndefined: undefined,
  [symbol2](that) {
    return isOption(that) && isNone(that);
  },
  [symbol]() {
    return NoneHash;
  },
  toString() {
    return `none()`;
  },
  toJSON() {
    return {
      _id: "Option",
      _tag: this._tag
    };
  }
});
var isOption = (input) => hasProperty(input, TypeId);
var isNone = (fa) => fa._tag === "None";
var isSome = (fa) => fa._tag === "Some";
var none = /* @__PURE__ */ Object.create(NoneProto);
var SomeImpl = function(value) {
  this.value = value;
};
SomeImpl.prototype = SomeProto;
var some = (value) => new SomeImpl(value);

// node_modules/effect/dist/internal/result.js
var TypeId2 = "~effect/Result";
var CommonProto2 = {
  [TypeId2]: {
    _A: (_) => _,
    _E: (_) => _
  },
  ...PipeInspectableProto,
  [Symbol.iterator]() {
    return new SingleShotGen(this);
  }
};
var SuccessProto = /* @__PURE__ */ Object.assign(/* @__PURE__ */ Object.create(CommonProto2), {
  _tag: "Success",
  _op: "Success",
  [symbol2](that) {
    return isResult(that) && isSuccess(that) && equals(this.success, that.success);
  },
  [symbol]() {
    return combine(hash(this._tag))(hash(this.success));
  },
  toString() {
    return `success(${format(this.success)})`;
  },
  toJSON() {
    return {
      _id: "Result",
      _tag: this._tag,
      value: toJson(this.success)
    };
  }
});
var FailureProto = /* @__PURE__ */ Object.assign(/* @__PURE__ */ Object.create(CommonProto2), {
  _tag: "Failure",
  _op: "Failure",
  [symbol2](that) {
    return isResult(that) && isFailure(that) && equals(this.failure, that.failure);
  },
  [symbol]() {
    return combine(hash(this._tag))(hash(this.failure));
  },
  toString() {
    return `failure(${format(this.failure)})`;
  },
  toJSON() {
    return {
      _id: "Result",
      _tag: this._tag,
      failure: toJson(this.failure)
    };
  }
});
var isResult = (input) => hasProperty(input, TypeId2);
var isFailure = (result) => result._tag === "Failure";
var isSuccess = (result) => result._tag === "Success";
var FailureImpl = function(failure) {
  this.failure = failure;
};
FailureImpl.prototype = FailureProto;
var fail = (failure) => new FailureImpl(failure);
var SuccessImpl = function(success) {
  this.success = success;
};
SuccessImpl.prototype = SuccessProto;
var succeed = (success) => new SuccessImpl(success);

// node_modules/effect/dist/Order.js
function make2(compare) {
  return (self, that) => self === that ? 0 : compare(self, that);
}
var Number2 = /* @__PURE__ */ make2((self, that) => {
  if (globalThis.Number.isNaN(self) && globalThis.Number.isNaN(that))
    return 0;
  if (globalThis.Number.isNaN(self))
    return -1;
  if (globalThis.Number.isNaN(that))
    return 1;
  return self < that ? -1 : 1;
});
var mapInput = /* @__PURE__ */ dual(2, (self, f) => make2((b1, b2) => self(f(b1), f(b2))));
var isGreaterThan = (O) => dual(2, (self, that) => O(self, that) === 1);

// node_modules/effect/dist/Option.js
var none2 = () => none;
var some2 = some;
var isNone2 = isNone;
var isSome2 = isSome;
var match = /* @__PURE__ */ dual(2, (self, {
  onNone,
  onSome
}) => isNone2(self) ? onNone() : onSome(self.value));
var getOrElse = /* @__PURE__ */ dual(2, (self, onNone) => isNone2(self) ? onNone() : self.value);
var fromNullishOr = (a) => a == null ? none2() : some2(a);
var fromUndefinedOr = (a) => a === undefined ? none2() : some2(a);
var getOrUndefined = /* @__PURE__ */ getOrElse(constUndefined);
var liftThrowable = (f) => (...a) => {
  try {
    return some2(f(...a));
  } catch {
    return none2();
  }
};
var map = /* @__PURE__ */ dual(2, (self, f) => isNone2(self) ? none2() : some2(f(self.value)));
var flatMap = /* @__PURE__ */ dual(2, (self, f) => isNone2(self) ? none2() : f(self.value));
var filter = /* @__PURE__ */ dual(2, (self, predicate) => isNone2(self) ? none2() : predicate(self.value) ? some2(self.value) : none2());
var exists = /* @__PURE__ */ dual(2, (self, refinement) => isNone2(self) ? false : refinement(self.value));

// node_modules/effect/dist/Result.js
var succeed2 = succeed;
var fail2 = fail;
var try_ = (evaluate) => {
  if (isFunction(evaluate)) {
    try {
      return succeed2(evaluate());
    } catch (e) {
      return fail2(e);
    }
  } else {
    try {
      return succeed2(evaluate.try());
    } catch (e) {
      return fail2(evaluate.catch(e));
    }
  }
};
var isFailure2 = isFailure;
var isSuccess2 = isSuccess;
var map2 = /* @__PURE__ */ dual(2, (self, f) => isSuccess2(self) ? succeed2(f(self.success)) : self);
var match2 = /* @__PURE__ */ dual(2, (self, {
  onFailure,
  onSuccess
}) => isFailure2(self) ? onFailure(self.failure) : onSuccess(self.success));
var getOrThrowWith = /* @__PURE__ */ dual(2, (self, onFailure) => {
  if (isSuccess2(self)) {
    return self.success;
  }
  throw onFailure(self.failure);
});
var getOrThrow = /* @__PURE__ */ getOrThrowWith(identity);
var flatMap2 = /* @__PURE__ */ dual(2, (self, f) => isFailure2(self) ? fail2(self.failure) : f(self.success));

// node_modules/effect/dist/Tuple.js
var makeEquivalence = Tuple;

// node_modules/effect/dist/Iterable.js
var findFirst = /* @__PURE__ */ dual(2, (self, f) => {
  let i = 0;
  for (const a of self) {
    const o = f(a, i);
    if (isBoolean(o)) {
      if (o) {
        return some2(a);
      }
    } else {
      if (isSome2(o)) {
        return o;
      }
    }
    i++;
  }
  return none2();
});
var constEmpty = {
  [Symbol.iterator]() {
    return constEmptyIterator;
  }
};
var constEmptyIterator = {
  next() {
    return {
      done: true,
      value: undefined
    };
  }
};

// node_modules/effect/dist/Record.js
var isEmptyRecord = (self) => Object.keys(self).length === 0;
var has = /* @__PURE__ */ dual(2, (self, key) => Object.hasOwn(self, key));
var map3 = /* @__PURE__ */ dual(2, (self, f) => {
  const out = {
    ...self
  };
  for (const key of keys(self)) {
    assignProperty(out, key, f(self[key], key));
  }
  return out;
});
var keys = (self) => Object.keys(self);
var isSubrecordBy = (equivalence) => dual(2, (self, that) => {
  for (const key of keys(self)) {
    if (!has(that, key) || !equivalence(self[key], that[key])) {
      return false;
    }
  }
  return true;
});
var makeEquivalence2 = (equivalence) => {
  const is = isSubrecordBy(equivalence);
  return (self, that) => is(self, that) && is(that, self);
};

// node_modules/effect/dist/Array.js
var Array2 = globalThis.Array;
var fromIterable = (collection) => Array2.isArray(collection) ? collection : Array2.from(collection);
var match3 = /* @__PURE__ */ dual(2, (self, {
  onEmpty,
  onNonEmpty
}) => isReadonlyArrayNonEmpty(self) ? onNonEmpty(self) : onEmpty());
var append = /* @__PURE__ */ dual(2, (self, last) => [...self, last]);
var isArray = Array2.isArray;
var isArrayNonEmpty2 = isArrayNonEmpty;
var isReadonlyArrayNonEmpty = isArrayNonEmpty;
function isCanonicalArrayIndex(key) {
  const index = Number(key);
  return String(index) === key && Number.isInteger(index) && index >= 0 && index < 2 ** 32 - 1;
}
var findFirstIndex = /* @__PURE__ */ dual(2, (self, predicate) => {
  let i = 0;
  for (const a of self) {
    if (predicate(a, i)) {
      return some2(i);
    }
    i++;
  }
  return none2();
});
var findFirst2 = findFirst;
var findLast = /* @__PURE__ */ dual(2, (self, f) => {
  const input = fromIterable(self);
  for (let i = input.length - 1;i >= 0; i--) {
    const a = input[i];
    const o = f(a, i);
    if (typeof o === "boolean") {
      if (o) {
        return some2(a);
      }
    } else {
      if (isSome2(o)) {
        return o;
      }
    }
  }
  return none2();
});
var reverse = (self) => Array2.from(self).reverse();
var empty = () => [];
var of = (a) => [a];
var map4 = /* @__PURE__ */ dual(2, (self, f) => self.map(f));
var reduce = /* @__PURE__ */ dual(3, (self, b, f) => fromIterable(self).reduce((b, a, i) => f(b, a, i), b));
var makeEquivalence3 = Array_;

// node_modules/effect/dist/Effectable.js
var Prototype2 = (options) => makePrimitiveProto({
  op: options.label,
  [evaluate]: options.evaluate
});

// node_modules/effect/dist/Context.js
var ServiceTypeId = "~effect/Context/Service";
var Service = function() {
  function KeyClass() {}
  const self = KeyClass;
  Object.setPrototypeOf(self, ServiceProto);
  const init = (key, options) => {
    self.key = key;
    if (options?.defaultValue) {
      self[ReferenceTypeId] = ReferenceTypeId;
      self.defaultValue = options.defaultValue;
    }
    if (options?.make) {
      self.make = options.make;
    }
    if (options?.fiberCached) {
      cacheKeys.add(key);
    }
    return self;
  };
  return arguments.length > 0 ? init(arguments[0], arguments[1]) : init;
};
var ServiceProto = {
  [ServiceTypeId]: ServiceTypeId,
  .../* @__PURE__ */ Prototype2({
    label: "Service",
    evaluate(fiber) {
      return exitSucceed(get(fiber.context, this));
    }
  }),
  toJSON() {
    return {
      _id: "Service",
      key: this.key
    };
  },
  of(self) {
    return self;
  },
  context(self) {
    return make3(this, self);
  },
  use(f) {
    return withFiber((fiber) => f(get(fiber.context, this)));
  },
  useSync(f) {
    return withFiber((fiber) => exitSucceed(f(get(fiber.context, this))));
  }
};
var cacheKeys = /* @__PURE__ */ new Set;
var ReferenceTypeId = "~effect/Context/Reference";
var TypeId3 = "~effect/Context";
var MaxDepth = 8;
var FlattenAfterBaseHits = 8;
var makeImpl = (cacheRoot, base, overlay, depth) => {
  const self = Object.create(Proto);
  self.cacheRoot = cacheRoot ?? self;
  self.base = base;
  self.overlay = overlay;
  self.depth = depth;
  self._flat = undefined;
  self.baseHits = 0;
  return self;
};
var applyOverlays = (map, overlay) => {
  if (!overlay)
    return;
  applyOverlays(map, overlay.parent);
  map.set(overlay.key, overlay.value);
};
var flatten = (self) => {
  if (self._flat)
    return self._flat;
  if (!self.overlay)
    return self._flat = self.base;
  const map = new Map(self.base);
  applyOverlays(map, self.overlay);
  return self._flat = map;
};
var withFlat = (self, f) => {
  const map = new Map(self.mapUnsafe);
  f(map);
  return makeUnsafe(map);
};
var notFound = /* @__PURE__ */ Symbol();
var lookup = (self, key) => {
  const impl = self;
  for (let overlay = impl.overlay;overlay; overlay = overlay.parent) {
    if (overlay.key === key)
      return overlay.value;
  }
  const value = impl.base.get(key);
  if (value === undefined && !impl.base.has(key))
    return notFound;
  if (impl.overlay && ++impl.baseHits >= FlattenAfterBaseHits) {
    impl.base = flatten(impl);
    impl.overlay = undefined;
    impl.depth = 0;
  }
  return value;
};
var makeUnsafe = (mapUnsafe) => makeImpl(undefined, mapUnsafe, undefined, 0);
var Proto = {
  get mapUnsafe() {
    return flatten(this);
  },
  ...PipeInspectableProto,
  [TypeId3]: {
    _Services: (_) => _
  },
  toJSON() {
    return {
      _id: "Context",
      services: Array.from(this.mapUnsafe).map(([key, value]) => ({
        key,
        value
      }))
    };
  },
  [symbol2](that) {
    if (!isContext(that))
      return false;
    const self = this.mapUnsafe;
    const other = that.mapUnsafe;
    if (self.size !== other.size)
      return false;
    for (const [key, value] of self) {
      if (!other.has(key) || !equals(value, other.get(key)))
        return false;
    }
    return true;
  },
  [symbol]() {
    return number(this.mapUnsafe.size);
  }
};
var hasSameCache = (self, that) => self.cacheRoot === that.cacheRoot;
var isContext = (u) => hasProperty(u, TypeId3);
var isReference = (u) => !!u[ReferenceTypeId];
var empty2 = () => emptyContext2;
var emptyContext2 = /* @__PURE__ */ makeUnsafe(/* @__PURE__ */ new Map);
var make3 = (key, service) => makeUnsafe(new Map([[key.key, service]]));
var add = /* @__PURE__ */ dual(3, (self, key, service) => addUnsafe(self, key.key, service));
var addUnsafe = (self, key, service) => {
  const impl = self;
  const cacheRoot = cacheKeys.has(key) ? undefined : impl.cacheRoot;
  if (impl.depth >= MaxDepth) {
    const map = new Map(impl.mapUnsafe);
    map.set(key, service);
    return makeImpl(cacheRoot, map, undefined, 0);
  }
  return makeImpl(cacheRoot, impl.base, {
    key,
    value: service,
    parent: impl.overlay
  }, impl.depth + 1);
};
var getOrUndefined2 = /* @__PURE__ */ dual(2, (self, key) => getOrUndefinedUnsafe(self, key.key));
var getOrUndefinedUnsafe = (self, key) => {
  const value = lookup(self, key);
  return value === notFound ? undefined : value;
};
var getUnsafe = /* @__PURE__ */ dual(2, (self, service) => {
  const value = lookup(self, service.key);
  if (value === notFound) {
    if (isReference(service))
      return getDefaultValue(service);
    throw serviceNotFoundError(service);
  }
  return value;
});
var get = getUnsafe;
var defaultValueCacheKey = "~effect/Context/defaultValue";
var getDefaultValue = (ref) => {
  if (defaultValueCacheKey in ref) {
    return ref[defaultValueCacheKey];
  }
  return ref[defaultValueCacheKey] = ref.defaultValue();
};
var serviceNotFoundError = (service) => {
  const error = new Error(`Service not found${service.key ? `: ${String(service.key)}` : ""}`);
  if (error.stack) {
    const lines = error.stack.split(`
`);
    lines.splice(1, 3);
    error.stack = lines.join(`
`);
  }
  return error;
};
var getOption = /* @__PURE__ */ dual(2, (self, service) => {
  const value = lookup(self, service.key);
  if (value !== notFound)
    return some2(value);
  return isReference(service) ? some2(getDefaultValue(service)) : none2();
});
var merge = /* @__PURE__ */ dual(2, (self, that) => {
  if (self.mapUnsafe.size === 0)
    return that;
  if (that.mapUnsafe.size === 0)
    return self;
  return withFlat(self, (map) => that.mapUnsafe.forEach((value, key) => map.set(key, value)));
});
var mergeAll = (...ctxs) => {
  const map = new Map;
  for (let i = 0;i < ctxs.length; i++) {
    ctxs[i].mapUnsafe.forEach((value, key) => {
      map.set(key, value);
    });
  }
  return makeUnsafe(map);
};
var Reference = Service;

// node_modules/effect/dist/Data.js
var taggedEnum = () => new Proxy({}, {
  get(_target, tag, _receiver) {
    if (tag === "$is") {
      return isTagged;
    } else if (tag === "$match") {
      return taggedMatch;
    }
    return (props) => ({
      ...props,
      _tag: tag
    });
  }
});
function taggedMatch() {
  if (arguments.length === 1) {
    const cases = arguments[0];
    return function(value) {
      return cases[value._tag](value);
    };
  }
  const value = arguments[0];
  const cases = arguments[1];
  return cases[value._tag](value);
}
var Error3 = Error2;
var TaggedError2 = TaggedError;

// node_modules/effect/dist/Duration.js
var TypeId4 = "~effect/Duration";
var bigint0 = /* @__PURE__ */ BigInt(0);
var bigint1 = /* @__PURE__ */ BigInt(1);
var bigint2 = /* @__PURE__ */ BigInt(2);
var bigint10 = /* @__PURE__ */ BigInt(10);
var bigint24 = /* @__PURE__ */ BigInt(24);
var bigint60 = /* @__PURE__ */ BigInt(60);
var bigint1e3 = /* @__PURE__ */ BigInt(1000);
var bigint1e6 = /* @__PURE__ */ BigInt(1e6);
var roundTiesAwayFromZero = (input) => BigInt(input < 0 ? Math.ceil(input - 0.5) : Math.floor(input + 0.5));
var roundMillisToNanos = (millis) => roundTiesAwayFromZero(millis * 1e6);
var parseNanos = (input, scale) => {
  const decimalIndex = input.indexOf(".");
  if (decimalIndex === -1)
    return BigInt(input) * scale;
  const isNegative = input[0] === "-";
  const fractional = input.slice(decimalIndex + 1);
  const fractionalScale = bigint10 ** BigInt(fractional.length);
  const scaled = (BigInt(input.slice(isNegative ? 1 : 0, decimalIndex)) * fractionalScale + BigInt(fractional)) * scale;
  const rounded = scaled / fractionalScale + (scaled % fractionalScale * bigint2 >= fractionalScale ? bigint1 : bigint0);
  return isNegative ? -rounded : rounded;
};
var DURATION_REGEXP = /^(-?\d+(?:\.\d+)?)\s+(nanos?|micros?|millis?|seconds?|minutes?|hours?|days?|weeks?)$/;
var fromInputUnsafe = (input) => {
  switch (typeof input) {
    case "number":
      return millis(input);
    case "bigint":
      return nanos(input);
    case "string": {
      if (input === "Infinity") {
        return infinity;
      }
      if (input === "-Infinity") {
        return negativeInfinity;
      }
      const match = DURATION_REGEXP.exec(input);
      if (!match)
        break;
      const [_, valueStr, unit] = match;
      if (unit === "nano" || unit === "nanos") {
        return nanos(parseNanos(valueStr, bigint1));
      }
      if (unit === "micro" || unit === "micros") {
        return nanos(parseNanos(valueStr, bigint1e3));
      }
      const value = Number(valueStr);
      switch (unit) {
        case "milli":
        case "millis":
          return millis(value);
        case "second":
        case "seconds":
          return seconds(value);
        case "minute":
        case "minutes":
          return minutes(value);
        case "hour":
        case "hours":
          return hours(value);
        case "day":
        case "days":
          return days(value);
        case "week":
        case "weeks":
          return weeks(value);
      }
      break;
    }
    case "object": {
      if (input === null)
        break;
      if (TypeId4 in input)
        return input;
      if (Array.isArray(input)) {
        if (input.length !== 2 || !input.every(isNumber)) {
          return invalid(input);
        }
        if (Number.isNaN(input[0]) || Number.isNaN(input[1])) {
          return zero;
        }
        if (input[0] === -Infinity || input[1] === -Infinity) {
          return negativeInfinity;
        }
        if (input[0] === Infinity || input[1] === Infinity) {
          return infinity;
        }
        return make4(roundTiesAwayFromZero(input[0] * 1e9 + input[1]));
      }
      const obj = input;
      let millis = 0;
      if (obj.weeks)
        millis += obj.weeks * 604800000;
      if (obj.days)
        millis += obj.days * 86400000;
      if (obj.hours)
        millis += obj.hours * 3600000;
      if (obj.minutes)
        millis += obj.minutes * 60000;
      if (obj.seconds)
        millis += obj.seconds * 1000;
      if (obj.milliseconds)
        millis += obj.milliseconds;
      if (!obj.microseconds && !obj.nanoseconds)
        return make4(millis);
      return make4(roundTiesAwayFromZero(millis * 1e6 + (obj.microseconds ?? 0) * 1000 + (obj.nanoseconds ?? 0)));
    }
  }
  return invalid(input);
};
var invalid = (input) => {
  throw new Error(`Invalid Input: ${input}`);
};
var zeroDurationValue = {
  _tag: "Millis",
  millis: 0
};
var infinityDurationValue = {
  _tag: "Infinity"
};
var negativeInfinityDurationValue = {
  _tag: "NegativeInfinity"
};
var DurationProto = {
  [TypeId4]: TypeId4,
  [symbol]() {
    switch (this.value._tag) {
      case "Millis": {
        const nanos = this.value.millis * 1e6;
        return Number.isFinite(nanos) ? hash(roundTiesAwayFromZero(nanos)) : number(this.value.millis);
      }
      case "Nanos":
        return hash(this.value.nanos);
      default:
        return structure(this.value);
    }
  },
  [symbol2](that) {
    return isDuration(that) && equals2(this, that);
  },
  toString() {
    switch (this.value._tag) {
      case "Infinity":
        return "Infinity";
      case "NegativeInfinity":
        return "-Infinity";
      case "Nanos":
        return `${this.value.nanos} nanos`;
      case "Millis":
        return `${this.value.millis} millis`;
    }
  },
  toJSON() {
    switch (this.value._tag) {
      case "Millis":
        return {
          _id: "Duration",
          _tag: "Millis",
          millis: this.value.millis
        };
      case "Nanos":
        return {
          _id: "Duration",
          _tag: "Nanos",
          nanos: String(this.value.nanos)
        };
      case "Infinity":
        return {
          _id: "Duration",
          _tag: "Infinity"
        };
      case "NegativeInfinity":
        return {
          _id: "Duration",
          _tag: "NegativeInfinity"
        };
    }
  },
  [NodeInspectSymbol]() {
    return this.toJSON();
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var make4 = (input) => {
  const duration = Object.create(DurationProto);
  if (typeof input === "number") {
    if (isNaN(input) || input === 0 || Object.is(input, -0)) {
      duration.value = zeroDurationValue;
    } else if (!Number.isFinite(input)) {
      duration.value = input > 0 ? infinityDurationValue : negativeInfinityDurationValue;
    } else if (!Number.isInteger(input)) {
      duration.value = {
        _tag: "Nanos",
        nanos: roundMillisToNanos(input)
      };
    } else {
      duration.value = {
        _tag: "Millis",
        millis: input
      };
    }
  } else if (input === bigint0) {
    duration.value = zeroDurationValue;
  } else {
    duration.value = {
      _tag: "Nanos",
      nanos: input
    };
  }
  return duration;
};
var isDuration = (u) => hasProperty(u, TypeId4);
var isFinite = (self) => self.value._tag !== "Infinity" && self.value._tag !== "NegativeInfinity";
var isZero = (self) => {
  switch (self.value._tag) {
    case "Millis":
      return self.value.millis === 0;
    case "Nanos":
      return self.value.nanos === bigint0;
    case "Infinity":
    case "NegativeInfinity":
      return false;
  }
};
var isNegative = (self) => {
  switch (self.value._tag) {
    case "Millis":
      return self.value.millis < 0;
    case "Nanos":
      return self.value.nanos < bigint0;
    case "NegativeInfinity":
      return true;
    case "Infinity":
      return false;
  }
};
var abs = (self) => {
  switch (self.value._tag) {
    case "Infinity":
    case "NegativeInfinity":
      return infinity;
    case "Millis":
      return self.value.millis < 0 ? make4(-self.value.millis) : self;
    case "Nanos":
      return self.value.nanos < bigint0 ? make4(-self.value.nanos) : self;
  }
};
var zero = /* @__PURE__ */ make4(0);
var infinity = /* @__PURE__ */ make4(Infinity);
var negativeInfinity = /* @__PURE__ */ make4(-Infinity);
var nanos = (nanos) => make4(nanos);
var millis = (millis) => make4(millis);
var seconds = (seconds) => make4(seconds * 1000);
var minutes = (minutes) => make4(minutes * 60000);
var hours = (hours) => make4(hours * 3600000);
var days = (days) => make4(days * 86400000);
var weeks = (weeks) => make4(weeks * 604800000);
var toMillis = (self) => match4(fromInputUnsafe(self), {
  onMillis: identity,
  onNanos: (nanos) => Number(nanos) / 1e6,
  onInfinity: () => Infinity,
  onNegativeInfinity: () => -Infinity
});
var toSeconds = (self) => match4(fromInputUnsafe(self), {
  onMillis: (millis) => millis / 1000,
  onNanos: (nanos) => Number(nanos) / 1e9,
  onInfinity: () => Infinity,
  onNegativeInfinity: () => -Infinity
});
var toNanosUnsafe = (input) => {
  const self = fromInputUnsafe(input);
  switch (self.value._tag) {
    case "Infinity":
    case "NegativeInfinity":
      throw new Error("Cannot convert infinite duration to nanos");
    case "Nanos":
      return self.value.nanos;
    case "Millis":
      return roundMillisToNanos(self.value.millis);
  }
};
var match4 = /* @__PURE__ */ dual(2, (self, options) => {
  switch (self.value._tag) {
    case "Millis":
      return options.onMillis(self.value.millis);
    case "Nanos":
      return options.onNanos(self.value.nanos);
    case "Infinity":
      return options.onInfinity();
    case "NegativeInfinity":
      return (options.onNegativeInfinity ?? options.onInfinity)();
  }
});
var matchPair = /* @__PURE__ */ dual(3, (self, that, options) => {
  if (self.value._tag === "Infinity" || self.value._tag === "NegativeInfinity" || that.value._tag === "Infinity" || that.value._tag === "NegativeInfinity")
    return options.onInfinity(self, that);
  if (self.value._tag === "Millis") {
    return that.value._tag === "Millis" ? options.onMillis(self.value.millis, that.value.millis) : options.onNanos(toNanosUnsafe(self), that.value.nanos);
  } else {
    return options.onNanos(self.value.nanos, toNanosUnsafe(that));
  }
});
var Equivalence = (self, that) => matchPair(self, that, {
  onMillis: (self, that) => self === that,
  onNanos: (self, that) => self === that,
  onInfinity: (self, that) => self.value._tag === that.value._tag
});
var equals2 = /* @__PURE__ */ dual(2, (self, that) => Equivalence(self, that));
var parts = (self) => {
  if (self.value._tag === "Infinity") {
    return {
      days: Infinity,
      hours: Infinity,
      minutes: Infinity,
      seconds: Infinity,
      millis: Infinity,
      nanos: Infinity
    };
  }
  if (self.value._tag === "NegativeInfinity") {
    return {
      days: -Infinity,
      hours: -Infinity,
      minutes: -Infinity,
      seconds: -Infinity,
      millis: -Infinity,
      nanos: -Infinity
    };
  }
  const n = toNanosUnsafe(self);
  const neg = n < bigint0;
  const a = neg ? -n : n;
  const ms = a / bigint1e6;
  const sec = ms / bigint1e3;
  const min = sec / bigint60;
  const hr = min / bigint60;
  const d = hr / bigint24;
  const sign = neg ? -1 : 1;
  return {
    days: sign * Number(d),
    hours: sign * Number(hr % bigint24),
    minutes: sign * Number(min % bigint60),
    seconds: sign * Number(sec % bigint60),
    millis: sign * Number(ms % bigint1e3),
    nanos: sign * Number(a % bigint1e6)
  };
};
var format2 = (self) => {
  if (self.value._tag === "Infinity") {
    return "Infinity";
  }
  if (self.value._tag === "NegativeInfinity") {
    return "-Infinity";
  }
  if (isZero(self)) {
    return "0";
  }
  if (isNegative(self)) {
    return "-" + format2(abs(self));
  }
  const fragments = parts(self);
  const pieces = [];
  if (fragments.days !== 0) {
    pieces.push(`${fragments.days}d`);
  }
  if (fragments.hours !== 0) {
    pieces.push(`${fragments.hours}h`);
  }
  if (fragments.minutes !== 0) {
    pieces.push(`${fragments.minutes}m`);
  }
  if (fragments.seconds !== 0) {
    pieces.push(`${fragments.seconds}s`);
  }
  if (fragments.millis !== 0) {
    pieces.push(`${fragments.millis}ms`);
  }
  if (fragments.nanos !== 0) {
    pieces.push(`${fragments.nanos}ns`);
  }
  return pieces.join(" ");
};

// node_modules/effect/dist/Scheduler.js
var Scheduler = /* @__PURE__ */ Reference("effect/Scheduler", {
  fiberCached: true,
  defaultValue: () => new MixedScheduler
});
var setMicrotask = (f) => {
  let cancelled = false;
  Promise.resolve().then(() => {
    if (!cancelled)
      f();
  });
  return () => {
    cancelled = true;
  };
};
var setTimer = "setImmediate" in globalThis ? (f) => {
  const timer = globalThis.setImmediate(f);
  return () => globalThis.clearImmediate(timer);
} : (f) => {
  const timer = setTimeout(f, 0);
  return () => clearTimeout(timer);
};
var setImmediate = (f) => {
  try {
    return setTimer(f);
  } catch {
    return setMicrotask(f);
  }
};

class PriorityBuckets {
  buckets = [];
  scheduleTask(task, priority) {
    const buckets = this.buckets;
    const len = buckets.length;
    let bucket;
    let index = 0;
    for (;index < len; index++) {
      if (buckets[index][0] > priority)
        break;
      bucket = buckets[index];
    }
    if (bucket && bucket[0] === priority) {
      bucket[1].push(task);
    } else if (index === len) {
      buckets.push([priority, [task]]);
    } else {
      buckets.splice(index, 0, [priority, [task]]);
    }
  }
  drain() {
    const buckets = this.buckets;
    this.buckets = [];
    return buckets;
  }
}

class MixedScheduler {
  executionMode;
  setImmediate;
  constructor(executionMode = "async", setImmediateFn) {
    this.executionMode = executionMode;
    this.setImmediate = setImmediateFn ?? (executionMode === "sync" ? setMicrotask : setImmediate);
  }
  shouldYield(fiber) {
    return fiber.currentOpCount >= fiber.cache.maxOpsBeforeYield;
  }
  makeDispatcher() {
    return new MixedSchedulerDispatcher(this.setImmediate);
  }
}

class MixedSchedulerDispatcher {
  tasks = /* @__PURE__ */ new PriorityBuckets;
  running = undefined;
  setImmediate;
  constructor(setImmediateFn = setImmediate) {
    this.setImmediate = setImmediateFn;
  }
  scheduleTask(task, priority) {
    this.tasks.scheduleTask(task, priority);
    if (this.running === undefined) {
      this.running = this.setImmediate(this.afterScheduled);
    }
  }
  afterScheduled = () => {
    this.running = undefined;
    this.runTasks();
  };
  runTasks() {
    const buckets = this.tasks.drain();
    for (let i = 0;i < buckets.length; i++) {
      const toRun = buckets[i][1];
      for (let j = 0;j < toRun.length; j++) {
        toRun[j]();
      }
    }
  }
  flush() {
    while (this.tasks.buckets.length > 0) {
      if (this.running !== undefined) {
        this.running();
        this.running = undefined;
      }
      this.runTasks();
    }
  }
}
var MaxOpsBeforeYield = /* @__PURE__ */ Reference("effect/Scheduler/MaxOpsBeforeYield", {
  fiberCached: true,
  defaultValue: () => 2048
});
var PreventSchedulerYield = /* @__PURE__ */ Reference("effect/Scheduler/PreventSchedulerYield", {
  fiberCached: true,
  defaultValue: () => false
});

// node_modules/effect/dist/Encoding.js
var EncodingErrorTypeId = "~effect/Encoding/EncodingError";

class EncodingError extends (/* @__PURE__ */ TaggedError2("EncodingError")) {
  [EncodingErrorTypeId] = EncodingErrorTypeId;
}
var encodeBase64 = (input) => typeof input === "string" ? base64EncodeUint8Array(encoder.encode(input)) : base64EncodeUint8Array(input);
var decodeBase64 = (str) => {
  const stripped = stripCrlf(str);
  const length = stripped.length;
  if (length % 4 !== 0) {
    return fail2(new EncodingError({
      kind: "Decode",
      module: "Base64",
      input: stripped,
      message: `Length must be a multiple of 4, but is ${length}`
    }));
  }
  const index = stripped.indexOf("=");
  if (index !== -1 && (index < length - 2 || index === length - 2 && stripped[length - 1] !== "=")) {
    return fail2(new EncodingError({
      kind: "Decode",
      module: "Base64",
      input: stripped,
      message: `Found a '=' character, but it is not at the end`
    }));
  }
  try {
    const missingOctets = stripped.endsWith("==") ? 2 : stripped.endsWith("=") ? 1 : 0;
    const result = new Uint8Array(3 * (length / 4) - missingOctets);
    for (let i = 0, j = 0;i < length; i += 4, j += 3) {
      const buffer = getBase64Code(stripped.charCodeAt(i)) << 18 | getBase64Code(stripped.charCodeAt(i + 1)) << 12 | getBase64Code(stripped.charCodeAt(i + 2)) << 6 | getBase64Code(stripped.charCodeAt(i + 3));
      result[j] = buffer >> 16;
      result[j + 1] = buffer >> 8 & 255;
      result[j + 2] = buffer & 255;
    }
    return succeed2(result);
  } catch (e) {
    return fail2(new EncodingError({
      kind: "Decode",
      module: "Base64",
      input: stripped,
      message: e instanceof Error ? e.message : "Invalid input"
    }));
  }
};
var randomHex = (length) => {
  switch (length) {
    case 16:
      return randomHex16();
    case 32:
      return randomHex32();
    default: {
      let result = "";
      for (let i = length >>> 3;i > 0; i--) {
        result += randomHex8();
      }
      return result;
    }
  }
};
var hexCharCodes = /* @__PURE__ */ Uint8Array.from("0123456789abcdef", (c) => c.charCodeAt(0));
var randomWord = () => Math.random() * 4294967296 >>> 0;
var randomHex8 = () => {
  const a = randomWord();
  return String.fromCharCode(hexCharCodes[a >>> 28], hexCharCodes[a >>> 24 & 15], hexCharCodes[a >>> 20 & 15], hexCharCodes[a >>> 16 & 15], hexCharCodes[a >>> 12 & 15], hexCharCodes[a >>> 8 & 15], hexCharCodes[a >>> 4 & 15], hexCharCodes[a & 15]);
};
var randomHex16 = () => {
  const a = randomWord();
  const b = randomWord();
  return String.fromCharCode(hexCharCodes[a >>> 28], hexCharCodes[a >>> 24 & 15], hexCharCodes[a >>> 20 & 15], hexCharCodes[a >>> 16 & 15], hexCharCodes[a >>> 12 & 15], hexCharCodes[a >>> 8 & 15], hexCharCodes[a >>> 4 & 15], hexCharCodes[a & 15], hexCharCodes[b >>> 28], hexCharCodes[b >>> 24 & 15], hexCharCodes[b >>> 20 & 15], hexCharCodes[b >>> 16 & 15], hexCharCodes[b >>> 12 & 15], hexCharCodes[b >>> 8 & 15], hexCharCodes[b >>> 4 & 15], hexCharCodes[b & 15]);
};
var randomHex32 = () => {
  const a = randomWord();
  const b = randomWord();
  const c = randomWord();
  const d = randomWord();
  return String.fromCharCode(hexCharCodes[a >>> 28], hexCharCodes[a >>> 24 & 15], hexCharCodes[a >>> 20 & 15], hexCharCodes[a >>> 16 & 15], hexCharCodes[a >>> 12 & 15], hexCharCodes[a >>> 8 & 15], hexCharCodes[a >>> 4 & 15], hexCharCodes[a & 15], hexCharCodes[b >>> 28], hexCharCodes[b >>> 24 & 15], hexCharCodes[b >>> 20 & 15], hexCharCodes[b >>> 16 & 15], hexCharCodes[b >>> 12 & 15], hexCharCodes[b >>> 8 & 15], hexCharCodes[b >>> 4 & 15], hexCharCodes[b & 15], hexCharCodes[c >>> 28], hexCharCodes[c >>> 24 & 15], hexCharCodes[c >>> 20 & 15], hexCharCodes[c >>> 16 & 15], hexCharCodes[c >>> 12 & 15], hexCharCodes[c >>> 8 & 15], hexCharCodes[c >>> 4 & 15], hexCharCodes[c & 15], hexCharCodes[d >>> 28], hexCharCodes[d >>> 24 & 15], hexCharCodes[d >>> 20 & 15], hexCharCodes[d >>> 16 & 15], hexCharCodes[d >>> 12 & 15], hexCharCodes[d >>> 8 & 15], hexCharCodes[d >>> 4 & 15], hexCharCodes[d & 15]);
};
var encoder = /* @__PURE__ */ new TextEncoder;
var stripCrlf = (str) => str.replace(/[\n\r]/g, "");
var base64EncodeUint8Array = (bytes) => {
  const length = bytes.length;
  let result = "";
  let i;
  for (i = 2;i < length; i += 3) {
    result += base64abc[bytes[i - 2] >> 2];
    result += base64abc[(bytes[i - 2] & 3) << 4 | bytes[i - 1] >> 4];
    result += base64abc[(bytes[i - 1] & 15) << 2 | bytes[i] >> 6];
    result += base64abc[bytes[i] & 63];
  }
  if (i === length + 1) {
    result += base64abc[bytes[i - 2] >> 2];
    result += base64abc[(bytes[i - 2] & 3) << 4];
    result += "==";
  }
  if (i === length) {
    result += base64abc[bytes[i - 2] >> 2];
    result += base64abc[(bytes[i - 2] & 3) << 4 | bytes[i - 1] >> 4];
    result += base64abc[(bytes[i - 1] & 15) << 2];
    result += "=";
  }
  return result;
};
function getBase64Code(charCode) {
  if (charCode >= base64codes.length) {
    throw new TypeError(`Invalid character ${String.fromCharCode(charCode)}`);
  }
  const code = base64codes[charCode];
  if (code === 255) {
    throw new TypeError(`Invalid character ${String.fromCharCode(charCode)}`);
  }
  return code;
}
var base64abc = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "/"];
var base64codes = [255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 62, 255, 255, 255, 63, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 255, 255, 255, 0, 255, 255, 255, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 255, 255, 255, 255, 255, 255, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51];

// node_modules/effect/dist/Tracer.js
var ParentSpanKey = "effect/Tracer/ParentSpan";

class ParentSpan extends (/* @__PURE__ */ Service()(ParentSpanKey, {
  fiberCached: true
})) {
}
var make5 = (options) => options;
var externalSpan = (options) => ({
  _tag: "ExternalSpan",
  spanId: options.spanId,
  traceId: options.traceId,
  sampled: options.sampled ?? true,
  annotations: options.annotations ?? empty2()
});
var DisablePropagation = /* @__PURE__ */ Reference("effect/Tracer/DisablePropagation", {
  defaultValue: constFalse
});
var CurrentTraceLevel = /* @__PURE__ */ Reference("effect/Tracer/CurrentTraceLevel", {
  defaultValue: () => "Info"
});
var MinimumTraceLevel = /* @__PURE__ */ Reference("effect/Tracer/MinimumTraceLevel", {
  defaultValue: () => "All"
});
var TracerKey = "effect/Tracer";
var Tracer = /* @__PURE__ */ Reference(TracerKey, {
  fiberCached: true,
  defaultValue: () => nativeTracer
});
var nativeTracer = /* @__PURE__ */ make5({
  span: (options) => new NativeSpan(options)
});

class NativeSpan {
  _tag = "Span";
  sampled;
  name;
  parent;
  annotations;
  links;
  startTime;
  kind;
  status;
  _traceId = undefined;
  _spanId = undefined;
  _attributes = undefined;
  _events = undefined;
  constructor(options) {
    this.name = options.name;
    this.parent = options.parent;
    this.annotations = options.annotations;
    this.links = options.links;
    this.startTime = options.startTime;
    this.kind = options.kind;
    this.sampled = options.sampled;
    this.status = {
      _tag: "Started",
      startTime: options.startTime
    };
  }
  get traceId() {
    return this._traceId ??= getOrUndefined(this.parent)?.traceId ?? randomHex(32);
  }
  get spanId() {
    return this._spanId ??= randomHex(16);
  }
  get attributes() {
    return this._attributes ??= new Map;
  }
  get events() {
    return this._events ??= [];
  }
  end(endTime, exit) {
    this.status = {
      _tag: "Ended",
      endTime,
      exit,
      startTime: this.status.startTime
    };
  }
  attribute(key, value) {
    this.attributes.set(key, value);
  }
  event(name, startTime, attributes) {
    this.events.push([name, startTime, attributes ?? {}]);
  }
  addLinks(links) {
    this.links.push(...links);
  }
}

// node_modules/effect/dist/internal/metric.js
var FiberRuntimeMetricsKey = "effect/Metric/FiberRuntimeMetrics";

// node_modules/effect/dist/internal/references.js
var CurrentErrorReporters = /* @__PURE__ */ Reference("effect/ErrorReporter/CurrentErrorReporters", {
  defaultValue: () => new Set
});
var CurrentStackFrame = /* @__PURE__ */ Reference("effect/References/CurrentStackFrame", {
  fiberCached: true,
  defaultValue: constUndefined
});
var TracerEnabled = /* @__PURE__ */ Reference("effect/References/TracerEnabled", {
  fiberCached: true,
  defaultValue: constTrue
});
var TracerTimingEnabled = /* @__PURE__ */ Reference("effect/References/TracerTimingEnabled", {
  defaultValue: constTrue
});
var TracerSpanAnnotations = /* @__PURE__ */ Reference("effect/References/TracerSpanAnnotations", {
  defaultValue: () => ({})
});
var TracerSpanLinks = /* @__PURE__ */ Reference("effect/References/TracerSpanLinks", {
  defaultValue: () => []
});
var CurrentLogAnnotations = /* @__PURE__ */ Reference("effect/References/CurrentLogAnnotations", {
  defaultValue: () => ({})
});
var CurrentLogLevel = /* @__PURE__ */ Reference("effect/References/CurrentLogLevel", {
  fiberCached: true,
  defaultValue: () => "Info"
});
var MinimumLogLevel = /* @__PURE__ */ Reference("effect/References/MinimumLogLevel", {
  fiberCached: true,
  defaultValue: () => "Info"
});
var CurrentLogSpans = /* @__PURE__ */ Reference("effect/References/CurrentLogSpans", {
  defaultValue: () => []
});

// node_modules/effect/dist/internal/tracer.js
var addSpanStackTrace = (options) => {
  if (options?.captureStackTrace === false) {
    return options;
  } else if (options?.captureStackTrace !== undefined && typeof options.captureStackTrace !== "boolean") {
    return options;
  }
  const limit = getStackTraceLimit();
  if (limit === 0 && options?.captureStackTrace !== true) {
    return {
      ...options,
      captureStackTrace: false
    };
  }
  setStackTraceLimit(3);
  const traceError = new Error;
  setStackTraceLimit(limit);
  return {
    ...options,
    captureStackTrace: spanCleaner(() => traceError.stack)
  };
};
var makeStackCleaner = (line) => (stack) => {
  let cache;
  return () => {
    if (cache !== undefined)
      return cache;
    const trace = stack();
    if (!trace)
      return;
    const lines = trace.split(`
`);
    if (lines[line] !== undefined) {
      cache = lines[line].trim();
      return cache;
    }
  };
};
var spanCleaner = /* @__PURE__ */ makeStackCleaner(3);

// node_modules/effect/dist/internal/effect.js
class Interrupt extends ReasonBase {
  constructor(fiberId, annotations = constEmptyAnnotations) {
    super("Interrupt", annotations, "Interrupted");
    this.fiberId = fiberId;
  }
  toString() {
    return `Interrupt(${this.fiberId})`;
  }
  toJSON() {
    return {
      _tag: "Interrupt",
      fiberId: this.fiberId
    };
  }
  [symbol2](that) {
    return isInterruptReason(that) && this.fiberId === that.fiberId && this.annotations === that.annotations;
  }
  [symbol]() {
    return combine(string(`${this._tag}:${this.fiberId}`))(random(this.annotations));
  }
}
var causeInterrupt = (fiberId) => new CauseImpl([new Interrupt(fiberId)]);
var findFail = (self) => {
  const reason = self.reasons.find(isFailReason);
  return reason ? succeed2(reason) : fail2(self);
};
var findError = (self) => {
  for (let i = 0;i < self.reasons.length; i++) {
    const reason = self.reasons[i];
    if (reason._tag === "Fail") {
      return succeed2(reason.error);
    }
  }
  return fail2(self);
};
var hasDies = (self) => self.reasons.some(isDieReason);
var findDefect = (self) => {
  const reason = self.reasons.find(isDieReason);
  return reason ? succeed2(reason.defect) : fail2(self);
};
var hasInterrupts = (self) => self.reasons.some(isInterruptReason);
var causeFilterInterruptors = (self) => {
  let interruptors;
  for (let i = 0;i < self.reasons.length; i++) {
    const f = self.reasons[i];
    if (f._tag !== "Interrupt")
      continue;
    interruptors ??= new Set;
    if (f.fiberId !== undefined) {
      interruptors.add(f.fiberId);
    }
  }
  return interruptors ? succeed2(interruptors) : fail2(self);
};
var hasInterruptsOnly = (self) => self.reasons.length > 0 && self.reasons.every(isInterruptReason);
var dedupeReasons = (self, that) => {
  const buckets = new Map;
  const out = [];
  for (const reason of self.concat(that)) {
    const hash2 = hash(reason);
    const bucket = buckets.get(hash2);
    if (bucket === undefined) {
      buckets.set(hash2, [reason]);
    } else if (bucket.some((previous) => equals(previous, reason))) {
      continue;
    } else {
      bucket.push(reason);
    }
    out.push(reason);
  }
  return out;
};
var causeCombine = /* @__PURE__ */ dual(2, (self, that) => {
  if (self.reasons.length === 0) {
    return that;
  } else if (that.reasons.length === 0) {
    return self;
  }
  const newCause = new CauseImpl(dedupeReasons(self.reasons, that.reasons));
  return equals(self, newCause) ? self : newCause;
});
var causeMap = /* @__PURE__ */ dual(2, (self, f) => {
  let hasFail = false;
  const failures = self.reasons.map((failure) => {
    if (isFailReason(failure)) {
      hasFail = true;
      return new Fail(f(failure.error), failure.annotations);
    }
    return failure;
  });
  return hasFail ? causeFromReasons(failures) : self;
});
var causePartition = (self) => {
  const obj = {
    Fail: [],
    Die: [],
    Interrupt: []
  };
  for (let i = 0;i < self.reasons.length; i++) {
    obj[self.reasons[i]._tag].push(self.reasons[i]);
  }
  return obj;
};
var causeSquash = (self) => {
  const partitioned = causePartition(self);
  if (partitioned.Fail.length > 0) {
    return partitioned.Fail[0].error;
  } else if (partitioned.Die.length > 0) {
    return partitioned.Die[0].defect;
  } else if (partitioned.Interrupt.length > 0) {
    return new globalThis.Error("All fibers interrupted without error");
  }
  return new globalThis.Error("Empty cause");
};
var causePrettyErrors = (self, options) => {
  const errors = [];
  const interrupts = [];
  if (self.reasons.length === 0)
    return errors;
  const prevStackLimit = getStackTraceLimit();
  if (prevStackLimit !== 0)
    setStackTraceLimit(1);
  for (const failure of self.reasons) {
    if (failure._tag === "Interrupt") {
      interrupts.push(failure);
      continue;
    }
    errors.push(causePrettyError(failure._tag === "Die" ? failure.defect : failure.error, failure.annotations, options));
  }
  if (errors.length === 0) {
    const cause = new Error("The fiber was interrupted by:");
    cause.name = "InterruptCause";
    cause.stack = interruptCauseStack(cause, interrupts);
    const error = new globalThis.Error("All fibers interrupted without error", {
      cause
    });
    error.name = "InterruptError";
    error.stack = `${error.name}: ${error.message}`;
    errors.push(causePrettyError(error, interrupts[0].annotations, options));
  }
  if (prevStackLimit !== 0)
    setStackTraceLimit(prevStackLimit);
  return errors;
};
var causePrettyError = (original, annotations, options) => {
  const kind = typeof original;
  let error;
  if (original && kind === "object") {
    error = new globalThis.Error(causePrettyMessage(original), {
      cause: original.cause ? causePrettyError(original.cause) : undefined
    });
    if (typeof original.name === "string") {
      error.name = original.name;
    }
    if (typeof original.stack === "string") {
      error.stack = cleanErrorStack(original.stack, error, annotations);
    } else {
      const stack = `${error.name}: ${error.message}`;
      error.stack = annotations ? addStackAnnotations(stack, annotations) : stack;
    }
    if (options?.includeCauseInStack) {
      error.stack = renderPrettyError(error);
    }
    for (const key of Object.keys(original)) {
      if (!(key in error)) {
        error[key] = original[key];
      }
    }
  } else {
    error = new globalThis.Error(!original ? `Unknown error: ${original}` : kind === "string" ? original : formatJson(original));
  }
  return error;
};
var causePrettyMessage = (u) => {
  if (typeof u.message === "string") {
    return u.message;
  } else if (typeof u.toString === "function" && u.toString !== Object.prototype.toString && u.toString !== Array.prototype.toString) {
    try {
      return u.toString();
    } catch {}
  }
  return formatJson(u);
};
var locationRegExp = /\((.*)\)/g;
var cleanErrorStack = (stack, error, annotations) => {
  const message = `${error.name}: ${error.message}`;
  const lines = (stack.startsWith(message) ? stack.slice(message.length) : stack).split(`
`);
  const out = [message];
  for (let i = 1;i < lines.length; i++) {
    if (/(?:Generator\.next|~effect\/Effect)/.test(lines[i])) {
      break;
    }
    out.push(lines[i]);
  }
  return annotations ? addStackAnnotations(out.join(`
`), annotations) : out.join(`
`);
};
var addStackAnnotations = (stack, annotations) => {
  const frame = annotations?.get(StackTraceKey.key);
  if (frame) {
    stack = `${stack}
${currentStackTrace(frame)}`;
  }
  return stack;
};
var interruptCauseStack = (error, interrupts) => {
  const out = [`${error.name}: ${error.message}`];
  for (const current of interrupts) {
    const fiberId = current.fiberId !== undefined ? `#${current.fiberId}` : "unknown";
    const frame = current.annotations.get(InterruptorStackTrace.key);
    out.push(`    at fiber (${fiberId})`);
    if (frame)
      out.push(currentStackTrace(frame));
  }
  return out.join(`
`);
};
var currentStackTrace = (frame) => {
  const out = [];
  let current = frame;
  let i = 0;
  while (current && i < 10) {
    const stack = current.stack();
    if (stack) {
      const locationMatchAll = stack.matchAll(locationRegExp);
      let match = false;
      for (const [, location2] of locationMatchAll) {
        match = true;
        out.push(`    at ${current.name} (${location2})`);
      }
      if (!match) {
        out.push(`    at ${current.name} (${stack.replace(/^at /, "")})`);
      }
    } else {
      out.push(`    at ${current.name}`);
    }
    current = current.parent;
    i++;
  }
  return out.join(`
`);
};
var causePretty = (cause) => causePrettyErrors(cause).map(renderPrettyError).join(`
`);
var renderPrettyError = (e) => e.cause ? `${e.stack} {
${renderErrorCause(e.cause, "  ")}
}` : e.stack;
var renderErrorCause = (cause, prefix) => {
  const lines = cause.stack.split(`
`);
  let stack = `${prefix}[cause]: ${lines[0]}`;
  for (let i = 1, len = lines.length;i < len; i++) {
    stack += `
${prefix}${lines[i]}`;
  }
  if (cause.cause) {
    stack += ` {
${renderErrorCause(cause.cause, `${prefix}  `)}
${prefix}}`;
  }
  return stack;
};
var FiberTypeId = "~effect/Fiber";
var fiberVariance = {
  _A: identity,
  _E: identity
};
var fiberIdStore = {
  id: 0
};
var getCurrentFiber = () => globalThis[currentFiberTypeId];

class FiberImpl {
  constructor(context, interruptible = true) {
    this[FiberTypeId] = fiberVariance;
    this.setContext(context);
    this.id = ++fiberIdStore.id;
    this.currentOpCount = 0;
    this.interruptible = interruptible;
    this._stack = [];
    this._observers = undefined;
    this._exit = undefined;
    this._children = undefined;
    this._interruptedCause = undefined;
    this._yielded = undefined;
    this._running = false;
    this._deferredInterrupt = false;
    this._parent = undefined;
    this.cache.runtimeMetrics?.recordFiberStart(this.context);
  }
  [FiberTypeId];
  id;
  interruptible;
  currentOpCount;
  _stack;
  _observers;
  _exit;
  _children;
  _interruptedCause;
  _yielded;
  _running;
  _deferredInterrupt;
  _parent;
  context;
  cache;
  _dispatcher = undefined;
  get currentDispatcher() {
    return this._dispatcher ??= this.cache.scheduler.makeDispatcher();
  }
  getRef(ref) {
    return get(this.context, ref);
  }
  addObserver(cb) {
    if (this._exit) {
      cb(this._exit);
      return constVoid;
    }
    if (this._observers === undefined) {
      this._observers = [cb];
    } else {
      this._observers.push(cb);
    }
    return () => {
      if (this._exit || this._observers === undefined)
        return;
      const index = this._observers.indexOf(cb);
      if (index >= 0) {
        this._observers.splice(index, 1);
      }
    };
  }
  interruptUnsafe(fiberId, annotations) {
    if (this._exit) {
      return;
    }
    let cause = causeInterrupt(fiberId);
    if (this.cache.stackFrame) {
      cause = causeAnnotate(cause, make3(StackTraceKey, this.cache.stackFrame));
    }
    if (annotations) {
      cause = causeAnnotate(cause, annotations);
    }
    this._interruptedCause = this._interruptedCause ? causeCombine(this._interruptedCause, cause) : cause;
    if (this.interruptible) {
      if (this._running) {
        this._deferredInterrupt = true;
      } else {
        this.evaluate(failCause(this._interruptedCause));
      }
    }
  }
  pollUnsafe() {
    return this._exit;
  }
  evaluate(effect) {
    if (this._exit) {
      return;
    } else if (this._yielded !== undefined) {
      const yielded = this._yielded;
      this._yielded = undefined;
      yielded();
    }
    const exit = this.runLoop(effect);
    if (exit === Yield) {
      return;
    }
    const interruptChildren = fiberMiddleware.interruptChildren && fiberMiddleware.interruptChildren(this);
    if (interruptChildren !== undefined) {
      return this.evaluate(flatMap3(interruptChildren, () => exit));
    }
    this._exit = exit;
    this.cache.runtimeMetrics?.recordFiberEnd(this.context, this._exit);
    if (this._parent) {
      this._parent._children?.delete(this);
      this._parent = undefined;
    }
    if (this._observers !== undefined) {
      const observers = this._observers;
      this._observers = undefined;
      for (let i = 0;i < observers.length; i++) {
        observers[i](exit);
      }
    }
    this._stack.length = 0;
    this._children = undefined;
    this.context = empty2();
  }
  runLoop(effect) {
    const prevFiber = globalThis[currentFiberTypeId];
    globalThis[currentFiberTypeId] = this;
    const prevRunning = this._running;
    this._running = true;
    let yielding = false;
    let current = effect;
    this.currentOpCount = 0;
    try {
      while (true) {
        if (this._deferredInterrupt) {
          this._deferredInterrupt = false;
          current = failCause(this._interruptedCause);
        }
        this.currentOpCount++;
        const cache = this.cache;
        if (!yielding && !cache.preventYield && cache.scheduler.shouldYield(this)) {
          yielding = true;
          const prev = current;
          current = flatMap3(yieldNow, () => prev);
        }
        current = cache.tracerContext ? cache.tracerContext(current, this) : current[evaluate](this);
        if (current === Yield) {
          const yielded = this._yielded;
          if (ExitTypeId in yielded) {
            this._deferredInterrupt = false;
            this._yielded = undefined;
            return yielded;
          } else if (this._deferredInterrupt) {
            this._yielded = undefined;
            yielded();
            continue;
          }
          return Yield;
        }
      }
    } catch (error) {
      if (!hasProperty(current, evaluate)) {
        return exitDie(`Fiber.runLoop: Not a valid effect: ${String(current)}`);
      }
      return this.runLoop(exitDie(error));
    } finally {
      this._running = prevRunning;
      globalThis[currentFiberTypeId] = prevFiber;
    }
  }
  getCont(symbol) {
    if (this._deferredInterrupt) {
      this._deferredInterrupt = false;
      return deferredInterruptCont;
    }
    while (true) {
      const op = this._stack.pop();
      if (!op)
        return;
      const all = op[contAll];
      if (all !== undefined) {
        const cont = all.call(op, this);
        if (cont) {
          cont[symbol] = cont;
          return cont;
        }
      }
      if (op[symbol])
        return op;
    }
  }
  yieldWith(value) {
    this._yielded = value;
    return Yield;
  }
  children() {
    return this._children ??= new Set;
  }
  pipe() {
    return pipeArguments(this, arguments);
  }
  setContext(context) {
    const previous = this.context;
    this.context = context;
    if (previous !== undefined && hasSameCache(previous, context))
      return;
    const root = context.cacheRoot;
    const cache = root._fiberCache ??= makeFiberContextCache(context);
    if (this.cache !== undefined && this.cache.scheduler !== cache.scheduler) {
      this._dispatcher = undefined;
    }
    this.cache = cache;
  }
  get currentSpanLocal() {
    const span = this.cache.span;
    return span?._tag === "Span" ? span : undefined;
  }
}
var makeFiberContextCache = (context) => {
  const currentTracer = getOrUndefinedUnsafe(context, TracerKey);
  return {
    scheduler: get(context, Scheduler),
    tracer: currentTracer,
    tracerContext: currentTracer ? currentTracer["context"] : undefined,
    tracerEnabled: get(context, TracerEnabled),
    span: getOrUndefinedUnsafe(context, ParentSpanKey),
    logLevel: get(context, CurrentLogLevel),
    minimumLogLevel: get(context, MinimumLogLevel),
    stackFrame: get(context, CurrentStackFrame),
    runtimeMetrics: getOrUndefinedUnsafe(context, FiberRuntimeMetricsKey),
    maxOpsBeforeYield: get(context, MaxOpsBeforeYield),
    preventYield: get(context, PreventSchedulerYield)
  };
};
var deferredInterruptCont = {
  [contA](_value, fiber) {
    return failCause(fiber._interruptedCause);
  },
  [contE](_cause, fiber) {
    return failCause(fiber._interruptedCause);
  }
};
var fiberMiddleware = {
  interruptChildren: undefined
};
var fiberStackAnnotations = (fiber) => {
  if (!fiber.cache.stackFrame)
    return;
  const annotations = new Map;
  annotations.set(InterruptorStackTrace.key, fiber.cache.stackFrame);
  return makeUnsafe(annotations);
};
var fiberAwait = (self) => {
  const impl = self;
  if (impl._exit)
    return succeed3(impl._exit);
  return callback((resume) => {
    if (impl._exit)
      return resume(succeed3(impl._exit));
    return sync(self.addObserver((exit) => resume(succeed3(exit))));
  });
};
var fiberAwaitAll = (self) => callback((resume) => {
  const iter = self[Symbol.iterator]();
  const exits = [];
  let cancel = undefined;
  function loop() {
    let result = iter.next();
    while (!result.done) {
      if (result.value._exit) {
        exits.push(result.value._exit);
        result = iter.next();
        continue;
      }
      cancel = result.value.addObserver((exit) => {
        exits.push(exit);
        loop();
      });
      return;
    }
    resume(succeed3(exits));
  }
  loop();
  return sync(() => cancel?.());
});
var fiberInterrupt = (self) => withFiber((fiber) => fiberInterruptAs(self, fiber.id));
var fiberInterruptAs = /* @__PURE__ */ dual((args) => hasProperty(args[0], FiberTypeId), (self, fiberId, annotations) => withFiber((parent) => {
  let ann = fiberStackAnnotations(parent);
  ann = ann && annotations ? merge(ann, annotations) : ann ?? annotations;
  self.interruptUnsafe(fiberId, ann);
  return asVoid(fiberAwait(self));
}));
var fiberInterruptAll = (fibers) => withFiber((parent) => {
  const annotations = fiberStackAnnotations(parent);
  let fiberArr = empty();
  for (const fiber of fibers) {
    fiber.interruptUnsafe(parent.id, annotations);
    fiberArr.push(fiber);
  }
  return asVoid(fiberAwaitAll(fiberArr));
});
var succeed3 = exitSucceed;
var failCause = exitFailCause;
var fail3 = exitFail;
var sync = /* @__PURE__ */ makePrimitive({
  op: "Sync",
  [evaluate](fiber) {
    const value = this[args]();
    const cont = fiber.getCont(contA);
    return cont ? cont[contA](value, fiber) : fiber.yieldWith(exitSucceed(value));
  }
});
var suspend = /* @__PURE__ */ makePrimitive({
  op: "Suspend",
  [evaluate](_fiber) {
    return this[args]();
  }
});
var fromResult = /* @__PURE__ */ match2({
  onFailure: fail3,
  onSuccess: succeed3
});
var yieldNowWith = /* @__PURE__ */ makePrimitive({
  op: "Yield",
  [evaluate](fiber) {
    let resumed = false;
    fiber.currentDispatcher.scheduleTask(() => {
      if (resumed)
        return;
      fiber.evaluate(exitVoid);
    }, this[args] ?? 0);
    return fiber.yieldWith(() => {
      resumed = true;
    });
  }
});
var yieldNow = /* @__PURE__ */ yieldNowWith(0);
var succeedNone = /* @__PURE__ */ succeed3(/* @__PURE__ */ none2());
var failCauseSync = (evaluate) => suspend(() => failCause(internalCall(evaluate)));
var die = (defect) => exitDie(defect);
var failSync = (error) => suspend(() => fail3(internalCall(error)));
var void_ = /* @__PURE__ */ succeed3(undefined);
var try_2 = (options) => {
  const evaluate = typeof options === "function" ? options : options.try;
  const catcher = typeof options === "function" ? (cause) => new UnknownError(cause, "An error occurred in Effect.try") : options.catch;
  return suspend(() => {
    try {
      return succeed3(internalCall(evaluate));
    } catch (err) {
      return fail3(internalCall(() => catcher(err)));
    }
  });
};
var promise = (evaluate) => callbackOptions(function(resume, signal) {
  internalCall(() => evaluate(signal)).then((a) => resume(succeed3(a)), (e) => resume(die(e)));
}, evaluate.length !== 0);
var tryPromise = (options) => {
  const f = typeof options === "function" ? options : options.try;
  const catcher = typeof options === "function" ? (cause) => new UnknownError(cause, "An error occurred in Effect.tryPromise") : options.catch;
  return callbackOptions(function(resume, signal) {
    const failWithCatch = (cause) => {
      try {
        resume(fail3(internalCall(() => catcher(cause))));
      } catch (err) {
        resume(die(err));
      }
    };
    try {
      internalCall(() => f(signal)).then((a) => resume(succeed3(a)), failWithCatch);
    } catch (err) {
      failWithCatch(err);
    }
  }, f.length !== 0);
};
var withFiberId = (f) => withFiber((fiber) => f(fiber.id));
var fiber = /* @__PURE__ */ withFiber(succeed3);
var callbackOptions = /* @__PURE__ */ function() {
  const Proto = /* @__PURE__ */ makePrimitiveProto({
    op: "Async",
    [evaluate](fiber) {
      const register = internalCall(() => this.register.bind(fiber.cache.scheduler));
      let resumed = false;
      let yielded = false;
      const controller = this.withSignal ? new AbortController : undefined;
      const onCancel = register((effect) => {
        if (resumed)
          return;
        resumed = true;
        if (yielded) {
          fiber.evaluate(effect);
        } else {
          yielded = effect;
        }
      }, controller?.signal);
      if (yielded !== false)
        return yielded;
      yielded = true;
      fiber._yielded = () => {
        resumed = true;
      };
      if (controller === undefined && onCancel === undefined) {
        return Yield;
      }
      fiber._stack.push(asyncFinalizer(() => {
        resumed = true;
        controller?.abort();
        return onCancel ?? exitVoid;
      }));
      return Yield;
    }
  });
  const AsyncImpl = function(register, withSignal) {
    this.register = register;
    this.withSignal = withSignal;
  };
  AsyncImpl.prototype = Proto;
  return function(register, withSignal) {
    return new AsyncImpl(register, withSignal);
  };
}();
var asyncFinalizer = /* @__PURE__ */ makePrimitive({
  op: "AsyncFinalizer",
  [contAll](fiber) {
    if (fiber.interruptible) {
      fiber.interruptible = false;
      fiber._stack.push(setInterruptibleTrue);
    }
  },
  [contE](cause, _fiber) {
    return hasInterrupts(cause) ? flatMap3(this[args](), () => failCause(cause)) : failCause(cause);
  }
});
var callback = (register) => callbackOptions(register, register.length >= 2);
var never = /* @__PURE__ */ callback(constVoid);
var gen = (...args) => {
  if (args.length === 1) {
    const body = args[0];
    return suspend(() => fromIteratorUnsafe(body()));
  }
  const [options, body] = args;
  return suspend(() => fromIteratorUnsafe(body.call(options.self)));
};
var fnUntraced = (body, ...pipeables) => {
  const fn = pipeables.length === 0 ? function() {
    return suspend(() => fromIteratorUnsafe(body.apply(this, arguments)));
  } : function() {
    let effect = suspend(() => fromIteratorUnsafe(body.apply(this, arguments)));
    for (let i = 0;i < pipeables.length; i++) {
      effect = pipeables[i](effect, ...arguments);
    }
    return effect;
  };
  return defineFunctionLength(body.length, fn);
};
var defineFunctionLength = (length, fn) => Object.defineProperty(fn, "length", {
  value: length,
  configurable: true
});
var fnUntracedEager = (body, ...pipeables) => defineFunctionLength(body.length, pipeables.length === 0 ? function() {
  return fromIteratorEagerUnsafe(() => body.apply(this, arguments));
} : function() {
  let effect = fromIteratorEagerUnsafe(() => body.apply(this, arguments));
  for (const pipeable of pipeables) {
    effect = pipeable(effect, ...arguments);
  }
  return effect;
});
var fromIteratorEagerUnsafe = (evaluate) => {
  try {
    const iterator = evaluate();
    let value = undefined;
    while (true) {
      const state = iterator.next(value);
      if (state.done) {
        return succeed3(state.value);
      }
      const primitive = state.value;
      if (primitive && primitive._tag === "Success") {
        value = primitive.value;
        continue;
      } else if (primitive && primitive._tag === "Failure") {
        return state.value;
      } else {
        let isFirstExecution = true;
        return suspend(() => {
          if (isFirstExecution) {
            isFirstExecution = false;
            return flatMap3(state.value, (value) => fromIteratorUnsafe(iterator, value));
          } else {
            return suspend(() => fromIteratorUnsafe(evaluate()));
          }
        });
      }
    }
  } catch (error) {
    return die(error);
  }
};
var fromIteratorUnsafe = /* @__PURE__ */ function() {
  const Proto = /* @__PURE__ */ makePrimitiveProto({
    op: "Iterator",
    [contA](value, fiber) {
      const iter = this.iterator;
      while (true) {
        const state = iter.next(value);
        if (state.done)
          return succeed3(state.value);
        if (!effectIsExit(state.value)) {
          fiber._stack.push(this);
          return state.value;
        } else if (state.value._tag === "Failure") {
          return state.value;
        }
        value = state.value.value;
      }
    },
    [evaluate](fiber) {
      return this[contA](this.initial, fiber);
    }
  });
  const IteratorImpl = function(iterator, initial) {
    this.iterator = iterator;
    this.initial = initial;
  };
  IteratorImpl.prototype = Proto;
  return function(iterator, initial) {
    return new IteratorImpl(iterator, initial);
  };
}();
var as = /* @__PURE__ */ dual(2, (self, value) => new ContImpl(self, returnPayload, succeed3(value)));
var evaluateCont = function(fiber) {
  fiber._stack.push(this);
  return this[args];
};
var OnSuccessProto = /* @__PURE__ */ makePrimitiveProto({
  op: "OnSuccess",
  [evaluate]: evaluateCont
});
var OnSuccessImpl = function(self, f) {
  this[args] = self;
  this[contA] = f;
};
OnSuccessImpl.prototype = OnSuccessProto;
var ContImpl = function(self, cont, payload) {
  this[args] = self;
  this[contA] = cont;
  this.payload = payload;
};
ContImpl.prototype = OnSuccessProto;
var returnPayload = function() {
  return this.payload;
};
var mapCont = function(value) {
  const f = this.payload;
  return succeed3(internalCall(() => f(value)));
};
var andThenCont = function(value) {
  const f = this.payload;
  return internalCall(() => f(value));
};
var tapCont = function(value) {
  const f = this.payload;
  return new ContImpl(internalCall(() => f(value)), returnPayload, exitSucceed(value));
};
var tapEffectCont = function(value) {
  return new ContImpl(this.payload, returnPayload, exitSucceed(value));
};
var asSome = (self) => map5(self, some2);
var andThen = /* @__PURE__ */ dual(2, (self, f) => new ContImpl(self, isEffect(f) ? returnPayload : andThenCont, f));
var tap = /* @__PURE__ */ dual(2, (self, f) => new ContImpl(self, isEffect(f) ? tapEffectCont : tapCont, f));
var asVoid = (self) => new ContImpl(self, returnPayload, exitVoid);
var raceAllFirst = (all, options) => withFiber((parent) => callback((resume) => {
  let done = false;
  const fibers = new Set;
  const onExit = (exit) => {
    done = true;
    resume(fibers.size === 0 ? exit : flatMap3(uninterruptible(fiberInterruptAll(fibers)), () => exit));
  };
  let i = 0;
  for (const effect of all) {
    if (done)
      break;
    const index = i++;
    const fiber = forkUnsafe(parent, effect, true, true, false);
    fibers.add(fiber);
    fiber.addObserver((exit) => {
      fibers.delete(fiber);
      const isWinner = !done;
      onExit(exit);
      if (isWinner && options?.onWinner) {
        options.onWinner({
          fiber,
          index,
          parentFiber: parent
        });
      }
    });
  }
  return fiberInterruptAll(fibers);
}));
var raceFirst = /* @__PURE__ */ dual((args) => isEffect(args[1]), (self, that, options) => raceAllFirst([self, that], options));
var flatMap3 = /* @__PURE__ */ dual(2, (self, f) => new OnSuccessImpl(self, f.length !== 1 ? (a) => f(a) : f));
var matchCauseEffectEager = /* @__PURE__ */ dual(2, (self, options) => {
  if (effectIsExit(self)) {
    return self._tag === "Success" ? options.onSuccess(self.value) : options.onFailure(self.cause);
  }
  return matchCauseEffect(self, options);
});
var effectIsExit = (effect) => effect[ExitTypeId] !== undefined;
var flatMapEager = /* @__PURE__ */ dual(2, (self, f) => {
  if (effectIsExit(self)) {
    return self._tag === "Success" ? f(self.value) : self;
  }
  return flatMap3(self, f);
});
var map5 = /* @__PURE__ */ dual(2, (self, f) => new ContImpl(self, mapCont, f));
var mapEager = /* @__PURE__ */ dual(2, (self, f) => effectIsExit(self) ? exitMap(self, f) : map5(self, f));
var mapErrorEager = /* @__PURE__ */ dual(2, (self, f) => effectIsExit(self) ? exitMapError(self, f) : mapError(self, f));
var catchEager = /* @__PURE__ */ dual(2, (self, f) => {
  if (effectIsExit(self)) {
    if (self._tag === "Success")
      return self;
    const error = findError(self.cause);
    if (isFailure2(error))
      return self;
    return f(error.success);
  }
  return catch_(self, f);
});
var exitInterrupt = (fiberId) => exitFailCause(causeInterrupt(fiberId));
var exitIsSuccess = (self) => self._tag === "Success";
var exitIsFailure = (self) => self._tag === "Failure";
var exitFilterCause = (self) => self._tag === "Failure" ? succeed2(self.cause) : fail2(self);
var exitVoid = /* @__PURE__ */ exitSucceed(undefined);
var exitMap = /* @__PURE__ */ dual(2, (self, f) => self._tag === "Success" ? exitSucceed(f(self.value)) : self);
var exitMapError = /* @__PURE__ */ dual(2, (self, f) => {
  if (self._tag === "Success")
    return self;
  const error = findError(self.cause);
  if (isFailure2(error))
    return self;
  return exitFail(f(error.success));
});
var exitZipRight = /* @__PURE__ */ dual(2, (self, that) => exitIsSuccess(self) ? that : self);
var exitAsVoidAll = (exits) => {
  const failures = [];
  for (const exit of exits) {
    if (exit._tag === "Failure") {
      failures.push(...exit.cause.reasons);
    }
  }
  return failures.length === 0 ? exitVoid : exitFailCause(causeFromReasons(failures));
};
var serviceOption = (service) => withFiber((fiber) => succeed3(getOption(fiber.context, service)));
var updateContext = /* @__PURE__ */ dual(2, (self, f) => withFiber((fiber) => {
  const prevContext = fiber.context;
  const nextContext = f(prevContext);
  if (prevContext === nextContext)
    return self;
  fiber.setContext(nextContext);
  return onExitPrimitive(self, () => {
    fiber.setContext(prevContext);
    return;
  });
}));
var updateService = /* @__PURE__ */ dual(3, (self, service, f) => updateContext(self, (s) => {
  const prev = getUnsafe(s, service);
  const next = f(prev);
  if (prev === next)
    return s;
  return add(s, service, next);
}));
var context = () => getContext;
var getContext = /* @__PURE__ */ withFiber((fiber) => succeed3(fiber.context));
var contextWith = (f) => withFiber((fiber) => f(fiber.context));
var provideContext = /* @__PURE__ */ dual(2, (self, context) => {
  if (effectIsExit(self))
    return self;
  return updateContext(self, merge(context));
});
var provideService = function() {
  if (arguments.length === 1) {
    return dual(2, (self, impl) => provideServiceImpl(self, arguments[0], impl));
  }
  return dual(3, (self, service, impl) => provideServiceImpl(self, service, impl)).apply(this, arguments);
};
var provideServiceImpl = (self, service, implementation) => updateContext(self, add(service, implementation));
var forever = /* @__PURE__ */ dual((args) => isEffect(args[0]), (self, options) => whileLoop({
  while: constTrue,
  body: constant(options?.disableYield ? self : flatMap3(self, (_) => yieldNow)),
  step: constVoid
}));
var catchCause = /* @__PURE__ */ dual(2, (self, f) => new OnFailureImpl(self, f.length !== 1 ? (cause) => f(cause) : f));
var OnFailureProto = /* @__PURE__ */ makePrimitiveProto({
  op: "OnFailure",
  [evaluate]: evaluateCont
});
var OnFailureImpl = function(self, f) {
  this[args] = self;
  this[contE] = f;
};
OnFailureImpl.prototype = OnFailureProto;
var catchCauseFilter = /* @__PURE__ */ dual(3, (self, filter, f) => catchCause(self, (cause) => {
  const eb = filter(cause);
  return isFailure2(eb) ? failCause(eb.failure) : internalCall(() => f(eb.success, cause));
}));
var catch_ = /* @__PURE__ */ dual(2, (self, f) => catchCauseFilter(self, findError, (e) => f(e)));
var catchDefect = /* @__PURE__ */ dual(2, (self, f) => catchCauseFilter(self, findDefect, f));
var tapCause = /* @__PURE__ */ dual(2, (self, f) => catchCause(self, (cause) => andThen(internalCall(() => f(cause)), failCause(cause))));
var catchIf = /* @__PURE__ */ dual((args) => isEffect(args[0]), (self, predicate, f, orElse) => catchCause(self, (cause) => {
  const error = findError(cause);
  if (isFailure2(error))
    return failCause(error.failure);
  if (!predicate(error.success)) {
    return orElse ? internalCall(() => orElse(error.success)) : failCause(cause);
  }
  return internalCall(() => f(error.success));
}));
var catchFilter = /* @__PURE__ */ dual((args) => isEffect(args[0]), (self, filter, f, orElse) => catchCause(self, (cause) => {
  const error = findError(cause);
  if (isFailure2(error))
    return failCause(error.failure);
  const result = filter(error.success);
  if (isFailure2(result)) {
    return orElse ? internalCall(() => orElse(result.failure)) : failCause(cause);
  }
  return internalCall(() => f(result.success));
}));
var catchTag = /* @__PURE__ */ dual((args) => isEffect(args[0]), (self, k, f, orElse) => {
  const pred = Array.isArray(k) ? (e) => hasProperty(e, "_tag") && k.includes(e._tag) : isTagged(k);
  return catchIf(self, pred, f, orElse);
});
var catchTags = /* @__PURE__ */ dual((args) => isEffect(args[0]), (self, cases, orElse) => {
  let keys;
  return catchFilter(self, (e) => {
    keys ??= Object.keys(cases);
    return hasProperty(e, "_tag") && isString(e["_tag"]) && keys.includes(e["_tag"]) ? succeed2(e) : fail2(e);
  }, (e) => internalCall(() => cases[e["_tag"]](e)), orElse);
});
var mapError = /* @__PURE__ */ dual(2, (self, f) => catch_(self, (error) => failSync(() => f(error))));
var orDie = (self) => catch_(self, die);
var orElseSucceed = /* @__PURE__ */ dual(2, (self, f) => catch_(self, (_) => sync(f)));
var ignore = /* @__PURE__ */ dual((args) => isEffect(args[0]), (self, options) => {
  if (!options?.log) {
    return matchEffect(self, {
      onFailure: (_) => void_,
      onSuccess: (_) => void_
    });
  }
  const logEffect = logWithLevel(options.log === true ? undefined : options.log);
  return matchCauseEffect(self, {
    onFailure(cause) {
      const failure = findFail(cause);
      return isFailure2(failure) ? failCause(failure.failure) : options.message === undefined ? logEffect(cause) : logEffect(options.message, cause);
    },
    onSuccess: (_) => void_
  });
});
var result = (self) => matchEager(self, {
  onFailure: fail2,
  onSuccess: succeed2
});
var matchCauseEffect = /* @__PURE__ */ dual(2, (self, options) => new OnSuccessAndFailureImpl(self, options.onSuccess.length !== 1 ? (a) => options.onSuccess(a) : options.onSuccess, options.onFailure.length !== 1 ? (cause) => options.onFailure(cause) : options.onFailure));
var OnSuccessAndFailureProto = /* @__PURE__ */ makePrimitiveProto({
  op: "OnSuccessAndFailure",
  [evaluate]: evaluateCont
});
var OnSuccessAndFailureImpl = function(self, onSuccess, onFailure) {
  this[args] = self;
  this[contA] = onSuccess;
  this[contE] = onFailure;
};
OnSuccessAndFailureImpl.prototype = OnSuccessAndFailureProto;
var matchEffect = /* @__PURE__ */ dual(2, (self, options) => matchCauseEffect(self, {
  onFailure: (cause) => {
    const fail = cause.reasons.find(isFailReason);
    return fail ? internalCall(() => options.onFailure(fail.error)) : failCause(cause);
  },
  onSuccess: options.onSuccess
}));
var match5 = /* @__PURE__ */ dual(2, (self, options) => matchEffect(self, {
  onFailure: (error) => sync(() => options.onFailure(error)),
  onSuccess: (value) => sync(() => options.onSuccess(value))
}));
var matchEager = /* @__PURE__ */ dual(2, (self, options) => {
  if (effectIsExit(self)) {
    if (self._tag === "Success")
      return exitSucceed(options.onSuccess(self.value));
    const error = findError(self.cause);
    if (isFailure2(error))
      return self;
    return exitSucceed(options.onFailure(error.success));
  }
  return match5(self, options);
});
var exit = (self) => effectIsExit(self) ? exitSucceed(self) : exitPrimitive(self);
var exitPrimitive = /* @__PURE__ */ makePrimitive({
  op: "Exit",
  [evaluate](fiber) {
    fiber._stack.push(this);
    return this[args];
  },
  [contA](value, _, exit) {
    return succeed3(exit ?? exitSucceed(value));
  },
  [contE](cause, _, exit) {
    return succeed3(exit ?? exitFailCause(cause));
  }
});
var timeoutOrElse = /* @__PURE__ */ dual(2, (self, options) => flatMap3(timeoutOption(self, options.duration), (option) => isNone2(option) ? options.orElse() : succeed3(option.value)));
var timeoutErrorFromDuration = (duration) => new TimeoutError(`Operation timed out after '${format2(duration)}'`);
var timeout = /* @__PURE__ */ dual(2, (self, duration) => {
  const decoded = fromInputUnsafe(duration);
  return timeoutOrElse(self, {
    duration: decoded,
    orElse: () => fail3(timeoutErrorFromDuration(decoded))
  });
});
var timeoutOption = /* @__PURE__ */ dual(2, (self, duration) => raceFirst(asSome(self), as(sleep(duration), none2())));
var ScopeTypeId = "~effect/Scope";
var ScopeCloseableTypeId = "~effect/Scope/Closeable";
var scopeTag = /* @__PURE__ */ Service("effect/Scope");
var scopeClose = (self, exit_) => suspend(() => scopeCloseUnsafe(self, exit_) ?? void_);
var scopeCloseUnsafe = (self, exit_) => {
  if (self.state._tag === "Closed")
    return;
  const closed = {
    _tag: "Closed",
    exit: exit_
  };
  if (self.state._tag === "Empty") {
    self.state = closed;
    return;
  }
  const state = self.state;
  self.state = closed;
  if (state.finalizer !== undefined) {
    return state.finalizer(exit_);
  }
  const finalizers = state.finalizers;
  if (finalizers === undefined || finalizers.size === 0) {
    return;
  } else if (finalizers.size === 1) {
    return finalizers.values().next().value(exit_);
  }
  return scopeCloseFinalizers(self, finalizers, exit_);
};
var combineFinalizerCause = (exit_, finalizer) => exitIsSuccess(exit_) ? finalizer : catchCause(finalizer, (cause) => failCause(causeCombine(exit_.cause, cause)));
var scopeCloseFinalizers = /* @__PURE__ */ fnUntraced(function* (self, finalizers, exit_) {
  let exits = [];
  const fibers = [];
  const arr = Array.from(finalizers.values());
  const parent = getCurrentFiber();
  for (let i = arr.length - 1;i >= 0; i--) {
    const finalizer = arr[i];
    if (self.strategy === "sequential") {
      exits.push(yield* exit(finalizer(exit_)));
    } else {
      fibers.push(forkUnsafe(parent, finalizer(exit_), true, true, "inherit"));
    }
  }
  if (fibers.length > 0) {
    exits = yield* fiberAwaitAll(fibers);
  }
  return yield* exitAsVoidAll(exits);
});
var scopeForkUnsafe = (scope, finalizerStrategy) => {
  const newScope = scopeMakeUnsafe(finalizerStrategy);
  if (scope.state._tag === "Closed") {
    newScope.state = scope.state;
    return newScope;
  }
  const key = {};
  scopeAddFinalizerUnsafe(scope, key, (exit) => scopeClose(newScope, exit));
  scopeAddFinalizerUnsafe(newScope, key, (_) => sync(() => scopeRemoveFinalizerUnsafe(scope, key)));
  return newScope;
};
var scopeAddFinalizerExit = (scope, finalizer) => {
  return suspend(() => {
    if (scope.state._tag === "Closed") {
      return finalizer(scope.state.exit);
    }
    scopeAddFinalizerUnsafe(scope, {}, finalizer);
    return void_;
  });
};
var scopeAddFinalizer = (scope, finalizer) => scopeAddFinalizerExit(scope, constant(finalizer));
var scopeAddFinalizerUnsafe = (scope, key, finalizer) => {
  if (scope.state._tag === "Empty") {
    scope.state = {
      _tag: "Open",
      finalizerKey: key,
      finalizer,
      finalizers: undefined
    };
  } else if (scope.state._tag === "Open") {
    const state = scope.state;
    if (state.finalizer !== undefined) {
      state.finalizers = new Map([[state.finalizerKey, state.finalizer]]);
      state.finalizerKey = undefined;
      state.finalizer = undefined;
      state.finalizers.set(key, finalizer);
    } else if (state.finalizers === undefined) {
      state.finalizerKey = key;
      state.finalizer = finalizer;
    } else {
      state.finalizers.set(key, finalizer);
    }
  }
};
var scopeRemoveFinalizerUnsafe = (scope, key) => {
  if (scope.state._tag === "Open") {
    const state = scope.state;
    if (state.finalizerKey === key) {
      state.finalizerKey = undefined;
      state.finalizer = undefined;
    } else if (state.finalizers !== undefined) {
      state.finalizers.delete(key);
    }
  }
};
var scopeMakeUnsafe = (finalizerStrategy = "sequential") => ({
  [ScopeCloseableTypeId]: ScopeCloseableTypeId,
  [ScopeTypeId]: ScopeTypeId,
  strategy: finalizerStrategy,
  state: constScopeEmpty
});
var constScopeEmpty = {
  _tag: "Empty"
};
var scope = scopeTag;
var provideScope = /* @__PURE__ */ provideService(scopeTag);
var scoped = (self) => withFiber((fiber) => {
  const prev = fiber.context;
  const scope = scopeMakeUnsafe();
  fiber.setContext(add(fiber.context, scopeTag, scope));
  return onExitPrimitive(self, (exit) => {
    fiber.setContext(prev);
    return scopeCloseUnsafe(scope, exit);
  });
});
var scopedWith = (f) => suspend(() => {
  const scope = scopeMakeUnsafe();
  return onExit(f(scope), (exit) => suspend(() => scopeCloseUnsafe(scope, exit) ?? void_));
});
var acquireRelease = (acquire, release, options) => contextWith((context) => uninterruptibleMask((restore) => flatMap3(scope, (scope) => tap(options?.interruptible ? restore(acquire) : acquire, (a) => scopeAddFinalizerExit(scope, (exit) => provideContext(release(a, exit), context))))));
var addFinalizer = (finalizer) => flatMap3(scope, (scope) => contextWith((context) => scopeAddFinalizerExit(scope, (exit) => provideContext(finalizer(exit), context))));
var onExitPrimitive = /* @__PURE__ */ function() {
  const Proto = /* @__PURE__ */ makePrimitiveProto({
    op: "OnExit",
    [evaluate](fiber) {
      fiber._stack.push(this);
      return this.effect;
    },
    [contAll](fiber) {
      if (fiber.interruptible && this.interruptible !== true) {
        fiber._stack.push(setInterruptibleTrue);
        fiber.interruptible = false;
      }
    },
    [contA](value, _, exit) {
      exit ??= exitSucceed(value);
      const eff = this.onExit(exit);
      return eff ? flatMap3(eff, (_) => exit) : exit;
    },
    [contE](cause, _, exit) {
      exit ??= exitFailCause(cause);
      const eff = this.onExit(exit);
      return eff ? flatMap3(combineFinalizerCause(exit, eff), (_) => exit) : exit;
    }
  });
  const OnExitImpl = function(effect, onExit, interruptible) {
    this.effect = effect;
    this.onExit = onExit;
    this.interruptible = interruptible;
  };
  OnExitImpl.prototype = Proto;
  return function(effect, onExit, interruptible) {
    return new OnExitImpl(effect, onExit, interruptible);
  };
}();
var onExit = /* @__PURE__ */ dual(2, onExitPrimitive);
var ensuring = /* @__PURE__ */ dual(2, (self, finalizer) => onExit(self, (_) => finalizer));
var onExitFilter = /* @__PURE__ */ dual(3, (self, filter, f) => onExit(self, (exit) => {
  const b = filter(exit);
  return isFailure2(b) ? void_ : f(b.success, exit);
}));
var onError = /* @__PURE__ */ dual(2, (self, f) => onExitFilter(self, exitFilterCause, f));
var onErrorFilter = /* @__PURE__ */ dual(3, (self, filter, f) => onExit(self, (exit) => {
  if (exit._tag !== "Failure") {
    return void_;
  }
  const result = filter(exit.cause);
  return isFailure2(result) ? void_ : f(result.success, exit.cause);
}));
var onInterrupt = /* @__PURE__ */ dual(2, (self, finalizer) => onErrorFilter(causeFilterInterruptors, finalizer)(self));
var cached = (self) => sync(() => {
  const latch = makeLatchUnsafe(false);
  let started = false;
  let exit;
  const wait = flatMap3(latch.await, () => exit);
  return suspend(() => {
    if (exit !== undefined)
      return exit;
    if (started)
      return wait;
    started = true;
    return onExit(self, (result) => sync(() => {
      exit = result;
      latch.openUnsafe();
    }));
  });
});
var interrupt = /* @__PURE__ */ withFiber((fiber) => failCause(causeInterrupt(fiber.id)));
var uninterruptible = (self) => withFiber((fiber) => {
  if (!fiber.interruptible)
    return self;
  fiber.interruptible = false;
  fiber._stack.push(setInterruptibleTrue);
  return self;
});
var setInterruptible = /* @__PURE__ */ makePrimitive({
  op: "SetInterruptible",
  [contAll](fiber) {
    fiber.interruptible = this[args];
    if (fiber._interruptedCause && fiber.interruptible) {
      return () => failCause(fiber._interruptedCause);
    }
  }
});
var setInterruptibleTrue = /* @__PURE__ */ setInterruptible(true);
var setInterruptibleFalse = /* @__PURE__ */ setInterruptible(false);
var setFiberInterruptible = (fiber) => {
  fiber.interruptible = true;
  fiber._stack.push(setInterruptibleFalse);
  if (fiber._interruptedCause)
    return failCause(fiber._interruptedCause);
};
var fiberEnterUninterruptibleUnsafe = (fiber) => {
  const impl = fiber;
  if (!impl.interruptible)
    return;
  impl.interruptible = false;
  impl._stack.push(setInterruptibleTrue);
};
var fiberEnterInterruptibleUnsafe = (fiber) => {
  const impl = fiber;
  if (impl.interruptible)
    return;
  return setFiberInterruptible(impl);
};
var interruptible = (self) => withFiber((fiber) => {
  if (fiber.interruptible)
    return self;
  return setFiberInterruptible(fiber) ?? self;
});
var uninterruptibleMask = (f) => withFiber((fiber) => {
  if (!fiber.interruptible)
    return f(identity);
  fiber.interruptible = false;
  fiber._stack.push(setInterruptibleTrue);
  return f(interruptible);
});
var whileLoop = /* @__PURE__ */ makePrimitive({
  op: "While",
  [contA](value, fiber) {
    this[args].step(value);
    if (this[args].while()) {
      fiber._stack.push(this);
      return this[args].body();
    }
    return exitVoid;
  },
  [evaluate](fiber) {
    if (this[args].while()) {
      fiber._stack.push(this);
      return this[args].body();
    }
    return exitVoid;
  }
});
var forEach = /* @__PURE__ */ dual((args) => typeof args[1] === "function", (iterable, f, options) => suspend(() => {
  const concurrency = resolveConcurrency(options?.concurrency);
  if (concurrency === 1) {
    return forEachSequential(iterable, f, options);
  }
  const items = fromIterable(iterable);
  let length = items.length;
  if (length === 0) {
    return options?.discard ? void_ : succeed3([]);
  }
  const out = options?.discard ? undefined : new Array(length);
  const eff = forEachConcurrent({
    f,
    out
  }, items, {
    concurrency
  });
  return eff ? as(eff, out) : succeed3(out);
}));
var forEachSequential = (iterable, f, options) => suspend(() => {
  const out = options?.discard ? undefined : [];
  const iterator = iterable[Symbol.iterator]();
  let state = iterator.next();
  let index = 0;
  return as(whileLoop({
    while: () => !state.done,
    body: () => f(state.value, index++),
    step: (b) => {
      if (out)
        out.push(b);
      state = iterator.next();
    }
  }), out);
});
var resolveConcurrency = (concurrency) => concurrency === "unbounded" ? Number.POSITIVE_INFINITY : Math.max(1, concurrency ?? 1);
var iterateEager = () => (options) => {
  const onItem = options.onItem;
  const step = options.step;
  const runSequential = (state, items, index = 0, end = items.length) => {
    for (;index < end; index++) {
      const item = items[index];
      const effect = onItem(state, item, index);
      if (!effectIsExit(effect)) {
        return flatMap3(exit(effect), (itemExit) => step(state, item, itemExit, index) ?? runSequential(state, items, index + 1, end) ?? void_);
      }
      const terminal = step(state, item, effect, index);
      if (terminal)
        return terminal._tag === "Failure" ? terminal : undefined;
    }
  };
  return runSequential;
};
var iterateConcurrentImpl = (options) => {
  const onItem = options.onItem;
  const step = options.step;
  return (state, items, opts) => {
    let index = 0;
    const end = opts.end ?? items.length;
    const concurrency = opts.concurrency;
    let done = false;
    let parentFiber;
    let fibers;
    let resume;
    let interrupted = false;
    let terminal;
    let effect;
    const failDefect = (error) => {
      const defect = exitDie(error);
      terminal = defect;
      done = true;
      interrupted = true;
      return fibers && fibers.size > 0 ? flatMap3(uninterruptible(fiberInterruptAll(Array.from(fibers))), () => defect) : defect;
    };
    const go = () => {
      let paused = false;
      for (;!terminal && index < end; index++) {
        const item = items[index];
        const eff = effect ?? onItem(state, item, index);
        if (effectIsExit(eff)) {
          terminal = step(state, item, eff, index);
          if (terminal)
            break;
        } else if (!parentFiber) {
          return callback((cb) => {
            parentFiber = getCurrentFiber();
            fibers = new Set;
            effect = eff;
            resume = cb;
            let result;
            try {
              result = go();
            } catch (error) {
              return cb(failDefect(error));
            }
            if (result)
              return cb(result);
            return suspend(() => {
              terminal = exitVoid;
              interrupted = true;
              return fibers ? fiberInterruptAll(fibers) : void_;
            });
          });
        } else {
          effect = undefined;
          const fiber = forkUnsafe(parentFiber, eff, true, true, "inherit");
          if (fiber._exit) {
            terminal = step(state, item, fiber._exit, index);
            if (terminal)
              break;
            continue;
          }
          fibers.add(fiber);
          const currentIndex = index;
          fiber.addObserver((exit) => {
            fibers.delete(fiber);
            try {
              if (terminal) {
                if (!interrupted && exit._tag === "Failure") {
                  for (const reason of exit.cause.reasons) {
                    if (reason._tag === "Interrupt")
                      continue;
                    else if (terminal._tag === "Failure") {
                      terminal.cause.reasons.push(reason);
                    } else {
                      terminal = exitFailCause(causeFromReasons([reason]));
                    }
                  }
                }
              } else {
                const result = step(state, item, exit, currentIndex);
                if (result) {
                  terminal = result._tag === "Failure" ? exitFailCause(causeFromReasons(result.cause.reasons.slice())) : result;
                  go();
                }
              }
              if (paused) {
                const eff = go();
                if (eff)
                  resume(eff);
              } else if (done && fibers.size === 0) {
                resume(terminal ?? void_);
              }
            } catch (error) {
              resume(failDefect(error));
            }
          });
          if (fibers.size < concurrency)
            continue;
          paused = true;
          index++;
          return;
        }
      }
      done = true;
      if (terminal) {
        if (fibers && fibers.size > 0) {
          const annotations = fiberStackAnnotations(parentFiber);
          fibers.forEach((f) => f.interruptUnsafe(parentFiber.id, annotations));
          return;
        }
        if (resume || terminal._tag === "Failure") {
          return terminal;
        }
      } else if (resume) {
        if (!fibers) {
          return exitVoid;
        } else if (fibers.size === 0) {
          resume(void_);
        }
      }
    };
    return go();
  };
};
var iterateConcurrent = () => (options) => iterateConcurrentImpl(options);
var forEachConcurrent = /* @__PURE__ */ iterateConcurrentImpl({
  onItem(state, item, index) {
    return state.f(item, index);
  },
  step(state, _, exit, index) {
    if (exit._tag === "Failure")
      return exit;
    else if (state.out) {
      state.out[index] = exit.value;
    }
  }
});
var forkUnsafe = (parent, effect, immediate = false, daemon = false, uninterruptible = false) => {
  const parentRuntime = parent;
  const interruptible = uninterruptible === "inherit" ? parentRuntime.interruptible : !uninterruptible;
  const child = new FiberImpl(parentRuntime.context, interruptible);
  if (immediate) {
    child.evaluate(effect);
  } else {
    parentRuntime.currentDispatcher.scheduleTask(() => child.evaluate(effect), 0);
  }
  if (!daemon && !child._exit) {
    parentRuntime.children().add(child);
    child._parent = parentRuntime;
  }
  return child;
};
var forkIn = /* @__PURE__ */ dual((args) => isEffect(args[0]), (self, scope, options) => withFiber((parent) => {
  const fiber = forkUnsafe(parent, self, options?.startImmediately, true, options?.uninterruptible);
  if (!fiber._exit) {
    if (scope.state._tag !== "Closed") {
      const key = {};
      const finalizer = () => withFiberId((interruptor) => interruptor === fiber.id ? void_ : fiberInterrupt(fiber));
      scopeAddFinalizerUnsafe(scope, key, finalizer);
      fiber.addObserver(() => scopeRemoveFinalizerUnsafe(scope, key));
    } else {
      fiber.interruptUnsafe(parent.id, fiberStackAnnotations(parent));
    }
  }
  return succeed3(fiber);
}));
var forkScoped = /* @__PURE__ */ dual((args) => isEffect(args[0]), (self, options) => flatMap3(scope, (scope) => forkIn(self, scope, options)));
var runForkWith = (context) => (effect, options) => {
  const fiber = new FiberImpl(options?.scheduler ? add(context, Scheduler, options.scheduler) : context, options?.uninterruptible !== true);
  fiber.evaluate(effect);
  if (fiber._exit)
    return fiber;
  if (options?.signal) {
    if (options.signal.aborted) {
      fiber.interruptUnsafe();
    } else {
      const abort = () => fiber.interruptUnsafe();
      options.signal.addEventListener("abort", abort, {
        once: true
      });
      fiber.addObserver(() => options.signal.removeEventListener("abort", abort));
    }
  }
  if (options?.onFiberStart) {
    options.onFiberStart(fiber);
  }
  return fiber;
};
var fiberRunIn = /* @__PURE__ */ dual(2, (self, scope) => {
  if (self._exit) {
    return self;
  } else if (scope.state._tag === "Closed") {
    self.interruptUnsafe(self.id);
    return self;
  }
  const key = {};
  scopeAddFinalizerUnsafe(scope, key, () => fiberInterrupt(self));
  self.addObserver(() => scopeRemoveFinalizerUnsafe(scope, key));
  return self;
});
var runFork = /* @__PURE__ */ runForkWith(/* @__PURE__ */ empty2());
var runPromiseExitWith = (context) => {
  const runFork = runForkWith(context);
  return (effect, options) => {
    const fiber = runFork(effect, options);
    return new Promise((resolve) => {
      fiber.addObserver((exit) => resolve(exit));
    });
  };
};
var runPromiseWith = (context) => {
  const runPromiseExit = runPromiseExitWith(context);
  return (effect, options) => runPromiseExit(effect, options).then((exit) => {
    if (exit._tag === "Failure") {
      throw causeSquash(exit.cause);
    }
    return exit.value;
  });
};
var runPromise = /* @__PURE__ */ runPromiseWith(/* @__PURE__ */ empty2());
var runSyncExitWith = (context) => {
  const runFork = runForkWith(context);
  return (effect) => {
    if (effectIsExit(effect))
      return effect;
    const scheduler = new MixedScheduler("sync");
    const fiber = runFork(effect, {
      scheduler
    });
    fiber._dispatcher?.flush();
    return fiber._exit ?? exitDie(new AsyncFiberError(fiber));
  };
};
var runSyncExit = /* @__PURE__ */ runSyncExitWith(/* @__PURE__ */ empty2());
var runSyncWith = (context) => {
  const runSyncExit = runSyncExitWith(context);
  return (effect) => {
    const exit = runSyncExit(effect);
    if (exit._tag === "Failure")
      throw causeSquash(exit.cause);
    return exit.value;
  };
};
var runSync = /* @__PURE__ */ runSyncWith(/* @__PURE__ */ empty2());
var succeedTrue = /* @__PURE__ */ succeed3(true);
var succeedFalse = /* @__PURE__ */ succeed3(false);

class Latch {
  waiters = [];
  scheduled = undefined;
  _isOpen;
  constructor(isOpen) {
    this._isOpen = isOpen;
  }
  scheduleUnsafe(fiber) {
    if (this.waiters.length === 0) {
      return succeedTrue;
    }
    if (this.scheduled === undefined) {
      this.scheduled = this.waiters;
      fiber.currentDispatcher.scheduleTask(this.flushScheduled, 0);
    } else {
      for (let i = 0;i < this.waiters.length; i++) {
        this.scheduled.push(this.waiters[i]);
      }
    }
    this.waiters = [];
    return succeedTrue;
  }
  flushScheduled = () => {
    if (this.scheduled === undefined)
      return;
    const waiters = this.scheduled;
    this.scheduled = undefined;
    for (let i = 0;i < waiters.length; i++) {
      waiters[i](exitVoid);
    }
  };
  flushWaiters() {
    const waiters = this.waiters;
    this.waiters = [];
    this.flushScheduled();
    for (let i = 0;i < waiters.length; i++) {
      waiters[i](exitVoid);
    }
  }
  open = /* @__PURE__ */ withFiber((fiber) => {
    if (this._isOpen)
      return succeedFalse;
    this._isOpen = true;
    return this.scheduleUnsafe(fiber);
  });
  release = /* @__PURE__ */ withFiber((fiber) => this._isOpen ? succeedFalse : this.scheduleUnsafe(fiber));
  openUnsafe() {
    if (this._isOpen)
      return false;
    this._isOpen = true;
    this.flushWaiters();
    return true;
  }
  await = /* @__PURE__ */ callback((resume) => {
    if (this._isOpen) {
      return resume(void_);
    }
    this.waiters.push(resume);
    return sync(() => {
      let index = this.waiters.indexOf(resume);
      if (index !== -1) {
        this.waiters.splice(index, 1);
      } else if (this.scheduled !== undefined) {
        index = this.scheduled.indexOf(resume);
        if (index !== -1) {
          this.scheduled.splice(index, 1);
        }
      }
    });
  });
  closeUnsafe() {
    if (!this._isOpen)
      return false;
    this._isOpen = false;
    return true;
  }
  close = /* @__PURE__ */ sync(() => this.closeUnsafe());
  whenOpen = (self) => flatMap3(this.await, () => self);
  isOpen() {
    return this._isOpen;
  }
}
var makeLatchUnsafe = (open) => new Latch(open ?? false);
var bigint02 = /* @__PURE__ */ BigInt(0);
var NoopSpanProto = {
  _tag: "Span",
  spanId: "noop",
  traceId: "noop",
  sampled: false,
  status: {
    _tag: "Ended",
    startTime: bigint02,
    endTime: bigint02,
    exit: exitVoid
  },
  attributes: /* @__PURE__ */ new Map,
  links: [],
  kind: "internal",
  attribute() {},
  event() {},
  end() {},
  addLinks() {}
};
var noopSpan = (options) => Object.assign(Object.create(NoopSpanProto), options);
var filterDisablePropagation = (span) => {
  if (!span)
    return none2();
  return get(span.annotations, DisablePropagation) ? span._tag === "Span" ? filterDisablePropagation(getOrUndefined(span.parent)) : none2() : some2(span);
};
var makeSpanUnsafe = (fiber, name, options) => {
  const disablePropagation = !fiber.getRef(TracerEnabled) || options?.annotations && get(options.annotations, DisablePropagation);
  const parent = options?.parent !== undefined ? some2(options.parent) : options?.root ? none2() : filterDisablePropagation(fiber.cache.span);
  let span;
  if (disablePropagation) {
    span = noopSpan({
      name,
      parent,
      annotations: add(options?.annotations ?? empty2(), DisablePropagation, true)
    });
  } else {
    const tracer = fiber.getRef(Tracer);
    const clock = fiber.getRef(ClockRef);
    const timingEnabled = fiber.getRef(TracerTimingEnabled);
    const annotationsFromEnv = fiber.getRef(TracerSpanAnnotations);
    const linksFromEnv = fiber.getRef(TracerSpanLinks);
    const level = options?.level ?? fiber.getRef(CurrentTraceLevel);
    const links = options?.links !== undefined ? [...linksFromEnv, ...options.links] : linksFromEnv.length === 0 ? [] : linksFromEnv.slice();
    span = tracer.span({
      name,
      parent,
      annotations: options?.annotations ?? empty2(),
      links,
      startTime: timingEnabled ? clock.currentTimeNanosUnsafe() : bigint02,
      kind: options?.kind ?? "internal",
      root: options?.root ?? isNone2(parent),
      sampled: options?.sampled ?? (isSome2(parent) && parent.value.sampled === false ? false : !isLogLevelGreaterThan(fiber.getRef(MinimumTraceLevel), level))
    });
    for (const key in annotationsFromEnv) {
      span.attribute(key, annotationsFromEnv[key]);
    }
    if (options?.attributes !== undefined) {
      for (const key in options.attributes) {
        span.attribute(key, options.attributes[key]);
      }
    }
  }
  return span;
};
var provideSpanStackFrame = (name, stack) => {
  stack = typeof stack === "function" ? stack : constUndefined;
  return updateService(CurrentStackFrame, (parent) => ({
    name,
    stack,
    parent
  }));
};
var endSpan = (span, exit, clock, timingEnabled) => sync(() => {
  if (span.status._tag === "Ended")
    return;
  span.end(timingEnabled ? clock.currentTimeNanosUnsafe() : bigint02, exit);
});
var useSpan = (name, ...args) => {
  const options = args.length === 1 ? undefined : args[0];
  const evaluate = args[args.length - 1];
  return withFiber((fiber) => {
    const span = makeSpanUnsafe(fiber, name, options);
    const clock = fiber.getRef(ClockRef);
    const timingEnabled = fiber.getRef(TracerTimingEnabled);
    return onExit(suspend(() => internalCall(() => evaluate(span))), (exit) => endSpan(span, exit, clock, timingEnabled));
  });
};
var provideParentSpan = /* @__PURE__ */ provideService(ParentSpan);
var withParentSpan = function() {
  const dataFirst = isEffect(arguments[0]);
  const span = dataFirst ? arguments[1] : arguments[0];
  let options = dataFirst ? arguments[2] : arguments[1];
  let provideStackFrame = identity;
  if (span._tag === "Span") {
    options = addSpanStackTrace(options);
    provideStackFrame = provideSpanStackFrame(span.name, options?.captureStackTrace);
  }
  if (dataFirst) {
    return provideParentSpan(provideStackFrame(arguments[0]), span);
  }
  return (self) => provideParentSpan(provideStackFrame(self), span);
};
var ClockRef = /* @__PURE__ */ Reference("effect/Clock", {
  defaultValue: () => new ClockImpl
});
var MAX_TIMER_MILLIS = 2 ** 31 - 1;

class ClockImpl {
  currentTimeMillisUnsafe() {
    return Date.now();
  }
  currentTimeMillis = /* @__PURE__ */ sync(() => this.currentTimeMillisUnsafe());
  currentTimeNanosUnsafe() {
    return wallTimeNanos();
  }
  currentTimeNanos = /* @__PURE__ */ sync(() => this.currentTimeNanosUnsafe());
  monotonicTimeNanosUnsafe() {
    return monotonicNowNanos();
  }
  monotonicTimeNanos = /* @__PURE__ */ sync(() => this.monotonicTimeNanosUnsafe());
  sleep(duration) {
    return this.sleepMillis(toMillis(duration));
  }
  sleepMillis(millis) {
    if (millis <= 0)
      return yieldNow;
    else if (!Number.isFinite(millis))
      return never;
    return callback((resume) => {
      const continuation = millis > MAX_TIMER_MILLIS ? this.sleepMillis(millis - MAX_TIMER_MILLIS) : void_;
      const handle = setTimeout(() => resume(continuation), Math.min(millis, MAX_TIMER_MILLIS));
      return sync(() => clearTimeout(handle));
    });
  }
}
var nanosPerMilli = /* @__PURE__ */ BigInt(1e6);
var monotonicNowNanos = /* @__PURE__ */ function() {
  const processHrtime = globalThis.process?.hrtime;
  if (typeof processHrtime?.bigint === "function") {
    return () => processHrtime.bigint();
  }
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return () => BigInt(Math.round(performance.now() * 1e6));
  }
  let previous = /* @__PURE__ */ BigInt(0);
  return () => {
    const current = BigInt(Date.now()) * nanosPerMilli;
    if (current > previous) {
      previous = current;
    }
    return previous;
  };
}();
var wallTimeNanos = /* @__PURE__ */ function() {
  const reanchorThresholdNanos = /* @__PURE__ */ BigInt(1e9);
  let origin;
  return () => {
    const monotonic = monotonicNowNanos();
    const wall = BigInt(Date.now()) * nanosPerMilli;
    if (origin === undefined) {
      origin = wall - monotonic;
    } else {
      const projected = origin + monotonic;
      const skew = wall > projected ? wall - projected : projected - wall;
      if (skew > reanchorThresholdNanos) {
        origin = wall - monotonic;
      }
    }
    return origin + monotonic;
  };
}();
var clockWith = (f) => withFiber((fiber) => f(fiber.getRef(ClockRef)));
var sleep = (duration) => clockWith((clock) => clock.sleep(fromInputUnsafe(duration)));
var currentTimeMillis = /* @__PURE__ */ clockWith((clock) => clock.currentTimeMillis);
var TimeoutErrorTypeId = "~effect/Cause/TimeoutError";
class TimeoutError extends (/* @__PURE__ */ TaggedError("TimeoutError")) {
  [TimeoutErrorTypeId] = TimeoutErrorTypeId;
  constructor(message) {
    super({
      message
    });
  }
}
var AsyncFiberErrorTypeId = "~effect/Cause/AsyncFiberError";
class AsyncFiberError extends (/* @__PURE__ */ TaggedError("AsyncFiberError")) {
  [AsyncFiberErrorTypeId] = AsyncFiberErrorTypeId;
  constructor(fiber) {
    super({
      message: "An asynchronous Effect was executed with Effect.runSync",
      fiber
    });
  }
}
var UnknownErrorTypeId = "~effect/Cause/UnknownError";
class UnknownError extends (/* @__PURE__ */ TaggedError("UnknownError")) {
  [UnknownErrorTypeId] = UnknownErrorTypeId;
  constructor(cause, message) {
    super({
      message,
      cause
    });
  }
}
var ConsoleRef = /* @__PURE__ */ Reference("effect/Console", {
  defaultValue: () => globalThis.console
});
var logLevelToOrder = (level) => {
  switch (level) {
    case "All":
      return Number.MIN_SAFE_INTEGER;
    case "Fatal":
      return 50000;
    case "Error":
      return 40000;
    case "Warn":
      return 30000;
    case "Info":
      return 20000;
    case "Debug":
      return 1e4;
    case "Trace":
      return 0;
    case "None":
      return Number.MAX_SAFE_INTEGER;
  }
};
var LogLevelOrder = /* @__PURE__ */ mapInput(Number2, logLevelToOrder);
var isLogLevelGreaterThan = /* @__PURE__ */ isGreaterThan(LogLevelOrder);
var CurrentLoggers = /* @__PURE__ */ Reference("effect/Logger/CurrentLoggers", {
  defaultValue: () => new Set([defaultLogger, tracerLogger])
});
var LogToStderr = /* @__PURE__ */ Reference("effect/Logger/LogToStderr", {
  defaultValue: constFalse
});
var LoggerTypeId = "~effect/Logger";
var LoggerProto = {
  [LoggerTypeId]: {
    _Message: identity,
    _Output: identity
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var loggerMake = (log) => {
  const self = Object.create(LoggerProto);
  self.log = log;
  return self;
};
var formatLabel = (key) => key.replace(/[\s="]/g, "_");
var formatLogSpan = (self, now) => {
  const label = formatLabel(self[0]);
  return `${label}=${now - self[1]}ms`;
};
var logWithLevel = (level) => (...message) => {
  let cause = undefined;
  for (let i = 0, len = message.length;i < len; i++) {
    const msg = message[i];
    if (isCause(msg)) {
      if (cause) {
        message.splice(i, 1);
      } else {
        message = message.slice(0, i).concat(message.slice(i + 1));
      }
      cause = cause ? causeFromReasons(cause.reasons.concat(msg.reasons)) : msg;
      i--;
    }
  }
  if (cause === undefined) {
    cause = causeEmpty;
  }
  return withFiber((fiber) => {
    const logLevel = level ?? fiber.cache.logLevel;
    if (isLogLevelGreaterThan(fiber.cache.minimumLogLevel, logLevel)) {
      return void_;
    }
    const clock = fiber.getRef(ClockRef);
    const loggers = fiber.getRef(CurrentLoggers);
    if (loggers.size > 0) {
      const date = new Date(clock.currentTimeMillisUnsafe());
      for (const logger of loggers) {
        logger.log({
          cause,
          fiber,
          date,
          logLevel,
          message
        });
      }
    }
    return void_;
  });
};
var colors = {
  bold: "1",
  red: "31",
  green: "32",
  yellow: "33",
  blue: "34",
  cyan: "36",
  white: "37",
  gray: "90",
  black: "30",
  bgBrightRed: "101"
};
var logLevelColors = {
  None: [],
  All: [],
  Trace: [colors.gray],
  Debug: [colors.blue],
  Info: [colors.green],
  Warn: [colors.yellow],
  Error: [colors.red],
  Fatal: [colors.bgBrightRed, colors.black]
};
var defaultDateFormat = (date) => `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}.${date.getMilliseconds().toString().padStart(3, "0")}`;
var defaultLogger = /* @__PURE__ */ loggerMake(({
  cause,
  date,
  fiber,
  logLevel,
  message
}) => {
  const message_ = Array.isArray(message) ? message.slice() : [message];
  if (cause.reasons.length > 0) {
    message_.push(causePretty(cause));
  }
  const now = date.getTime();
  const spans = fiber.getRef(CurrentLogSpans);
  let spanString = "";
  for (const span of spans) {
    spanString += ` ${formatLogSpan(span, now)}`;
  }
  const annotations = fiber.getRef(CurrentLogAnnotations);
  if (Object.keys(annotations).length > 0) {
    message_.push(annotations);
  }
  const console = fiber.getRef(ConsoleRef);
  const log = fiber.getRef(LogToStderr) ? console.error : console.log;
  log(`[${defaultDateFormat(date)}] ${logLevel.toUpperCase()} (#${fiber.id})${spanString}:`, ...message_);
});
var tracerLogger = /* @__PURE__ */ loggerMake(({
  cause,
  fiber,
  logLevel,
  message
}) => {
  const clock = fiber.getRef(ClockRef);
  const annotations = fiber.getRef(CurrentLogAnnotations);
  const span = fiber.cache.span;
  if (span === undefined || span._tag === "ExternalSpan")
    return;
  const attributes = {};
  for (const [key, value] of Object.entries(annotations)) {
    assignProperty(attributes, key, value);
  }
  attributes["effect.fiberId"] = fiber.id;
  attributes["effect.logLevel"] = logLevel.toUpperCase();
  if (cause.reasons.length > 0) {
    attributes["effect.cause"] = causePretty(cause);
  }
  span.event(toStringUnknown(Array.isArray(message) && message.length === 1 ? message[0] : message), clock.currentTimeNanosUnsafe(), attributes);
});
var reportCauseUnsafe = (fiber, cause, defectsOnly) => {
  const reporters = fiber.getRef(CurrentErrorReporters);
  if (reporters.size === 0)
    return;
  if (defectsOnly && !hasDies(cause))
    return;
  const opts = {
    cause,
    fiber,
    timestamp: fiber.getRef(ClockRef).currentTimeNanosUnsafe()
  };
  reporters.forEach((reporter) => reporter.report(opts));
};

// node_modules/effect/dist/Exit.js
var succeed4 = exitSucceed;
var failCause2 = exitFailCause;
var fail4 = exitFail;
var void_2 = exitVoid;
var isSuccess3 = exitIsSuccess;
var isFailure3 = exitIsFailure;

// node_modules/effect/dist/Deferred.js
var TypeId5 = "~effect/Deferred";
var DeferredProto = {
  [TypeId5]: {
    _A: identity,
    _E: identity
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var DeferredImpl = function() {
  this.resumes = undefined;
  this.effect = undefined;
};
DeferredImpl.prototype = DeferredProto;
var makeUnsafe2 = () => new DeferredImpl;
var _await = (self) => callback((resume) => {
  if (self.effect)
    return resume(self.effect);
  self.resumes ??= [];
  self.resumes.push(resume);
  return sync(() => {
    const resumes = self.resumes;
    if (resumes === undefined)
      return;
    const index = resumes.indexOf(resume);
    if (index >= 0)
      resumes.splice(index, 1);
  });
});
var completeWith = /* @__PURE__ */ dual(2, (self, effect) => sync(() => doneUnsafe(self, effect)));
var done2 = completeWith;
var isDone2 = (self) => sync(() => isDoneUnsafe(self));
var isDoneUnsafe = (self) => self.effect !== undefined;
var doneUnsafe = (self, effect) => {
  if (self.effect)
    return false;
  self.effect = effect;
  if (self.resumes) {
    const resumes = self.resumes;
    self.resumes = undefined;
    for (let i = 0;i < resumes.length; i++) {
      resumes[i](effect);
    }
  }
  return true;
};

// node_modules/effect/dist/References.js
var CurrentLogAnnotations2 = CurrentLogAnnotations;
var CurrentLogSpans2 = CurrentLogSpans;
var MinimumLogLevel2 = MinimumLogLevel;

// node_modules/effect/dist/Scope.js
var Scope = scopeTag;
var makeUnsafe3 = scopeMakeUnsafe;
var provide = provideScope;
var addFinalizerExit = scopeAddFinalizerExit;
var addFinalizer2 = scopeAddFinalizer;
var forkUnsafe2 = scopeForkUnsafe;
var close = scopeClose;
var closeUnsafe = scopeCloseUnsafe;

// node_modules/effect/dist/Layer.js
var TypeId6 = "~effect/Layer";
var MemoMapTypeId = "~effect/Layer/MemoMap";
var memoMapReuse = (entry, scope) => {
  entry.observers++;
  return andThen(scopeAddFinalizerExit(scope, (exit) => entry.finalizer(exit)), entry.effect);
};
var LayerProto = {
  [TypeId6]: {
    _ROut: identity,
    _E: identity,
    _RIn: identity
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var fromBuildUnsafe = (build) => {
  const self = Object.create(LayerProto);
  self.build = build;
  return self;
};
var fromBuild = (build) => fromBuildUnsafe((memoMap, scope) => {
  const layerScope = forkUnsafe2(scope);
  return onExit(build(memoMap, layerScope), (exit) => exit._tag === "Failure" ? close(layerScope, exit) : void_);
});
var fromBuildMemo = (build) => {
  const self = fromBuild((memoMap, scope) => memoMap.getOrElseMemoize(self, scope, build));
  return self;
};
var memoMapBuild = (memoMap, layer, scope, build) => {
  const layerScope = makeUnsafe3();
  const deferred = makeUnsafe2();
  const entry = {
    observers: 1,
    effect: _await(deferred),
    finalizer: (exit) => suspend(() => {
      entry.observers--;
      if (entry.observers === 0) {
        memoMap.map.delete(layer);
        return close(layerScope, exit);
      }
      return void_;
    })
  };
  memoMap.map.set(layer, entry);
  return scopeAddFinalizerExit(scope, entry.finalizer).pipe(flatMap3(() => build(memoMap, layerScope)), onExit((exit) => {
    entry.effect = exit;
    return done2(deferred, exit);
  }));
};

class MemoMapImpl {
  get [MemoMapTypeId]() {
    return MemoMapTypeId;
  }
  parent;
  constructor(parent) {
    this.parent = parent;
  }
  map = /* @__PURE__ */ new Map;
  get(layer, scope) {
    const local = this.map.get(layer);
    if (local) {
      return memoMapReuse(local, scope);
    }
    return this.parent?.get(layer, scope);
  }
  getOrElseMemoize(layer, scope, build) {
    return suspend(() => {
      const existing = this.get(layer, scope);
      if (existing) {
        return existing;
      }
      return memoMapBuild(this, layer, scope, build);
    });
  }
}
var makeMemoMapUnsafe = () => new MemoMapImpl;
var forkMemoMapUnsafe = (parent) => new MemoMapImpl(parent);
class CurrentMemoMap extends (/* @__PURE__ */ Service()("effect/Layer/CurrentMemoMap")) {
  static forkOrCreate(self) {
    const current = getOrUndefined2(self, CurrentMemoMap);
    return current ? forkMemoMapUnsafe(current) : makeMemoMapUnsafe();
  }
}
var buildWithMemoMap = /* @__PURE__ */ dual(3, (self, memoMap, scope) => provideService(map5(self.build(memoMap, scope), add(CurrentMemoMap, memoMap)), CurrentMemoMap, memoMap));
var build = (self) => withFiber((fiber) => buildWithMemoMap(self, CurrentMemoMap.forkOrCreate(fiber.context), getUnsafe(fiber.context, Scope)));
var buildWithScope = /* @__PURE__ */ dual(2, (self, scope) => withFiber((fiber) => buildWithMemoMap(self, CurrentMemoMap.forkOrCreate(fiber.context), scope)));
var succeed5 = function() {
  if (arguments.length === 1) {
    return (resource) => succeedContext(make3(arguments[0], resource));
  }
  return succeedContext(make3(arguments[0], arguments[1]));
};
var succeedContext = (context) => fromBuildUnsafe(constant(succeed3(context)));
var effect = function() {
  if (arguments.length === 1) {
    return (effect) => effectImpl(arguments[0], effect);
  }
  return effectImpl(arguments[0], arguments[1]);
};
var effectImpl = (service, effect) => effectContext(map5(effect, (value) => make3(service, value)));
var effectContext = (effect) => fromBuildMemo((_, scope) => provide(effect, scope));
var effectDiscard = (effect) => effectContext(as(effect, empty2()));
var unwrapKey = /* @__PURE__ */ Service("effect/Layer/unwrap");
var unwrap = (self) => flatMap4(effect(unwrapKey)(self), get(unwrapKey));
var mergeAllEffect = (layers, memoMap, scope) => {
  const parentScope = forkUnsafe2(scope, "parallel");
  return forEach(layers, (layer) => layer.build(memoMap, forkUnsafe2(parentScope, "sequential")), {
    concurrency: layers.length
  }).pipe(map5((context) => mergeAll(...context)));
};
var mergeAll2 = (...layers) => fromBuild((memoMap, scope) => mergeAllEffect(layers, memoMap, scope));
var merge2 = /* @__PURE__ */ dual(2, (self, that) => mergeAll2(self, ...Array.isArray(that) ? that : [that]));
var provideWith = (self, that, f) => fromBuild((memoMap, scope) => flatMap3(Array.isArray(that) ? mergeAllEffect(that, memoMap, scope) : that.build(memoMap, scope), (context) => self.build(memoMap, scope).pipe(provideContext(context), map5((merged) => f(merged, context)))));
var provide2 = /* @__PURE__ */ dual(2, (self, that) => provideWith(self, that, identity));
var provideMerge = /* @__PURE__ */ dual(2, (self, that) => provideWith(self, that, (self, that) => merge(that, self)));
var flatMap4 = /* @__PURE__ */ dual(2, (self, f) => fromBuild((memoMap, scope) => flatMap3(self.build(memoMap, scope), (context) => f(context).build(memoMap, scope))));
var launch = (self) => scoped(andThen(build(self), never));

// node_modules/effect/dist/Cause.js
var isFailReason2 = isFailReason;
var fromReasons = causeFromReasons;
var fail5 = causeFail;
var makeDieReason = (defect) => new Die(defect);
var hasInterruptsOnly2 = hasInterruptsOnly;
var map6 = causeMap;
var squash = causeSquash;
var hasInterrupts2 = hasInterrupts;
var isNoSuchElementError2 = isNoSuchElementError;
var isDone3 = isDone;
var Done2 = Done;
var done3 = done;
var UnknownError2 = UnknownError;
class StackTrace extends (/* @__PURE__ */ Service()("effect/Cause/StackTrace")) {
}

// node_modules/effect/dist/Clock.js
var Clock = ClockRef;

// node_modules/effect/dist/Number.js
var Number3 = globalThis.Number;
var round = /* @__PURE__ */ dual(2, (self, precision) => {
  const factor = Math.pow(10, precision);
  return Math.round(self * factor) / factor;
});

// node_modules/effect/dist/internal/random.js
var nextBetween = (min, max, draw) => {
  const value = draw * (max - min) + min;
  if (value !== max || min >= max || !Number.isFinite(max)) {
    return value;
  }
  if (max === 0) {
    return -Number.MIN_VALUE;
  }
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, max);
  const bits = view.getBigUint64(0);
  view.setBigUint64(0, max > 0 ? bits - BigInt(1) : bits + BigInt(1));
  return view.getFloat64(0);
};

// node_modules/effect/dist/Pull.js
var catchDone = /* @__PURE__ */ dual(2, (effect, f) => catchCauseFilter(effect, filterDoneLeftover, (l) => f(l)));
var isDoneCause = (cause) => cause.reasons.some(isDoneFailure);
var isDoneFailure = (failure) => failure._tag === "Fail" && isDone3(failure.error);
var filterDone = (cause) => {
  let done;
  let hasFailure = false;
  for (const reason of cause.reasons) {
    if (isDoneFailure(reason)) {
      done ??= reason.error;
    } else if (reason._tag !== "Interrupt") {
      hasFailure = true;
    }
  }
  if (done === undefined)
    return fail2(cause);
  return hasFailure ? fail2(fromReasons(cause.reasons.filter((reason) => !isDoneFailure(reason)))) : succeed2(done);
};
var filterDoneLeftover = (cause) => {
  const done = filterDone(cause);
  return isFailure2(done) ? done : succeed2(done.success.value);
};
var doneExitFromCause = (cause) => {
  const halt = filterDone(cause);
  return !isFailure2(halt) ? succeed4(halt.success.value) : failCause2(halt.failure);
};
var matchEffect2 = /* @__PURE__ */ dual(2, (self, options) => matchCauseEffect(self, {
  onSuccess: options.onSuccess,
  onFailure: (cause) => {
    const halt = filterDone(cause);
    return !isFailure2(halt) ? options.onDone(halt.success.value) : options.onFailure(halt.failure);
  }
}));

// node_modules/effect/dist/internal/layer.js
var provideLayer = (self, layer, options) => scopedWith((scope) => flatMap3(options?.local ? buildWithMemoMap(layer, makeMemoMapUnsafe(), scope) : buildWithScope(layer, scope), (context) => provideContext(self, context)));
var provide3 = /* @__PURE__ */ dual((args) => isEffect(args[0]), (self, source, options) => isContext(source) ? provideContext(self, source) : provideLayer(self, Array.isArray(source) ? mergeAll2(...source) : source, options));

// node_modules/effect/dist/Effect.js
var isEffect2 = isEffect;
var forEach2 = forEach;
var whileLoop2 = whileLoop;
var promise2 = promise;
var tryPromise2 = tryPromise;
var succeed6 = succeed3;
var succeedNone2 = succeedNone;
var suspend2 = suspend;
var sync2 = sync;
var void_3 = void_;
var callback2 = callback;
var gen2 = gen;
var fail6 = fail3;
var failCause3 = failCause;
var failCauseSync2 = failCauseSync;
var die2 = die;
var try_3 = try_2;
var withFiber2 = withFiber;
var fromResult2 = fromResult;
var flatMap5 = flatMap3;
var andThen2 = andThen;
var tap2 = tap;
var result2 = result;
var exit2 = exit;
var map7 = map5;
var as2 = as;
var asVoid2 = asVoid;
var catch_2 = catch_;
var catchTag2 = catchTag;
var catchTags2 = catchTags;
var catchCause2 = catchCause;
var catchDefect2 = catchDefect;
var catchFilter2 = catchFilter;
var mapError2 = mapError;
var orDie2 = orDie;
var tapCause2 = tapCause;
var ignore2 = ignore;
var orElseSucceed2 = orElseSucceed;
var timeout2 = timeout;
var timeoutOrElse2 = timeoutOrElse;
var sleep2 = sleep;
var raceFirst2 = raceFirst;
var match6 = match5;
var matchCauseEffectEager2 = matchCauseEffectEager;
var matchCauseEffect2 = matchCauseEffect;
var matchEffect3 = matchEffect;
var context2 = context;
var contextWith2 = contextWith;
var provide4 = provide3;
var provideContext2 = provideContext;
var serviceOption2 = serviceOption;
var updateContext2 = updateContext;
var provideService2 = provideService;
var scope2 = scope;
var scoped2 = scoped;
var scopedWith2 = scopedWith;
var acquireRelease2 = acquireRelease;
var addFinalizer3 = addFinalizer;
var ensuring2 = ensuring;
var onError2 = onError;
var onExitPrimitive2 = onExitPrimitive;
var onExit2 = onExit;
var cached2 = cached;
var interrupt2 = interrupt;
var onInterrupt2 = onInterrupt;
var uninterruptible2 = uninterruptible;
var uninterruptibleMask2 = uninterruptibleMask;
var forever2 = forever;
var useSpan2 = useSpan;
var withParentSpan2 = withParentSpan;
var forkIn2 = forkIn;
var forkScoped2 = forkScoped;
var fiber2 = fiber;
var runFork2 = runFork;
var runForkWith2 = runForkWith;
var runPromise2 = runPromise;
var runSync2 = runSync;
var runSyncExit2 = runSyncExit;
var fnUntraced2 = fnUntraced;
var clockWith2 = clockWith;
var log = /* @__PURE__ */ logWithLevel();
var logError = /* @__PURE__ */ logWithLevel("Error");
var annotateLogs = /* @__PURE__ */ dual((args) => isEffect2(args[0]), (effect, ...args) => updateService(effect, CurrentLogAnnotations2, (annotations) => {
  const newAnnotations = args.length === 1 ? {
    ...annotations,
    ...args[0]
  } : {
    ...annotations
  };
  if (args.length === 1) {
    return newAnnotations;
  } else {
    assignProperty(newAnnotations, args[0], args[1]);
  }
  return newAnnotations;
}));
var withLogSpan = /* @__PURE__ */ dual(2, (effect, label) => flatMap3(currentTimeMillis, (now) => updateService(effect, CurrentLogSpans2, (spans) => {
  const span = [label, now];
  return [span, ...spans];
})));
var effectify = (fn, onError, onSyncError) => (...args) => callback2((resume) => {
  try {
    fn(...args, (err, result) => {
      if (err) {
        resume(fail6(onError ? onError(err, args) : err));
      } else {
        resume(succeed6(result));
      }
    });
  } catch (err) {
    resume(onSyncError ? fail6(onSyncError(err, args)) : die2(err));
  }
});
var mapEager2 = mapEager;
var mapErrorEager2 = mapErrorEager;
var flatMapEager2 = flatMapEager;
var catchEager2 = catchEager;
var fnUntracedEager2 = fnUntracedEager;

// node_modules/effect/dist/BigInt.js
var BigInt2 = globalThis.BigInt;
var toNumber = (b) => {
  if (b > BigInt2(Number.MAX_SAFE_INTEGER) || b < BigInt2(Number.MIN_SAFE_INTEGER)) {
    return none2();
  }
  return some2(Number(b));
};

// node_modules/effect/dist/ByteSize.js
var bigint03 = /* @__PURE__ */ BigInt(0);
var bigint12 = /* @__PURE__ */ BigInt(1);
var decimalBase = /* @__PURE__ */ BigInt(1000);
var binaryBase = /* @__PURE__ */ BigInt(1024);
var decimalUnits = [{
  symbol: "B",
  factor: bigint12,
  names: ["B", "byte", "bytes"]
}, {
  symbol: "kB",
  factor: decimalBase,
  names: ["kB", "kilobyte", "kilobytes"]
}, {
  symbol: "MB",
  factor: decimalBase ** /* @__PURE__ */ BigInt(2),
  names: ["MB", "megabyte", "megabytes"]
}, {
  symbol: "GB",
  factor: decimalBase ** /* @__PURE__ */ BigInt(3),
  names: ["GB", "gigabyte", "gigabytes"]
}, {
  symbol: "TB",
  factor: decimalBase ** /* @__PURE__ */ BigInt(4),
  names: ["TB", "terabyte", "terabytes"]
}, {
  symbol: "PB",
  factor: decimalBase ** /* @__PURE__ */ BigInt(5),
  names: ["PB", "petabyte", "petabytes"]
}, {
  symbol: "EB",
  factor: decimalBase ** /* @__PURE__ */ BigInt(6),
  names: ["EB", "exabyte", "exabytes"]
}, {
  symbol: "ZB",
  factor: decimalBase ** /* @__PURE__ */ BigInt(7),
  names: ["ZB", "zettabyte", "zettabytes"]
}, {
  symbol: "YB",
  factor: decimalBase ** /* @__PURE__ */ BigInt(8),
  names: ["YB", "yottabyte", "yottabytes"]
}, {
  symbol: "RB",
  factor: decimalBase ** /* @__PURE__ */ BigInt(9),
  names: ["RB", "ronnabyte", "ronnabytes"]
}, {
  symbol: "QB",
  factor: decimalBase ** /* @__PURE__ */ BigInt(10),
  names: ["QB", "quettabyte", "quettabytes"]
}];
var binaryUnits = [decimalUnits[0], {
  symbol: "KiB",
  factor: binaryBase,
  names: ["KiB", "kibibyte", "kibibytes"]
}, {
  symbol: "MiB",
  factor: binaryBase ** /* @__PURE__ */ BigInt(2),
  names: ["MiB", "mebibyte", "mebibytes"]
}, {
  symbol: "GiB",
  factor: binaryBase ** /* @__PURE__ */ BigInt(3),
  names: ["GiB", "gibibyte", "gibibytes"]
}, {
  symbol: "TiB",
  factor: binaryBase ** /* @__PURE__ */ BigInt(4),
  names: ["TiB", "tebibyte", "tebibytes"]
}, {
  symbol: "PiB",
  factor: binaryBase ** /* @__PURE__ */ BigInt(5),
  names: ["PiB", "pebibyte", "pebibytes"]
}, {
  symbol: "EiB",
  factor: binaryBase ** /* @__PURE__ */ BigInt(6),
  names: ["EiB", "exbibyte", "exbibytes"]
}, {
  symbol: "ZiB",
  factor: binaryBase ** /* @__PURE__ */ BigInt(7),
  names: ["ZiB", "zebibyte", "zebibytes"]
}, {
  symbol: "YiB",
  factor: binaryBase ** /* @__PURE__ */ BigInt(8),
  names: ["YiB", "yobibyte", "yobibytes"]
}];
var allUnits = [...decimalUnits, .../* @__PURE__ */ binaryUnits.slice(1)];
var unitsByName = /* @__PURE__ */ new Map(/* @__PURE__ */ allUnits.flatMap((unit) => unit.names.map((name) => [name, unit])));
var unitsBySymbol = /* @__PURE__ */ new Map(/* @__PURE__ */ allUnits.map((unit) => [unit.symbol, unit]));
var make6 = (value) => value;
var zero2 = /* @__PURE__ */ make6(bigint03);
var invalid2 = (message) => {
  throw new Error(`Invalid ByteSize: ${message}`);
};
var fromNumber = (input) => {
  if (!Number.isSafeInteger(input) || input < 0) {
    return invalid2(`expected a non-negative safe integer, received ${input}`);
  }
  return make6(BigInt(input));
};
var fromQuantity = (quantity, unit) => {
  if (typeof quantity === "bigint") {
    if (quantity < bigint03)
      return invalid2(`expected a non-negative quantity, received ${quantity}`);
    return make6(quantity * unit.factor);
  }
  const value = quantity * Number(unit.factor);
  if (!Number.isSafeInteger(value) || value < 0) {
    return invalid2(`expected an exact non-negative safe-integer byte result, received ${quantity} ${unit.symbol}`);
  }
  return make6(BigInt(value));
};
var parse = (input) => {
  const match = /^\s*(\d+)(?:\.(\d+))?\s*([A-Za-z]+)\s*$/.exec(input);
  if (match === null)
    return invalid2(`unsupported syntax ${JSON.stringify(input)}`);
  const unit = unitsByName.get(match[3]);
  if (unit === undefined)
    return invalid2(`unsupported unit ${JSON.stringify(match[3])}`);
  const fraction = match[2] ?? "";
  const scale = BigInt(10) ** BigInt(fraction.length);
  const numerator = BigInt(match[1] + fraction) * unit.factor;
  if (numerator % scale !== bigint03) {
    return invalid2(`${JSON.stringify(input)} does not represent an integral number of bytes`);
  }
  return make6(numerator / scale);
};
var fromInputUnsafe2 = (input) => {
  switch (typeof input) {
    case "bigint":
      if (input < bigint03)
        return invalid2(`expected a non-negative bigint, received ${input}`);
      return make6(input);
    case "number":
      return fromNumber(input);
    case "string":
      return parse(input);
  }
  return invalid2(`unsupported input ${input}`);
};
var fromInput = /* @__PURE__ */ liftThrowable(fromInputUnsafe2);
var bytes = (value) => typeof value === "bigint" ? fromInputUnsafe2(value) : fromNumber(value);
var unitConstructor = (symbol) => (value) => fromQuantity(value, unitsBySymbol.get(symbol));
var mebibytes = /* @__PURE__ */ unitConstructor("MiB");

// node_modules/effect/dist/PlatformError.js
var TypeId7 = "~effect/PlatformError";

class BadArgument extends (/* @__PURE__ */ TaggedError2("BadArgument")) {
  get message() {
    return `${this.module}.${this.method}${this.description ? `: ${this.description}` : ""}`;
  }
}

class SystemError extends Error3 {
  get message() {
    return `${this._tag}: ${this.module}.${this.method}${this.pathOrDescriptor !== undefined ? ` (${this.pathOrDescriptor})` : ""}${this.description ? `: ${this.description}` : ""}`;
  }
}

class PlatformError extends (/* @__PURE__ */ TaggedError2("PlatformError")) {
  constructor(reason) {
    if ("cause" in reason) {
      super({
        reason,
        cause: reason.cause
      });
    } else {
      super({
        reason
      });
    }
  }
  [TypeId7] = TypeId7;
  get message() {
    return this.reason.message;
  }
}
var systemError = (options) => new PlatformError(new SystemError(options));
var badArgument = (options) => new PlatformError(new BadArgument(options));

// node_modules/effect/dist/Fiber.js
var interrupt3 = fiberInterrupt;
var getCurrent = getCurrentFiber;
var runIn = fiberRunIn;

// node_modules/effect/dist/Latch.js
var makeUnsafe4 = makeLatchUnsafe;

// node_modules/effect/dist/MutableRef.js
var TypeId8 = "~effect/MutableRef";
var MutableRefProto = {
  [TypeId8]: TypeId8,
  ...PipeInspectableProto,
  toJSON() {
    return {
      _id: "MutableRef",
      current: toJson(this.current)
    };
  }
};
var make7 = (value) => {
  const ref = Object.create(MutableRefProto);
  ref.current = value;
  return ref;
};

// node_modules/effect/dist/MutableList.js
var Empty = /* @__PURE__ */ Symbol.for("effect/MutableList/Empty");
var make8 = () => ({
  head: undefined,
  tail: undefined,
  length: 0
});
var emptyBucket = () => ({
  array: [],
  mutable: true,
  offset: 0,
  next: undefined
});
var append2 = (self, message) => {
  if (!self.tail) {
    self.head = self.tail = emptyBucket();
  } else if (!self.tail.mutable) {
    self.tail.next = emptyBucket();
    self.tail = self.tail.next;
  }
  self.tail.array.push(message);
  self.length++;
};
var clear = (self) => {
  self.head = self.tail = undefined;
  self.length = 0;
};
var takeN = (self, n) => {
  n = normalize(n);
  if (n <= 0 || !self.head)
    return [];
  n = Math.min(n, self.length);
  if (n === self.length && self.head?.offset === 0 && !self.head.next) {
    const array = self.head.array;
    clear(self);
    return array;
  }
  const array = new Array(n);
  let index = 0;
  let chunk = self.head;
  while (chunk) {
    while (chunk.offset < chunk.array.length) {
      array[index++] = chunk.array[chunk.offset];
      if (chunk.mutable)
        chunk.array[chunk.offset] = undefined;
      chunk.offset++;
      if (index === n) {
        self.head = chunk;
        self.length -= n;
        if (self.length === 0)
          clear(self);
        return array;
      }
    }
    chunk = chunk.next;
  }
  clear(self);
  return array;
};
var take = (self) => {
  if (!self.head)
    return Empty;
  const message = self.head.array[self.head.offset];
  if (self.head.mutable)
    self.head.array[self.head.offset] = undefined;
  self.head.offset++;
  self.length--;
  if (self.head.offset === self.head.array.length) {
    if (self.head.next) {
      self.head = self.head.next;
    } else {
      clear(self);
    }
  }
  return message;
};

// node_modules/effect/dist/Queue.js
var TypeId9 = "~effect/Queue";
var EnqueueTypeId = "~effect/Queue/Enqueue";
var DequeueTypeId = "~effect/Queue/Dequeue";
var variance = {
  _A: identity,
  _E: identity
};
var QueueProto = {
  [TypeId9]: variance,
  [EnqueueTypeId]: variance,
  [DequeueTypeId]: variance,
  ...PipeInspectableProto,
  toJSON() {
    return {
      _id: "effect/Queue",
      state: this.state._tag,
      size: sizeUnsafe(this)
    };
  }
};
var make9 = (options) => withFiber((fiber) => {
  const self = Object.create(QueueProto);
  self.dispatcher = fiber.currentDispatcher;
  self.capacity = options?.capacity ?? Number.POSITIVE_INFINITY;
  self.strategy = options?.strategy ?? "suspend";
  self.messages = make8();
  self.scheduleRunning = false;
  self.state = {
    _tag: "Open",
    takers: new Set,
    offers: new Set,
    awaiters: new Set
  };
  return succeed3(self);
});
var bounded = (capacity) => make9({
  capacity
});
var offer = (self, message) => suspend(() => {
  if (self.state._tag !== "Open") {
    return exitFalse;
  } else if (self.messages.length >= self.capacity) {
    switch (self.strategy) {
      case "dropping":
        return exitFalse;
      case "suspend":
        if (self.capacity <= 0 && self.state.takers.size > 0) {
          append2(self.messages, message);
          releaseTakers(self);
          return exitTrue;
        }
        return offerRemainingSingle(self, message);
      case "sliding":
        take(self.messages);
        append2(self.messages, message);
        return exitTrue;
    }
  }
  append2(self.messages, message);
  scheduleReleaseTaker(self);
  return exitTrue;
});
var offerUnsafe = (self, message) => {
  if (self.state._tag !== "Open") {
    return false;
  } else if (self.messages.length >= self.capacity) {
    if (self.strategy === "sliding") {
      take(self.messages);
      append2(self.messages, message);
      return true;
    } else if (self.capacity <= 0 && self.state.takers.size > 0) {
      append2(self.messages, message);
      releaseTakers(self);
      return true;
    }
    return false;
  }
  append2(self.messages, message);
  scheduleReleaseTaker(self);
  return true;
};
var failCause4 = /* @__PURE__ */ dual(2, (self, cause) => sync(() => failCauseUnsafe(self, cause)));
var failCauseUnsafe = (self, cause) => {
  if (self.state._tag !== "Open") {
    return false;
  }
  const exit = exitFailCause(cause);
  const fail = exitZipRight(exit, exitFailDone);
  if (self.state.offers.size === 0 && self.messages.length === 0) {
    finalize(self, fail);
    return true;
  }
  self.state = {
    ...self.state,
    _tag: "Closing",
    exit: fail
  };
  return true;
};
var endUnsafe = (self) => failCauseUnsafe(self, causeFail(Done()));
var shutdown = (self) => sync(() => {
  if (self.state._tag === "Done") {
    return true;
  }
  clear(self.messages);
  const offers = self.state.offers;
  finalize(self, self.state._tag === "Open" ? exitInterrupt2 : self.state.exit);
  if (offers.size > 0) {
    for (const entry of offers) {
      if (entry._tag === "Single") {
        entry.resume(exitFalse);
      } else {
        entry.resume(exitSucceed(entry.remaining.slice(entry.offset)));
      }
    }
    offers.clear();
  }
  return true;
});
var takeAll2 = (self) => takeBetween(self, 1, Number.POSITIVE_INFINITY);
var takeBetween = (self, min, max) => {
  min = normalize(min);
  max = normalize(max);
  return suspend(() => takeBetweenUnsafe(self, min, max) ?? andThen(awaitTake(self), takeBetween(self, 1, max)));
};
var take2 = (self) => suspend(() => takeUnsafe(self) ?? andThen(awaitTake(self), take2(self)));
var poll = (self) => suspend(() => {
  const result = takeUnsafe(self);
  if (result === undefined) {
    return succeed3(none2());
  }
  if (result._tag === "Success") {
    return succeed3(some2(result.value));
  }
  return succeed3(none2());
});
var takeUnsafe = (self) => {
  if (self.state._tag === "Done") {
    return self.state.exit;
  }
  if (self.messages.length > 0) {
    const message = take(self.messages);
    releaseCapacity(self);
    return exitSucceed(message);
  } else if (self.capacity <= 0 && self.state.offers.size > 0) {
    const message = takeOfferUnsafe(self.state.offers);
    releaseCapacity(self);
    return exitSucceed(message);
  }
  return;
};
var sizeUnsafe = (self) => self.state._tag === "Done" ? 0 : self.messages.length;
var exitFalse = /* @__PURE__ */ exitSucceed(false);
var exitTrue = /* @__PURE__ */ exitSucceed(true);
var exitFailDone = /* @__PURE__ */ exitFail(/* @__PURE__ */ Done());
var exitInterrupt2 = /* @__PURE__ */ exitInterrupt();
var releaseTakers = (self) => {
  if (self.state._tag === "Done" || self.state.takers.size === 0) {
    return;
  }
  for (const taker of self.state.takers) {
    self.state.takers.delete(taker);
    taker(exitVoid);
    if (self.messages.length === 0) {
      break;
    }
  }
};
var scheduleReleaseTaker = (self) => {
  if (self.scheduleRunning || self.state._tag === "Done" || self.state.takers.size === 0) {
    return;
  }
  self.scheduleRunning = true;
  self.dispatcher.scheduleTask(() => {
    self.scheduleRunning = false;
    releaseTakers(self);
  }, 0);
};
var takeBetweenUnsafe = (self, min, max) => {
  if (self.state._tag === "Done") {
    return self.state.exit;
  } else if (max <= 0 || min <= 0) {
    return exitSucceed([]);
  } else if (self.capacity <= 0 && self.messages.length === 0 && self.state.offers.size > 0) {
    const messages = [takeOfferUnsafe(self.state.offers)];
    releaseCapacity(self);
    return exitSucceed(messages);
  }
  min = Math.min(min, self.capacity || 1);
  if (min <= self.messages.length) {
    const messages = takeN(self.messages, max);
    releaseCapacity(self);
    return exitSucceed(messages);
  }
};
var offerRemainingSingle = (self, message) => {
  return callback((resume) => {
    if (self.state._tag !== "Open") {
      return resume(exitFalse);
    }
    const entry = {
      _tag: "Single",
      message,
      resume
    };
    self.state.offers.add(entry);
    return sync(() => {
      if (self.state._tag === "Open") {
        self.state.offers.delete(entry);
      }
    });
  });
};
var takeOfferUnsafe = (offers) => {
  const entry = offers.values().next().value;
  if (entry._tag === "Single") {
    offers.delete(entry);
    entry.resume(exitTrue);
    return entry.message;
  }
  const message = entry.remaining[entry.offset++];
  if (entry.offset === entry.remaining.length) {
    offers.delete(entry);
    entry.resume(exitSucceed([]));
  }
  return message;
};
var releaseCapacity = (self) => {
  if (self.state._tag === "Done") {
    return isDoneCause(self.state.exit.cause);
  } else if (self.state.offers.size === 0) {
    if (self.state._tag === "Closing" && self.messages.length === 0) {
      finalize(self, self.state.exit);
      return isDoneCause(self.state.exit.cause);
    }
    return false;
  }
  for (const entry of self.state.offers) {
    let n = self.capacity - self.messages.length;
    if (n <= 0)
      break;
    else if (entry._tag === "Single") {
      append2(self.messages, entry.message);
      self.state.offers.delete(entry);
      entry.resume(exitTrue);
    } else {
      for (;entry.offset < entry.remaining.length; entry.offset++) {
        if (n === 0)
          return false;
        append2(self.messages, entry.remaining[entry.offset]);
        n--;
      }
      self.state.offers.delete(entry);
      entry.resume(exitSucceed([]));
    }
  }
  return false;
};
var awaitTake = (self) => callback((resume) => {
  if (self.state._tag === "Done") {
    return resume(self.state.exit);
  }
  self.state.takers.add(resume);
  return sync(() => {
    if (self.state._tag !== "Done") {
      self.state.takers.delete(resume);
    }
  });
});
var finalize = (self, exit) => {
  if (self.state._tag === "Done") {
    return;
  }
  const openState = self.state;
  self.state = {
    _tag: "Done",
    exit
  };
  for (const taker of openState.takers) {
    taker(exit);
  }
  openState.takers.clear();
  for (const awaiter of openState.awaiters) {
    awaiter(exit);
  }
  openState.awaiters.clear();
};

// node_modules/effect/dist/Semaphore.js
var makeUnsafe5 = (permits) => new SemaphoreImpl(permits);
var waitForPermits = (self, n, effect) => callback((resume) => {
  if (self.free >= n)
    return resume(effect);
  const observer = () => {
    if (self.free < n)
      return;
    self.waiters.delete(observer);
    resume(effect);
  };
  self.waiters.add(observer);
  return sync(() => {
    self.waiters.delete(observer);
  });
});

class SemaphoreImpl {
  waiters = /* @__PURE__ */ new Set;
  taken = 0;
  permits;
  constructor(permits) {
    this.permits = permits;
  }
  get free() {
    return this.permits - this.taken;
  }
  take(n) {
    const take = suspend(() => {
      if (this.free < n) {
        return waitForPermits(this, n, take);
      }
      this.taken += n;
      return succeed3(n);
    });
    return take;
  }
  takeIfAvailable(n) {
    return suspend(() => {
      if (this.free < n)
        return succeed3(false);
      this.taken += n;
      return succeed3(true);
    });
  }
  releaseUnsafe(fiber, n) {
    this.taken -= n;
    if (this.waiters.size > 0) {
      fiber.currentDispatcher.scheduleTask(() => {
        for (const observer of this.waiters) {
          if (this.free <= 0)
            break;
          observer();
        }
      }, 0);
    }
    return this.free;
  }
  resize(permits) {
    return withFiber((fiber) => {
      this.permits = permits;
      if (this.free < 0)
        return void_;
      this.releaseUnsafe(fiber, 0);
      return void_;
    });
  }
  release(n) {
    return withFiber((fiber) => succeed3(this.releaseUnsafe(fiber, n)));
  }
  get releaseAll() {
    return withFiber((fiber) => succeed3(this.releaseUnsafe(fiber, this.taken)));
  }
  withPermits(n) {
    return (self) => uninterruptibleMask((restore) => {
      const acquire = suspend(() => {
        if (this.free < n) {
          const wait = waitForPermits(this, n, void_);
          return flatMap3(restore(wait), () => acquire);
        }
        this.taken += n;
        return onExitPrimitive(restore(self), () => {
          this.releaseUnsafe(getCurrentFiber(), n);
          return;
        }, true);
      });
      return acquire;
    });
  }
  withPermit = /* @__PURE__ */ this.withPermits(1);
  withPermitsIfAvailable(n) {
    return (self) => uninterruptibleMask((restore) => {
      if (this.free < n)
        return succeedNone;
      this.taken += n;
      return onExitPrimitive(restore(asSome(self)), () => {
        this.releaseUnsafe(getCurrentFiber(), n);
        return;
      }, true);
    });
  }
}

// node_modules/effect/dist/Channel.js
var TypeId10 = "~effect/Channel";
var isChannel = (u) => hasProperty(u, TypeId10);
var ChannelProto = {
  [TypeId10]: {
    _Env: identity,
    _InErr: identity,
    _InElem: identity,
    _OutErr: identity,
    _OutElem: identity
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var fromTransform = (transform) => {
  const self = Object.create(ChannelProto);
  self.transform = (upstream, scope) => catchCause2(transform(upstream, scope), (cause) => succeed6(failCause3(cause)));
  return self;
};
var transformPull = (self, f) => fromTransform((upstream, scope) => flatMap5(toTransform(self)(upstream, scope), (pull) => f(pull, scope)));
var fromPull = (effect) => fromTransform((_, __) => effect);
var fromTransformBracket = (f) => fromTransform(fnUntraced2(function* (upstream, scope) {
  const closableScope = forkUnsafe2(scope);
  const onCause = (cause) => close(closableScope, doneExitFromCause(cause));
  const pull = yield* onError2(f(upstream, scope, closableScope), onCause);
  return onError2(pull, onCause);
}));
var toTransform = (channel) => channel.transform;
var asyncQueue = (scope, f, options) => make9({
  capacity: options?.bufferSize,
  strategy: options?.strategy
}).pipe(tap2((queue) => addFinalizer2(scope, shutdown(queue))), tap2((queue) => forkIn2(provide(f(queue), scope), scope)));
var callbackArray = (f, options) => fromTransform((_, scope) => map7(asyncQueue(scope, f, options), takeAll2));
var suspend3 = (evaluate) => fromTransform((upstream, scope) => suspend2(() => toTransform(evaluate())(upstream, scope)));
var empty3 = /* @__PURE__ */ fromPull(/* @__PURE__ */ succeed6(/* @__PURE__ */ done3()));
var fail7 = (error) => fromPull(succeed6(fail6(error)));
var fromReadableStream = (options) => fromTransform((_, scope) => readableStreamToPullUnsafe({
  scope,
  readable: options.evaluate(),
  onError: options.onError,
  releaseLockOnEnd: options.releaseLockOnEnd
}));
var readableStreamToPullUnsafe = (options) => {
  const reader = options.readable.getReader();
  const exit = options.exit ?? make7(undefined);
  const pull = suspend2(() => {
    if (exit.current)
      return exit.current;
    return matchCauseEffect2(tryPromise2({
      try: () => reader.read(),
      catch: options.onError
    }), {
      onFailure: (cause) => exit.current ?? failCause3(cause),
      onSuccess: ({
        done,
        value
      }) => {
        if (exit.current)
          return exit.current;
        return done ? done3() : succeed6(of(value));
      }
    });
  });
  return as2(addFinalizer2(options.scope, options.releaseLockOnEnd ? sync2(() => reader.releaseLock()) : promise2(() => reader.cancel().catch(constVoid))), pull);
};
var map8 = /* @__PURE__ */ dual(2, (self, f) => transformPull(self, (pull) => sync2(() => {
  let i = 0;
  return map7(pull, (o) => f(o, i++));
})));
var mapDone = /* @__PURE__ */ dual(2, (self, f) => mapDoneEffect(self, (o) => succeed6(f(o))));
var mapDoneEffect = /* @__PURE__ */ dual(2, (self, f) => transformPull(self, (pull) => succeed6(catchDone(pull, (done) => flatMap5(f(done), done3)))));
var merge3 = /* @__PURE__ */ dual((args) => isChannel(args[0]) && isChannel(args[1]), (left, right, options) => fromTransformBracket(fnUntraced2(function* (upstream, _scope, forkedScope) {
  const strategy = options?.haltStrategy ?? "both";
  const queue = yield* bounded(0);
  yield* addFinalizer2(forkedScope, shutdown(queue));
  let done = 0;
  function onExit(side, cause) {
    done++;
    if (!isDoneCause(cause)) {
      return failCause4(queue, cause);
    }
    switch (strategy) {
      case "both": {
        return done === 2 ? failCause4(queue, cause) : void_3;
      }
      case "left":
      case "right": {
        return side === strategy ? failCause4(queue, cause) : void_3;
      }
      case "either": {
        return failCause4(queue, cause);
      }
    }
  }
  const runSide = (side, channel, scope) => toTransform(channel)(upstream, scope).pipe(flatMap5((pull) => pull.pipe(flatMap5((value) => offer(queue, value)), forever2)), onError2((cause) => andThen2(close(scope, doneExitFromCause(cause)), onExit(side, cause))), forkIn2(forkedScope));
  yield* runSide("left", left, forkUnsafe2(forkedScope));
  yield* runSide("right", right, forkUnsafe2(forkedScope));
  return take2(queue);
})));
var splitLines = () => fromTransform((upstream, _scope) => sync2(() => {
  let stringBuilder = "";
  let midCRLF = false;
  let done = none2();
  function splitLinesArray(chunk) {
    const chunkBuilder = [];
    function pushLine(segment) {
      if (stringBuilder.length === 0) {
        chunkBuilder.push(segment);
      } else {
        chunkBuilder.push(stringBuilder + segment);
        stringBuilder = "";
      }
    }
    for (let i = 0;i < chunk.length; i++) {
      const str = chunk[i];
      if (str.length !== 0) {
        let from = 0;
        let indexOfCR = str.indexOf("\r");
        let indexOfLF = str.indexOf(`
`);
        if (midCRLF) {
          if (indexOfLF === 0) {
            from = 1;
            indexOfLF = str.indexOf(`
`, from);
          }
          midCRLF = false;
        }
        while (indexOfCR !== -1 || indexOfLF !== -1) {
          if (indexOfCR === -1 || indexOfLF !== -1 && indexOfLF < indexOfCR) {
            pushLine(str.substring(from, indexOfLF));
            from = indexOfLF + 1;
            indexOfLF = str.indexOf(`
`, from);
          } else {
            pushLine(str.substring(from, indexOfCR));
            if (str.length === indexOfCR + 1) {
              midCRLF = true;
              from = str.length;
              indexOfCR = -1;
            } else {
              from = indexOfCR + (indexOfLF === indexOfCR + 1 ? 2 : 1);
              indexOfCR = str.indexOf("\r", from);
              indexOfLF = str.indexOf(`
`, from);
            }
          }
        }
        stringBuilder = stringBuilder + str.substring(from);
      }
    }
    return isReadonlyArrayNonEmpty(chunkBuilder) ? chunkBuilder : null;
  }
  const pullOrFlush = suspend2(() => {
    if (done._tag === "Some") {
      return done3(done.value);
    }
    return matchEffect2(upstream, {
      onSuccess: loop,
      onFailure: failCause3,
      onDone: (leftover) => {
        done = some2(leftover);
        if (stringBuilder.length > 0) {
          const last = stringBuilder;
          stringBuilder = "";
          midCRLF = false;
          return succeed6([last]);
        }
        return done3(leftover);
      }
    });
  });
  function loop(chunk) {
    const lines = splitLinesArray(chunk);
    return lines !== null ? succeed6(lines) : pullOrFlush;
  }
  return pullOrFlush;
}));
var pipeTo = /* @__PURE__ */ dual(2, (self, that) => fromTransform((upstream, scope) => flatMap5(toTransform(self)(upstream, scope), (upstream) => toTransform(that)(upstream, scope))));
var unwrap2 = (channel) => fromTransform((upstream, scope) => {
  let pull;
  return succeed6(suspend2(() => {
    if (pull)
      return pull;
    return channel.pipe(provide(scope), flatMap5((channel) => toTransform(channel)(upstream, scope)), flatMap5((pull_) => pull = pull_));
  }));
});
var onExit3 = /* @__PURE__ */ dual(2, (self, finalizer) => fromTransformBracket((upstream, scope, forkedScope) => addFinalizerExit(forkedScope, finalizer).pipe(andThen2(toTransform(self)(upstream, scope)))));
var ensuring3 = /* @__PURE__ */ dual(2, (self, finalizer) => onExit3(self, (_) => finalizer));
var runWith = (self, f, onHalt) => suspend2(() => {
  const scope = makeUnsafe3();
  const makePull = toTransform(self)(done3(), scope);
  return catchDone(flatMap5(makePull, f), onHalt ? onHalt : succeed6).pipe(onExit2((exit) => close(scope, exit)));
});
var runForEach = /* @__PURE__ */ dual(2, (self, f) => runWith(self, (pull) => forever2(flatMap5(pull, f), {
  disableYield: true
})));
var mkUint8Array = (self) => map7(runFold(self, () => ({
  bytes: 0,
  arrays: []
}), (acc, chunk) => {
  for (let i = 0;i < chunk.length; i++) {
    acc.bytes += chunk[i].length;
    acc.arrays.push(chunk[i]);
  }
  return acc;
}), ({
  arrays,
  bytes
}) => {
  const result = new Uint8Array(bytes);
  let offset = 0;
  for (let i = 0;i < arrays.length; i++) {
    const array = arrays[i];
    result.set(array, offset);
    offset += array.length;
  }
  return result;
});
var runFold = /* @__PURE__ */ dual(3, (self, initial, f) => suspend2(() => {
  let state = initial();
  return runWith(self, (pull) => whileLoop2({
    while: constTrue,
    body: () => pull,
    step: (value) => {
      state = f(state, value);
    }
  }), () => succeed6(state));
}));
var toPullScoped = (self, scope) => toTransform(self)(done3(), scope);

// node_modules/effect/dist/internal/stream.js
var TypeId11 = "~effect/Stream";
var streamVariance = {
  _R: identity,
  _E: identity,
  _A: identity
};
var Stream = function(channel) {
  this.channel = channel;
};
Stream.prototype = {
  [TypeId11]: streamVariance,
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var fromChannel = (channel) => new Stream(channel);

// node_modules/effect/dist/Sink.js
var TypeId12 = "~effect/Sink";
var endVoid = /* @__PURE__ */ succeed6([undefined]);
var sinkVariance = {
  _A: identity,
  _In: identity,
  _L: identity,
  _E: identity,
  _R: identity
};
var SinkProto = {
  [TypeId12]: sinkVariance,
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var isSink = (u) => hasProperty(u, TypeId12);
var fromChannel2 = (channel) => fromTransform2((upstream, scope) => toTransform(channel)(upstream, scope).pipe(flatMap5(forever2({
  disableYield: true
})), catchDone(succeed6)));
var fromTransform2 = (transform) => {
  const self = Object.create(SinkProto);
  self.transform = transform;
  return self;
};
var toChannel = (self) => fromTransform((upstream, scope) => succeed6(flatMap5(self.transform(upstream, scope), done3)));
var drain = /* @__PURE__ */ fromTransform2((upstream) => catchDone(forever2(upstream, {
  disableYield: true
}), () => endVoid));
var forEach3 = (f) => forEachArray(forEach2((_) => f(_), {
  discard: true
}));
var forEachArray = (f) => fromTransform2((upstream) => upstream.pipe(flatMap5(f), forever2({
  disableYield: true
}), catchDone(() => endVoid)));
var unwrap3 = (effect) => fromChannel2(unwrap2(map7(effect, toChannel)));

// node_modules/effect/dist/internal/rcRef.js
var TypeId13 = "~effect/RcRef";
var stateEmpty = {
  _tag: "Empty"
};
var stateClosed = {
  _tag: "Closed"
};
var variance2 = {
  _A: identity,
  _E: identity
};

class RcRefImpl {
  [TypeId13] = variance2;
  pipe() {
    return pipeArguments(this, arguments);
  }
  state = stateEmpty;
  semaphore = /* @__PURE__ */ makeUnsafe5(1);
  acquire;
  context;
  scope;
  idleTimeToLive;
  constructor(acquire, context, scope, idleTimeToLive) {
    this.acquire = acquire;
    this.context = context;
    this.scope = scope;
    this.idleTimeToLive = idleTimeToLive;
  }
}
var make10 = (options) => withFiber2((fiber) => {
  const context = fiber.context;
  const scope = get(context, Scope);
  const ref = new RcRefImpl(options.acquire, context, scope, options.idleTimeToLive ? fromInputUnsafe(options.idleTimeToLive) : undefined);
  return as2(addFinalizerExit(scope, () => {
    const close2 = ref.state._tag === "Acquired" ? close(ref.state.scope, void_2) : void_3;
    ref.state = stateClosed;
    return close2;
  }), ref);
});
var getState = (self) => uninterruptibleMask2(function loop(restore) {
  switch (self.state._tag) {
    case "Closed": {
      return interrupt2;
    }
    case "Acquired": {
      self.state.refCount++;
      return self.state.fiber ? as2(interrupt3(self.state.fiber), self.state) : succeed6(self.state);
    }
    case "Empty": {
      const scope = makeUnsafe3();
      return self.semaphore.withPermit(suspend2(() => {
        if (self.state._tag !== "Empty") {
          return loop(restore);
        }
        return restore(provideContext2(self.acquire, add(self.context, Scope, scope))).pipe(flatMap5((value) => {
          if (self.state._tag === "Closed") {
            return interrupt2;
          }
          const state = {
            _tag: "Acquired",
            value,
            scope,
            fiber: undefined,
            refCount: 1,
            invalidated: false
          };
          self.state = state;
          return succeed6(state);
        }), onExit2((exit) => isFailure3(exit) ? close(scope, exit) : void_3));
      }));
    }
  }
});
var get2 = /* @__PURE__ */ fnUntraced2(function* (self_) {
  const self = self_;
  const state = yield* getState(self);
  const scope = yield* scope2;
  const isFinite2 = self.idleTimeToLive !== undefined && isFinite(self.idleTimeToLive);
  yield* addFinalizerExit(scope, () => {
    state.refCount--;
    if (state.refCount > 0) {
      return void_3;
    }
    if (self.idleTimeToLive === undefined || state.invalidated) {
      if (self.state === state) {
        self.state = stateEmpty;
      }
      return close(state.scope, void_2);
    } else if (!isFinite2) {
      return void_3;
    }
    state.fiber = sleep2(self.idleTimeToLive).pipe(flatMap5(() => {
      if (self.state === state && state.refCount === 0) {
        self.state = stateEmpty;
        return close(state.scope, void_2);
      }
      return void_3;
    }), ensuring2(sync2(() => {
      state.fiber = undefined;
    })), runForkWith2(self.context), runIn(self.scope));
    return void_3;
  });
  return state.value;
});

// node_modules/effect/dist/RcRef.js
var make11 = make10;
var get3 = get2;

// node_modules/effect/dist/Stream.js
var TypeId14 = "~effect/Stream";
var isStream = (u) => hasProperty(u, TypeId14);
var fromChannel3 = fromChannel;
var fromPull2 = (pull) => fromChannel3(fromPull(pull));
var transformPull2 = (self, f) => fromChannel3(fromTransform((_, scope) => flatMap5(toPullScoped(self.channel, scope), (pull) => f(pull, scope))));
var toChannel2 = (stream) => stream.channel;
var callback3 = (f, options) => fromChannel3(callbackArray(f, options));
var empty4 = /* @__PURE__ */ fromChannel3(empty3);
var suspend4 = (stream) => fromChannel3(suspend3(() => stream().channel));
var fail8 = (error) => fromChannel3(fail7(error));
var fromReadableStream2 = (options) => fromChannel3(fromReadableStream(options));
var unwrap4 = (effect) => fromChannel3(unwrap2(map7(effect, toChannel2)));
var map9 = /* @__PURE__ */ dual(2, (self, f) => suspend4(() => {
  let i = 0;
  return fromChannel3(map8(self.channel, map4((o) => f(o, i++))));
}));
var merge4 = /* @__PURE__ */ dual((args) => isStream(args[0]) && isStream(args[1]), (self, that, options) => fromChannel3(merge3(toChannel2(self), toChannel2(that), options)));
var transduce = /* @__PURE__ */ dual(2, (self, sink) => transformPull2(self, (upstream, scope) => sync2(() => {
  let done;
  let leftover;
  const upstreamWithLeftover = suspend2(() => {
    if (leftover !== undefined) {
      const chunk = leftover;
      leftover = undefined;
      return succeed6(chunk);
    }
    return upstream;
  }).pipe(catch_2((error) => {
    done = fail4(error);
    return done3();
  }));
  const pull = map7(suspend2(() => sink.transform(upstreamWithLeftover, scope)), ([value, leftover_]) => {
    leftover = leftover_;
    return of(value);
  });
  return suspend2(() => done ? done : pull);
})));
var pipeThroughChannel = /* @__PURE__ */ dual(2, (self, channel) => fromChannel3(pipeTo(self.channel, channel)));
var decodeText = /* @__PURE__ */ dual((args) => isStream(args[0]), (self, options) => suspend4(() => {
  const decoder = new TextDecoder(options?.encoding);
  return map9(self, (chunk) => decoder.decode(chunk, {
    stream: true
  }));
}));
var splitLines2 = (self) => self.channel.pipe(pipeTo(splitLines()), fromChannel3);
var onExit4 = /* @__PURE__ */ dual(2, (self, finalizer) => fromChannel3(onExit3(self.channel, finalizer)));
var ensuring4 = /* @__PURE__ */ dual(2, (self, finalizer) => fromChannel3(ensuring3(self.channel, finalizer)));
var run = /* @__PURE__ */ dual(2, (self, sink) => scopedWith2((scope) => toPullScoped(self.channel, scope).pipe(flatMap5((upstream) => sink.transform(upstream, scope)), map7(([a]) => a))));
var runCollect = (self) => runFold(self.channel, () => [], (acc, chunk) => {
  for (let i = 0;i < chunk.length; i++) {
    acc.push(chunk[i]);
  }
  return acc;
});
var runForEach2 = /* @__PURE__ */ dual(2, (self, f) => runForEach(self.channel, (arr) => {
  let i = 0;
  return whileLoop2({
    while: () => i < arr.length,
    body: () => f(arr[i++]),
    step: constVoid
  });
}));
var runForEachArray = /* @__PURE__ */ dual(2, (self, f) => runForEach(self.channel, f));
var mkString = (self) => runFold(self.channel, () => "", (acc, chunk) => acc + chunk.join(""));
var toReadableStreamWith = /* @__PURE__ */ dual((args) => isStream(args[0]), (self, context, options) => {
  let currentResolve = undefined;
  let fiber = undefined;
  const latch = makeUnsafe4(false);
  return new ReadableStream({
    start(controller) {
      fiber = runFork2(provideContext2(runForEachArray(self, (chunk) => latch.whenOpen(sync2(() => {
        latch.closeUnsafe();
        for (let i = 0;i < chunk.length; i++) {
          controller.enqueue(chunk[i]);
        }
        currentResolve();
        currentResolve = undefined;
      }))), context));
      fiber.addObserver((exit) => {
        if (exit._tag === "Failure") {
          controller.error(squash(exit.cause));
        } else {
          controller.close();
        }
      });
    },
    pull() {
      return new Promise((resolve) => {
        currentResolve = resolve;
        latch.openUnsafe();
      });
    },
    cancel() {
      if (!fiber)
        return;
      return runPromise2(asVoid2(interrupt3(fiber)));
    }
  }, options?.strategy);
});
var toReadableStream = /* @__PURE__ */ dual((args) => isStream(args[0]), (self, options) => toReadableStreamWith(self, empty2(), options));
var toReadableStreamEffect = /* @__PURE__ */ dual((args) => isStream(args[0]), (self, options) => map7(context2(), (context) => toReadableStreamWith(self, context, options)));

// node_modules/effect/dist/FileSystem.js
var TypeId15 = "~effect/FileSystem";
var FileSystem = /* @__PURE__ */ Service("effect/FileSystem");
var make12 = (impl) => FileSystem.of({
  ...impl,
  [TypeId15]: TypeId15,
  exists: (path) => pipe(impl.access(path), as2(true), catchTag2("PlatformError", (e) => e.reason._tag === "NotFound" ? succeed6(false) : fail6(e))),
  readFileString: (path, encoding) => flatMap5(impl.readFile(path), (_) => try_3({
    try: () => new TextDecoder(encoding).decode(_),
    catch: (cause) => badArgument({
      module: "FileSystem",
      method: "readFileString",
      description: "invalid encoding",
      cause
    })
  })),
  stream: fnUntraced2(function* (path, options) {
    const file = yield* impl.open(path, {
      flag: "r"
    });
    const offset = options?.offset === undefined ? undefined : fromInputUnsafe2(options.offset);
    if (offset) {
      yield* file.seek(offset, "start");
    }
    const bytesToRead = options?.bytesToRead === undefined ? undefined : fromInputUnsafe2(options.bytesToRead);
    let totalBytesRead = BigInt(0);
    const chunkSize = Number(BigInt(options?.chunkSize ?? 64 * 1024));
    const readChunk = file.readAlloc(chunkSize);
    return fromPull2(succeed6(flatMap5(suspend2(() => {
      if (bytesToRead !== undefined && bytesToRead <= totalBytesRead) {
        return done3();
      }
      return bytesToRead !== undefined && bytesToRead - totalBytesRead < chunkSize ? file.readAlloc(Number(bytesToRead - totalBytesRead)) : readChunk;
    }), match({
      onNone: () => done3(),
      onSome: (buf) => {
        totalBytesRead += BigInt(buf.length);
        return succeed6(of(buf));
      }
    }))));
  }, unwrap4),
  sink: (path, options) => pipe(impl.open(path, {
    ...options,
    flag: options?.flag ?? "w"
  }), map7((file) => forEach3((_) => file.writeAll(_))), unwrap3),
  writeFileString: (path, data, options) => flatMap5(try_3({
    try: () => new TextEncoder().encode(data),
    catch: (cause) => badArgument({
      module: "FileSystem",
      method: "writeFileString",
      description: "could not encode string",
      cause
    })
  }), (_) => impl.writeFile(path, _, options))
});
var FileTypeId = "~effect/FileSystem/File";
class WatchBackend extends (/* @__PURE__ */ Service()("effect/FileSystem/WatchBackend")) {
}

// node_modules/effect/dist/Path.js
var TypeId16 = "~effect/Path";
var Path = /* @__PURE__ */ Service("effect/Path");
function normalizeStringPosix(path, allowAboveRoot) {
  let res = "";
  let lastSegmentLength = 0;
  let lastSlash = -1;
  let dots = 0;
  let code;
  for (let i = 0;i <= path.length; ++i) {
    if (i < path.length) {
      code = path.charCodeAt(i);
    } else if (code === 47) {
      break;
    } else {
      code = 47;
    }
    if (code === 47) {
      if (lastSlash === i - 1 || dots === 1) {} else if (lastSlash !== i - 1 && dots === 2) {
        if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== 46 || res.charCodeAt(res.length - 2) !== 46) {
          if (res.length > 2) {
            const lastSlashIndex = res.lastIndexOf("/");
            if (lastSlashIndex !== res.length - 1) {
              if (lastSlashIndex === -1) {
                res = "";
                lastSegmentLength = 0;
              } else {
                res = res.slice(0, lastSlashIndex);
                lastSegmentLength = res.length - 1 - res.lastIndexOf("/");
              }
              lastSlash = i;
              dots = 0;
              continue;
            }
          } else if (res.length === 2 || res.length === 1) {
            res = "";
            lastSegmentLength = 0;
            lastSlash = i;
            dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          if (res.length > 0) {
            res += "/..";
          } else {
            res = "..";
          }
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0) {
          res += "/" + path.slice(lastSlash + 1, i);
        } else {
          res = path.slice(lastSlash + 1, i);
        }
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i;
      dots = 0;
    } else if (code === 46 && dots !== -1) {
      ++dots;
    } else {
      dots = -1;
    }
  }
  return res;
}
function _format(sep, pathObject) {
  const dir = pathObject.dir || pathObject.root;
  const base = pathObject.base || (pathObject.name || "") + (pathObject.ext || "");
  if (!dir) {
    return base;
  }
  if (dir === pathObject.root) {
    return dir + base;
  }
  return dir + sep + base;
}
function fromFileUrl(url) {
  if (url.protocol !== "file:") {
    return fail6(new BadArgument({
      module: "Path",
      method: "fromFileUrl",
      description: "URL must be of scheme file"
    }));
  } else if (url.hostname !== "") {
    return fail6(new BadArgument({
      module: "Path",
      method: "fromFileUrl",
      description: "Invalid file URL host"
    }));
  }
  const pathname = url.pathname;
  for (let n = 0;n < pathname.length; n++) {
    if (pathname[n] === "%") {
      const third = pathname.codePointAt(n + 2) | 32;
      if (pathname[n + 1] === "2" && third === 102) {
        return fail6(new BadArgument({
          module: "Path",
          method: "fromFileUrl",
          description: "must not include encoded / characters"
        }));
      }
    }
  }
  return succeed6(decodeURIComponent(pathname));
}
var resolve = function resolve() {
  let resolvedPath = "";
  let resolvedAbsolute = false;
  let cwd = undefined;
  for (let i = arguments.length - 1;i >= -1 && !resolvedAbsolute; i--) {
    let path;
    if (i >= 0) {
      path = arguments[i];
    } else {
      const process2 = globalThis.process;
      if (cwd === undefined && "process" in globalThis && typeof process2 === "object" && process2 !== null && typeof process2.cwd === "function") {
        cwd = process2.cwd();
      }
      path = cwd;
    }
    if (path.length === 0) {
      continue;
    }
    resolvedPath = path + "/" + resolvedPath;
    resolvedAbsolute = path.charCodeAt(0) === 47;
  }
  resolvedPath = normalizeStringPosix(resolvedPath, !resolvedAbsolute);
  if (resolvedAbsolute) {
    if (resolvedPath.length > 0) {
      return "/" + resolvedPath;
    } else {
      return "/";
    }
  } else if (resolvedPath.length > 0) {
    return resolvedPath;
  } else {
    return ".";
  }
};
var CHAR_FORWARD_SLASH = 47;
function toFileUrl(filepath) {
  const outURL = new URL("file://");
  let resolved = resolve(filepath);
  const filePathLast = filepath.charCodeAt(filepath.length - 1);
  if (filePathLast === CHAR_FORWARD_SLASH && resolved[resolved.length - 1] !== "/") {
    resolved += "/";
  }
  outURL.pathname = encodePathChars(resolved);
  return succeed6(outURL);
}
var percentRegExp = /%/g;
var backslashRegExp = /\\/g;
var newlineRegExp = /\n/g;
var carriageReturnRegExp = /\r/g;
var tabRegExp = /\t/g;
function encodePathChars(filepath) {
  if (filepath.includes("%")) {
    filepath = filepath.replace(percentRegExp, "%25");
  }
  if (filepath.includes("\\")) {
    filepath = filepath.replace(backslashRegExp, "%5C");
  }
  if (filepath.includes(`
`)) {
    filepath = filepath.replace(newlineRegExp, "%0A");
  }
  if (filepath.includes("\r")) {
    filepath = filepath.replace(carriageReturnRegExp, "%0D");
  }
  if (filepath.includes("\t")) {
    filepath = filepath.replace(tabRegExp, "%09");
  }
  return filepath;
}
var posixImpl = /* @__PURE__ */ Path.of({
  [TypeId16]: TypeId16,
  resolve,
  normalize(path) {
    if (path.length === 0)
      return ".";
    const isAbsolute = path.charCodeAt(0) === 47;
    const trailingSeparator = path.charCodeAt(path.length - 1) === 47;
    path = normalizeStringPosix(path, !isAbsolute);
    if (path.length === 0 && !isAbsolute)
      path = ".";
    if (path.length > 0 && trailingSeparator)
      path += "/";
    if (isAbsolute)
      return "/" + path;
    return path;
  },
  isAbsolute(path) {
    return path.length > 0 && path.charCodeAt(0) === 47;
  },
  join() {
    if (arguments.length === 0) {
      return ".";
    }
    let joined;
    for (let i = 0;i < arguments.length; ++i) {
      const arg = arguments[i];
      if (arg.length > 0) {
        if (joined === undefined) {
          joined = arg;
        } else {
          joined += "/" + arg;
        }
      }
    }
    if (joined === undefined) {
      return ".";
    }
    return posixImpl.normalize(joined);
  },
  relative(from, to) {
    if (from === to)
      return "";
    from = posixImpl.resolve(from);
    to = posixImpl.resolve(to);
    if (from === to)
      return "";
    let fromStart = 1;
    for (;fromStart < from.length; ++fromStart) {
      if (from.charCodeAt(fromStart) !== 47) {
        break;
      }
    }
    const fromEnd = from.length;
    const fromLen = fromEnd - fromStart;
    let toStart = 1;
    for (;toStart < to.length; ++toStart) {
      if (to.charCodeAt(toStart) !== 47) {
        break;
      }
    }
    const toEnd = to.length;
    const toLen = toEnd - toStart;
    const length = fromLen < toLen ? fromLen : toLen;
    let lastCommonSep = -1;
    let i = 0;
    for (;i <= length; ++i) {
      if (i === length) {
        if (toLen > length) {
          if (to.charCodeAt(toStart + i) === 47) {
            return to.slice(toStart + i + 1);
          } else if (i === 0) {
            return to.slice(toStart + i);
          }
        } else if (fromLen > length) {
          if (from.charCodeAt(fromStart + i) === 47) {
            lastCommonSep = i;
          } else if (i === 0) {
            lastCommonSep = 0;
          }
        }
        break;
      }
      const fromCode = from.charCodeAt(fromStart + i);
      const toCode = to.charCodeAt(toStart + i);
      if (fromCode !== toCode) {
        break;
      } else if (fromCode === 47) {
        lastCommonSep = i;
      }
    }
    let out = "";
    for (i = fromStart + lastCommonSep + 1;i <= fromEnd; ++i) {
      if (i === fromEnd || from.charCodeAt(i) === 47) {
        if (out.length === 0) {
          out += "..";
        } else {
          out += "/..";
        }
      }
    }
    if (out.length > 0) {
      return out + to.slice(toStart + lastCommonSep);
    } else {
      toStart += lastCommonSep;
      if (to.charCodeAt(toStart) === 47) {
        ++toStart;
      }
      return to.slice(toStart);
    }
  },
  dirname(path) {
    if (path.length === 0)
      return ".";
    let code = path.charCodeAt(0);
    const hasRoot = code === 47;
    let end = -1;
    let matchedSlash = true;
    for (let i = path.length - 1;i >= 1; --i) {
      code = path.charCodeAt(i);
      if (code === 47) {
        if (!matchedSlash) {
          end = i;
          break;
        }
      } else {
        matchedSlash = false;
      }
    }
    if (end === -1)
      return hasRoot ? "/" : ".";
    if (hasRoot && end === 1)
      return "//";
    return path.slice(0, end);
  },
  basename(path, ext) {
    let start = 0;
    let end = -1;
    let matchedSlash = true;
    let i;
    if (ext !== undefined && ext.length > 0 && ext.length <= path.length) {
      if (ext.length === path.length && ext === path)
        return "";
      let extIdx = ext.length - 1;
      let firstNonSlashEnd = -1;
      for (i = path.length - 1;i >= 0; --i) {
        const code = path.charCodeAt(i);
        if (code === 47) {
          if (!matchedSlash) {
            start = i + 1;
            break;
          }
        } else {
          if (firstNonSlashEnd === -1) {
            matchedSlash = false;
            firstNonSlashEnd = i + 1;
          }
          if (extIdx >= 0) {
            if (code === ext.charCodeAt(extIdx)) {
              if (--extIdx === -1) {
                end = i;
              }
            } else {
              extIdx = -1;
              end = firstNonSlashEnd;
            }
          }
        }
      }
      if (start === end)
        end = firstNonSlashEnd;
      else if (end === -1)
        end = path.length;
      return path.slice(start, end);
    } else {
      for (i = path.length - 1;i >= 0; --i) {
        if (path.charCodeAt(i) === 47) {
          if (!matchedSlash) {
            start = i + 1;
            break;
          }
        } else if (end === -1) {
          matchedSlash = false;
          end = i + 1;
        }
      }
      if (end === -1)
        return "";
      return path.slice(start, end);
    }
  },
  extname(path) {
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let preDotState = 0;
    for (let i = path.length - 1;i >= 0; --i) {
      const code = path.charCodeAt(i);
      if (code === 47) {
        if (!matchedSlash) {
          startPart = i + 1;
          break;
        }
        continue;
      }
      if (end === -1) {
        matchedSlash = false;
        end = i + 1;
      }
      if (code === 46) {
        if (startDot === -1) {
          startDot = i;
        } else if (preDotState !== 1) {
          preDotState = 1;
        }
      } else if (startDot !== -1) {
        preDotState = -1;
      }
    }
    if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
      return "";
    }
    return path.slice(startDot, end);
  },
  format: function format(pathObject) {
    if (pathObject === null || typeof pathObject !== "object") {
      throw new TypeError('The "pathObject" argument must be of type Object. Received type ' + typeof pathObject);
    }
    return _format("/", pathObject);
  },
  parse(path) {
    const ret = {
      root: "",
      dir: "",
      base: "",
      ext: "",
      name: ""
    };
    if (path.length === 0)
      return ret;
    let code = path.charCodeAt(0);
    const isAbsolute = code === 47;
    let start;
    if (isAbsolute) {
      ret.root = "/";
      start = 1;
    } else {
      start = 0;
    }
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let i = path.length - 1;
    let preDotState = 0;
    for (;i >= start; --i) {
      code = path.charCodeAt(i);
      if (code === 47) {
        if (!matchedSlash) {
          startPart = i + 1;
          break;
        }
        continue;
      }
      if (end === -1) {
        matchedSlash = false;
        end = i + 1;
      }
      if (code === 46) {
        if (startDot === -1)
          startDot = i;
        else if (preDotState !== 1)
          preDotState = 1;
      } else if (startDot !== -1) {
        preDotState = -1;
      }
    }
    if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
      if (end !== -1) {
        if (startPart === 0 && isAbsolute)
          ret.base = ret.name = path.slice(1, end);
        else
          ret.base = ret.name = path.slice(startPart, end);
      }
    } else {
      if (startPart === 0 && isAbsolute) {
        ret.name = path.slice(1, startDot);
        ret.base = path.slice(1, end);
      } else {
        ret.name = path.slice(startPart, startDot);
        ret.base = path.slice(startPart, end);
      }
      ret.ext = path.slice(startDot, end);
    }
    if (startPart > 0)
      ret.dir = path.slice(0, startPart - 1);
    else if (isAbsolute)
      ret.dir = "/";
    return ret;
  },
  sep: "/",
  fromFileUrl,
  toFileUrl,
  toNamespacedPath: identity
});

// node_modules/effect/dist/ConfigProvider.js
function makeValue(value) {
  return {
    _tag: "Value",
    value
  };
}
function makeRecord(keys, value) {
  return {
    _tag: "Record",
    keys,
    value
  };
}
function makeArray(length, value) {
  return {
    _tag: "Array",
    length,
    value
  };
}
var ConfigProvider = /* @__PURE__ */ Reference("effect/ConfigProvider", {
  defaultValue: () => fromEnv()
});
var Proto2 = {
  ...PipeInspectableProto,
  toJSON() {
    return {
      _id: "ConfigProvider"
    };
  }
};
var identityPath = (path) => path;
function makeProvider(load, mapInput) {
  const self = Object.create(Proto2);
  self.load = load;
  self.mapInput = mapInput;
  return self;
}
function makeSource(get, transform) {
  return makeProvider((path) => get(transform(path)), (f) => makeSource(get, flow(transform, f)));
}
function make13(get) {
  return makeSource(get, identityPath);
}
function emptyStringAsMissing(value, preserveEmptyStrings) {
  return value === "" && !preserveEmptyStrings ? undefined : value;
}
function fromEnvRecord(env, options) {
  const preserveEmptyStrings = options?.preserveEmptyStrings === true;
  const trie = buildEnvTrie(env);
  return make13((path) => succeed6(nodeAtEnv(trie, env, path, preserveEmptyStrings)));
}
function fromEnv(options) {
  const env = options?.env ?? {
    ...globalThis.process?.env,
    ...import.meta?.env
  };
  return fromEnvRecord(env, {
    preserveEmptyStrings: options?.preserveEmptyStrings
  });
}
function buildEnvTrie(env) {
  const trie = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined)
      continue;
    const segments = name.split("_");
    let node = trie;
    for (const seg of segments) {
      const children = node.children ??= Object.create(null);
      node = children[seg] ??= {};
    }
  }
  return trie;
}
function nodeAtEnv(trie, env, path, preserveEmptyStrings) {
  const key = path.map(String).join("_");
  const leafValue = emptyStringAsMissing(Object.hasOwn(env, key) ? env[key] : undefined, preserveEmptyStrings);
  const trieNode = trieNodeAt(trie, path);
  const children = trieNode?.children ? Object.keys(trieNode.children) : [];
  if (children.length === 0) {
    return leafValue === undefined ? undefined : makeValue(leafValue);
  }
  const allNumeric = children.every(isCanonicalArrayIndex);
  if (allNumeric) {
    const length = Math.max(...children.map((k) => parseInt(k, 10))) + 1;
    return makeArray(length, leafValue);
  }
  return makeRecord(new Set(children), leafValue);
}
function trieNodeAt(root, path) {
  if (path.length === 0)
    return root;
  let node = root;
  for (const seg of path) {
    node = node?.children?.[String(seg)];
    if (!node)
      return;
  }
  return node;
}

// node_modules/effect/dist/internal/schema/annotations.js
function resolve2(ast) {
  return ast.checks ? ast.checks[ast.checks.length - 1].annotations : ast.annotations;
}
var STRUCTURAL_ANNOTATION_KEY = "~structural";
var SENTINELS_ANNOTATION_KEY = "~sentinels";
var CONSTRUCTOR_ANNOTATION_KEY = "~constructor";
var getExpected = /* @__PURE__ */ memoize((ast) => {
  const identifier = resolve2(ast)?.identifier;
  if (typeof identifier === "string")
    return identifier;
  return ast.getExpected(getExpected);
});

// node_modules/effect/dist/internal/schema/parser.js
var missing = /* @__PURE__ */ Symbol();
var succeed8 = succeed4;
var missingExit = /* @__PURE__ */ succeed8(missing);
var sameExit = /* @__PURE__ */ succeed8(missing);
var toOption = (value) => value === missing ? none2() : some2(value);
var fromOptionExit = (option) => option._tag === "None" ? missingExit : succeed8(option.value);

// node_modules/effect/dist/SchemaIssue.js
var TypeId17 = "~effect/SchemaIssue/Issue";
function isIssue(u) {
  return hasProperty(u, TypeId17) && u[TypeId17] === TypeId17;
}
function hasInput(issue) {
  return Object.hasOwn(issue, "input");
}

class IssueNodeImpl {
  [TypeId17] = TypeId17;
  constructor(input, options) {
    if (options?.reportInput === true && input !== missing) {
      this.input = input;
    }
  }
}
var Filter = class extends IssueNodeImpl {
  _tag = "Filter";
  filter;
  issue;
  constructor(filter, issue, input, options) {
    super(input, options);
    this.filter = filter;
    this.issue = issue;
  }
};
var Encoding = class extends IssueNodeImpl {
  _tag = "Encoding";
  ast;
  issue;
  constructor(ast, issue, input, options) {
    super(input, options);
    this.ast = ast;
    this.issue = issue;
  }
};
var Pointer = class extends IssueNodeImpl {
  _tag = "Pointer";
  path;
  issue;
  constructor(path, issue) {
    super();
    this.path = path;
    this.issue = issue;
  }
};
var MissingKey = class extends IssueNodeImpl {
  _tag = "MissingKey";
  annotations;
  constructor(annotations) {
    super();
    this.annotations = annotations;
  }
};
var UnexpectedKey = class extends IssueNodeImpl {
  _tag = "UnexpectedKey";
  ast;
  constructor(ast, input, options) {
    super(input, options);
    this.ast = ast;
  }
};
var Composite = class extends IssueNodeImpl {
  _tag = "Composite";
  ast;
  issues;
  constructor(ast, issues, input, options) {
    super(input, options);
    this.ast = ast;
    this.issues = issues;
  }
};
var InvalidType = class extends IssueNodeImpl {
  _tag = "InvalidType";
  ast;
  constructor(ast, input, options) {
    super(input, options);
    this.ast = ast;
  }
};
var InvalidValue = class extends IssueNodeImpl {
  _tag = "InvalidValue";
  annotations;
  constructor(annotations, input, options) {
    super(input, options);
    this.annotations = annotations;
  }
};
var AnyOf = class extends IssueNodeImpl {
  _tag = "AnyOf";
  ast;
  issues;
  constructor(ast, issues, input, options) {
    super(input, options);
    this.ast = ast;
    this.issues = issues;
  }
};
var OneOf = class extends IssueNodeImpl {
  _tag = "OneOf";
  ast;
  successes;
  constructor(ast, successes, input, options) {
    super(input, options);
    this.ast = ast;
    this.successes = successes;
  }
};
function makeFilterIssue(entry, input, options) {
  if (isIssue(entry)) {
    return entry;
  }
  if (typeof entry === "string") {
    return new InvalidValue({
      message: entry
    }, input, options);
  }
  const inner = typeof entry.issue === "string" ? new InvalidValue({
    message: entry.issue
  }, input, options) : entry.issue;
  return new Pointer(entry.path, inner);
}
function makeSingle(out, input, options) {
  if (out === undefined) {
    return;
  }
  if (typeof out === "boolean") {
    return out ? undefined : new InvalidValue(undefined, input, options);
  }
  return makeFilterIssue(out, input, options);
}
function normalizeFilterOutput(ast, out, input, options) {
  if (Array.isArray(out)) {
    if (!isReadonlyArrayNonEmpty(out)) {
      return;
    }
    return out.length === 1 ? makeFilterIssue(out[0], input, options) : new Composite(ast, map4(out, (entry) => makeFilterIssue(entry, input, options)), input, options);
  }
  return makeSingle(out, input, options);
}
var defaultLeafHook = (issue) => {
  const message = findMessage(issue);
  if (message !== undefined)
    return message;
  switch (issue._tag) {
    case "InvalidType":
      return getExpectedMessage(getExpected(issue.ast), issue);
    case "InvalidValue": {
      const expected = findExpected(issue);
      if (expected !== undefined)
        return getExpectedMessage(expected, issue);
      const input = formatInput(issue);
      return input === undefined ? "Expected a valid value" : `Invalid data ${input}`;
    }
    case "MissingKey":
      return "Missing key";
    case "UnexpectedKey": {
      const input = formatInput(issue);
      return input === undefined ? "Expected no excess property" : `Unexpected key with value ${input}`;
    }
    case "Forbidden":
      return "Forbidden operation";
    case "OneOf": {
      const input = formatInput(issue);
      return input === undefined ? "Expected exactly one member to match" : `Expected exactly one member to match the input ${input}`;
    }
  }
};
var defaultCheckHook = (issue) => findMessage(issue.issue) ?? findMessage(issue);
function formatInput(issue) {
  return hasInput(issue) ? format(issue.input) : undefined;
}
function findExpected(issue) {
  const expected = issue.annotations?.expected;
  return typeof expected === "string" ? expected : undefined;
}
function getExpectedMessage(expected, issue) {
  const input = formatInput(issue);
  return input === undefined ? `Expected ${expected}` : `Expected ${expected}, got ${input}`;
}
function formatCheck(check) {
  const expected = check.annotations?.expected;
  if (typeof expected === "string")
    return expected;
  switch (check._tag) {
    case "Filter":
      return "<filter>";
    case "FilterGroup":
      return check.checks.map((check) => formatCheck(check)).join(" & ");
  }
}
function makeFormatterDefault() {
  return (issue) => formatIssue(issue, "");
}
var defaultFormatter = /* @__PURE__ */ makeFormatterDefault();
function formatIssue(issue, path) {
  let message;
  switch (issue._tag) {
    case "Filter": {
      const annotated = defaultCheckHook(issue);
      if (annotated !== undefined) {
        message = annotated;
      } else {
        if (issue.issue._tag !== "InvalidValue") {
          return formatIssue(issue.issue, path);
        }
        const expected = findExpected(issue.issue);
        message = expected === undefined ? getExpectedMessage(formatCheck(issue.filter), issue) : getExpectedMessage(expected, issue.issue);
      }
      break;
    }
    case "Encoding":
      return formatIssue(issue.issue, path);
    case "Pointer":
      return formatIssue(issue.issue, path + formatPath(issue.path));
    case "Composite":
    case "AnyOf": {
      if (issue._tag === "Composite" || issue.issues.length > 0) {
        return issue.issues.map((issue) => formatIssue(issue, path)).join(`
`);
      }
      message = findMessage(issue) ?? getExpectedMessage(getExpected(issue.ast), issue);
      break;
    }
    default:
      message = defaultLeafHook(issue);
      break;
  }
  return path ? `${message}
  at ${path}` : message;
}
function findMessage(issue) {
  if (issue._tag === "Pointer")
    return;
  if (issue._tag === "Encoding")
    return findMessage(issue.issue);
  const annotations = issue._tag === "Filter" ? issue.filter.annotations : ("annotations" in issue) ? issue.annotations : issue.ast.annotations;
  const message = annotations?.[issue._tag === "MissingKey" ? "messageMissingKey" : issue._tag === "UnexpectedKey" ? "messageUnexpectedKey" : "message"];
  if (typeof message === "string")
    return message;
}

// node_modules/effect/dist/internal/schema/cause.js
function getSchemaIssue(cause) {
  let issue;
  for (const reason of cause.reasons) {
    if (!isFailReason2(reason) || !isIssue(reason.error)) {
      return;
    }
    issue ??= reason.error;
  }
  return issue;
}
function getSchemaIssueOrThrow(cause, message) {
  const issue = getSchemaIssue(cause);
  if (issue === undefined) {
    throw new Error(message, {
      cause
    });
  }
  return issue;
}

// node_modules/effect/dist/SchemaGetter.js
var Getter = class extends Class {
  run;
  constructor(run) {
    super();
    this.run = run;
  }
  map(f) {
    return new Getter((oe, options) => this.run(oe, options).pipe(mapEager2(map(f))));
  }
  compose(other) {
    if (isPassthrough(this)) {
      return other;
    }
    if (isPassthrough(other)) {
      return this;
    }
    return new Getter((oe, options) => this.run(oe, options).pipe(flatMapEager2((ot) => other.run(ot, options))));
  }
};
var passthrough_ = /* @__PURE__ */ new Getter(succeed6);
function isPassthrough(getter) {
  return getter.run === passthrough_.run;
}
function passthrough() {
  return passthrough_;
}
function onSome(f) {
  return new Getter((oe, options) => isNone2(oe) ? succeedNone2 : f(oe.value, options));
}
function transform(f) {
  return transformOptional(map(f));
}
function transformEffect(f) {
  return onSome((e, options) => f(e, options).pipe(mapEager2(some2)));
}
function transformOptional(f) {
  return new Getter((oe) => succeed6(f(oe)));
}
function omit() {
  return new Getter(() => succeedNone2);
}
function withDefault(defaultValue) {
  return new Getter((o) => {
    const filtered = filter(o, isNotUndefined);
    return isSome2(filtered) ? succeed6(filtered) : mapEager2(defaultValue, some2);
  });
}
function String2() {
  return transform(globalThis.String);
}
function Number4() {
  return transform(globalThis.Number);
}
function parseJson(options) {
  return onSome((input, parseOptions) => try_3({
    try: () => some2(JSON.parse(input, options?.reviver)),
    catch: () => new InvalidValue({
      expected: "a valid JSON string"
    }, input, parseOptions)
  }));
}
function stringifyJson(options) {
  return onSome((input, parseOptions) => try_3({
    try: () => {
      const output = JSON.stringify(input, options?.replacer, options?.space);
      if (output === undefined) {
        throw new TypeError("Value cannot be represented as JSON");
      }
      return some2(output);
    },
    catch: () => new InvalidValue({
      expected: "a JSON-serializable value"
    }, input, parseOptions)
  }));
}
function encodeBase642() {
  return transform(encodeBase64);
}
function decodeBase642() {
  return transformEffect((input, options) => mapErrorEager2(fromResult2(decodeBase64(input)), () => new InvalidValue({
    expected: "a valid Base64 string"
  }, input, options)));
}

// node_modules/effect/dist/SchemaTransformation.js
var TypeId18 = "~effect/SchemaTransformation/Transformation";
var Transformation = class {
  [TypeId18] = TypeId18;
  _tag = "Transformation";
  decode;
  encode;
  constructor(decode, encode) {
    this.decode = decode;
    this.encode = encode;
  }
  flip() {
    return new Transformation(this.encode, this.decode);
  }
  compose(other) {
    return new Transformation(this.decode.compose(other.decode), other.encode.compose(this.encode));
  }
};
function isTransformation(u) {
  return hasProperty(u, TypeId18) && u[TypeId18] === TypeId18;
}
var make14 = (options) => {
  if (isTransformation(options)) {
    return options;
  }
  return new Transformation(options.decode, options.encode);
};
function transformEffect2(options) {
  return new Transformation(transformEffect(options.decode), transformEffect(options.encode));
}
function transform2(options) {
  return new Transformation(transform(options.decode), transform(options.encode));
}
var passthrough_2 = /* @__PURE__ */ new Transformation(/* @__PURE__ */ passthrough(), /* @__PURE__ */ passthrough());
function passthrough2() {
  return passthrough_2;
}
var numberFromString = /* @__PURE__ */ new Transformation(/* @__PURE__ */ Number4(), /* @__PURE__ */ String2());
var isJsonError = (input) => isObject(input) && typeof input["message"] === "string";
var decodeJsonError = (input) => {
  const hasCause = Object.hasOwn(input, "cause");
  const err = hasCause ? new Error(input.message, {
    cause: decodeDefect(input.cause)
  }) : new Error(input.message);
  if (typeof input.name === "string" && input.name !== "Error")
    err.name = input.name;
  if (typeof input.stack === "string")
    err.stack = input.stack;
  return err;
};
var encodeUnknownAsJson = (input) => {
  try {
    const json = formatJson(input);
    return json === undefined ? format(input) : JSON.parse(json);
  } catch {
    return format(input);
  }
};
var encodeJsonError = (input, options, encodeDefect) => {
  const encoded = {
    name: input.name,
    message: typeof input.message === "string" ? input.message : ""
  };
  if (options?.includeStack && typeof input.stack === "string") {
    encoded.stack = input.stack;
  }
  if (!options?.excludeCause && input.cause !== undefined) {
    encoded.cause = encodeDefect(input.cause);
  }
  return encoded;
};
var makeEncodeDefect = (options) => {
  const seen = new WeakSet;
  const encode = (input) => {
    if (isError(input)) {
      if (seen.has(input)) {
        return "[Circular]";
      }
      seen.add(input);
      const encoded = encodeJsonError(input, options, encode);
      seen.delete(input);
      return encoded;
    }
    return encodeUnknownAsJson(input);
  };
  return encode;
};
var decodeDefect = (input) => isJsonError(input) ? decodeJsonError(input) : input;
var defectFromJson = (options) => transform2({
  decode: decodeDefect,
  encode: makeEncodeDefect(options)
});
var urlFromString = /* @__PURE__ */ transformEffect2({
  decode: (s, options) => URL.canParse(s) ? succeed6(new URL(s)) : fail6(new InvalidValue({
    expected: "a valid URL string"
  }, s, options)),
  encode: (url) => succeed6(url.href)
});
var uint8ArrayFromBase64String = /* @__PURE__ */ new Transformation(/* @__PURE__ */ decodeBase642(), /* @__PURE__ */ encodeBase642());
function fromJsonString(options) {
  return new Transformation(parseJson(options ?? {}), stringifyJson(options));
}

// node_modules/effect/dist/SchemaAST.js
function makeGuard(tag) {
  return (ast) => ast._tag === tag;
}
var isDeclaration = /* @__PURE__ */ makeGuard("Declaration");
var isNever2 = /* @__PURE__ */ makeGuard("Never");
var isLiteral = /* @__PURE__ */ makeGuard("Literal");
var isUniqueSymbol = /* @__PURE__ */ makeGuard("UniqueSymbol");
var isArrays = /* @__PURE__ */ makeGuard("Arrays");
var isObjects = /* @__PURE__ */ makeGuard("Objects");
var isSuspend = /* @__PURE__ */ makeGuard("Suspend");
var Link = class {
  to;
  transformation;
  constructor(to, transformation) {
    this.to = to;
    this.transformation = transformation;
  }
};
var defaultParseOptions = {};
var Context = class {
  isOptional;
  isMutable;
  constructorDefault;
  annotations;
  constructor(isOptional, isMutable, constructorDefault = undefined, annotations = undefined) {
    this.isOptional = isOptional;
    this.isMutable = isMutable;
    this.constructorDefault = constructorDefault;
    this.annotations = annotations;
  }
};
var TypeId19 = "~effect/Schema";

class ASTNodeImpl {
  [TypeId19] = TypeId19;
  annotations;
  checks;
  encoding;
  context;
  constructor(annotations = undefined, checks = undefined, encoding = undefined, context = undefined) {
    this.annotations = annotations;
    this.checks = checks;
    this.encoding = encoding;
    this.context = context;
  }
  toString() {
    return `<${this._tag}>`;
  }
}
var Declaration = class extends ASTNodeImpl {
  _tag = "Declaration";
  typeParameters;
  run;
  encodingChecks;
  encodingRun;
  constructor(typeParameters, run, annotations, checks, encoding, context, encodingChecks, encodingRun) {
    super(annotations, checks, encoding, context);
    this.typeParameters = typeParameters;
    this.run = run;
    this.encodingChecks = encodingChecks;
    this.encodingRun = encodingRun;
  }
  getParser() {
    let run;
    return (input, options) => {
      if (input === missing)
        return missingExit;
      return (run ??= this.run(this.typeParameters))(input, this, options);
    };
  }
  _rebuild(recur, checks, encodingChecks, run, encodingRun) {
    const tps = mapOrSame(this.typeParameters, recur);
    return tps === this.typeParameters && checks === this.checks && encodingChecks === this.encodingChecks && run === this.run && encodingRun === this.encodingRun ? this : new Declaration(tps, run, this.annotations, checks, undefined, this.context, encodingChecks, encodingRun);
  }
  recur(recur) {
    return this._rebuild(recur, this.checks, this.encodingChecks, this.run, this.encodingRun);
  }
  flip(recur) {
    return this._rebuild(recur, this.encodingChecks, this.checks, this.encodingRun ?? this.run, this.run);
  }
  getExpected() {
    const expected = this.annotations?.expected;
    if (typeof expected === "string")
      return expected;
    return "<Declaration>";
  }
};
var Null = class extends ASTNodeImpl {
  _tag = "Null";
  getParser() {
    return fromConst(this, null);
  }
  getExpected() {
    return "null";
  }
};
var null_ = /* @__PURE__ */ new Null;
var Undefined = class extends ASTNodeImpl {
  _tag = "Undefined";
  getParser() {
    return fromConst(this, undefined);
  }
  toCodecJson() {
    return replaceEncoding(this, [undefinedToNull]);
  }
  getExpected() {
    return "undefined";
  }
};
var undefinedToNull = /* @__PURE__ */ new Link(null_, /* @__PURE__ */ new Transformation(/* @__PURE__ */ transform(() => {
  return;
}), /* @__PURE__ */ transform(() => null)));
var undefined_2 = /* @__PURE__ */ new Undefined;
var Unknown = class extends ASTNodeImpl {
  _tag = "Unknown";
  getParser() {
    return fromRefinement(this, isUnknown);
  }
  getExpected() {
    return "unknown";
  }
};
var unknown = /* @__PURE__ */ new Unknown;
var Literal = class extends ASTNodeImpl {
  _tag = "Literal";
  literal;
  constructor(literal, annotations, checks, encoding, context) {
    super(annotations, checks, encoding, context);
    if (typeof literal === "number" && !globalThis.Number.isFinite(literal)) {
      throw new Error(`A numeric literal must be finite, got ${format(literal)}`);
    }
    this.literal = literal;
  }
  getParser() {
    return fromConst(this, this.literal);
  }
  matchPart(s, _options) {
    return s === globalThis.String(this.literal) ? this.literal : undefined;
  }
  toCodecJson() {
    return typeof this.literal === "bigint" ? literalToString(this) : this;
  }
  toCodecStringTree() {
    return typeof this.literal === "string" ? this : literalToString(this);
  }
  getExpected() {
    return typeof this.literal === "string" ? JSON.stringify(this.literal) : globalThis.String(this.literal);
  }
};
function literalToString(ast) {
  const literalAsString = globalThis.String(ast.literal);
  return replaceEncoding(ast, [new Link(new Literal(literalAsString), new Transformation(transform(() => ast.literal), transform(() => literalAsString)))]);
}
var String3 = class extends ASTNodeImpl {
  _tag = "String";
  getParser() {
    return fromRefinement(this, isString);
  }
  matchPart(s, options) {
    const checks = this.checks;
    return checks && !options.disableChecks && collectIssues(checks, s, undefined, this, options) ? undefined : s;
  }
  getExpected() {
    return "string";
  }
};
var string2 = /* @__PURE__ */ new String3;
var Number5 = class extends ASTNodeImpl {
  _tag = "Number";
  getParser() {
    return fromRefinement(this, isNumber);
  }
  matchKey(s, options) {
    return this._match(isStringNumberRegExp, s, options);
  }
  matchPart(s, options) {
    return this._match(isStringFiniteRegExp, s, options);
  }
  _match(regexp, s, options) {
    if (!regexp.test(s))
      return;
    const value = globalThis.Number(s);
    if (options.disableChecks || !this.checks)
      return value;
    return collectIssues(this.checks, value, undefined, this, options) ? undefined : value;
  }
  toCodecJson() {
    if (this.checks && (hasCheck(this.checks, "effect/schema/isFinite") || hasCheck(this.checks, "effect/schema/isInt"))) {
      return this;
    }
    return replaceEncoding(this, [numberToJson]);
  }
  toCodecStringTree() {
    if (this.toCodecJson() === this) {
      return replaceEncoding(this, [finiteToString]);
    }
    return replaceEncoding(this, [numberToString]);
  }
  getExpected() {
    return "number";
  }
};
function hasCheck(checks, id) {
  return checks.some((check) => check.annotations?.representation?.id === id || check._tag === "FilterGroup" && hasCheck(check.checks, id));
}
var number2 = /* @__PURE__ */ new Number5;
var Boolean = class extends ASTNodeImpl {
  _tag = "Boolean";
  getParser() {
    return fromRefinement(this, isBoolean);
  }
  getExpected() {
    return "boolean";
  }
};
var boolean = /* @__PURE__ */ new Boolean;
var Arrays = class extends ASTNodeImpl {
  _tag = "Arrays";
  isMutable;
  elements;
  rest;
  encodingChecks;
  constructor(isMutable, elements, rest, annotations, checks, encoding, context, encodingChecks) {
    super(annotations, checks, encoding, context);
    this.isMutable = isMutable;
    this.elements = elements;
    this.rest = rest;
    this.encodingChecks = encodingChecks;
    let hasOptional = false;
    for (let i = 0;i < elements.length; i++) {
      if (isOptional(elements[i])) {
        hasOptional = true;
      } else if (hasOptional) {
        throw new Error("A required element cannot follow an optional element. ts(1257)");
      }
    }
    if (hasOptional && rest.length > 1) {
      throw new Error("A required element cannot follow an optional element. ts(1257)");
    }
    for (let i = 1;i < rest.length; i++) {
      if (isOptional(rest[i])) {
        throw new Error("An optional element cannot follow a rest element. ts(1266)");
      }
    }
  }
  getParser(compile, compileConstructorDefault = compile) {
    const ast = this;
    let elements;
    let rest;
    const elementLen = ast.elements.length;
    const tailLen = Math.max(0, ast.rest.length - 1);
    function getParser(tailThreshold, index) {
      if (index < elementLen) {
        return elements[index];
      } else if (index >= tailThreshold) {
        return rest[index - tailThreshold + 1];
      }
      return rest[0];
    }
    return fnUntracedEager2(function* (input, options) {
      if (input === missing) {
        return missing;
      }
      if (!Array.isArray(input)) {
        return yield* fail6(new InvalidType(ast, input, options));
      }
      if (!elements) {
        elements = ast.elements.map((ast) => ({
          ast,
          parser: compileConstructorDefault(ast)
        }));
        rest = ast.rest.map((ast) => ({
          ast,
          parser: compileConstructorDefault(ast)
        }));
      }
      const len = input.length;
      const state = {
        ast,
        getParser,
        input,
        len,
        tailThreshold: Math.max(elementLen, len - tailLen),
        output: new globalThis.Array(len),
        issues: undefined,
        options
      };
      const end = ast.rest.length === 0 ? elementLen : Math.max(len, elementLen + tailLen);
      const concurrency = options.concurrency === undefined ? 1 : resolveConcurrency(options.concurrency);
      const eff = concurrency === 1 ? parseArray(state, input, 0, end) : parseArrayConcurrent(state, input, {
        concurrency,
        end
      });
      if (eff)
        yield* eff;
      if (ast.rest.length === 0 && len > elementLen) {
        for (let i = elementLen;i <= len - 1; i++) {
          const unexpected = new UnexpectedKey(ast, input[i], options);
          const issue = new Pointer([i], unexpected);
          if (options.errors === "all") {
            if (state.issues)
              state.issues.push(issue);
            else
              state.issues = [issue];
          } else {
            return yield* fail6(new Composite(ast, [issue], input, options));
          }
        }
      }
      if (state.issues) {
        return yield* fail6(new Composite(ast, state.issues, input, options));
      }
      return state.output;
    });
  }
  _rebuild(recur, checks, encodingChecks) {
    const elements = mapOrSame(this.elements, recur);
    const rest = mapOrSame(this.rest, recur);
    return elements === this.elements && rest === this.rest && checks === this.checks && encodingChecks === this.encodingChecks ? this : new Arrays(this.isMutable, elements, rest, this.annotations, checks, undefined, this.context, encodingChecks);
  }
  recur(recur) {
    return this._rebuild(recur, this.checks, this.encodingChecks);
  }
  flip(recur) {
    return this._rebuild(recur, this.encodingChecks, this.checks);
  }
  getExpected() {
    return "array";
  }
};
var parseArrayOptions = {
  onItem(s, item, i) {
    const value = i < s.len ? item : missing;
    return s.getParser(s.tailThreshold, i).parser(value, s.options);
  },
  step(s, item, exit, i) {
    if (exit._tag === "Failure") {
      return wrapPropertyKeyIssue(s, s.ast, i, exit);
    }
    const value = exit === sameExit ? item : exit[args];
    if (value !== missing) {
      s.output[i] = value;
    } else {
      const p = s.getParser(s.tailThreshold, i);
      if (isOptional(p.ast))
        return;
      const issue = new Pointer([i], new MissingKey(p.ast.context?.annotations));
      if (s.options.errors === "all") {
        if (s.issues)
          s.issues.push(issue);
        else
          s.issues = [issue];
      } else {
        return fail4(new Composite(s.ast, [issue], s.input, s.options));
      }
    }
  }
};
var parseArray = /* @__PURE__ */ iterateEager()(parseArrayOptions);
var parseArrayConcurrent = /* @__PURE__ */ iterateConcurrent()(parseArrayOptions);
var wrapPropertyKeyIssue = (s, ast, key, exit) => {
  if (exit.cause.reasons.length === 0) {
    return exit;
  }
  const issue = getSchemaIssue(exit.cause);
  if (issue === undefined) {
    return failCause2(map6(exit.cause, (issue) => new Composite(ast, [new Pointer([key], issue)], s.input, s.options)));
  }
  const pointer = new Pointer([key], issue);
  if (s.options.errors === "all") {
    if (s.issues)
      s.issues.push(pointer);
    else
      s.issues = [pointer];
  } else {
    return fail4(new Composite(ast, [pointer], s.input, s.options));
  }
};
var FINITE_PATTERN = "[+-]?\\d*\\.?\\d+(?:[Ee][+-]?\\d+)?";
function getIndexSignatureKeys(input, parameter, options = defaultParseOptions) {
  let stringKeys;
  let symbolKeys;
  function go(parameter) {
    switch (parameter._tag) {
      case "String":
      case "TemplateLiteral":
        return (stringKeys ??= Object.keys(input)).filter((k) => parameter.matchPart(k, options) !== undefined);
      case "Number":
        return (stringKeys ??= Object.keys(input)).filter((k) => parameter.matchKey(k, options) !== undefined);
      case "Symbol":
        return (symbolKeys ??= Object.getOwnPropertySymbols(input)).filter((k) => parameter.matchKey(k, options) !== undefined);
      case "Union":
        return [...new Set(parameter.types.flatMap(go))];
      default:
        return [];
    }
  }
  return go(parameterFromPropertyKey(toEncoded(parameter)));
}
var PropertySignature = class {
  name;
  type;
  constructor(name, type) {
    this.name = name;
    this.type = type;
  }
};
function isIndexSignatureParameterSide(ast) {
  switch (ast._tag) {
    case "String":
    case "Number":
    case "Symbol":
    case "TemplateLiteral":
      return true;
    case "Union":
      return ast.types.every(isIndexSignatureParameterSide);
    default:
      return false;
  }
}
function isIndexSignatureParameterEncodedSide(ast) {
  const encoded = getLastEncoding(ast);
  switch (encoded._tag) {
    case "String":
    case "Number":
    case "Symbol":
    case "TemplateLiteral":
      return true;
    case "Union":
      return encoded.types.every(isIndexSignatureParameterEncodedSide);
    default:
      return false;
  }
}
function isIndexSignatureParameter(ast) {
  return isIndexSignatureParameterSide(ast) && isIndexSignatureParameterEncodedSide(ast);
}
var IndexSignature = class {
  parameter;
  type;
  constructor(parameter, type) {
    if (!isIndexSignatureParameter(parameter)) {
      throw new Error(`Invalid index signature parameter ${parameter._tag}`);
    }
    this.parameter = parameter;
    this.type = type;
    if (isOptional(type) && !containsUndefined(type)) {
      throw new Error("Cannot use `Schema.optionalKey` with index signatures, use `Schema.optional` instead.");
    }
  }
};
var Objects = class extends ASTNodeImpl {
  _tag = "Objects";
  propertySignatures;
  indexSignatures;
  encodingChecks;
  constructor(propertySignatures, indexSignatures, annotations, checks, encoding, context, encodingChecks) {
    super(annotations, checks, encoding, context);
    this.propertySignatures = propertySignatures;
    this.indexSignatures = indexSignatures;
    this.encodingChecks = encodingChecks;
    const seen = new Set;
    const duplicates = [];
    for (const propertySignature of propertySignatures) {
      const name = propertySignature.name;
      if (seen.has(name)) {
        duplicates.push(name);
      } else {
        seen.add(name);
      }
    }
    if (duplicates.length > 0) {
      throw new Error(`Duplicate identifiers: ${JSON.stringify(duplicates)}. ts(2300)`);
    }
  }
  getParser(compile, compileConstructorDefault = compile) {
    const ast = this;
    const expectedKeys = [];
    for (const ps of ast.propertySignatures) {
      expectedKeys.push(typeof ps.name === "number" ? globalThis.String(ps.name) : ps.name);
    }
    const hasProperties = expectedKeys.length;
    const indexCount = ast.indexSignatures.length;
    let expectedKeysSet = hasProperties && indexCount ? new Set(expectedKeys) : undefined;
    if (!hasProperties && !indexCount) {
      return fromRefinement(ast, isNotNullish);
    }
    let properties;
    let indexes;
    const finishIndex = (s, key, k2, inputValue, exitValue) => {
      if (exitValue._tag === "Failure") {
        return wrapPropertyKeyIssue(s, ast, key, exitValue) ?? void_2;
      }
      const value = exitValue === sameExit ? inputValue : exitValue[args];
      if (k2 !== missing && value !== missing) {
        if (hasProperties && (expectedKeysSet.has(key) || expectedKeysSet.has(typeof k2 === "number" ? globalThis.String(k2) : k2)))
          return void_2;
        assignProperty(s.out, k2, value);
      }
      return void_2;
    };
    const parseIndex = (s, key, index, exitKey) => {
      if (!exitKey) {
        const eff = index.parserKey(key, s.options);
        if (!effectIsExit(eff)) {
          return flatMap5(exit2(eff), (exit) => parseIndex(s, key, index, exit));
        }
        exitKey = eff;
      }
      if (exitKey._tag === "Failure") {
        return wrapPropertyKeyIssue(s, ast, key, exitKey) ?? void_2;
      }
      const k2 = exitKey === sameExit ? key : exitKey[args];
      const inputValue = s.input[key];
      const result = index.parserValue(inputValue, s.options);
      return effectIsExit(result) ? finishIndex(s, key, k2, inputValue, result) : flatMap5(exit2(result), (exit) => finishIndex(s, key, k2, inputValue, exit));
    };
    const parseStringIndex = (s, key, index) => {
      const inputValue = s.input[key];
      const result = index.parserValue(inputValue, s.options);
      return effectIsExit(result) ? finishIndex(s, key, key, inputValue, result) : flatMap5(exit2(result), (exit) => finishIndex(s, key, key, inputValue, exit));
    };
    const parseIndexes = indexCount ? iterateConcurrent()({
      onItem: (s, [key, index]) => index.is.parameter === string2 ? parseStringIndex(s, key, index) : parseIndex(s, key, index),
      step: (_s, _item, exit) => exit._tag === "Failure" ? exit : undefined
    }) : undefined;
    const compileMembers = () => {
      if (!properties) {
        properties = ast.propertySignatures.map((ps) => ({
          parser: compileConstructorDefault(ps.type),
          name: ps.name,
          type: ps.type
        }));
        indexes = indexCount ? ast.indexSignatures.map((is) => ({
          is,
          parserKey: compile(parameterFromPropertyKey(is.parameter)),
          parserValue: compileConstructorDefault(is.type)
        })) : undefined;
      }
      return properties;
    };
    const fallback = fnUntracedEager2(function* (input, options) {
      if (input === missing) {
        return missing;
      }
      if (!(typeof input === "object" && input !== null && !Array.isArray(input))) {
        return yield* fail6(new InvalidType(ast, input, options));
      }
      compileMembers();
      const record = input;
      const out = {};
      const state = {
        ast,
        input: record,
        out,
        issues: undefined,
        options
      };
      const errorsAllOption = options.errors === "all";
      const onExcessPropertyError = options.onExcessProperty === "error";
      const concurrency = options.concurrency === undefined ? 1 : resolveConcurrency(options.concurrency);
      const indexKeys = indexCount && onExcessPropertyError ? ast.indexSignatures.map((index) => getIndexSignatureKeys(record, index.parameter, options)) : undefined;
      if (onExcessPropertyError) {
        expectedKeysSet ??= new Set(expectedKeys);
        const coveredKeys = indexKeys ? new Set(expectedKeysSet) : expectedKeysSet;
        if (indexKeys) {
          for (const keys of indexKeys) {
            for (const key of keys)
              coveredKeys.add(key);
          }
        }
        const inputKeys = Reflect.ownKeys(record);
        for (let i = 0;i < inputKeys.length; i++) {
          const key = inputKeys[i];
          if (!coveredKeys.has(key)) {
            const unexpected = new UnexpectedKey(ast, record[key], options);
            const issue = new Pointer([key], unexpected);
            if (errorsAllOption) {
              if (state.issues) {
                state.issues.push(issue);
              } else {
                state.issues = [issue];
              }
              continue;
            } else {
              return yield* fail6(new Composite(ast, [issue], input, options));
            }
          }
        }
      }
      if (hasProperties) {
        const eff = concurrency === 1 ? parseProperties(state, properties) : parsePropertiesConcurrent(state, properties, {
          concurrency
        });
        if (eff)
          yield* eff;
      }
      if (indexCount && concurrency === 1) {
        for (let i = 0;i < indexCount; i++) {
          const index = indexes[i];
          const parse = index.is.parameter === string2 ? parseStringIndex : parseIndex;
          const keys = indexKeys?.[i] ?? (index.is.parameter === string2 ? Object.keys(record) : getIndexSignatureKeys(record, index.is.parameter, options));
          for (let j = 0;j < keys.length; j++) {
            const eff = parse(state, keys[j], index);
            if (!effectIsExit(eff))
              yield* eff;
            else if (eff._tag === "Failure")
              return yield* eff;
          }
        }
      } else if (parseIndexes) {
        const keyPairs = empty();
        for (let i = 0;i < indexCount; i++) {
          const index = indexes[i];
          const keys = indexKeys?.[i] ?? (index.is.parameter === string2 ? Object.keys(record) : getIndexSignatureKeys(record, index.is.parameter, options));
          for (let j = 0;j < keys.length; j++) {
            keyPairs.push([keys[j], index]);
          }
        }
        const eff = parseIndexes(state, keyPairs, {
          concurrency
        });
        if (eff)
          yield* eff;
      }
      if (state.issues) {
        return yield* fail6(new Composite(ast, state.issues, input, options));
      }
      return out;
    });
    if (indexCount)
      return fallback;
    const resume = (state, index, pending) => {
      const property = properties[index];
      return flatMap5(exit2(pending), (exit) => {
        const terminal = stepProperty(state, property, exit);
        if (terminal)
          return terminal;
        const done = () => succeed8(state.out);
        const eff = parseProperties(state, properties.slice(index + 1));
        return eff ? flatMapEager2(eff, done) : done();
      });
    };
    return (input, options) => {
      if (input === missing)
        return missingExit;
      if (options.errors === "all" || options.onExcessProperty !== undefined || options.concurrency !== undefined && resolveConcurrency(options.concurrency) !== 1) {
        return fallback(input, options);
      }
      if (!(typeof input === "object" && input !== null && !Array.isArray(input))) {
        return fail6(new InvalidType(ast, input, options));
      }
      const props = compileMembers();
      const record = input;
      const out = {};
      const state = {
        ast,
        input: record,
        out,
        issues: undefined,
        options
      };
      try {
        for (let index = 0;index < props.length; index++) {
          const property = props[index];
          const name = property.name;
          const hasKey = hasPropertySignature(record, name);
          const value = hasKey ? record[name] : missing;
          const exit = property.parser(value, options);
          if (!effectIsExit(exit)) {
            return resume(state, index, exit);
          }
          if (exit === sameExit) {
            if (hasKey)
              assignProperty(out, name, value);
            continue;
          }
          const terminal = stepProperty(state, property, exit);
          if (terminal)
            return terminal;
        }
      } catch (error) {
        return die2(error);
      }
      return succeed8(out);
    };
  }
  _rebuild(recur, recurParameter, checks, encodingChecks) {
    const props = mapOrSame(this.propertySignatures, (ps) => {
      const t = recur(ps.type);
      return t === ps.type ? ps : new PropertySignature(ps.name, t);
    });
    const indexes = mapOrSame(this.indexSignatures, (is) => {
      const p = recurParameter(is.parameter);
      const t = recur(is.type);
      return p === is.parameter && t === is.type ? is : new IndexSignature(p, t);
    });
    return props === this.propertySignatures && indexes === this.indexSignatures && checks === this.checks && encodingChecks === this.encodingChecks ? this : new Objects(props, indexes, this.annotations, checks, undefined, this.context, encodingChecks);
  }
  flip(recur) {
    return this._rebuild(recur, recur, this.encodingChecks, this.checks);
  }
  recur(recur, recurParameter = recur) {
    return this._rebuild(recur, recurParameter, this.checks, this.encodingChecks);
  }
  getExpected() {
    if (this.propertySignatures.length === 0 && this.indexSignatures.length === 0)
      return "object | array";
    return "object";
  }
};
function stepProperty(s, p, exit) {
  if (exit._tag === "Failure") {
    return wrapPropertyKeyIssue(s, s.ast, p.name, exit);
  }
  if (exit === sameExit)
    return;
  const value = exit[args];
  if (value !== missing) {
    assignProperty(s.out, p.name, value);
    return;
  }
  delete s.out[p.name];
  if (!isOptional(p.type)) {
    const issue = new Pointer([p.name], new MissingKey(p.type.context?.annotations));
    if (s.options.errors === "all") {
      if (s.issues)
        s.issues.push(issue);
      else
        s.issues = [issue];
      return;
    } else {
      return fail4(new Composite(s.ast, [issue], s.input, s.options));
    }
  }
}
var parsePropertiesOptions = {
  onItem(s, p) {
    if (!hasPropertySignature(s.input, p.name)) {
      return p.parser(missing, s.options);
    }
    const value = s.input[p.name];
    assignProperty(s.out, p.name, value);
    return p.parser(value, s.options);
  },
  step: stepProperty
};
var parseProperties = /* @__PURE__ */ iterateEager()(parsePropertiesOptions);
var parsePropertiesConcurrent = /* @__PURE__ */ iterateConcurrent()(parsePropertiesOptions);
function combineChecks(a, b) {
  if (!a)
    return b;
  if (!b)
    return a;
  return [...a, ...b];
}
function struct(fields, checks, annotations) {
  return new Objects(Reflect.ownKeys(fields).map((key) => {
    return new PropertySignature(key, fields[key].ast);
  }), [], annotations, checks);
}
function getAST(self) {
  return self.ast;
}
function tuple(elements, checks = undefined) {
  return new Arrays(false, elements.map((e) => e.ast), [], undefined, checks);
}
function union(members, options, checks) {
  return new Union(members.map(getAST), options, undefined, checks);
}
function structWithRest(ast, records) {
  if (ast.encoding || records.some((r) => r.encoding)) {
    throw new Error("StructWithRest does not support encodings");
  }
  let propertySignatures = ast.propertySignatures;
  let indexSignatures = ast.indexSignatures;
  let checks = ast.checks;
  for (const record of records) {
    propertySignatures = propertySignatures.concat(record.propertySignatures);
    indexSignatures = indexSignatures.concat(record.indexSignatures);
    checks = combineChecks(checks, record.checks);
  }
  return new Objects(propertySignatures, indexSignatures, undefined, checks);
}
var toCandidate = /* @__PURE__ */ memoizeIdempotent((ast) => {
  while (true) {
    if (isSuspend(ast))
      return unknown;
    const encoding = ast.encoding;
    if (!encoding) {
      return ast.recur?.(toCandidate, identity) ?? ast;
    }
    if (encoding.some((link) => link.transformation._tag === "Middleware" && link.transformation.decode !== identity))
      return unknown;
    ast = encoding[encoding.length - 1].to;
  }
});
function getCandidateTypes(ast) {
  switch (ast._tag) {
    case "Null":
      return ["null"];
    case "Undefined":
      return ["undefined"];
    case "String":
    case "TemplateLiteral":
      return ["string"];
    case "Number":
      return ["number"];
    case "Boolean":
      return ["boolean"];
    case "Symbol":
    case "UniqueSymbol":
      return ["symbol"];
    case "BigInt":
      return ["bigint"];
    case "Arrays":
      return ["array"];
    case "ObjectKeyword":
      return ["object", "array", "function"];
    case "Objects":
      return ast.propertySignatures.length || ast.indexSignatures.length ? ["object"] : ["string", "number", "boolean", "symbol", "bigint", "object", "array", "function"];
    case "Enum":
      return Array.from(new Set(ast.enums.map(([, v]) => typeof v)));
    case "Literal":
      return [typeof ast.literal];
    case "Union":
      return Array.from(new Set(ast.types.flatMap(getCandidateTypes)));
    default:
      return ["null", "undefined", "string", "number", "boolean", "symbol", "bigint", "object", "array", "function"];
  }
}
function collectSentinels(ast) {
  switch (ast._tag) {
    default:
      return [];
    case "Declaration": {
      const s = ast.annotations?.[SENTINELS_ANNOTATION_KEY];
      return Array.isArray(s) ? s : [];
    }
    case "Objects":
      return ast.propertySignatures.flatMap((ps) => {
        const type = ps.type;
        if (!isOptional(type)) {
          if (isLiteral(type)) {
            return [{
              key: ps.name,
              literal: type.literal
            }];
          }
          if (isUniqueSymbol(type)) {
            return [{
              key: ps.name,
              literal: type.symbol
            }];
          }
        }
        return [];
      });
    case "Arrays":
      return ast.elements.flatMap((e, i) => {
        if (!isOptional(e)) {
          if (isLiteral(e)) {
            return [{
              key: i,
              literal: e.literal
            }];
          }
          if (isUniqueSymbol(e)) {
            return [{
              key: i,
              literal: e.symbol
            }];
          }
        }
        return [];
      });
    case "Union": {
      if (ast.types.length === 0)
        return [];
      const members = ast.types.map((type) => collectSentinels(toCandidate(type)));
      return members[0].filter((s) => members.every((sentinels) => sentinels.some((o) => o.key === s.key && o.literal === s.literal)));
    }
    case "Suspend":
      return collectSentinels(ast.thunk());
  }
}
var candidateIndexCache = /* @__PURE__ */ new WeakMap;
var emptyCandidates = /* @__PURE__ */ Object.freeze([]);
var hasPropertySignature = (input, key) => key === "__proto__" ? Object.hasOwn(input, key) : (key in input);
function getIndex(types) {
  let index = candidateIndexCache.get(types);
  if (index)
    return index;
  let bySentinel;
  let sentinelCandidateCount = 0;
  let otherwise;
  let literalCandidates;
  let onlyLiterals = true;
  for (let i = 0;i < types.length; i++) {
    const a = types[i];
    const encoded = toCandidate(a);
    if (isNever2(encoded))
      continue;
    if (onlyLiterals) {
      if (isLiteral(encoded) || isUniqueSymbol(encoded)) {
        literalCandidates ??= new Map;
        const literal = isLiteral(encoded) ? encoded.literal : encoded.symbol;
        let arr = literalCandidates.get(literal);
        if (!arr)
          literalCandidates.set(literal, arr = []);
        arr.push(a);
      } else {
        onlyLiterals = false;
      }
    }
    const sentinels = collectSentinels(encoded);
    if (sentinels.length) {
      bySentinel ??= new Map;
      sentinelCandidateCount++;
      for (const {
        key,
        literal
      } of sentinels) {
        let entry = bySentinel.get(key);
        if (!entry)
          bySentinel.set(key, entry = [new Map, new Set]);
        entry[1].add(i);
        let indexes = entry[0].get(literal);
        if (!indexes)
          entry[0].set(literal, indexes = new Set);
        indexes.add(i);
      }
    } else {
      otherwise ??= {};
      const candidateTypes = getCandidateTypes(encoded);
      for (const t of candidateTypes)
        (otherwise[t] ??= []).push(i);
    }
  }
  if (onlyLiterals && literalCandidates) {
    literalCandidates.forEach(Object.freeze);
    index = (input) => literalCandidates.get(input) ?? emptyCandidates;
  } else if (bySentinel?.size === 1 && !otherwise) {
    const [key, [byValue]] = bySentinel.entries().next().value;
    const candidates = byValue;
    for (const [literal, indexes] of byValue) {
      candidates.set(literal, Object.freeze(Array.from(indexes, (index) => types[index])));
    }
    index = (input, isConstructor) => {
      if (isObjectKeyword(input)) {
        const value = hasPropertySignature(input, key) ? input[key] : undefined;
        if (value !== undefined)
          return candidates.get(value) ?? emptyCandidates;
        if (isConstructor)
          return types;
      }
      return emptyCandidates;
    };
  } else if (bySentinel) {
    let commonSentinel;
    for (const entry of bySentinel) {
      if ((!commonSentinel || entry[1][0].size > commonSentinel[1][0].size) && entry[1][1].size === sentinelCandidateCount) {
        commonSentinel = entry;
      }
    }
    index = (input, isConstructor) => {
      const runtimeType = input === null ? "null" : Array.isArray(input) ? "array" : typeof input;
      const base = otherwise?.[runtimeType] ?? emptyCandidates;
      if (!isObjectKeyword(input))
        return base.map((i) => types[i]);
      const selected = new Set(base);
      let directKey;
      if (commonSentinel) {
        const [key, [byValue]] = commonSentinel;
        const hasKey = hasPropertySignature(input, key);
        const value = hasKey ? input[key] : undefined;
        if (hasKey && (!isConstructor || value !== undefined)) {
          const match = byValue.get(value);
          if (!match)
            return base.map((i) => types[i]);
          for (const i of match)
            selected.add(i);
          directKey = key;
        }
      }
      if (directKey === undefined) {
        for (const [key, [byValue, all]] of bySentinel) {
          const hasKey = hasPropertySignature(input, key);
          const value = hasKey ? input[key] : undefined;
          if (hasKey && (!isConstructor || value !== undefined)) {
            const match = byValue.get(value);
            if (match) {
              for (const i of match)
                selected.add(i);
            }
          } else if (isConstructor) {
            for (const i of all)
              selected.add(i);
          }
        }
      }
      for (const [key, [byValue, all]] of bySentinel) {
        if (key === directKey)
          continue;
        const hasKey = hasPropertySignature(input, key);
        const value = hasKey ? input[key] : undefined;
        if (hasKey && (!isConstructor || value !== undefined)) {
          const match = byValue.get(value);
          for (const i of selected) {
            if (all.has(i) && !match?.has(i))
              selected.delete(i);
          }
        }
      }
      return Array.from(selected).sort((a, b) => a - b).map((i) => types[i]);
    };
  } else {
    index = (input) => {
      const runtimeType = input === null ? "null" : Array.isArray(input) ? "array" : typeof input;
      return (otherwise?.[runtimeType] ?? emptyCandidates).map((i) => types[i]).filter(filterLiterals(input));
    };
  }
  candidateIndexCache.set(types, index);
  return index;
}
function filterLiterals(input) {
  return (ast) => {
    const encoded = toCandidate(ast);
    return encoded._tag === "Literal" ? encoded.literal === input : encoded._tag === "UniqueSymbol" ? encoded.symbol === input : true;
  };
}
function getCandidates(input, types, isConstructor = false) {
  return getIndex(types)(input, isConstructor);
}
var Union = class extends ASTNodeImpl {
  _tag = "Union";
  types;
  options;
  encodingChecks;
  constructor(types, options, annotations, checks, encoding, context, encodingChecks) {
    super(annotations, checks, encoding, context);
    this.types = types;
    this.options = options;
    this.encodingChecks = encodingChecks;
  }
  getParser(compile, compileConstructorDefault) {
    const ast = this;
    return (input, options) => {
      if (input === missing) {
        return missingExit;
      }
      const candidates = getCandidates(input, ast.types, compileConstructorDefault !== undefined);
      if (candidates.length === 0) {
        return fail6(new AnyOf(ast, [], input, options));
      }
      if (candidates.length === 1) {
        const result = compile(candidates[0])(input, options);
        if (result._tag === "Success")
          return result;
        return effectIsExit(result) ? failSingleUnionCandidate(ast, result.cause, input, options) : catchCause2(result, (cause) => failSingleUnionCandidate(ast, cause, input, options));
      }
      const state = {
        ast,
        compile,
        input,
        out: undefined,
        successes: ast.options?.mode === "oneOf" ? [] : undefined,
        issues: undefined,
        options
      };
      const eff = parseUnion(state, candidates);
      if (!eff) {
        if (state.out)
          return state.out;
        return fail6(new AnyOf(ast, state.issues ?? [], input, options));
      }
      return flatMapEager2(eff, (_) => {
        if (state.out === sameExit)
          return succeed6(input);
        if (state.out)
          return state.out;
        return fail6(new AnyOf(ast, state.issues ?? [], input, options));
      });
    };
  }
  _rebuild(recur, checks, encodingChecks) {
    const types = mapOrSame(this.types, recur);
    return types === this.types && checks === this.checks && encodingChecks === this.encodingChecks ? this : new Union(types, this.options, this.annotations, checks, undefined, this.context, encodingChecks);
  }
  recur(recur) {
    return this._rebuild(recur, this.checks, this.encodingChecks);
  }
  flip(recur) {
    return this._rebuild(recur, this.encodingChecks, this.checks);
  }
  matchPart(s, options) {
    for (const type of this.types) {
      const out = type.matchPart(s, options);
      if (out !== undefined)
        return out;
    }
    return;
  }
  getExpected(getExpected) {
    const expected = this.annotations?.expected;
    if (typeof expected === "string")
      return expected;
    if (this.types.length === 0)
      return "never";
    const types = this.types.map((type) => {
      const encoded = toEncoded(type);
      switch (encoded._tag) {
        case "Arrays": {
          const literals = encoded.elements.filter(isLiteral);
          if (literals.length > 0) {
            return `${formatIsMutable(encoded.isMutable)}[ ${literals.map((e) => getExpected(e) + formatIsOptional(e.context?.isOptional)).join(", ")}, ... ]`;
          }
          break;
        }
        case "Objects": {
          const literals = encoded.propertySignatures.filter((ps) => isLiteral(ps.type));
          if (literals.length > 0) {
            return `{ ${literals.map((ps) => `${formatIsMutable(ps.type.context?.isMutable)}${formatPropertyKey(ps.name)}${formatIsOptional(ps.type.context?.isOptional)}: ${getExpected(ps.type)}`).join(", ")}, ... }`;
          }
          break;
        }
      }
      return getExpected(encoded);
    });
    return Array.from(new Set(types)).join(" | ");
  }
};
function failSingleUnionCandidate(ast, cause, input, options) {
  const issue = getSchemaIssue(cause);
  if (!issue)
    return failCause2(cause);
  return fail4(new AnyOf(ast, [issue], input, options));
}
var parseUnion = /* @__PURE__ */ iterateEager()({
  onItem(s, ast) {
    const parser = s.compile(ast);
    return parser(s.input, s.options);
  },
  step(s, candidate, exit) {
    if (exit._tag === "Failure") {
      const issue = getSchemaIssue(exit.cause);
      if (issue === undefined) {
        return exit;
      }
      if (s.issues)
        s.issues.push(issue);
      else
        s.issues = [issue];
    } else {
      if (s.out && s.successes) {
        s.successes.push(candidate);
        return fail4(new OneOf(s.ast, s.successes, s.input, s.options));
      }
      s.out = exit;
      if (s.successes) {
        s.successes.push(candidate);
      } else {
        return void_2;
      }
    }
  }
});
var nonFiniteLiterals = /* @__PURE__ */ new Union([/* @__PURE__ */ new Literal("Infinity"), /* @__PURE__ */ new Literal("-Infinity"), /* @__PURE__ */ new Literal("NaN")]);
function formatIsMutable(isMutable) {
  return isMutable ? "" : "readonly ";
}
function formatIsOptional(isOptional) {
  return isOptional ? "?" : "";
}
var Filter2 = class extends Class {
  _tag = "Filter";
  run;
  annotations;
  aborted;
  constructor(run, annotations = undefined, aborted = false) {
    super();
    this.run = run;
    this.annotations = annotations;
    this.aborted = aborted;
  }
  annotate(annotations) {
    return new Filter2(this.run, {
      ...this.annotations,
      ...annotations
    }, this.aborted);
  }
  abort() {
    return new Filter2(this.run, this.annotations, true);
  }
  and(other, annotations) {
    return new FilterGroup([this, other], annotations);
  }
};
var FilterGroup = class extends Class {
  _tag = "FilterGroup";
  checks;
  annotations;
  constructor(checks, annotations = undefined) {
    super();
    this.checks = checks;
    this.annotations = annotations;
  }
  annotate(annotations) {
    return new FilterGroup(this.checks, {
      ...this.annotations,
      ...annotations
    });
  }
  and(other, annotations) {
    return new FilterGroup([this, other], annotations);
  }
};
function makeFilter(filter, annotations, aborted = false) {
  return new Filter2((input, ast, options) => normalizeFilterOutput(ast, filter(input, ast, options), input, options), annotations, aborted);
}
function isFinite2(annotations) {
  return makeFilter((n) => globalThis.Number.isFinite(n), {
    expected: "a finite number",
    representation: {
      id: "effect/schema/isFinite",
      payload: null
    },
    toJsonSchema: () => ({
      type: "number"
    }),
    toCode: () => ({
      runtime: "Schema.isFinite()"
    }),
    arbitraryConstraint: {
      number: "finite"
    },
    ...annotations
  });
}
var finite = /* @__PURE__ */ appendChecks(number2, [/* @__PURE__ */ isFinite2()]);
var numberToJson = /* @__PURE__ */ new Link(/* @__PURE__ */ new Union([finite, nonFiniteLiterals]), /* @__PURE__ */ new Transformation(/* @__PURE__ */ Number4(), /* @__PURE__ */ transform((n) => globalThis.Number.isFinite(n) ? n : globalThis.String(n))));
function isPattern(regExp, annotations) {
  const source = regExp.source;
  const pattern = new globalThis.RegExp(source, regExp.flags);
  return makeFilter((s) => {
    pattern.lastIndex = 0;
    return pattern.test(s);
  }, {
    expected: `a string matching the RegExp ${source}`,
    representation: {
      id: "effect/schema/isPattern",
      payload: {
        source,
        flags: regExp.flags
      }
    },
    toJsonSchema: () => ({
      pattern: source
    }),
    arbitraryConstraint: {
      patterns: [{
        source: regExp.source,
        flags: regExp.flags
      }]
    },
    ...annotations
  });
}
function modifyOwnPropertyDescriptors(ast, f) {
  const d = Object.getOwnPropertyDescriptors(ast);
  f(d);
  return Object.create(Object.getPrototypeOf(ast), d);
}
var contextOwners = /* @__PURE__ */ new WeakMap;
function getContextOwner(ast) {
  return contextOwners.get(ast) ?? ast;
}
function replaceEncoding(ast, encoding) {
  if (ast.encoding === encoding) {
    return ast;
  }
  return modifyOwnPropertyDescriptors(ast, (d) => {
    d.encoding.value = encoding;
  });
}
function replaceContext(ast, context) {
  if (ast.context === context) {
    return ast;
  }
  const owner = getContextOwner(ast);
  if (owner.context === context) {
    return owner;
  }
  const out = modifyOwnPropertyDescriptors(ast, (d) => {
    d.context.value = context;
  });
  contextOwners.set(out, owner);
  return out;
}
function getLastEncoding(ast) {
  return ast.encoding ? getLastEncoding(ast.encoding[ast.encoding.length - 1].to) : ast;
}
function annotate(ast, annotations) {
  if (ast.checks) {
    const last = ast.checks[ast.checks.length - 1];
    return replaceChecks(ast, append(ast.checks.slice(0, -1), last.annotate(annotations)));
  }
  return modifyOwnPropertyDescriptors(ast, (d) => {
    d.annotations.value = {
      ...d.annotations.value,
      ...annotations
    };
  });
}
function replaceChecks(ast, checks) {
  if (ast._tag === "Suspend" && checks) {
    throw new Error("Cannot add checks to Suspend");
  }
  if (ast.checks === checks) {
    return ast;
  }
  return modifyOwnPropertyDescriptors(ast, (d) => {
    d.checks.value = checks;
  });
}
function appendChecks(ast, checks) {
  return replaceChecks(ast, combineChecks(ast.checks, checks));
}
function mapLink(link, f) {
  const to = f(link.to);
  return to === link.to ? link : new Link(to, link.transformation);
}
function updateLastLink(encoding, f) {
  const links = encoding;
  const last = links[links.length - 1];
  const out = mapLink(last, f);
  return out === last ? encoding : append(encoding.slice(0, encoding.length - 1), out);
}
function applyToLastLink(f) {
  return (ast) => ast.encoding ? replaceEncoding(ast, updateLastLink(ast.encoding, f)) : ast;
}
function replaceContextLastLink(ast, context) {
  return applyToLastLink((ast) => replaceContext(ast, context))(ast);
}
function applyToSelfOrLastLinkEncoding(f) {
  function out(ast) {
    return ast.encoding ? replaceEncoding(ast, updateLastLink(ast.encoding, out)) : f(ast);
  }
  return memoize(out);
}
function applyToSelfOrLastLinkEncodingIdempotent(f, options) {
  function out(ast) {
    if (ast.encoding) {
      const last = ast.encoding[ast.encoding.length - 1];
      return options?.stopAt?.(last) ? ast : replaceEncoding(ast, updateLastLink(ast.encoding, out));
    }
    return f(ast);
  }
  return memoizeIdempotent(out);
}
function appendTransformation(from, transformation, to) {
  const link = new Link(from, transformation);
  return replaceEncoding(to, to.encoding ? [...to.encoding, link] : [link]);
}
function mapOrSame(as, f) {
  let changed = false;
  const out = new Array(as.length);
  for (let i = 0;i < as.length; i++) {
    const a = as[i];
    const fa = f(a);
    if (fa !== a) {
      changed = true;
    }
    out[i] = fa;
  }
  return changed ? out : as;
}
function annotateKey(ast, annotations) {
  const context = ast.context ? new Context(ast.context.isOptional, ast.context.isMutable, ast.context.constructorDefault, {
    ...ast.context.annotations,
    ...annotations
  }) : new Context(false, false, undefined, annotations);
  return replaceContext(ast, context);
}
var optionalKey = /* @__PURE__ */ memoizeIdempotent((ast) => {
  const context = ast.context ? ast.context.isOptional === false ? new Context(true, ast.context.isMutable, ast.context.constructorDefault, ast.context.annotations) : ast.context : new Context(true, false);
  return optionalKeyLastLink(replaceContext(ast, context));
});
var optionalKeyLastLink = /* @__PURE__ */ applyToLastLink(optionalKey);
var optional = /* @__PURE__ */ memoize((ast) => optionalKey(new Union([ast, undefined_2])));
function withConstructorDefault(ast, defaultValue) {
  const transformation = new Transformation(withDefault(defaultValue), passthrough());
  const constructorDefault = new Link(unknown, transformation);
  const context = ast.context ? new Context(ast.context.isOptional, ast.context.isMutable, constructorDefault, ast.context.annotations) : new Context(false, false, constructorDefault);
  return replaceContext(ast, context);
}
function decodeTo(from, to, transformation) {
  return appendTransformation(from, transformation, to);
}
function parseParameter(ast) {
  const literals = [];
  const parameters = [];
  function go(ast) {
    switch (ast._tag) {
      case "Literal":
        if (isPropertyKey(ast.literal)) {
          literals.push(ast.literal);
        }
        return;
      case "UniqueSymbol":
        literals.push(ast.symbol);
        return;
      case "Never":
        return;
      case "Union":
        for (let i = 0;i < ast.types.length; i++) {
          go(ast.types[i]);
        }
        return;
      default:
        parameters.push(ast);
    }
  }
  go(ast);
  return {
    literals,
    parameters
  };
}
function record(key, value) {
  const {
    literals,
    parameters: indexSignatures
  } = parseParameter(key);
  return new Objects(literals.map((literal) => new PropertySignature(literal, value)), indexSignatures.map((parameter) => new IndexSignature(parameter, value)));
}
function isOptional(ast) {
  return ast.context?.isOptional ?? false;
}
function isStructuralCheck(check) {
  return check.annotations?.[STRUCTURAL_ANNOTATION_KEY] === true || check._tag === "FilterGroup" && check.checks.every(isStructuralCheck);
}
function extractStructuralChecks(checks) {
  function extract(check) {
    if (isStructuralCheck(check))
      return [check];
    return check._tag === "FilterGroup" ? check.checks.flatMap(extract) : [];
  }
  const out = checks.flatMap(extract);
  return isArrayNonEmpty2(out) ? out : undefined;
}
var toType = /* @__PURE__ */ memoizeIdempotent((ast) => {
  if (ast.encoding) {
    return toType(replaceEncoding(ast, undefined));
  }
  const out = ast;
  const type = out.recur?.(toType) ?? out;
  const encodingChecks = type.encodingChecks;
  if (encodingChecks) {
    const checks = type === ast ? encodingChecks : isArrays(type) || isObjects(type) || isDeclaration(type) && type.typeParameters.length > 0 ? extractStructuralChecks(encodingChecks) : undefined;
    return modifyOwnPropertyDescriptors(type, (d) => {
      d.encodingChecks.value = undefined;
      d.checks.value = combineChecks(type.checks, checks);
    });
  }
  return type;
});
var toEncoded = /* @__PURE__ */ memoizeIdempotent((ast) => {
  return toType(flip2(ast));
});
function flipEncoding(ast, encoding) {
  const links = encoding;
  const len = links.length;
  const last = links[len - 1];
  const ls = [new Link(flip2(replaceEncoding(ast, undefined)), links[0].transformation.flip())];
  for (let i = 1;i < len; i++) {
    ls.unshift(new Link(flip2(links[i - 1].to), links[i].transformation.flip()));
  }
  const to = flip2(last.to);
  if (to.encoding) {
    return replaceEncoding(to, [...to.encoding, ...ls]);
  } else {
    return replaceEncoding(to, ls);
  }
}
var flip2 = /* @__PURE__ */ memoize((ast) => {
  if (ast.encoding) {
    return flipEncoding(ast, ast.encoding);
  }
  const out = ast;
  return out.flip?.(flip2) ?? out.recur?.(flip2) ?? out;
});
function containsUndefined(ast) {
  switch (ast._tag) {
    case "Undefined":
      return true;
    case "Union":
      return ast.types.some(containsUndefined);
    default:
      return false;
  }
}
function fromConst(ast, value) {
  const succeed = value === 0 ? sameExit : succeed8(value);
  return (input, options) => {
    if (input === missing)
      return missingExit;
    if (input === value)
      return succeed;
    return fail6(new InvalidType(ast, input, options));
  };
}
function fromRefinement(ast, refinement) {
  return (input, options) => {
    if (input === missing)
      return missingExit;
    if (refinement(input))
      return sameExit;
    return fail6(new InvalidType(ast, input, options));
  };
}
var parameterFromPropertyKey = /* @__PURE__ */ applyToSelfOrLastLinkEncodingIdempotent((ast) => {
  switch (ast._tag) {
    default:
      return ast;
    case "Number":
      return ast.toCodecStringTree();
    case "Union":
      return ast.recur(parameterFromPropertyKey);
  }
});
var parameterFromString = /* @__PURE__ */ applyToSelfOrLastLinkEncodingIdempotent((ast) => {
  switch (ast._tag) {
    default:
      return ast;
    case "Symbol":
    case "UniqueSymbol":
      return ast.toCodecStringTree();
    case "Union":
      return ast.recur(parameterFromString);
  }
});
var isStringFiniteRegExp = /* @__PURE__ */ new globalThis.RegExp(`^${FINITE_PATTERN}$`);
var isStringNumberRegExp = /* @__PURE__ */ new globalThis.RegExp(`^(?:${FINITE_PATTERN}|Infinity|-Infinity|NaN)$`);
function isStringFinite(annotations) {
  return isPattern(isStringFiniteRegExp, {
    expected: "a string representing a finite number",
    representation: {
      id: "effect/schema/isStringFinite",
      payload: null
    },
    toJsonSchema: () => ({
      pattern: isStringFiniteRegExp.source
    }),
    ...annotations
  });
}
var finiteString = /* @__PURE__ */ appendChecks(string2, [/* @__PURE__ */ isStringFinite()]);
var finiteToString = /* @__PURE__ */ new Link(finiteString, numberFromString);
var numberToString = /* @__PURE__ */ new Link(/* @__PURE__ */ new Union([finiteString, nonFiniteLiterals]), numberFromString);
var BIGINT_PATTERN = "-?\\d+";
var isStringBigIntRegExp = /* @__PURE__ */ new globalThis.RegExp(`^${BIGINT_PATTERN}$`);
var REGEXP_PATTERN = "Symbol\\(([\\s\\S]*)\\)";
var isStringSymbolRegExp = /* @__PURE__ */ new globalThis.RegExp(`^${REGEXP_PATTERN}$`);
function collectIssues(checks, value, issues, ast, options) {
  for (let i = 0;i < checks.length; i++) {
    const check = checks[i];
    if (check._tag === "FilterGroup") {
      issues = collectIssues(check.checks, value, issues, ast, options);
      if (issues && (options.errors !== "all" || issues[issues.length - 1].filter.aborted)) {
        return issues;
      }
    } else {
      const issue = check.run(value, ast, options);
      if (issue) {
        const filter = new Filter(check, issue, value, options);
        if (issues)
          issues.push(filter);
        else
          issues = [filter];
        if (options.errors !== "all" || check.aborted) {
          return issues;
        }
      }
    }
  }
  return issues;
}
function getConstructorDescriptor(ast) {
  if (!isDeclaration(ast))
    return;
  const getDescriptor = ast.annotations?.[CONSTRUCTOR_ANNOTATION_KEY];
  return isFunction(getDescriptor) ? getDescriptor(ast.typeParameters) : undefined;
}
function isJsonLeaf(u) {
  return u === null || typeof u === "string" || typeof u === "boolean" || typeof u === "number" && globalThis.Number.isFinite(u);
}
function isStringTreeLeaf(u) {
  return u === undefined || typeof u === "string";
}
function isTree(u, isLeaf) {
  const cache = new WeakMap;
  const stack = [];
  outer:
    while (true) {
      if (typeof u !== "object" || u === null) {
        if (!isLeaf(u)) {
          return false;
        }
      } else {
        const value = u;
        const cached = cache.get(value);
        if (cached === false) {
          return false;
        }
        if (cached === undefined) {
          const isArray = Array.isArray(value);
          if (!isArray) {
            const prototype = Object.getPrototypeOf(value);
            if (prototype !== null && prototype !== Object.prototype && Object.getPrototypeOf(prototype) !== null) {
              return false;
            }
          }
          cache.set(value, false);
          stack.push({
            value,
            keys: isArray ? value.length : Object.keys(value),
            index: 0
          });
        }
      }
      while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        const keys = frame.keys;
        if (typeof keys === "number") {
          if (frame.index < keys) {
            u = frame.value[frame.index++];
            continue outer;
          }
        } else if (frame.index < keys.length) {
          u = frame.value[keys[frame.index++]];
          continue outer;
        }
        cache.set(frame.value, true);
        stack.pop();
      }
      return true;
    }
}
function isJson(u) {
  return isTree(u, isJsonLeaf);
}
var Json = /* @__PURE__ */ new Declaration([], () => (input, ast, options) => isJson(input) ? sameExit : fail6(new InvalidType(ast, input, options)), {
  representation: {
    id: "effect/schema/Json",
    payload: null
  },
  expected: "JSON value",
  toCodecJson: () => {
    return;
  },
  toCodecStringTree: () => unknownToStringTree
});
var unknownToJson = /* @__PURE__ */ new Link(Json, /* @__PURE__ */ passthrough2());
var objectKeywordToJson = /* @__PURE__ */ new Link(/* @__PURE__ */ new Union([/* @__PURE__ */ new Arrays(false, [], [Json]), /* @__PURE__ */ new Objects([], [/* @__PURE__ */ new IndexSignature(string2, Json)])]), /* @__PURE__ */ passthrough2());
function isStringTree(u) {
  return isTree(u, isStringTreeLeaf);
}
var StringTree = /* @__PURE__ */ new Declaration([], () => (input, ast, options) => isStringTree(input) ? sameExit : fail6(new InvalidType(ast, input, options)), {
  expected: "StringTree",
  toCodecStringTree: () => {
    return;
  }
});
var unknownToStringTree = /* @__PURE__ */ new Link(StringTree, /* @__PURE__ */ passthrough2());

// node_modules/effect/dist/SchemaParser.js
function makeEffect(schema) {
  const ast = schema.ast;
  let parser;
  return (input, options) => {
    return (parser ??= runWithCompiler(constructorCompiler, toType(ast)))(input, options?.disableChecks ? options?.parseOptions ? {
      ...options.parseOptions,
      disableChecks: true
    } : {
      disableChecks: true
    } : options?.parseOptions);
  };
}
function makeOption(schema) {
  const parser = makeEffect(schema);
  return (input, options) => {
    const exit = runSyncExit2(parser(input, options));
    if (isSuccess3(exit)) {
      return some2(exit.value);
    }
    getSchemaIssueOrThrow(exit.cause, "Option adapter can only return none for schema issues");
    return none2();
  };
}
function make15(schema) {
  const parser = makeEffect(schema);
  return (input, options) => {
    const exit = runSyncExit2(parser(input, options));
    if (isSuccess3(exit)) {
      return exit.value;
    }
    const issue = getSchemaIssueOrThrow(exit.cause, "Constructor adapter can only throw schema issues");
    throw new Error("Schema validation failed", {
      cause: issue
    });
  };
}
function is(schema) {
  return _is(schema.ast);
}
function _is(ast) {
  const parser = asExit(run2(toType(ast)));
  return (input) => {
    const exit = parser(input, defaultParseOptions);
    if (isSuccess3(exit)) {
      return true;
    }
    getSchemaIssueOrThrow(exit.cause, "Type guard adapter can only return false for schema issues");
    return false;
  };
}
function decodeUnknownEffect(schema, options) {
  const parser = run2(schema.ast);
  return options === undefined ? parser : (input, overrideOptions) => parser(input, mergeParseOptions(options, overrideOptions));
}
var mergeParseOptions = (options, overrideOptions) => overrideOptions ? {
  ...options,
  ...overrideOptions
} : options;
var getValue = (value) => {
  if (value === missing) {
    return fail6(new InvalidValue);
  }
  return succeed6(value);
};
function run2(ast) {
  return runWithCompiler(normalCompiler, ast);
}
function runWithCompiler(compiler, ast) {
  let parser;
  return (input, options) => {
    const result = (parser ??= compiler(ast))(input, options ?? defaultParseOptions);
    if (result === sameExit) {
      return succeed6(input);
    }
    if (!effectIsExit(result)) {
      return flatMapEager2(result, getValue);
    }
    return result[args] === missing ? getValue(missing) : result;
  };
}
function asExit(parser) {
  return (input, options) => runSyncExit2(parser(input, options));
}
var normalCompiler = /* @__PURE__ */ memoize((ast) => makeParser(ast, normalCompiler));
var constructorCompiler = /* @__PURE__ */ memoize((ast) => makeParser(ast, constructorCompiler, compileConstructorDefault));
var compileDefaulted = /* @__PURE__ */ memoize((ast) => makeParser(ast, constructorCompiler, compileConstructorDefault, ast.context?.constructorDefault));
function compileConstructorDefault(ast) {
  return ast.context?.constructorDefault ? compileDefaulted(ast) : constructorCompiler(ast);
}
function applyTransformation(result, current, transformation, options) {
  let transformed;
  if (effectIsExit(result) && result._tag === "Success") {
    const optional = toOption(result === sameExit ? current : result[args]);
    transformed = transformation._tag === "Transformation" ? transformation.decode.run(optional, options) : transformation.decode(succeed8(optional), options);
  } else if (transformation._tag === "Transformation") {
    transformed = flatMapEager2(result, (value) => transformation.decode.run(toOption(value), options));
  } else {
    transformed = transformation.decode(mapEager2(result, toOption), options);
  }
  return effectIsExit(transformed) && transformed._tag === "Success" ? fromOptionExit(transformed[args]) : flatMapEager2(transformed, fromOptionExit);
}
function makeConstructorParser(descriptor, compile) {
  let sourceParser;
  return (input, options) => {
    if (input === missing)
      return missingExit;
    if (descriptor.isConstructed(input))
      return sameExit;
    const result = (sourceParser ??= compile(descriptor.link.to))(input, options);
    return applyTransformation(result, input, descriptor.link.transformation, options);
  };
}
function makeParser(ast, compile, compileConstructorDefault, constructorDefault) {
  const descriptor = compileConstructorDefault ? getConstructorDescriptor(ast) : undefined;
  const parser = descriptor ? makeConstructorParser(descriptor, compile) : ast.getParser(compile, compileConstructorDefault);
  const checks = ast.checks;
  const links = constructorDefault ? ast.encoding ? [...ast.encoding, constructorDefault] : [constructorDefault] : ast.encoding;
  const encodingChecks = ast.encodingChecks;
  if (!links && !checks && !encodingChecks) {
    return parser;
  }
  let encodingParsers;
  const parseLocal = (input, options) => {
    let result = parser(input, options);
    if (encodingChecks && !options.disableChecks) {
      if (effectIsExit(result)) {
        if (result._tag === "Success") {
          const output = result === sameExit ? input : result[args];
          if (input !== missing && output !== missing) {
            const issues = collectIssues(encodingChecks, input, undefined, ast, options);
            if (issues) {
              result = fail6(new Composite(ast, issues, input, options));
            }
          }
        }
      } else {
        result = flatMap5(result, (value) => {
          if (input !== missing && value !== missing) {
            const issues = collectIssues(encodingChecks, input, undefined, ast, options);
            if (issues) {
              return fail6(new Composite(ast, issues, input, options));
            }
          }
          return succeed6(value);
        });
      }
    }
    if (checks && !options.disableChecks) {
      if (effectIsExit(result)) {
        if (result._tag === "Success") {
          const value = result === sameExit ? input : result[args];
          if (value === missing)
            return result;
          const issues = collectIssues(checks, value, undefined, ast, options);
          if (issues) {
            result = fail6(new Composite(ast, issues, value, options));
          }
        }
      } else {
        result = flatMap5(result, (value) => {
          if (value !== missing) {
            const issues = collectIssues(checks, value, undefined, ast, options);
            if (issues) {
              return fail6(new Composite(ast, issues, value, options));
            }
          }
          return succeed6(value);
        });
      }
    }
    return result;
  };
  if (!links) {
    return parseLocal;
  }
  return (input, options) => {
    const parsers = encodingParsers ??= links.map((link) => compile(link.to));
    let current = input;
    let result = parsers[parsers.length - 1](input, options);
    for (let i = links.length - 1;i >= 0; i--) {
      result = applyTransformation(result, current, links[i].transformation, options);
      if (i !== 0) {
        const next = parsers[i - 1];
        if (result._tag === "Success") {
          current = result[args];
          result = next(current, options);
        } else {
          result = flatMapEager2(result, (value) => {
            const nextResult = next(value, options);
            return nextResult === sameExit ? succeed8(value) : nextResult;
          });
        }
      }
    }
    if (result._tag === "Success") {
      const value = result[args];
      const local = parseLocal(value, options);
      return local === sameExit ? result : local;
    }
    result = catchCause2(result, (cause) => failCauseSync2(() => map6(cause, (issue) => new Encoding(ast, issue, input, options))));
    return flatMapEager2(result, (value) => {
      const local = parseLocal(value, options);
      return local === sameExit ? succeed8(value) : local;
    });
  };
}

// node_modules/effect/dist/internal/schema/make.js
var TypeId20 = "~effect/Schema/Schema";
var SchemaProto = {
  [TypeId20]: TypeId20,
  pipe() {
    return pipeArguments(this, arguments);
  },
  annotate(annotations) {
    return this.rebuild(annotate(this.ast, annotations));
  },
  annotateKey(annotations) {
    return this.rebuild(annotateKey(this.ast, annotations));
  },
  check(...checks) {
    return this.rebuild(appendChecks(this.ast, checks));
  }
};
function make16(ast, options) {
  function Schema() {}
  const self = Object.setPrototypeOf(Schema, SchemaProto);
  if (options && (Object.hasOwn(options, "name") || Object.hasOwn(options, "length") || Object.hasOwn(options, "__proto__"))) {
    Object.defineProperties(self, Object.getOwnPropertyDescriptors({
      ...options
    }));
  } else {
    Object.assign(self, options);
  }
  self.ast = ast;
  self.rebuild = (ast) => make16(ast, options);
  self.makeEffect = makeEffect(self);
  self.make = make15(self);
  self.makeOption = makeOption(self);
  return self;
}

// node_modules/effect/dist/internal/schema/toCodec.js
function toCodecJson(schema) {
  return make16(toCodecJsonAST(schema.ast), {
    schema
  });
}
var toCodecJsonAST = /* @__PURE__ */ applyToSelfOrLastLinkEncodingIdempotent((ast) => {
  const out = toCodecJsonASTStep(ast, toCodecJsonAST);
  const context = ast.context;
  if (out === ast || context === undefined)
    return out;
  return replaceContextLastLink(out, withoutConstructorDefault(context));
});
function withoutConstructorDefault(context) {
  return context.constructorDefault === undefined ? context : new Context(context.isOptional, context.isMutable, undefined, context.annotations);
}
function validateCanonicalObjectPropertyNames(ast) {
  if (ast.propertySignatures.some((ps) => typeof ps.name !== "string")) {
    throw new globalThis.Error("Objects property names must be strings", {
      cause: ast
    });
  }
}
function makeReorder(getPriority) {
  return (types) => {
    const indexMap = new Map;
    for (let i = 0;i < types.length; i++) {
      indexMap.set(toEncoded(types[i]), i);
    }
    const sortedTypes = [...types].sort((a, b) => {
      a = toEncoded(a);
      b = toEncoded(b);
      const pa = getPriority(a);
      const pb = getPriority(b);
      if (pa !== pb)
        return pa - pb;
      return indexMap.get(a) - indexMap.get(b);
    });
    const orderChanged = sortedTypes.some((ast, index) => ast !== types[index]);
    if (!orderChanged)
      return types;
    return sortedTypes;
  };
}
var toCodecJsonReorder = /* @__PURE__ */ makeReorder((ast) => {
  switch (ast._tag) {
    case "BigInt":
    case "Symbol":
    case "UniqueSymbol":
      return 0;
    default:
      return 1;
  }
});
function toCodecJsonASTStep(ast, recur) {
  switch (ast._tag) {
    case "Declaration": {
      const getLink = ast.annotations?.toCodecJson ?? ast.annotations?.toCodec;
      if (!isFunction(getLink)) {
        return replaceEncoding(ast, [unknownToJson]);
      }
      const typeParameters = ast.typeParameters.map((tp) => make16(toEncoded(tp)));
      const link = getLink(typeParameters);
      return link === undefined ? ast : replaceEncoding(ast, [mapLink(link, recur)]);
    }
    case "Unknown":
      return replaceEncoding(ast, [unknownToJson]);
    case "ObjectKeyword":
      return replaceEncoding(ast, [objectKeywordToJson]);
    case "Undefined":
    case "Void":
    case "Literal":
    case "Number":
      return ast.toCodecJson();
    case "UniqueSymbol":
    case "Symbol":
    case "BigInt":
      return ast.toCodecStringTree();
    case "Objects": {
      validateCanonicalObjectPropertyNames(ast);
      return ast.recur(recur, parameterFromString);
    }
    case "Union": {
      const sortedTypes = toCodecJsonReorder(ast.types);
      if (sortedTypes !== ast.types) {
        return new Union(sortedTypes, ast.options, ast.annotations, ast.checks, ast.encoding, ast.context, ast.encodingChecks).recur(recur);
      }
      return ast.recur(recur);
    }
    case "Arrays":
    case "Suspend":
      return ast.recur(recur);
  }
  return ast;
}
function toCodecStringTree(schema) {
  return make16(toCodecStringTreeAST(schema.ast), {
    schema
  });
}
var toStringTreeReorder = /* @__PURE__ */ makeReorder((ast) => {
  switch (ast._tag) {
    case "Null":
    case "Boolean":
    case "Number":
    case "BigInt":
    case "Symbol":
    case "UniqueSymbol":
      return 0;
    default:
      return 1;
  }
});
function toCodecStringTreeASTStep(ast, recur, onMissingAnnotation) {
  switch (ast._tag) {
    case "Declaration": {
      const typeParameters = ast.typeParameters.map((tp) => make16(recur(toEncoded(tp))));
      const getStringTreeLink = ast.annotations?.toCodecStringTree;
      if (isFunction(getStringTreeLink)) {
        const link = getStringTreeLink(typeParameters);
        if (link === undefined)
          return ast;
        return replaceEncoding(ast, [mapLink(link, recur)]);
      }
      const getJsonLink = ast.annotations?.toCodecJson;
      const jsonLink = isFunction(getJsonLink) ? getJsonLink(typeParameters) : undefined;
      const getLink = jsonLink === undefined ? ast.annotations?.toCodec : undefined;
      const link = jsonLink ?? (isFunction(getLink) ? getLink(typeParameters) : undefined);
      return link === undefined ? onMissingAnnotation(ast) : replaceEncoding(ast, [mapLink(link, recur)]);
    }
    case "Null":
      return replaceEncoding(ast, [nullToString]);
    case "Boolean":
      return replaceEncoding(ast, [booleanToString]);
    case "Unknown":
    case "ObjectKeyword":
      return replaceEncoding(ast, [unknownToStringTree]);
    case "Enum":
    case "Number":
    case "Literal":
    case "UniqueSymbol":
    case "Symbol":
    case "BigInt":
      return ast.toCodecStringTree();
    case "Objects": {
      validateCanonicalObjectPropertyNames(ast);
      return ast.recur(recur, parameterFromString);
    }
    case "Union": {
      const sortedTypes = toStringTreeReorder(ast.types);
      if (sortedTypes !== ast.types) {
        return new Union(sortedTypes, ast.options, ast.annotations, ast.checks, ast.encoding, ast.context, ast.encodingChecks).recur(recur);
      }
      return ast.recur(recur);
    }
    case "Arrays":
    case "Suspend":
      return ast.recur(recur);
  }
  return ast;
}
var nullToString = /* @__PURE__ */ new Link(/* @__PURE__ */ new Literal("null"), /* @__PURE__ */ new Transformation(/* @__PURE__ */ transform(() => null), /* @__PURE__ */ transform(() => "null")));
var booleanToString = /* @__PURE__ */ new Link(/* @__PURE__ */ new Union([/* @__PURE__ */ new Literal("true"), /* @__PURE__ */ new Literal("false")]), /* @__PURE__ */ new Transformation(/* @__PURE__ */ transform((s) => s === "true"), /* @__PURE__ */ String2()));
var arrayFromSingleTransformation = /* @__PURE__ */ new Transformation(/* @__PURE__ */ transform((input) => typeof input === "string" ? [input] : input), /* @__PURE__ */ passthrough());
var isCodecArrayFromSingleLink = (link) => link.transformation === arrayFromSingleTransformation;
var toCodecStringTreeAST = /* @__PURE__ */ applyToSelfOrLastLinkEncodingIdempotent((ast) => {
  const out = toCodecStringTreeASTStep(ast, toCodecStringTreeAST, (ast) => {
    throw new globalThis.Error("Missing structural codec for StringTree", {
      cause: ast
    });
  });
  if (out !== ast && ast.context !== undefined) {
    return replaceContextLastLink(out, withoutConstructorDefault(ast.context));
  }
  return out;
}, {
  stopAt: isCodecArrayFromSingleLink
});

// node_modules/effect/dist/Struct.js
var lambda = (f) => f;

// node_modules/effect/dist/internal/schemaError.js
var SchemaErrorTypeId = "~effect/Schema/SchemaError";
function isSchemaError(u) {
  return hasProperty(u, SchemaErrorTypeId) && u[SchemaErrorTypeId] === SchemaErrorTypeId;
}

// node_modules/effect/dist/internal/redacted.js
var redactedRegistry = /* @__PURE__ */ new WeakMap;
var value = (self) => {
  if (redactedRegistry.has(self)) {
    return redactedRegistry.get(self);
  } else {
    throw new Error("Unable to get redacted value" + (self.label ? ` with label: "${self.label}"` : ""));
  }
};

// node_modules/effect/dist/Redacted.js
var TypeId21 = "~effect/Redacted";
var isRedacted = (u) => hasProperty(u, TypeId21);
var make17 = (value, options) => {
  const self = Object.create(Proto3);
  if (options?.label) {
    self.label = options.label;
  }
  redactedRegistry.set(self, value);
  return self;
};
var Proto3 = {
  [TypeId21]: {
    _A: (_) => _
  },
  label: undefined,
  ...PipeInspectableProto,
  toJSON() {
    return this.toString();
  },
  toString() {
    return `<redacted${isString(this.label) ? ":" + this.label : ""}>`;
  },
  [symbol]() {
    return hash(redactedRegistry.get(this));
  },
  [symbol2](that) {
    return isRedacted(that) && equals(redactedRegistry.get(this), redactedRegistry.get(that));
  }
};
var value2 = value;

// node_modules/effect/dist/unstable/http/Cookies.js
var TypeId22 = "~effect/http/Cookies";
var CookieTypeId = "~effect/http/Cookies/Cookie";
var CookieErrorTypeId = "~effect/http/Cookies/CookieError";

class CookiesErrorReason extends Error3 {
}

class CookiesError extends (/* @__PURE__ */ TaggedError2("CookiesError")) {
  static fromReason(reason, cause) {
    return new CookiesError({
      reason: new CookiesErrorReason({
        _tag: reason,
        cause
      })
    });
  }
  [CookieErrorTypeId] = CookieErrorTypeId;
  get message() {
    return this.reason._tag;
  }
}
var Proto4 = {
  [TypeId22]: TypeId22,
  ...BaseProto,
  toJSON() {
    return {
      _id: "effect/Cookies",
      cookies: map3(this.cookies, (cookie) => cookie.toJSON())
    };
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var fromReadonlyRecord = (cookies) => {
  const self = Object.create(Proto4);
  self.cookies = cookies;
  return self;
};
var fromIterable2 = (cookies) => {
  const record = {};
  for (const cookie of cookies) {
    assignProperty(record, cookie.name, cookie);
  }
  return fromReadonlyRecord(record);
};
var fromSetCookie = (headers) => {
  const arrayHeaders = typeof headers === "string" ? [headers] : headers;
  const cookies = [];
  for (const header of arrayHeaders) {
    const cookie = parseSetCookie(header.trim());
    if (cookie) {
      cookies.push(cookie);
    }
  }
  return fromIterable2(cookies);
};
function parseSetCookie(header) {
  const parts = header.split(";").map((_) => _.trim()).filter((_) => _ !== "");
  if (parts.length === 0) {
    return;
  }
  const firstEqual = parts[0].indexOf("=");
  if (firstEqual === -1) {
    return;
  }
  const name = parts[0].slice(0, firstEqual);
  if (!cookieNameRegExp.test(name)) {
    return;
  }
  const valueEncoded = parts[0].slice(firstEqual + 1);
  const value = tryDecodeURIComponent(valueEncoded);
  if (parts.length === 1) {
    return Object.assign(Object.create(CookieProto), {
      name,
      value,
      valueEncoded
    });
  }
  const options = {};
  for (let i = 1;i < parts.length; i++) {
    const part = parts[i];
    const equalIndex = part.indexOf("=");
    const key = equalIndex === -1 ? part : part.slice(0, equalIndex).trim();
    const value = equalIndex === -1 ? undefined : part.slice(equalIndex + 1).trim();
    switch (key.toLowerCase()) {
      case "domain": {
        if (value === undefined) {
          break;
        }
        const domain = value.trim().replace(/^\./, "");
        if (domain) {
          options.domain = domain;
        }
        break;
      }
      case "expires": {
        if (value === undefined) {
          break;
        }
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          options.expires = date;
        }
        break;
      }
      case "max-age": {
        if (value === undefined) {
          break;
        }
        const maxAge = parseInt(value, 10);
        if (!isNaN(maxAge)) {
          options.maxAge = seconds(maxAge);
        }
        break;
      }
      case "path": {
        if (value === undefined) {
          break;
        }
        if (value[0] === "/") {
          options.path = value;
        }
        break;
      }
      case "priority": {
        if (value === undefined) {
          break;
        }
        switch (value.toLowerCase()) {
          case "low":
            options.priority = "low";
            break;
          case "medium":
            options.priority = "medium";
            break;
          case "high":
            options.priority = "high";
            break;
        }
        break;
      }
      case "httponly": {
        options.httpOnly = true;
        break;
      }
      case "secure": {
        options.secure = true;
        break;
      }
      case "partitioned": {
        options.partitioned = true;
        break;
      }
      case "samesite": {
        if (value === undefined) {
          break;
        }
        switch (value.toLowerCase()) {
          case "lax":
            options.sameSite = "lax";
            break;
          case "strict":
            options.sameSite = "strict";
            break;
          case "none":
            options.sameSite = "none";
            break;
        }
        break;
      }
    }
  }
  return Object.assign(Object.create(CookieProto), {
    name,
    value,
    valueEncoded,
    options: Object.keys(options).length > 0 ? options : undefined
  });
}
var empty5 = /* @__PURE__ */ fromIterable2([]);
var isEmpty = (self) => isEmptyRecord(self.cookies);
var fieldContentRegExp = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/;
var cookieNameRegExp = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
var cookieDomainRegExp = /^[\u0009\u0020-\u003a\u003c-\u007e\u0080-\u00ff]+$/;
var cookiePathRegExp = /^[\u0020-\u003a\u003c-\u007e]+$/;
var CookieProto = {
  [CookieTypeId]: CookieTypeId,
  ...BaseProto,
  toJSON() {
    return {
      _id: "effect/Cookies/Cookie",
      name: this.name,
      value: this.value,
      options: this.options
    };
  }
};
function validateCookie(name, encodedValue, options) {
  if (!cookieNameRegExp.test(name)) {
    return CookiesError.fromReason("InvalidCookieName");
  }
  if (encodedValue && !fieldContentRegExp.test(encodedValue)) {
    return CookiesError.fromReason("InvalidCookieValue");
  }
  if (options?.domain !== undefined && !cookieDomainRegExp.test(options.domain)) {
    return CookiesError.fromReason("InvalidCookieDomain");
  }
  if (options?.path !== undefined && !cookiePathRegExp.test(options.path)) {
    return CookiesError.fromReason("InvalidCookiePath");
  }
  if (options?.maxAge !== undefined && !isFinite(fromInputUnsafe(options.maxAge))) {
    return CookiesError.fromReason("CookieInfinityMaxAge");
  }
}
function serializeCookie(self) {
  const error = validateCookie(self.name, self.valueEncoded, self.options);
  if (error !== undefined) {
    throw error;
  }
  let str = self.name + "=" + self.valueEncoded;
  if (self.options === undefined) {
    return str;
  }
  const options = self.options;
  if (options.maxAge !== undefined) {
    const maxAge = toSeconds(fromInputUnsafe(options.maxAge));
    str += "; Max-Age=" + Math.trunc(maxAge);
  }
  if (options.domain !== undefined) {
    str += "; Domain=" + options.domain;
  }
  if (options.path !== undefined) {
    str += "; Path=" + options.path;
  }
  if (options.priority !== undefined) {
    switch (options.priority) {
      case "low":
        str += "; Priority=Low";
        break;
      case "medium":
        str += "; Priority=Medium";
        break;
      case "high":
        str += "; Priority=High";
        break;
    }
  }
  if (options.expires !== undefined) {
    str += "; Expires=" + options.expires.toUTCString();
  }
  if (options.httpOnly) {
    str += "; HttpOnly";
  }
  if (options.secure) {
    str += "; Secure";
  }
  if (options.partitioned) {
    str += "; Partitioned";
  }
  if (options.sameSite !== undefined) {
    switch (options.sameSite) {
      case "lax":
        str += "; SameSite=Lax";
        break;
      case "strict":
        str += "; SameSite=Strict";
        break;
      case "none":
        str += "; SameSite=None";
        break;
    }
  }
  return str;
}
var toSetCookieHeaders = (self) => Object.values(self.cookies).map(serializeCookie);
function parseHeader(header) {
  const result = {};
  const strLen = header.length;
  let pos = 0;
  let terminatorPos = 0;
  while (true) {
    if (terminatorPos === strLen)
      break;
    terminatorPos = header.indexOf(";", pos);
    if (terminatorPos === -1)
      terminatorPos = strLen;
    let eqIdx = header.indexOf("=", pos);
    if (eqIdx === -1)
      break;
    if (eqIdx > terminatorPos) {
      pos = terminatorPos + 1;
      continue;
    }
    const key = header.substring(pos, eqIdx++).trim();
    if (!Object.hasOwn(result, key)) {
      const val = header.charCodeAt(eqIdx) === 34 ? header.substring(eqIdx + 1, terminatorPos - 1).trim() : header.substring(eqIdx, terminatorPos).trim();
      assignProperty(result, key, !(val.indexOf("%") === -1) ? tryDecodeURIComponent(val) : val);
    }
    pos = terminatorPos + 1;
  }
  return result;
}
var tryDecodeURIComponent = (str) => {
  try {
    return decodeURIComponent(str);
  } catch (_) {
    return str;
  }
};

// node_modules/effect/dist/unstable/http/Headers.js
var TypeId23 = /* @__PURE__ */ Symbol.for("~effect/http/Headers");
var Proto5 = /* @__PURE__ */ Object.defineProperties(/* @__PURE__ */ Object.create(null), {
  [TypeId23]: {
    value: TypeId23
  },
  [symbolRedactable]: {
    value(context) {
      return redact2(this, get(context, CurrentRedactedNames));
    }
  },
  toJSON: {
    value() {
      return redact(this);
    }
  },
  [symbol2]: {
    value(that) {
      return Equivalence2(this, that);
    }
  },
  [symbol]: {
    value() {
      return structure(this);
    }
  },
  toString: {
    value: BaseProto.toString
  },
  [NodeInspectSymbol]: {
    value: BaseProto[NodeInspectSymbol]
  }
});
var make18 = (input) => Object.assign(Object.create(Proto5), input);
var Equivalence2 = /* @__PURE__ */ makeEquivalence2(/* @__PURE__ */ strictEqual());
var empty6 = /* @__PURE__ */ Object.create(Proto5);
var fromInput2 = (input) => {
  if (input === undefined) {
    return empty6;
  } else if (Symbol.iterator in input) {
    const out = Object.create(Proto5);
    for (const [k, v] of input) {
      out[k.toLowerCase()] = v;
    }
    return out;
  }
  const out = Object.create(Proto5);
  for (const [k, v] of Object.entries(input)) {
    if (Array.isArray(v)) {
      out[k.toLowerCase()] = v.join(", ");
    } else if (v !== undefined) {
      out[k.toLowerCase()] = v;
    }
  }
  return out;
};
var fromRecordUnsafe = (input) => Object.setPrototypeOf(input, Proto5);
var set2 = /* @__PURE__ */ dual(3, (self, key, value) => {
  const out = make18(self);
  out[key.toLowerCase()] = value;
  return out;
});
var setAll = /* @__PURE__ */ dual(2, (self, headers) => make18({
  ...self,
  ...fromInput2(headers)
}));
var merge5 = /* @__PURE__ */ dual(2, (self, headers) => {
  const out = make18(self);
  Object.assign(out, headers);
  return out;
});
var remove2 = /* @__PURE__ */ dual(2, (self, key) => {
  const out = make18(self);
  delete out[key.toLowerCase()];
  return out;
});
var redact2 = /* @__PURE__ */ dual(2, (self, key) => {
  const out = {
    ...self
  };
  const modify = (key) => {
    if (typeof key === "string") {
      const k = key.toLowerCase();
      if (k in self) {
        out[k] = make17(self[k]);
      }
    } else {
      for (const name in self) {
        if (name.search(key) !== -1) {
          out[name] = make17(self[name]);
        }
      }
    }
  };
  if (Array.isArray(key)) {
    for (let i = 0;i < key.length; i++) {
      modify(key[i]);
    }
  } else {
    modify(key);
  }
  return out;
});
var isRedactedName = (name, patterns) => {
  for (let i = 0;i < patterns.length; i++) {
    const pattern = patterns[i];
    if (typeof pattern === "string") {
      if (pattern.toLowerCase() === name.toLowerCase()) {
        return true;
      }
    } else if (name.search(pattern) !== -1) {
      return true;
    }
  }
  return false;
};
var CurrentRedactedNames = /* @__PURE__ */ Reference("effect/Headers/CurrentRedactedNames", {
  defaultValue: () => ["authorization", "cookie", "set-cookie", "x-api-key"]
});

// node_modules/effect/dist/unstable/http/UrlParams.js
var TypeId24 = "~effect/http/UrlParams";
var isUrlParams = (u) => hasProperty(u, TypeId24);
var Proto6 = {
  ...PipeInspectableProto,
  [TypeId24]: TypeId24,
  [Symbol.iterator]() {
    return this.params[Symbol.iterator]();
  },
  toJSON() {
    return {
      _id: "UrlParams",
      params: Object.fromEntries(this.params)
    };
  },
  [symbol2](that) {
    return Equivalence3(this, that);
  },
  [symbol]() {
    return array(this.params.flat());
  }
};
var make19 = (params) => {
  const self = Object.create(Proto6);
  self.params = params;
  return self;
};
var fromInput3 = (input) => {
  if (isUrlParams(input)) {
    return input;
  }
  const parsed = fromInputNested(input);
  const out = [];
  for (let i = 0;i < parsed.length; i++) {
    if (Array.isArray(parsed[i][0])) {
      const [keys, value] = parsed[i];
      out.push([`${keys[0]}[${keys.slice(1).join("][")}]`, value]);
    } else {
      out.push(parsed[i]);
    }
  }
  return make19(out);
};
var fromInputNested = (input) => {
  const entries = typeof input[Symbol.iterator] === "function" ? fromIterable(input) : Object.entries(input);
  const out = [];
  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      for (let i = 0;i < value.length; i++) {
        if (value[i] !== undefined) {
          out.push([key, String(value[i])]);
        }
      }
    } else if (value !== null && typeof value === "object") {
      const nested = fromInputNested(value);
      for (const [k, v] of nested) {
        out.push([[key, ...typeof k === "string" ? [k] : k], v]);
      }
    } else if (value !== undefined) {
      out.push([key, String(value)]);
    }
  }
  return out;
};
var Equivalence3 = /* @__PURE__ */ make((a, b) => arrayEquivalence(a.params, b.params));
var arrayEquivalence = /* @__PURE__ */ makeEquivalence3(/* @__PURE__ */ makeEquivalence([/* @__PURE__ */ strictEqual(), /* @__PURE__ */ strictEqual()]));
var empty7 = /* @__PURE__ */ make19([]);
var setAll2 = /* @__PURE__ */ dual(2, (self, input) => {
  const params = fromInput3(input).params.slice();
  const keys = new Set;
  for (let i = 0;i < params.length; i++) {
    keys.add(params[i][0]);
  }
  for (let i = 0;i < self.params.length; i++) {
    if (keys.has(self.params[i][0]))
      continue;
    params.push(self.params[i]);
  }
  return make19(params);
});

// node_modules/effect/dist/unstable/net/NetAddress.js
var TypeId25 = "~effect/net/NetAddress";
var getBytes = (self) => self.bytes;

class NetAddressError extends (/* @__PURE__ */ TaggedError2("NetAddressError")) {
}
var isAddress = (u) => hasProperty(u, TypeId25);
var isIpv4Address = (u) => isAddress(u) && u._tag === "Ipv4Address";
var isIpv6Address = (u) => isAddress(u) && u._tag === "Ipv6Address";
var isMacAddress = (u) => isAddress(u) && u._tag === "MacAddress";
var isInetAddressV4 = (u) => isAddress(u) && u._tag === "InetAddressV4";
var isInetAddressV6 = (u) => isAddress(u) && u._tag === "InetAddressV6";
var isInetAddress = (u) => isInetAddressV4(u) || isInetAddressV6(u);
var isUnixPathAddress = (u) => isAddress(u) && u._tag === "UnixPathAddress";
var Ipv4Proto = {
  _tag: "Ipv4Address",
  [TypeId25]: TypeId25,
  [symbol2](that) {
    return isIpv4Address(that) && bytesEqual(getBytes(this), getBytes(that));
  },
  [symbol]() {
    return hashBytes("Ipv4Address", getBytes(this));
  },
  toString() {
    return formatIp(this);
  },
  toJSON() {
    return this.toString();
  },
  [NodeInspectSymbol]() {
    return this.toJSON();
  }
};
var Ipv6Proto = {
  _tag: "Ipv6Address",
  [TypeId25]: TypeId25,
  [symbol2](that) {
    return isIpv6Address(that) && bytesEqual(getBytes(this), getBytes(that));
  },
  [symbol]() {
    return hashBytes("Ipv6Address", getBytes(this));
  },
  toString() {
    return formatIp(this);
  },
  toJSON() {
    return this.toString();
  },
  [NodeInspectSymbol]() {
    return this.toJSON();
  }
};
var MacProto = {
  _tag: "MacAddress",
  [TypeId25]: TypeId25,
  [symbol2](that) {
    return isMacAddress(that) && bytesEqual(getBytes(this), getBytes(that));
  },
  [symbol]() {
    return hashBytes("MacAddress", getBytes(this));
  },
  toString() {
    return formatMacAddress(this);
  },
  toJSON() {
    return this.toString();
  },
  [NodeInspectSymbol]() {
    return this.toJSON();
  }
};
var bytesEqual = (self, that) => {
  if (self.length !== that.length)
    return false;
  for (let index = 0;index < self.length; index++) {
    if (self[index] !== that[index])
      return false;
  }
  return true;
};
var hashBytes = (tag, bytes) => {
  return combine(string(tag), array(bytes));
};
var makeIpv4 = (bytes) => {
  const self = Object.assign(Object.create(Ipv4Proto), {
    bytes: new Uint8Array(bytes)
  });
  return Object.freeze(self);
};
var makeIpv6 = (bytes) => {
  const self = Object.assign(Object.create(Ipv6Proto), {
    bytes: new Uint8Array(bytes)
  });
  return Object.freeze(self);
};
var addressError = (input, message) => fail2(new NetAddressError({
  input,
  message
}));
var ipv4FromOctets = (octets) => {
  if (!octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    return addressError(octets, "octets must be integers from 0 through 255");
  }
  return succeed2(makeIpv4(new Uint8Array(octets)));
};
var ipv6FromSegments = (segments) => {
  if (!segments.every((n) => Number.isInteger(n) && n >= 0 && n <= 65535)) {
    return addressError(segments, "segments must be integers from 0 through 65535");
  }
  const bytes = new Uint8Array(16);
  for (let index = 0;index < 8; index++) {
    bytes[index * 2] = segments[index] >> 8;
    bytes[index * 2 + 1] = segments[index];
  }
  return succeed2(makeIpv6(bytes));
};
var ipv4FromString = (input) => {
  const parts = input.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) {
    return addressError(input, "expected exactly four decimal octets");
  }
  if (parts.some((part) => part.length > 1 && part[0] === "0")) {
    return addressError(input, "leading zeroes are not allowed");
  }
  const octets = parts.map(Number);
  if (octets.some((part) => part > 255)) {
    return addressError(input, "octets must be at most 255");
  }
  return ipv4FromOctets([octets[0], octets[1], octets[2], octets[3]]);
};
var parseIpv6Segments = (input) => {
  if (input.includes("[") || input.includes("]") || input.includes("%")) {
    return addressError(input, "brackets and zone identifiers are not valid in a bare IPv6 address");
  }
  const halves = input.split("::");
  if (halves.length > 2)
    return addressError(input, "only one compression marker is allowed");
  const head = halves[0] === "" ? [] : halves[0].split(":");
  const tail = halves.length === 2 && halves[1] !== "" ? halves[1].split(":") : [];
  if (head.some((part) => part === "") || tail.some((part) => part === "")) {
    return addressError(input, "empty segments are only valid in the compression marker");
  }
  const trailing = tail.length > 0 ? tail[tail.length - 1] : head.length > 0 ? head[head.length - 1] : "";
  let embedded;
  if (trailing.includes(".")) {
    if (halves.length === 2 && tail.length === 0) {
      return addressError(input, "embedded IPv4 syntax must be trailing");
    }
    const parsed = map2(ipv4FromString(trailing), (address) => {
      const octets = ipv4ToOctets(address);
      return [octets[0] * 256 + octets[1], octets[2] * 256 + octets[3]];
    });
    if (isFailure2(parsed))
      return parsed;
    embedded = parsed.success;
    if (tail.length > 0)
      tail.pop();
    else
      head.pop();
  }
  const explicit = head.length + tail.length + (embedded ? 2 : 0);
  if (halves.length === 1 ? explicit !== 8 : explicit >= 8) {
    return addressError(input, halves.length === 1 ? "expected eight segments" : "compression must replace at least one segment");
  }
  const parse = (part) => /^[0-9a-fA-F]{1,4}$/.test(part) ? Number.parseInt(part, 16) : undefined;
  const parsedHead = head.map(parse);
  const parsedTail = tail.map(parse);
  if (parsedHead.some((part) => part === undefined) || parsedTail.some((part) => part === undefined)) {
    return addressError(input, "segments must contain one through four hexadecimal digits");
  }
  return succeed2([...parsedHead, ...Array(8 - explicit).fill(0), ...parsedTail, ...embedded ?? []]);
};
var ipv6FromString = (input) => {
  return flatMap2(parseIpv6Segments(input), (segments) => ipv6FromSegments(segments));
};
var ipFromString = (input) => {
  const result = input.includes(":") ? ipv6FromString(input) : ipv4FromString(input);
  return result;
};
var ipv4ToOctets = (self) => {
  const bytes = getBytes(self);
  return [bytes[0], bytes[1], bytes[2], bytes[3]];
};
var ipv6ToSegments = (self) => {
  const bytes = getBytes(self);
  const output = Array(8);
  for (let index = 0;index < 8; index++) {
    output[index] = bytes[index * 2] * 256 + bytes[index * 2 + 1];
  }
  return output;
};
var formatMacAddress = (self) => Array.from(getBytes(self), (byte) => byte.toString(16).padStart(2, "0")).join(":");
var formatIp = (self) => {
  if (isIpv4Address(self))
    return ipv4ToOctets(self).join(".");
  const segments = ipv6ToSegments(self);
  if (isIpv4Mapped(self)) {
    return `::ffff:${segments[6] >> 8}.${segments[6] & 255}.${segments[7] >> 8}.${segments[7] & 255}`;
  }
  let bestStart = -1;
  let bestLength = 0;
  let start = -1;
  for (let index = 0;index <= 8; index++) {
    if (index < 8 && segments[index] === 0) {
      if (start === -1)
        start = index;
    } else if (start !== -1) {
      if (index - start > bestLength) {
        bestStart = start;
        bestLength = index - start;
      }
      start = -1;
    }
  }
  if (bestLength < 2)
    return segments.map((segment) => segment.toString(16)).join(":");
  const head = segments.slice(0, bestStart).map((segment) => segment.toString(16)).join(":");
  const tail = segments.slice(bestStart + bestLength).map((segment) => segment.toString(16)).join(":");
  return `${head}::${tail}`;
};
var isIpv4Mapped = (self) => {
  const bytes = getBytes(self);
  for (let index = 0;index < 10; index++) {
    if (bytes[index] !== 0)
      return false;
  }
  return bytes[10] === 255 && bytes[11] === 255;
};
var InetV4Proto = {
  _tag: "InetAddressV4",
  [TypeId25]: TypeId25,
  [symbol2](that) {
    return isInetAddressV4(that) && this.port === that.port && equals(this.address, that.address);
  },
  [symbol]() {
    return combine(hash(this.address), number(this.port));
  },
  toString() {
    return formatInet(this);
  },
  toJSON() {
    return this.toString();
  },
  [NodeInspectSymbol]() {
    return this.toJSON();
  }
};
var InetV6Proto = {
  _tag: "InetAddressV6",
  [TypeId25]: TypeId25,
  [symbol2](that) {
    return isInetAddressV6(that) && this.port === that.port && this.scopeId === that.scopeId && equals(this.address, that.address);
  },
  [symbol]() {
    return combine(combine(hash(this.address), number(this.port)), number(this.scopeId));
  },
  toString() {
    return formatInet(this);
  },
  toJSON() {
    return this.toString();
  },
  [NodeInspectSymbol]() {
    return this.toJSON();
  }
};
var checkPort = (port) => Number.isInteger(port) && port >= 0 && port <= 65535;
var inetAddressV4 = (address, port) => {
  if (!checkPort(port)) {
    return addressError(address, "port must be an integer from 0 through 65535");
  }
  const self = Object.create(InetV4Proto);
  self.address = address;
  self.port = port;
  return succeed2(Object.freeze(self));
};
var inetAddressV6 = (address, port, options) => {
  if (!checkPort(port)) {
    return addressError(address, "port must be an integer from 0 through 65535");
  }
  const scopeId = options?.scopeId ?? 0;
  if (!Number.isInteger(scopeId) || scopeId < 0 || scopeId > 4294967295) {
    return addressError(address, "scopeId must be an unsigned 32-bit integer");
  }
  const self = Object.create(InetV6Proto);
  self.address = address;
  self.port = port;
  self.scopeId = scopeId;
  return succeed2(Object.freeze(self));
};
var inetAddress = (address, port) => isIpv4Address(address) ? inetAddressV4(address, port) : inetAddressV6(address, port);
var inetAddressFromIpString = (address, port) => {
  return flatMap2(ipFromString(address), (address) => inetAddress(address, port));
};
var formatInet = (self) => {
  if (self._tag === "InetAddressV4")
    return `${formatIp(self.address)}:${self.port}`;
  const scope = self.scopeId === 0 ? "" : `%${self.scopeId}`;
  return `[${formatIp(self.address)}${scope}]:${self.port}`;
};
var formatUrlHost = (self) => isIpv4Address(self) ? formatIp(self) : `[${formatIp(self)}]`;
var toUrl = (self, scheme = "http") => {
  if (self._tag === "InetAddressV6" && self.scopeId !== 0) {
    return addressError(self, "scoped IPv6 addresses are not supported by WHATWG URLs");
  }
  return try_({
    try: () => new URL(`${scheme}://${isInetAddress(self) ? formatInet(self) : formatUrlHost(self)}`),
    catch: (cause) => new NetAddressError({
      input: self,
      message: "failed to construct URL",
      cause
    })
  });
};
var formatUrl = (self, scheme = "http") => isUnixPathAddress(self) ? succeed2(formatUnixPath(self)) : map2(toUrl(self, scheme), (url) => `${url.protocol}//${url.host}`);
var formatUrlUnsafe = (self, scheme = "http") => getOrThrow(formatUrl(self, scheme));
var UnixPathProto = {
  _tag: "UnixPathAddress",
  [TypeId25]: TypeId25,
  [symbol2](that) {
    return isUnixPathAddress(that) && this.path === that.path;
  },
  [symbol]() {
    return combine(string("UnixPathAddress"), string(this.path));
  },
  toString() {
    return this.path;
  },
  toJSON() {
    return this.toString();
  },
  [NodeInspectSymbol]() {
    return this.toJSON();
  }
};
var unixPathAddress = (path) => {
  const self = Object.create(UnixPathProto);
  self.path = path;
  return Object.freeze(self);
};
var formatUnixPath = (self) => `unix://${self.path}`;

// node_modules/effect/dist/Schema.js
var TypeId26 = TypeId20;
function declareConstructor() {
  return (typeParameters, run, annotations) => {
    return make20(new Declaration(typeParameters.map(getAST), (typeParameters) => run(typeParameters.map((ast) => make20(ast))), annotations));
  };
}
function declare(is, annotations) {
  return declareConstructor()([], () => (input, ast, options) => is(input) ? succeed6(input) : fail6(new InvalidType(ast, input, options)), annotations);
}
class SchemaError extends (/* @__PURE__ */ TaggedError2("SchemaError")) {
  [SchemaErrorTypeId] = SchemaErrorTypeId;
  constructor(issue) {
    const stackTraceLimit = getStackTraceLimit();
    setStackTraceLimit(0);
    try {
      super({
        issue
      });
    } finally {
      setStackTraceLimit(stackTraceLimit);
    }
  }
  get message() {
    return defaultFormatter(this.issue);
  }
  toString() {
    return `SchemaError(${this.message})`;
  }
}
function fromIssueEffect(self) {
  if (effectIsExit(self)) {
    return fromIssueExit(self);
  }
  return catchCause2(self, (cause) => failCauseSync2(() => map6(cause, (issue) => new SchemaError(issue))));
}
function fromIssueExit(exit) {
  return isSuccess3(exit) ? exit : failCause2(map6(exit.cause, (issue) => new SchemaError(issue)));
}
var is2 = is;
function decodeUnknownEffect2(schema, options) {
  const parser = decodeUnknownEffect(schema, options);
  return (input, options) => {
    return fromIssueEffect(parser(input, options));
  };
}
var decodeEffect2 = decodeUnknownEffect2;
var make20 = make16;
function isSchema(u) {
  return hasProperty(u, TypeId26) && u[TypeId26] === TypeId26;
}
var optionalKey2 = /* @__PURE__ */ lambda((schema) => make20(optionalKey(schema.ast), {
  schema
}));
var optional2 = /* @__PURE__ */ lambda((self) => {
  const schema = UndefinedOr(self);
  return make20(optional(self.ast), {
    schema
  });
});
var toType2 = /* @__PURE__ */ lambda((schema) => make20(toType(schema.ast), {
  schema
}));
var toEncoded2 = /* @__PURE__ */ lambda((schema) => make20(toEncoded(schema.ast), {
  schema
}));
function Literal2(literal) {
  const out = make20(new Literal(literal), {
    literal,
    transform(to) {
      return out.pipe(decodeTo2(Literal2(to), {
        decode: transform(() => to),
        encode: transform(() => literal)
      }));
    }
  });
  return out;
}
var Unknown2 = /* @__PURE__ */ make20(unknown);
var Undefined2 = /* @__PURE__ */ make20(undefined_2);
var String4 = /* @__PURE__ */ make20(string2);
var Number6 = /* @__PURE__ */ make20(number2);
var Boolean2 = /* @__PURE__ */ make20(boolean);
function makeStruct(ast, fields) {
  return make20(ast, {
    fields,
    mapFields(f, options) {
      const fields = f(this.fields);
      return makeStruct(struct(fields, options?.unsafePreserveChecks ? this.ast.checks : undefined), fields);
    }
  });
}
function Struct(fields) {
  return makeStruct(struct(fields, undefined), fields);
}
function Record(key, value) {
  return make20(record(key.ast, value.ast), {
    key,
    value
  });
}
function StructWithRest(schema, records) {
  return make20(structWithRest(schema.ast, records.map(getAST)), {
    schema,
    records
  });
}
function makeTuple(ast, elements) {
  return make20(ast, {
    elements,
    mapElements(f, options) {
      const elements = f(this.elements);
      return makeTuple(tuple(elements, options?.unsafePreserveChecks ? this.ast.checks : undefined), elements);
    }
  });
}
function Tuple2(elements) {
  return makeTuple(tuple(elements), elements);
}
var ArraySchema = /* @__PURE__ */ lambda((schema) => make20(new Arrays(false, [], [schema.ast]), {
  value: schema
}));
function makeUnion(ast, members) {
  return make20(ast, {
    members,
    mapMembers(f, options) {
      const members = f(this.members);
      return makeUnion(union(members, this.ast.options, options?.unsafePreserveChecks ? this.ast.checks : undefined), members);
    }
  });
}
function Union2(members, options) {
  return makeUnion(union(members, options, undefined), members);
}
function Literals(literals) {
  const members = literals.map(Literal2);
  return make20(union(members, undefined, undefined), {
    literals,
    members,
    mapMembers(f) {
      return Union2(f(this.members));
    },
    pick(literals) {
      return Literals(literals);
    },
    transform(to) {
      return Union2(members.map((member, index) => member.transform(to[index])));
    }
  });
}
var UndefinedOr = /* @__PURE__ */ lambda((self) => Union2([self, Undefined2]));
function decodeTo2(to, transformation) {
  return (from) => {
    return make20(decodeTo(from.ast, to.ast, transformation ? make14(transformation) : passthrough2()), {
      from,
      to
    });
  };
}
var TrueLiterals = /* @__PURE__ */ Literals(["true", "yes", "on", "1", "y"]);
var FalseLiterals = /* @__PURE__ */ Literals(["false", "no", "off", "0", "n"]);
var BooleanLiterals = /* @__PURE__ */ Literals([...TrueLiterals.literals, ...FalseLiterals.literals]).pipe(/* @__PURE__ */ decodeTo2(Boolean2, /* @__PURE__ */ transform2({
  decode: (value) => value === "true" || value === "yes" || value === "on" || value === "1" || value === "y",
  encode: (value) => value ? "true" : "false"
})));
function encodeTo(to, transformation) {
  return (from) => {
    return transformation ? decodeTo2(from, transformation)(to) : decodeTo2(from)(to);
  };
}
function withConstructorDefault2(defaultValue) {
  return (schema) => make20(withConstructorDefault(schema.ast, defaultValue), {
    schema
  });
}
function toIssueEffect(self) {
  return catchCause2(self, (cause) => failCauseSync2(() => map6(cause, (error) => error.issue)));
}
function withDecodingDefault(defaultValue, options) {
  const encode = options?.encodingStrategy === "omit" ? omit() : passthrough();
  return (self) => {
    return optional2(toEncoded2(self)).pipe(decodeTo2(self, {
      decode: withDefault(toIssueEffect(defaultValue)),
      encode
    }));
  };
}
function withDecodingDefaultType(defaultValue, options) {
  return (self) => {
    return toType2(self).pipe(withDecodingDefault(defaultValue, options), encodeTo(optional2(self)));
  };
}
function tag(literal) {
  return Literal2(literal).pipe(withConstructorDefault2(succeed6(literal)));
}
function TaggedStruct(value, fields) {
  return Struct({
    _tag: tag(value),
    ...fields
  });
}
function instanceOf(constructor, annotations) {
  return declare((u) => u instanceof constructor, annotations);
}
function link() {
  return (encodeTo, transformation) => {
    return new Link(encodeTo.ast, make14(transformation));
  };
}
var makeFilter2 = makeFilter;
function isPattern2(regExp, annotations) {
  const source = regExp.source;
  const flags = regExp.flags;
  const runtimeRegExp = flags === "" ? `new RegExp(${format(source)})` : `new RegExp(${format(source)}, ${format(flags)})`;
  return isPattern(regExp, {
    toCode: () => ({
      runtime: `Schema.isPattern(${runtimeRegExp})`
    }),
    ...annotations
  });
}
function isBase64(annotations) {
  const regExp = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
  return isPattern2(regExp, {
    expected: "a base64 encoded string",
    representation: {
      id: "effect/schema/isBase64",
      payload: null
    },
    toJsonSchema: () => ({
      pattern: regExp.source
    }),
    toCode: () => ({
      runtime: "Schema.isBase64()"
    }),
    ...annotations
  });
}
function isInt(annotations) {
  return makeFilter2((n) => globalThis.Number.isSafeInteger(n), {
    expected: "an integer",
    representation: {
      id: "effect/schema/isInt",
      payload: null
    },
    toJsonSchema: () => ({
      type: "integer"
    }),
    toCode: () => ({
      runtime: "Schema.isInt()"
    }),
    arbitraryConstraint: {
      number: "integer"
    },
    ...annotations
  });
}
var Int = /* @__PURE__ */ Number6.check(/* @__PURE__ */ isInt());
var getErrorOptionsKey = (options) => (options?.includeStack === true ? 1 : 0) | (options?.excludeCause === true ? 2 : 0);
var getErrorOptions = (key) => {
  switch (key) {
    case 0:
      return;
    case 1:
      return {
        includeStack: true
      };
    case 2:
      return {
        excludeCause: true
      };
    case 3:
      return {
        includeStack: true,
        excludeCause: true
      };
  }
};
var defectSchemaCache = [];
function Defect(options) {
  const key = getErrorOptionsKey(options);
  const cached = defectSchemaCache[key];
  if (cached !== undefined) {
    return cached;
  }
  const schema = Json2.pipe(decodeTo2(Unknown2, defectFromJson(getErrorOptions(key))));
  defectSchemaCache[key] = schema;
  return schema;
}
var RegExp2 = /* @__PURE__ */ instanceOf(globalThis.RegExp, {
  representation: {
    id: "effect/schema/RegExp",
    payload: null
  },
  toCode: () => ({
    runtime: `Schema.RegExp`,
    Type: `globalThis.RegExp`
  }),
  expected: "RegExp",
  toCodecJson: () => link()(Struct({
    source: String4,
    flags: String4
  }), transformEffect2({
    decode: (e, options) => try_3({
      try: () => new globalThis.RegExp(e.source, e.flags),
      catch: () => new InvalidValue({
        expected: "valid RegExp source and flags"
      }, e, options)
    }),
    encode: (regExp) => succeed6({
      source: regExp.source,
      flags: regExp.flags
    })
  }))
});
var URLString = /* @__PURE__ */ String4.annotate({
  expected: "a string that will be decoded as a URL"
});
var URL2 = /* @__PURE__ */ instanceOf(globalThis.URL, {
  representation: {
    id: "effect/schema/URL",
    payload: null
  },
  toCode: () => ({
    runtime: `Schema.URL`,
    Type: `globalThis.URL`
  }),
  expected: "URL",
  toCodecJson: () => link()(URLString, urlFromString)
});
var JsonString = /* @__PURE__ */ String4.annotate({
  expected: "a string that will be decoded as JSON",
  contentMediaType: "application/json"
});
function fromJsonString2(schema, options) {
  return JsonString.pipe(decodeTo2(schema, fromJsonString(options)));
}
var File = /* @__PURE__ */ instanceOf(globalThis.File, {
  representation: {
    id: "effect/schema/File",
    payload: null
  },
  toCode: () => ({
    runtime: `Schema.File`,
    Type: `globalThis.File`
  }),
  expected: "File",
  toCodecJson: () => link()(Struct({
    data: String4.check(isBase64()),
    type: String4,
    name: String4,
    lastModified: Int
  }), transformEffect2({
    decode: (e, options) => match2(decodeBase64(e.data), {
      onFailure: () => fail6(new InvalidValue({
        expected: "a valid Base64 string"
      }, e.data, options)),
      onSuccess: (bytes) => {
        const buffer = new globalThis.Uint8Array(bytes);
        return succeed6(new globalThis.File([buffer], e.name, {
          type: e.type,
          lastModified: e.lastModified
        }));
      }
    }),
    encode: (file, options) => tryPromise2({
      try: async () => {
        const bytes = new globalThis.Uint8Array(await file.arrayBuffer());
        return {
          data: encodeBase64(bytes),
          type: file.type,
          name: file.name,
          lastModified: file.lastModified
        };
      },
      catch: () => new InvalidValue({
        expected: "a readable File"
      }, file, options)
    })
  }))
});
var FormData2 = /* @__PURE__ */ instanceOf(globalThis.FormData, {
  representation: {
    id: "effect/schema/FormData",
    payload: null
  },
  toCode: () => ({
    runtime: `Schema.FormData`,
    Type: `globalThis.FormData`
  }),
  expected: "FormData",
  toCodecJson: () => link()(ArraySchema(Tuple2([String4, Union2([Struct({
    _tag: tag("String"),
    value: String4
  }), Struct({
    _tag: tag("File"),
    value: File
  })])])), transformEffect2({
    decode: (e) => {
      const out = new globalThis.FormData;
      for (const [key, entry] of e) {
        out.append(key, entry.value);
      }
      return succeed6(out);
    },
    encode: (formData) => {
      return succeed6(globalThis.Array.from(formData.entries()).map(([key, value]) => {
        if (typeof value === "string") {
          return [key, {
            _tag: "String",
            value
          }];
        } else {
          return [key, {
            _tag: "File",
            value
          }];
        }
      }));
    }
  }))
});
var URLSearchParams2 = /* @__PURE__ */ instanceOf(globalThis.URLSearchParams, {
  representation: {
    id: "effect/schema/URLSearchParams",
    payload: null
  },
  toCode: () => ({
    runtime: `Schema.URLSearchParams`,
    Type: `globalThis.URLSearchParams`
  }),
  expected: "URLSearchParams",
  toCodecJson: () => link()(String4.annotate({
    expected: "a query string that will be decoded as URLSearchParams"
  }), transform2({
    decode: (e) => new globalThis.URLSearchParams(e),
    encode: (params) => params.toString()
  }))
});
var Base64String = /* @__PURE__ */ String4.annotate({
  expected: "a base64 encoded string that will be decoded as Uint8Array",
  format: "byte",
  contentEncoding: "base64"
});
var Uint8Array2 = /* @__PURE__ */ instanceOf(globalThis.Uint8Array, {
  representation: {
    id: "effect/schema/Uint8Array",
    payload: null
  },
  toCode: () => ({
    runtime: `Schema.Uint8Array`,
    Type: `globalThis.Uint8Array`
  }),
  expected: "Uint8Array",
  toCodecJson: () => link()(Base64String, uint8ArrayFromBase64String)
});
var arbitraryMinimumDateTimestamp = -8640000000000000;
var arbitraryMaximumDateTimestamp = 8640000000000000;
var arbitraryMinimumZonedDateTimeTimestamp = arbitraryMinimumDateTimestamp + 14 * 60 * 60 * 1000;
var arbitraryMaximumZonedDateTimeTimestamp = arbitraryMaximumDateTimestamp - 14 * 60 * 60 * 1000;
var arbitraryMinimumTimeZoneOffset = -12 * 60 * 60 * 1000;
var arbitraryMaximumTimeZoneOffset = 14 * 60 * 60 * 1000;
var immerable = /* @__PURE__ */ globalThis.Symbol.for("immer-draftable");
var payloadToken = {};
function makeClass(Inherited, identifier, struct2, annotations, proto) {
  const getClassSchema = getClassSchemaFactory(struct2, identifier, annotations);
  const ClassTypeId = getClassTypeId(identifier);
  const out = class extends Inherited {
    constructor(...[input, options]) {
      const internalOptions = options;
      const payload = internalOptions?.["~payload"];
      const value = payload?.token === payloadToken ? payload.value : struct2.make(input ?? {}, options);
      super(value, {
        ...options,
        disableChecks: true,
        "~payload": {
          token: payloadToken,
          value
        }
      });
    }
    static [TypeId26] = TypeId26;
    get [ClassTypeId]() {
      return ClassTypeId;
    }
    static [immerable] = true;
    static identifier = identifier;
    static fields = struct2.fields;
    static get ast() {
      return getClassSchema(this).ast;
    }
    static pipe() {
      return pipeArguments(this, arguments);
    }
    static rebuild(ast) {
      return getClassSchema(this).rebuild(ast);
    }
    static make(input, options) {
      return make15(getClassSchema(this))(input ?? {}, options);
    }
    static makeOption(input, options) {
      return makeOption(getClassSchema(this))(input ?? {}, options);
    }
    static makeEffect(input, options) {
      return getClassSchema(this).makeEffect(input ?? {}, options);
    }
    static annotate(annotations) {
      return this.rebuild(annotate(this.ast, annotations));
    }
    static annotateKey(annotations) {
      return this.rebuild(annotateKey(this.ast, annotations));
    }
    static check(...checks) {
      return this.rebuild(appendChecks(this.ast, checks));
    }
    static extend(identifier2) {
      return (schema, annotations) => {
        const extension = isStruct(schema) ? schema : Struct(schema);
        const fields = {
          ...struct2.fields,
          ...extension.fields
        };
        const ast = struct(fields, struct2.ast.checks, {
          identifier: identifier2
        });
        return makeClass(this, identifier2, makeStruct(appendChecks(ast, extension.ast.checks), fields), annotations, proto);
      };
    }
    static mapFields(f, options) {
      return struct2.mapFields(f, options);
    }
  };
  if (proto !== undefined) {
    Object.assign(out.prototype, proto(identifier));
  }
  return out;
}
function getClassTransformation(self) {
  return new Transformation(transform((input) => new self(input, {
    "~payload": {
      token: payloadToken,
      value: input
    }
  })), passthrough());
}
function getClassTypeId(identifier) {
  return `~effect/Schema/Class/${identifier}`;
}
function getClassSchemaFactory(from, identifier, annotations) {
  let memo;
  return (self) => {
    if (memo !== undefined) {
      return memo;
    }
    const ClassTypeId = getClassTypeId(identifier);
    const isClassValue = (input) => input instanceof self || hasProperty(input, ClassTypeId);
    const transformation = getClassTransformation(self);
    const to = make20(new Declaration([from.ast], () => (input, ast, options) => {
      return isClassValue(input) ? succeed6(input) : fail6(new InvalidType(ast, input, options));
    }, {
      identifier,
      [CONSTRUCTOR_ANNOTATION_KEY]: ([from]) => ({
        isConstructed: isClassValue,
        link: new Link(from, transformation)
      }),
      toCodec: ([from]) => new Link(from.ast, transformation),
      toEquivalence: ([from]) => from,
      toFormatter: ([from]) => (t) => `${self.identifier}(${from(t)})`,
      [SENTINELS_ANNOTATION_KEY]: collectSentinels(from.ast),
      ...annotations
    }));
    return memo = decodeTo2(to, transformation)(from);
  };
}
function isStruct(schema) {
  return isSchema(schema);
}
var Error4 = (identifier) => (schema, annotations) => {
  const struct = isStruct(schema) ? schema : Struct(schema);
  const self = makeClass(Error2, identifier, struct, annotations, (identifier) => ({
    name: identifier
  }));
  return self;
};
var TaggedError3 = (identifier) => {
  return (tagValue, schema, annotations) => {
    const struct = isStruct(schema) ? schema.mapFields((fields) => ({
      _tag: tag(tagValue),
      ...fields
    }), {
      unsafePreserveChecks: true
    }) : TaggedStruct(tagValue, schema);
    return Error4(identifier ?? tagValue)(struct, annotations);
  };
};
var toCodecJson2 = toCodecJson;
var toCodecStringTree2 = toCodecStringTree;
var Json2 = /* @__PURE__ */ make20(/* @__PURE__ */ annotate(Json, {
  toCode: () => ({
    runtime: "Schema.Json",
    Type: "Schema.Json"
  })
}));

// node_modules/effect/dist/Config.js
var TypeId27 = "~effect/Config";
class ConfigError {
  _tag = "ConfigError";
  name = "ConfigError";
  cause;
  constructor(cause) {
    this.cause = cause;
  }
  get message() {
    return this.cause.toString();
  }
  toString() {
    return `ConfigError(${this.message})`;
  }
}
var Proto7 = {
  .../* @__PURE__ */ Prototype2({
    label: "Config",
    evaluate(fiber) {
      return this.parse(fiber.getRef(ConfigProvider));
    }
  }),
  [TypeId27]: TypeId27,
  toJSON() {
    return {
      _id: "Config"
    };
  }
};
function make21(evaluator) {
  const self = Object.create(Proto7);
  self.evaluator = evaluator;
  self.parse = (provider) => evaluator(provider, []).pipe(mapErrorEager2((failure) => failure.error), flatMapEager2((resolution) => resolution._tag === "Resolved" ? succeed6(resolution.value) : fail6(resolution.error)));
  return self;
}
var evaluateAt = (self, provider, pathPrefix) => self.evaluator(provider, pathPrefix);
var resolved = (value, hasInput) => ({
  _tag: "Resolved",
  value,
  hasInput
});
var absent = (error) => ({
  _tag: "Absent",
  error
});
var evaluationFailure = (error, hasInput) => ({
  error,
  hasInput
});
var isSourceError = (u) => isTagged(u, "SourceError");
var catchSourceError = (self, hasInput) => self.pipe(catchDefect2((defect) => isSourceError(defect) ? fail6(evaluationFailure(new ConfigError(defect), hasInput)) : die2(defect)));
var withDefault2 = /* @__PURE__ */ dual(2, (self, defaultValue) => {
  return make21((provider, pathPrefix) => mapEager2(evaluateAt(self, provider, pathPrefix), (resolution) => resolution._tag === "Absent" ? resolved(defaultValue, false) : resolution));
});
var cursorToString = () => "<configuration>";
var loadCursor = (provider, path) => provider.load(path).pipe(orDie2, mapEager2((node) => ({
  provider,
  path,
  node,
  toString: cursorToString
})));
var loadChildCursor = (cursor, segment) => loadCursor(cursor.provider, [...cursor.path, segment]);
var getScalar = (node) => node?.value;
var decodeFromCursor = (ast, decode) => decodeTo(unknown, ast, new Transformation(transformEffect((input) => decode(input)), passthrough()));
var isScalarInput = (ast) => {
  switch (ast._tag) {
    case "Union":
      return ast.types.every(isScalarInput);
    case "Objects":
    case "Arrays":
    case "Suspend":
      return false;
    default:
      return true;
  }
};
var hasProviderInput = (ast, node) => {
  switch (ast._tag) {
    case "Objects":
      return node?._tag === "Record";
    case "Arrays":
      return node?._tag === "Array";
    case "Union":
      return ast.types.some((ast) => hasProviderInput(ast, node));
    case "Suspend":
      return hasProviderInput(ast.thunk(), node);
    default:
      return getScalar(node) !== undefined;
  }
};
var toConfigCursorAST = /* @__PURE__ */ memoize((root) => {
  const seen = new WeakSet;
  const recur = applyToSelfOrLastLinkEncoding((ast) => {
    seen.add(ast);
    switch (ast._tag) {
      case "Objects": {
        const matchesIndex = ast.indexSignatures.map((is) => _is(is.parameter));
        const materialize = fnUntraced2(function* (cursor) {
          if (cursor.node?._tag !== "Record") {
            return;
          }
          const node = cursor.node;
          const keys = new Set;
          for (const property of ast.propertySignatures) {
            if (typeof property.name === "string")
              keys.add(property.name);
          }
          if (matchesIndex.length > 0) {
            for (const key of node.keys) {
              if (matchesIndex.some((matches) => matches(key)))
                keys.add(key);
            }
          }
          const out = {};
          for (const key of keys) {
            const child = yield* loadChildCursor(cursor, key);
            if (child.node !== undefined)
              assignProperty(out, key, child);
          }
          return out;
        });
        return decodeFromCursor(ast.recur(recur, (ast) => ast), materialize);
      }
      case "Arrays": {
        const materialize = fnUntraced2(function* (cursor) {
          if (cursor.node?._tag !== "Array") {
            return;
          }
          const out = [];
          for (let i = 0;i < cursor.node.length; i++) {
            out.push(yield* loadChildCursor(cursor, i));
          }
          return out;
        });
        return decodeFromCursor(ast.recur(recur), materialize);
      }
      case "Union":
        for (const member of ast.types) {
          recur(member);
        }
        return isScalarInput(ast) ? decodeFromCursor(ast, (cursor) => succeed6(getScalar(cursor.node))) : ast.recur(recur);
      case "Suspend": {
        const target = ast.thunk();
        if (!seen.has(target))
          recur(target);
        return ast.recur(recur);
      }
      case "Declaration":
      case "Any":
        throw new globalThis.Error("Config.schema does not support opaque StringTree encodings", {
          cause: ast
        });
      default:
        return decodeFromCursor(ast, (cursor) => succeed6(getScalar(cursor.node)));
    }
  });
  return recur(root);
});
function schema(codec, path) {
  const codecStringTree = toCodecStringTree2(codec);
  const encodedAst = toEncoded(codecStringTree.ast);
  const decodeCursor = decodeUnknownEffect(make20(toConfigCursorAST(codecStringTree.ast)));
  const localPath = typeof path === "string" ? [path] : path ?? [];
  return make21((provider, pathPrefix) => {
    const fullPath = [...pathPrefix, ...localPath];
    return catchSourceError(loadCursor(provider, fullPath), false).pipe(flatMapEager2((cursor) => {
      const hasInput = hasProviderInput(encodedAst, cursor.node);
      return catchSourceError(decodeCursor(cursor).pipe(mapEager2((value) => resolved(value, hasInput)), catchEager2((issue) => {
        const error = new ConfigError(new SchemaError(fullPath.length > 0 ? new Pointer(fullPath, issue) : issue));
        return hasInput ? fail6(evaluationFailure(error, true)) : succeed6(absent(error));
      })), hasInput);
    }));
  });
}
function String5(name) {
  return schema(String4, name);
}
function Int2(name) {
  return schema(Int, name);
}

// node_modules/effect/dist/unstable/http/Etag.js
var toString = (self) => {
  switch (self._tag) {
    case "Weak":
      return `W/"${self.value}"`;
    case "Strong":
      return `"${self.value}"`;
  }
};

class Generator extends (/* @__PURE__ */ Service()("effect/http/Etag/Generator")) {
}
var fromFileInfo = (info) => {
  const mtime = match(info.mtime, {
    onNone: () => "0",
    onSome: (mtime) => mtime.getTime().toString(16)
  });
  return `${info.size.toString(16)}-${mtime}`;
};
var fromFileWeb = (file) => {
  return `${file.size.toString(16)}-${file.lastModified.toString(16)}`;
};
var layer = /* @__PURE__ */ succeed5(Generator)({
  fromFileInfo(info) {
    return sync2(() => ({
      _tag: "Strong",
      value: fromFileInfo(info)
    }));
  },
  fromFileWeb(file) {
    return sync2(() => ({
      _tag: "Strong",
      value: fromFileWeb(file)
    }));
  }
});
var layerWeak = /* @__PURE__ */ succeed5(Generator)({
  fromFileInfo(info) {
    return sync2(() => ({
      _tag: "Weak",
      value: fromFileInfo(info)
    }));
  },
  fromFileWeb(file) {
    return sync2(() => ({
      _tag: "Weak",
      value: fromFileWeb(file)
    }));
  }
});

// node_modules/effect/dist/unstable/http/HttpBody.js
var TypeId28 = "~effect/http/HttpBody";
var HttpBodyErrorTypeId = "~effect/http/HttpBody/HttpBodyError";

class HttpBodyError extends (/* @__PURE__ */ TaggedError2("HttpBodyError")) {
  [HttpBodyErrorTypeId] = HttpBodyErrorTypeId;
}

class Proto8 {
  [TypeId28];
  constructor() {
    this[TypeId28] = TypeId28;
  }
  [NodeInspectSymbol]() {
    return this.toJSON();
  }
  toString() {
    return format(this, {
      ignoreToString: true
    });
  }
}

class Empty2 extends Proto8 {
  _tag = "Empty";
  toJSON() {
    return {
      _id: "effect/HttpBody",
      _tag: "Empty"
    };
  }
}
var empty8 = /* @__PURE__ */ new Empty2;

class Raw extends Proto8 {
  _tag = "Raw";
  body;
  contentType;
  contentLength;
  constructor(body, contentType, contentLength) {
    super();
    this.body = body;
    this.contentType = contentType;
    this.contentLength = contentLength;
  }
  toJSON() {
    return {
      _id: "effect/HttpBody",
      _tag: "Raw",
      body: this.body,
      contentType: this.contentType,
      contentLength: this.contentLength
    };
  }
}
var raw = (body, options) => new Raw(body, options?.contentType, options?.contentLength);

class Uint8Array3 extends Proto8 {
  _tag = "Uint8Array";
  contentType;
  contentLength;
  text;
  _body;
  constructor(body, contentType, contentLength, text) {
    super();
    this._body = body;
    this.text = text;
    this.contentType = contentType;
    this.contentLength = contentLength;
  }
  get body() {
    return this._body ??= encodeText(this.text);
  }
  toJSON() {
    const toString = this.contentType.startsWith("text/") || this.contentType.endsWith("json");
    return {
      _id: "effect/HttpBody",
      _tag: "Uint8Array",
      body: toString ? new TextDecoder().decode(this.body) : `Uint8Array(${this.body.length})`,
      contentType: this.contentType,
      contentLength: this.contentLength
    };
  }
}
var uint8Array = (body, contentType) => new Uint8Array3(body, contentType ?? "application/octet-stream", body.length);
var encoder2 = /* @__PURE__ */ new TextEncoder;
var buffer2 = globalThis.Buffer;
var encodeText = buffer2 !== undefined ? (body) => buffer2.from(body, "utf8") : (body) => encoder2.encode(body);
var text = (body, contentType) => {
  if (typeof body !== "string") {
    body = body === undefined ? "" : String(body);
  }
  if (buffer2 !== undefined) {
    return new Uint8Array3(undefined, contentType ?? "text/plain", buffer2.byteLength(body, "utf8"), body);
  }
  const bytes = encoder2.encode(body);
  return new Uint8Array3(bytes, contentType ?? "text/plain", bytes.length, body);
};
var json = (body, contentType) => try_3({
  try: () => text(JSON.stringify(body), contentType ?? "application/json"),
  catch: (cause) => new HttpBodyError({
    reason: {
      _tag: "JsonError"
    },
    cause
  })
});
class Stream2 extends Proto8 {
  _tag = "Stream";
  stream;
  contentType;
  contentLength;
  constructor(stream, contentType, contentLength) {
    super();
    this.stream = stream;
    this.contentType = contentType;
    this.contentLength = contentLength;
  }
  toJSON() {
    return {
      _id: "effect/HttpBody",
      _tag: "Stream",
      contentType: this.contentType,
      contentLength: this.contentLength
    };
  }
}
var stream = (body, contentType, contentLength) => new Stream2(body, contentType ?? "application/octet-stream", contentLength);

// node_modules/effect/dist/unstable/http/HttpClientError.js
var TypeId29 = "~effect/http/HttpClientError";
class HttpClientError extends (/* @__PURE__ */ TaggedError2("HttpClientError")) {
  constructor(props) {
    if ("cause" in props.reason) {
      super({
        ...props,
        cause: props.reason.cause
      });
    } else {
      super(props);
    }
  }
  [TypeId29] = TypeId29;
  get request() {
    return this.reason.request;
  }
  get response() {
    return "response" in this.reason ? this.reason.response : undefined;
  }
  get message() {
    return this.reason.message;
  }
}
var formatReason = (tag) => tag.endsWith("Error") ? tag.slice(0, -5) : tag;
var formatMessage = (reason, description, info) => description ? `${reason}: ${description} (${info})` : `${reason} error (${info})`;

class TransportError extends (/* @__PURE__ */ TaggedError2("TransportError")) {
  get methodAndUrl() {
    return `${this.request.method} ${this.request.url}`;
  }
  get message() {
    return formatMessage(formatReason(this._tag), this.description, this.methodAndUrl);
  }
}
class InvalidUrlError extends (/* @__PURE__ */ TaggedError2("InvalidUrlError")) {
  get methodAndUrl() {
    return `${this.request.method} ${this.request.url}`;
  }
  get message() {
    return formatMessage(formatReason(this._tag), this.description, this.methodAndUrl);
  }
}
class DecodeError extends (/* @__PURE__ */ TaggedError2("DecodeError")) {
  get methodAndUrl() {
    return `${this.request.method} ${this.request.url}`;
  }
  get message() {
    const info = `${this.response.status} ${this.methodAndUrl}`;
    return formatMessage(formatReason(this._tag), this.description, info);
  }
}

class EmptyBodyError extends (/* @__PURE__ */ TaggedError2("EmptyBodyError")) {
  get methodAndUrl() {
    return `${this.request.method} ${this.request.url}`;
  }
  get message() {
    const info = `${this.response.status} ${this.methodAndUrl}`;
    return formatMessage(formatReason(this._tag), this.description, info);
  }
}

// node_modules/effect/dist/unstable/http/HttpMethod.js
var allShort = [["GET", "get"], ["POST", "post"], ["PUT", "put"], ["DELETE", "del"], ["PATCH", "patch"], ["HEAD", "head"], ["OPTIONS", "options"], ["TRACE", "trace"]];

// node_modules/effect/dist/unstable/http/internal/httpBody.js
var updateHeaders = (headers, body) => {
  if (body._tag === "Empty" || body._tag === "FormData") {
    return remove2(remove2(headers, "content-type"), "content-length");
  }
  headers = body.contentType === undefined ? remove2(headers, "content-type") : set2(headers, "content-type", body.contentType);
  return body.contentLength === undefined ? remove2(headers, "content-length") : set2(headers, "content-length", body.contentLength.toString());
};

// node_modules/effect/dist/unstable/http/Url.js
class UrlError extends (/* @__PURE__ */ TaggedError2("UrlError")) {
}
var make22 = (url, params, hash) => try_({
  try: () => {
    const urlInstance = new URL(url, baseUrl());
    for (let i = 0;i < params.params.length; i++) {
      const [key, value] = params.params[i];
      if (value !== undefined) {
        urlInstance.searchParams.append(key, value);
      }
    }
    if (hash !== undefined) {
      urlInstance.hash = hash;
    }
    return urlInstance;
  },
  catch: (cause) => new UrlError({
    cause
  })
});
var baseUrl = () => {
  if ("location" in globalThis && globalThis.location !== undefined && globalThis.location.origin !== undefined && globalThis.location.pathname !== undefined) {
    return location.origin + location.pathname;
  }
  return;
};

// node_modules/effect/dist/unstable/http/HttpClientRequest.js
var TypeId30 = "~effect/http/HttpClientRequest";
var Proto9 = {
  [TypeId30]: TypeId30,
  ...BaseProto,
  toJSON() {
    return {
      _id: "HttpClientRequest",
      method: this.method,
      url: this.url,
      urlParams: this.urlParams,
      hash: this.hash,
      headers: redact(this.headers),
      body: this.body.toJSON()
    };
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
function makeWith(method, url, urlParams, hash, headers, body) {
  const self = Object.create(Proto9);
  self.method = method;
  self.url = url;
  self.urlParams = urlParams;
  self.hash = hash;
  self.headers = headers;
  self.body = body;
  return self;
}
var empty9 = /* @__PURE__ */ makeWith("GET", "", empty7, /* @__PURE__ */ none2(), empty6, empty8);
var make23 = (method) => (url, options) => modify(empty9, {
  method,
  url,
  ...options ?? undefined
});
var modify = /* @__PURE__ */ dual(2, (self, options) => {
  let result = self;
  if (options.method) {
    result = setMethod(result, options.method);
  }
  if (options.url) {
    result = setUrl(result, options.url);
  }
  if (options.headers) {
    result = setHeaders(result, options.headers);
  }
  if (options.urlParams) {
    result = setUrlParams(result, options.urlParams);
  }
  if (options.hash) {
    result = setHash(result, options.hash);
  }
  if (options.body) {
    result = setBody(result, options.body);
  }
  if (options.accept) {
    result = accept(result, options.accept);
  }
  if (options.acceptJson) {
    result = acceptJson(result);
  }
  return result;
});
var setMethod = /* @__PURE__ */ dual(2, (self, method) => makeWith(method, self.url, self.urlParams, self.hash, self.headers, self.body));
var setHeader = /* @__PURE__ */ dual(3, (self, key, value) => makeWith(self.method, self.url, self.urlParams, self.hash, set2(self.headers, key, value), self.body));
var setHeaders = /* @__PURE__ */ dual(2, (self, input) => makeWith(self.method, self.url, self.urlParams, self.hash, setAll(self.headers, input), self.body));
var accept = /* @__PURE__ */ dual(2, (self, mediaType) => setHeader(self, "Accept", mediaType));
var acceptJson = /* @__PURE__ */ accept("application/json");
var setUrl = /* @__PURE__ */ dual(2, (self, url) => {
  if (typeof url === "string") {
    return makeWith(self.method, url, self.urlParams, self.hash, self.headers, self.body);
  }
  const clone = new URL(url.toString());
  const urlParams = fromInput3(clone.searchParams);
  const hash = fromNullishOr(clone.hash === "" ? undefined : clone.hash.slice(1));
  clone.search = "";
  clone.hash = "";
  return makeWith(self.method, clone.toString(), urlParams, hash, self.headers, self.body);
});
var setUrlParams = /* @__PURE__ */ dual(2, (self, input) => makeWith(self.method, self.url, setAll2(self.urlParams, input), self.hash, self.headers, self.body));
var setHash = /* @__PURE__ */ dual(2, (self, hash) => makeWith(self.method, self.url, self.urlParams, some2(hash), self.headers, self.body));
var setBody = /* @__PURE__ */ dual(2, (self, body) => {
  return makeWith(self.method, self.url, self.urlParams, self.hash, updateHeaders(self.headers, body), body);
});
function toUrl2(self) {
  const r = make22(self.url, self.urlParams, getOrUndefined(self.hash));
  if (isSuccess2(r)) {
    return some2(r.success);
  }
  return none2();
}

// node_modules/effect/dist/unstable/http/HttpIncomingMessage.js
var TypeId31 = "~effect/http/HttpIncomingMessage";
var schemaBodyJson = (schema, options) => {
  const decode = decodeEffect2(toCodecJson2(schema));
  const decodeJson = options?.reviver === undefined ? undefined : decodeEffect2(fromJsonString2(toCodecJson2(schema), options));
  return (self) => decodeJson === undefined ? flatMap5(self.json, (u) => decode(u, options)) : flatMap5(self.text, (body) => body === "" ? flatMap5(self.json, (u) => decode(u, options)) : decodeJson(body, options));
};
var MaxBodySize = /* @__PURE__ */ Reference("effect/http/HttpIncomingMessage/MaxBodySize", {
  defaultValue: () => {
    return;
  }
});
var inspect = (self, that) => {
  const contentType = self.headers["content-type"] ?? "";
  let body;
  if (contentType.includes("application/json")) {
    try {
      body = runSync2(self.json);
    } catch (_) {}
  } else if (contentType.includes("text/") || contentType.includes("urlencoded")) {
    try {
      body = runSync2(self.text);
    } catch (_) {}
  }
  const obj = {
    ...that,
    headers: redact(self.headers),
    remoteAddress: self.remoteAddress
  };
  if (body !== undefined) {
    obj.body = body;
  }
  return obj;
};

// node_modules/effect/dist/unstable/http/HttpClientResponse.js
var TypeId32 = "~effect/http/HttpClientResponse";
var fromWeb = (request, source) => new WebHttpClientResponse(request, source);
class WebHttpClientResponse extends Class2 {
  [TypeId31];
  [TypeId32];
  request;
  source;
  constructor(request, source) {
    super();
    this.request = request;
    this.source = source;
    this[TypeId31] = TypeId31;
    this[TypeId32] = TypeId32;
  }
  toJSON() {
    return inspect(this, {
      _id: "HttpClientResponse",
      request: this.request.toJSON(),
      status: this.status
    });
  }
  get status() {
    return this.source.status;
  }
  get url() {
    if (this.source.url)
      return this.source.url.split("#")[0];
    const url = toUrl2(this.request);
    if (isNone2(url))
      return "";
    url.value.hash = "";
    return url.value.href;
  }
  get headers() {
    return fromInput2(this.source.headers);
  }
  cachedCookies;
  get cookies() {
    if (this.cachedCookies) {
      return this.cachedCookies;
    }
    return this.cachedCookies = fromSetCookie(this.source.headers.getSetCookie());
  }
  get remoteAddress() {
    return none2();
  }
  get stream() {
    return this.source.body ? fromReadableStream2({
      evaluate: () => this.source.body,
      onError: (cause) => new HttpClientError({
        reason: new DecodeError({
          request: this.request,
          response: this,
          cause
        })
      })
    }) : fail8(new HttpClientError({
      reason: new EmptyBodyError({
        request: this.request,
        response: this,
        description: "can not create stream from empty body"
      })
    }));
  }
  get json() {
    return flatMap5(this.text, (text) => try_3({
      try: () => text === "" ? null : JSON.parse(text),
      catch: (cause) => new HttpClientError({
        reason: new DecodeError({
          request: this.request,
          response: this,
          cause
        })
      })
    }));
  }
  textBody;
  get text() {
    return this.textBody ??= map7(this.arrayBuffer, (_) => new TextDecoder().decode(_));
  }
  get urlParamsBody() {
    return flatMap5(this.text, (_) => try_3({
      try: () => fromInput3(new URLSearchParams(_)),
      catch: (cause) => new HttpClientError({
        reason: new DecodeError({
          request: this.request,
          response: this,
          cause
        })
      })
    }));
  }
  formDataBody;
  get formData() {
    return this.formDataBody ??= tryPromise2({
      try: () => this.source.formData(),
      catch: (cause) => new HttpClientError({
        reason: new DecodeError({
          request: this.request,
          response: this,
          cause
        })
      })
    }).pipe(cached2, runSync2);
  }
  arrayBufferBody;
  get arrayBuffer() {
    if (this.arrayBufferBody) {
      return this.arrayBufferBody;
    }
    this.arrayBufferBody = tryPromise2({
      try: () => this.source.arrayBuffer(),
      catch: (cause) => new HttpClientError({
        reason: new DecodeError({
          request: this.request,
          response: this,
          cause
        })
      })
    }).pipe(cached2, runSync2);
    return this.arrayBufferBody;
  }
  pipe() {
    return pipeArguments(this, arguments);
  }
}

// node_modules/effect/dist/unstable/http/HttpTraceContext.js
var toHeaders = (span) => fromRecordUnsafe({
  b3: `${span.traceId}-${span.spanId}-${span.sampled ? "1" : "0"}${match(span.parent, {
    onNone: () => "",
    onSome: (parent) => `-${parent.spanId}`
  })}`,
  traceparent: `00-${span.traceId}-${span.spanId}-${span.sampled ? "01" : "00"}`
});
var fromHeaders = (headers) => {
  let span = w3c(headers);
  if (isSome2(span)) {
    return span;
  }
  span = b3(headers);
  if (isSome2(span)) {
    return span;
  }
  return xb3(headers);
};
var b3 = (headers) => {
  if (!("b3" in headers)) {
    return none2();
  }
  const parts = headers["b3"].split("-");
  if (parts.length < 2) {
    return none2();
  }
  return some2(externalSpan({
    traceId: parts[0],
    spanId: parts[1],
    sampled: parts[2] ? parts[2] === "1" : true
  }));
};
var xb3 = (headers) => {
  if (!headers["x-b3-traceid"] || !headers["x-b3-spanid"]) {
    return none2();
  }
  return some2(externalSpan({
    traceId: headers["x-b3-traceid"],
    spanId: headers["x-b3-spanid"],
    sampled: headers["x-b3-sampled"] ? headers["x-b3-sampled"] === "1" : true
  }));
};
var w3cTraceId = /^[0-9a-f]{32}$/i;
var w3cSpanId = /^[0-9a-f]{16}$/i;
var w3c = (headers) => {
  if (!headers["traceparent"]) {
    return none2();
  }
  const parts = headers["traceparent"].split("-");
  if (parts.length !== 4) {
    return none2();
  }
  const [version, traceId, spanId, flags] = parts;
  switch (version) {
    case "00": {
      if (w3cTraceId.test(traceId) === false || w3cSpanId.test(spanId) === false) {
        return none2();
      }
      return some2(externalSpan({
        traceId,
        spanId,
        sampled: (parseInt(flags, 16) & 1) === 1
      }));
    }
    default: {
      return none2();
    }
  }
};

// node_modules/effect/dist/unstable/http/HttpClient.js
var TypeId33 = "~effect/http/HttpClient";
var HttpClient = /* @__PURE__ */ Service("effect/HttpClient");
var transformResponse = /* @__PURE__ */ dual(2, (self, f) => makeWith2((request) => f(self.postprocess(request)), self.preprocess));
var makeWith2 = (postprocess, preprocess) => {
  const self = Object.create(Proto10);
  self.preprocess = preprocess;
  self.postprocess = postprocess;
  self.execute = function(request) {
    return postprocess(preprocess(request));
  };
  return self;
};
var Proto10 = {
  [TypeId33]: TypeId33,
  pipe() {
    return pipeArguments(this, arguments);
  },
  ...BaseProto,
  toJSON() {
    return {
      _id: "effect/HttpClient"
    };
  },
  .../* @__PURE__ */ Object.fromEntries(/* @__PURE__ */ allShort.map(([fullMethod, method]) => [method, function(url, options) {
    return this.execute(make23(fullMethod)(url, options));
  }]))
};
var make24 = (f) => makeWith2((effect) => flatMap5(effect, (request) => withFiber2((fiber) => {
  const scopedController = scopedRequests.get(request);
  const controller = scopedController ?? new AbortController;
  const urlResult = make22(request.url, request.urlParams, getOrUndefined(request.hash));
  if (isFailure2(urlResult)) {
    return fail6(new HttpClientError({
      reason: new InvalidUrlError({
        request,
        cause: urlResult.failure
      })
    }));
  }
  const url = urlResult.success;
  const tracerDisabled = fiber.getRef(DisablePropagation) || fiber.getRef(TracerDisabledWhen)(request);
  if (tracerDisabled) {
    const effect = f(request, url, controller.signal, fiber);
    if (scopedController)
      return effect;
    return uninterruptibleMask2((restore) => matchCauseEffect2(restore(effect), {
      onSuccess(response) {
        responseRegistry.register(response, controller);
        return succeed6(new InterruptibleResponse(response, controller));
      },
      onFailure(cause) {
        if (hasInterrupts2(cause)) {
          controller.abort();
        }
        return failCause3(cause);
      }
    }));
  }
  return useSpan2(fiber.getRef(SpanNameGenerator)(request), {
    kind: "client"
  }, (span) => {
    span.attribute("http.request.method", request.method);
    span.attribute("server.address", url.origin);
    if (url.port !== "") {
      span.attribute("server.port", +url.port);
    }
    span.attribute("url.full", url.toString());
    span.attribute("url.path", url.pathname);
    span.attribute("url.scheme", url.protocol.slice(0, -1));
    const query = url.search.slice(1);
    if (query !== "") {
      span.attribute("url.query", query);
    }
    const redactedHeaderNames = fiber.getRef(CurrentRedactedNames);
    const headerFilter = fiber.getRef(TracerHeaderFilter);
    for (const name in request.headers) {
      if (!headerFilter(name, "request"))
        continue;
      span.attribute(`http.request.header.${name}`, isRedactedName(name, redactedHeaderNames) ? "<redacted>" : request.headers[name]);
    }
    request = fiber.getRef(TracerPropagationEnabled) ? setHeaders(request, toHeaders(span)) : request;
    return uninterruptibleMask2((restore) => restore(f(request, url, controller.signal, fiber)).pipe(withParentSpan2(span, {
      captureStackTrace: false
    }), matchCauseEffect2({
      onSuccess: (response) => {
        span.attribute("http.response.status_code", response.status);
        for (const name in response.headers) {
          if (!headerFilter(name, "response"))
            continue;
          span.attribute(`http.response.header.${name}`, isRedactedName(name, redactedHeaderNames) ? "<redacted>" : response.headers[name]);
        }
        if (scopedController)
          return succeed6(response);
        responseRegistry.register(response, controller);
        return succeed6(new InterruptibleResponse(response, controller));
      },
      onFailure(cause) {
        if (!scopedController && hasInterrupts2(cause)) {
          controller.abort();
        }
        return failCause3(cause);
      }
    })));
  });
})), succeed6);
var TracerDisabledWhen = /* @__PURE__ */ Reference("effect/http/HttpClient/TracerDisabledWhen", {
  defaultValue: () => constFalse
});
var TracerHeaderFilter = /* @__PURE__ */ Reference("effect/http/HttpClient/TracerHeaderFilter", {
  defaultValue: () => constTrue
});
var TracerPropagationEnabled = /* @__PURE__ */ Reference("effect/http/HttpClient/TracerPropagationEnabled", {
  defaultValue: constTrue
});
var SpanNameGenerator = /* @__PURE__ */ Reference("effect/http/HttpClient/SpanNameGenerator", {
  defaultValue: () => (request) => `http.client ${request.method}`
});
var layerMergedContext = (effect2) => effect(HttpClient)(contextWith2((context) => map7(effect2, (client) => transformResponse(client, updateContext2((input) => merge(context, input))))));
var responseRegistry = /* @__PURE__ */ (() => {
  if ("FinalizationRegistry" in globalThis && globalThis.FinalizationRegistry) {
    const registry = /* @__PURE__ */ new FinalizationRegistry((controller) => {
      controller.abort();
    });
    return {
      register(response, controller) {
        registry.register(response, controller, response);
      },
      unregister(response) {
        registry.unregister(response);
      }
    };
  }
  const timers = /* @__PURE__ */ new Map;
  return {
    register(response, controller) {
      timers.set(response, setTimeout(() => controller.abort(), 5000));
    },
    unregister(response) {
      const timer = timers.get(response);
      if (timer === undefined)
        return;
      clearTimeout(timer);
      timers.delete(response);
    }
  };
})();
var scopedRequests = /* @__PURE__ */ new WeakMap;

class InterruptibleResponse {
  original;
  controller;
  constructor(original, controller) {
    this.original = original;
    this.controller = controller;
  }
  [TypeId32] = TypeId32;
  [TypeId31] = TypeId31;
  applyInterrupt(effect) {
    return suspend2(() => {
      responseRegistry.unregister(this.original);
      return onInterrupt2(effect, () => sync2(() => {
        this.controller.abort();
      }));
    });
  }
  get request() {
    return this.original.request;
  }
  get url() {
    return this.original.url;
  }
  get status() {
    return this.original.status;
  }
  get headers() {
    return this.original.headers;
  }
  get cookies() {
    return this.original.cookies;
  }
  get remoteAddress() {
    return this.original.remoteAddress;
  }
  get formData() {
    return this.applyInterrupt(this.original.formData);
  }
  get text() {
    return this.applyInterrupt(this.original.text);
  }
  get json() {
    return this.applyInterrupt(this.original.json);
  }
  get urlParamsBody() {
    return this.applyInterrupt(this.original.urlParamsBody);
  }
  get arrayBuffer() {
    return this.applyInterrupt(this.original.arrayBuffer);
  }
  get stream() {
    return suspend4(() => {
      responseRegistry.unregister(this.original);
      return ensuring4(this.original.stream, sync2(() => {
        this.controller.abort();
      }));
    });
  }
  toJSON() {
    return this.original.toJSON();
  }
  [NodeInspectSymbol]() {
    return this.original[NodeInspectSymbol]();
  }
  pipe() {
    return pipeArguments(this, arguments);
  }
}

// node_modules/effect/dist/unstable/http/FetchHttpClient.js
var Fetch = /* @__PURE__ */ Reference("effect/http/FetchHttpClient/Fetch", {
  defaultValue: () => globalThis.fetch
});

class RequestInit extends (/* @__PURE__ */ Service()("effect/http/FetchHttpClient/RequestInit")) {
}
var fetch = /* @__PURE__ */ make24((request, url, signal, fiber) => {
  const fetch = fiber.getRef(Fetch);
  const options = getOrUndefined2(fiber.context, RequestInit) ?? {};
  let headers = options.headers ? merge5(fromInput2(options.headers), request.headers) : request.headers;
  if (headers["content-length"]) {
    headers = remove2(headers, "content-length");
  }
  const send = (body) => map7(tryPromise2({
    try: () => fetch(url, {
      ...options,
      method: request.method,
      headers,
      body,
      duplex: typeof ReadableStream !== "undefined" && body instanceof ReadableStream ? "half" : undefined,
      signal
    }),
    catch: (cause) => new HttpClientError({
      reason: new TransportError({
        request,
        cause
      })
    })
  }), (response) => fromWeb(request, response));
  switch (request.body._tag) {
    case "Raw":
    case "Uint8Array":
      return send(request.body.body);
    case "FormData":
      return send(request.body.formData);
    case "Stream":
      return flatMap5(toReadableStreamEffect(request.body.stream), send);
  }
  return send(undefined);
});
var layer2 = /* @__PURE__ */ layerMergedContext(/* @__PURE__ */ succeed6(fetch));

// node_modules/effect/dist/ErrorReporter.js
var ignore4 = "~effect/ErrorReporter/ignore";

// node_modules/effect/dist/unstable/http/internal/headers.js
var Proto11 = /* @__PURE__ */ Object.getPrototypeOf(empty6);
var emptyMutableUnsafe = () => Object.create(Proto11);

// node_modules/effect/dist/unstable/http/HttpServerResponse.js
var TypeId34 = "~effect/http/HttpServerResponse";
var isHttpServerResponse = (u) => hasProperty(u, TypeId34);
var empty10 = (options) => makeResponse({
  status: options?.status ?? 204,
  statusText: options?.statusText,
  headers: options?.headers ? fromInput2(options.headers) : undefined,
  cookies: options?.cookies
});
var getContentType = (options, headers) => {
  if (options?.contentType) {
    return options.contentType;
  } else if (options?.headers) {
    return headers["content-type"];
  }
};
var json2 = (body, options) => {
  const headers = options?.headers ? fromInput2(options.headers) : empty6;
  return map7(json(body, getContentType(options, headers)), (body) => makeResponse({
    status: options?.status ?? 200,
    statusText: options?.statusText,
    headers,
    cookies: options?.cookies,
    body
  }));
};
var raw2 = (body, options) => makeResponse({
  status: options?.status ?? 200,
  statusText: options?.statusText,
  headers: options?.headers && fromInput2(options.headers),
  cookies: options?.cookies,
  body: raw(body, {
    contentType: options?.contentType,
    contentLength: options?.contentLength
  })
});
var setHeader2 = /* @__PURE__ */ dual(3, (self, key, value) => makeResponse(self, set2(self.headers, key, value)));
var removeHeader2 = /* @__PURE__ */ dual(2, (self, key) => makeResponse({
  ...self,
  headers: remove2(self.headers, key)
}));
var setHeaders2 = /* @__PURE__ */ dual(2, (self, input) => makeResponse(self, setAll(self.headers, input)));
var setBody2 = /* @__PURE__ */ dual(2, (self, body) => makeResponse({
  ...self,
  body
}, updateHeaders(self.headers, body)));
var omitsBody = (response, withoutBody = false) => withoutBody || response.status === 204 || response.status === 205 || response.status === 304;
var toWeb = (response, options) => {
  const headers = new globalThis.Headers(response.headers);
  if (!isEmpty(response.cookies)) {
    const toAdd = toSetCookieHeaders(response.cookies);
    for (const header of toAdd) {
      headers.append("set-cookie", header);
    }
  }
  const body = response.body;
  if (omitsBody(response, options?.withoutBody)) {
    if (body._tag === "Raw" && isReadableStream(body.body)) {
      body.body.cancel().catch(constVoid);
    }
    return new Response(undefined, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
  switch (body._tag) {
    case "Empty": {
      return new Response(undefined, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }
    case "Uint8Array": {
      return new Response(body.text ?? body.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }
    case "Raw": {
      if (body.body instanceof Response) {
        for (const [key, value] of headers) {
          body.body.headers.set(key, value);
        }
        return body.body;
      }
      return new Response(body.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }
    case "FormData": {
      return new Response(body.formData, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }
    case "Stream": {
      return new Response(toReadableStreamWith(body.stream, options?.context ?? empty2()), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }
  }
};
var isReadableStream = (u) => typeof ReadableStream !== "undefined" && u instanceof ReadableStream;
var Proto12 = {
  ...PipeInspectableProto,
  [TypeId34]: TypeId34,
  [ignore4]: true,
  toJSON() {
    return {
      _id: "HttpServerResponse",
      status: this.status,
      statusText: this.statusText,
      headers: redact(this.headers),
      cookies: this.cookies.toJSON(),
      body: this.body.toJSON()
    };
  }
};
var makeResponse = (options, ownedHeaders) => {
  const self = Object.create(Proto12);
  self.status = options.status;
  self.statusText = options.statusText;
  self.cookies = options.cookies ?? empty5;
  self.body = options.body ?? empty8;
  if (self.body._tag !== "Empty" && (self.body.contentType || self.body.contentLength !== undefined)) {
    const owned = ownedHeaders !== undefined;
    const newHeaders = owned ? ownedHeaders : options.headers === undefined || options.headers === empty6 ? emptyMutableUnsafe() : fromRecordUnsafe({
      ...options.headers
    });
    if (self.body.contentType && (!owned || newHeaders["content-type"] === undefined)) {
      newHeaders["content-type"] = self.body.contentType;
    }
    if (self.body.contentLength !== undefined && (!owned || newHeaders["content-length"] === undefined)) {
      newHeaders["content-length"] = self.body.contentLength.toString();
    }
    self.headers = newHeaders;
  } else {
    self.headers = ownedHeaders ?? options.headers ?? empty6;
  }
  return self;
};

// node_modules/effect/dist/unstable/http/internal/compression.js
var varyWith = (headers, dimension) => {
  const vary = headers["vary"];
  if (vary === undefined) {
    return dimension;
  }
  const members = vary.split(",").map((member) => member.trim().toLowerCase());
  return members.includes("*") || members.includes(dimension.toLowerCase()) ? vary : `${vary}, ${dimension}`;
};
var wrapCompression = (impl) => ({
  algorithms: impl.algorithms,
  compressResponse(response, algorithm, options) {
    return map7(impl.compressResponse(response, algorithm, options), (compressed) => {
      if (compressed === response) {
        return response;
      }
      const headers = {
        "content-encoding": algorithm,
        vary: varyWith(compressed.headers, "Accept-Encoding")
      };
      const etag = compressed.headers["etag"];
      if (etag !== undefined && !etag.startsWith("W/")) {
        headers["etag"] = `W/${etag}`;
      }
      return setHeaders2(compressed, headers);
    });
  }
});
var compressionTransformWeb = (format) => (stream) => stream.pipeThrough(new CompressionStream(format));
var setBodyWithoutLength = (response, body) => removeHeader2(setBody2(response, body), "content-length");
var makeCompressionWeb = (options) => ({
  algorithms: new Set(options.algorithms),
  compressResponse(response, algorithm, opts) {
    const body = response.body;
    switch (body._tag) {
      case "Uint8Array": {
        const data = body.body;
        return succeed6(streamBody(response, () => options.transform(algorithm, opts)(singleChunkStream(data)), response.headers["content-type"] ?? body.contentType));
      }
      case "Stream": {
        const stream = body.stream;
        return succeed6(streamBody(response, () => options.transform(algorithm, opts)(toReadableStream(stream)), response.headers["content-type"] ?? body.contentType));
      }
      case "Raw": {
        const readable = rawReadableStream(body.body);
        if (readable === undefined) {
          return succeed6(response);
        }
        return succeed6(setBodyWithoutLength(response, raw(options.transform(algorithm, opts)(readable), {
          contentType: response.headers["content-type"] ?? body.contentType
        })));
      }
      default: {
        return succeed6(response);
      }
    }
  }
});
var streamBody = (response, evaluate, contentType) => setBodyWithoutLength(response, stream(fromReadableStream2({
  evaluate,
  onError: identity
}), contentType));
var singleChunkStream = (data) => new ReadableStream({
  start(controller) {
    controller.enqueue(data);
    controller.close();
  }
});
var rawReadableStream = (raw) => {
  if (typeof ReadableStream !== "undefined" && raw instanceof ReadableStream) {
    return raw;
  } else if (raw instanceof globalThis.Response) {
    return raw.body ?? undefined;
  }
  return new globalThis.Response(raw).body ?? undefined;
};

// node_modules/effect/dist/unstable/http/HttpPlatform.js
class HttpPlatform extends (/* @__PURE__ */ Service()("effect/http/HttpPlatform")) {
}
var make25 = /* @__PURE__ */ fnUntraced2(function* (impl) {
  const fs = yield* FileSystem;
  const etagGen = yield* Generator;
  return HttpPlatform.of({
    platform: impl.platform,
    compression: wrapCompression(impl.compression),
    fileResponse: fnUntraced2(function* (path, options) {
      const info = yield* fs.stat(path);
      const etag = yield* etagGen.fromFileInfo(info);
      const requestedOffset = options?.offset === undefined ? zero2 : yield* fileResponseSize(options.offset, "offset");
      const offset = requestedOffset > info.size ? info.size : requestedOffset;
      const available = info.size - offset;
      const bytesToRead = options?.bytesToRead !== undefined ? yield* fileResponseSize(options.bytesToRead, "bytesToRead") : undefined;
      const contentLength = bytesToRead === undefined || bytesToRead > available ? available : bytesToRead;
      const limit = bytesToRead === undefined ? undefined : offset + contentLength;
      const start = yield* fileResponseNumber(offset, "offset");
      const end = limit === undefined ? undefined : yield* fileResponseNumber(limit, "end");
      const headers = set2(options?.headers ? fromInput2(options.headers) : empty6, "etag", toString(etag));
      if (isSome2(info.mtime)) {
        headers["last-modified"] = info.mtime.value.toUTCString();
      }
      return impl.fileResponse(path, options?.status ?? 200, options?.statusText, headers, start, end, contentLength);
    }),
    fileWebResponse(file, options) {
      return map7(etagGen.fromFileWeb(file), (etag) => {
        const headers = merge5(options?.headers ? fromInput2(options.headers) : empty6, fromRecordUnsafe({
          etag: toString(etag),
          "last-modified": new Date(file.lastModified).toUTCString()
        }));
        return impl.fileWebResponse(file, options?.status ?? 200, options?.statusText, headers, options);
      });
    }
  });
});
var fileResponseSize = (input, field) => {
  const size = fromInput(input);
  return isSome2(size) ? succeed6(size.value) : fail6(badArgument({
    module: "HttpPlatform",
    method: "fileResponse",
    description: `Invalid ${field}: ${input}`
  }));
};
var fileResponseNumber = (value, field) => {
  const number = Number(value);
  return Number.isSafeInteger(number) ? succeed6(number) : fail6(badArgument({
    module: "HttpPlatform",
    method: "fileResponse",
    description: `${field} exceeds the safe integer range: ${value}`
  }));
};
var compressionTransformWeb2 = compressionTransformWeb;
var makeCompressionWeb2 = makeCompressionWeb;

// node_modules/effect/dist/unstable/http/HttpServerRespondable.js
var symbol4 = "~effect/http/HttpServerRespondable";
var isRespondable = (u) => hasProperty(u, symbol4);
var badRequest = /* @__PURE__ */ empty10({
  status: 400
});
var notFound2 = /* @__PURE__ */ empty10({
  status: 404
});
var toResponseOrElse = (u, orElse) => {
  if (isHttpServerResponse(u)) {
    return succeed6(u);
  } else if (isRespondable(u)) {
    return catchCause2(u[symbol4](), () => succeed6(orElse));
  } else if (isSchemaError(u)) {
    return succeed6(badRequest);
  } else if (isNoSuchElementError2(u)) {
    return succeed6(notFound2);
  }
  return succeed6(orElse);
};
var toResponseOrElseDefect = (u, orElse) => {
  if (isHttpServerResponse(u)) {
    return succeed6(u);
  } else if (isRespondable(u)) {
    return catchCause2(u[symbol4](), () => succeed6(orElse));
  }
  return succeed6(orElse);
};

// node_modules/effect/dist/unstable/http/HttpServerError.js
var TypeId35 = "~effect/http/HttpServerError";

class HttpServerError extends (/* @__PURE__ */ TaggedError2("HttpServerError")) {
  constructor(props) {
    if ("cause" in props.reason) {
      super({
        ...props,
        cause: props.reason.cause
      });
    } else {
      super(props);
    }
  }
  [TypeId35] = TypeId35;
  stack = `${this.name}: ${this.message}`;
  get request() {
    return this.reason.request;
  }
  get response() {
    return "response" in this.reason ? this.reason.response : undefined;
  }
  [symbol4]() {
    return this.reason[symbol4]();
  }
  get [ignore4]() {
    return this.reason[ignore4] ?? false;
  }
  get message() {
    return this.reason.message;
  }
}

class RequestParseError extends (/* @__PURE__ */ TaggedError2("RequestParseError")) {
  [symbol4]() {
    return succeed6(empty10({
      status: 400
    }));
  }
  get methodAndUrl() {
    return `${this.request.method} ${this.request.url}`;
  }
  get message() {
    return formatRequestMessage(this._tag, this.description, this.methodAndUrl);
  }
}

class RouteNotFound extends (/* @__PURE__ */ TaggedError2("RouteNotFound")) {
  [symbol4]() {
    return succeed6(empty10({
      status: 404
    }));
  }
  [ignore4] = true;
  get methodAndUrl() {
    return `${this.request.method} ${this.request.url}`;
  }
  get message() {
    return formatRequestMessage(this._tag, this.description, this.methodAndUrl);
  }
}
class ServeError extends (/* @__PURE__ */ TaggedError2("ServeError")) {
}

class ClientAbort extends (/* @__PURE__ */ Service()("effect/http/HttpServerError/ClientAbort")) {
  static annotation = /* @__PURE__ */ this.context(true).pipe(/* @__PURE__ */ add(StackTrace, {
    name: "ClientAbort",
    stack: constUndefined,
    parent: undefined
  }));
}
var formatRequestMessage = (reason, description, info) => {
  const prefix = `${reason} (${info})`;
  return description ? `${prefix}: ${description}` : prefix;
};
var causeResponse = (cause) => {
  let response;
  let effect = succeedInternalServerError;
  const failures = [];
  let interrupts = [];
  let isClientInterrupt = false;
  for (let i = 0;i < cause.reasons.length; i++) {
    const reason = cause.reasons[i];
    switch (reason._tag) {
      case "Fail": {
        effect = toResponseOrElse(reason.error, internalServerError);
        failures.push(reason);
        break;
      }
      case "Die": {
        if (isHttpServerResponse(reason.defect)) {
          response = reason.defect;
        } else {
          effect = toResponseOrElseDefect(reason.defect, internalServerError);
          failures.push(reason);
        }
        break;
      }
      case "Interrupt": {
        isClientInterrupt = reason.annotations.has(ClientAbort.key);
        if (failures.length > 0)
          break;
        interrupts.push(reason);
        break;
      }
    }
  }
  if (response) {
    return succeed6([response, fromReasons(failures)]);
  } else if (interrupts.length > 0 && failures.length === 0) {
    failures.push(...interrupts);
    effect = isClientInterrupt ? clientAbortError : serverAbortError;
  }
  return mapEager2(effect, (response) => {
    failures.push(makeDieReason(response));
    return [response, fromReasons(failures)];
  });
};
var causeResponseStripped = (cause) => {
  let response;
  const failures = cause.reasons.filter((f) => {
    if (f._tag === "Die" && isHttpServerResponse(f.defect)) {
      response = f.defect;
      return false;
    }
    return true;
  });
  return [response ?? internalServerError, failures.length > 0 ? some2(fromReasons(failures)) : none2()];
};
var internalServerError = /* @__PURE__ */ empty10({
  status: 500
});
var succeedInternalServerError = /* @__PURE__ */ succeed6(internalServerError);
var clientAbortError = /* @__PURE__ */ succeed6(/* @__PURE__ */ empty10({
  status: 499
}));
var serverAbortError = /* @__PURE__ */ succeed6(/* @__PURE__ */ empty10({
  status: 503
}));

// node_modules/effect/dist/unstable/socket/Socket.js
var TypeId36 = "~effect/socket/Socket";
var Socket = /* @__PURE__ */ Service("effect/socket/Socket");
var make26 = (options) => Socket.of({
  [TypeId36]: TypeId36,
  reader: options.reader,
  writer: options.writer
});
var CloseEventTypeId = "~effect/socket/Socket/CloseEvent";
var isCloseEvent = (u) => hasProperty(u, CloseEventTypeId);
var SocketErrorTypeId = "~effect/socket/Socket/SocketError";
var isSocketError = (u) => hasProperty(u, SocketErrorTypeId);

class SocketReadError extends (/* @__PURE__ */ Error4("effect/socket/Socket/SocketReadError")({
  _tag: /* @__PURE__ */ tag("SocketReadError"),
  cause: /* @__PURE__ */ Defect()
})) {
  message = `An error occurred during Read`;
}

class SocketWriteError extends (/* @__PURE__ */ Error4("effect/socket/Socket/SocketWriteError")({
  _tag: /* @__PURE__ */ tag("SocketWriteError"),
  cause: /* @__PURE__ */ Defect()
})) {
  message = `An error occurred during Write`;
}

class SocketOpenError extends (/* @__PURE__ */ Error4("effect/socket/Socket/SocketOpenError")({
  _tag: /* @__PURE__ */ tag("SocketOpenError"),
  kind: /* @__PURE__ */ Literals(["Unknown", "Timeout"]),
  cause: /* @__PURE__ */ Defect()
})) {
  get message() {
    return this.kind === "Timeout" ? `timeout waiting for "open"` : `An error occurred during Open`;
  }
}

class SocketUpgradeError extends (/* @__PURE__ */ Error4("effect/socket/Socket/SocketUpgradeError")({
  _tag: /* @__PURE__ */ tag("SocketUpgradeError"),
  cause: /* @__PURE__ */ optional2(/* @__PURE__ */ Defect())
})) {
  static unsupported = () => fail6(new SocketError({
    reason: new SocketUpgradeError({})
  }));
  get message() {
    return this.cause === undefined ? `Socket does not support TLS upgrade` : `An error occurred during TLS upgrade`;
  }
}

class SocketCloseError extends (/* @__PURE__ */ Error4("effect/socket/Socket/SocketCloseError")({
  _tag: /* @__PURE__ */ tag("SocketCloseError"),
  code: Int,
  closeReason: /* @__PURE__ */ optional2(String4)
})) {
  get message() {
    if (this.closeReason) {
      return `${this.code}: ${this.closeReason}`;
    }
    return `${this.code}`;
  }
}
var SocketErrorReason = /* @__PURE__ */ Union2([SocketReadError, SocketWriteError, SocketOpenError, SocketUpgradeError, SocketCloseError]);

class SocketError extends (/* @__PURE__ */ TaggedError3(SocketErrorTypeId)("SocketError", {
  _tag: /* @__PURE__ */ tag("SocketError"),
  reason: SocketErrorReason
})) {
  constructor(props) {
    if ("cause" in props.reason) {
      super({
        ...props,
        cause: props.reason.cause
      });
    } else {
      super(props);
    }
  }
  [SocketErrorTypeId] = SocketErrorTypeId;
  static is(u) {
    return isSocketError(u);
  }
  message = this.reason.message;
}
var defaultHighWaterMark = 64 * 1024;

// node_modules/effect/dist/unstable/http/MultipartParser/internal/contentType.js
var paramRE = /; *([!#$%&'*+.^\w`|~-]+)=("(?:[\v\u0020\u0021\u0023-\u005b\u005d-\u007e\u0080-\u{10ffff}]|\\[\v\u0020-\u{10ffff}])*"|[!#$%&'*+.^\w`|~-]+) */gu;
var quotedPairRE = /\\([\v\u0020-\u{10ffff}])/gu;
var mediaTypeRE = /^[!#$%&'*+.^\w|~-]+\/[!#$%&'*+.^\w|~-]+$/u;
var mediaTypeRENoSlash = /^[!#$%&'*+.^\w|~-]+$/u;
var defaultContentType = {
  value: "",
  parameters: /* @__PURE__ */ Object.create(null)
};
function parse2(header, withoutSlash = false) {
  if (typeof header !== "string") {
    return defaultContentType;
  }
  let index = header.indexOf(";");
  const type = index !== -1 ? header.slice(0, index).trim() : header.trim();
  const mediaRE = withoutSlash ? mediaTypeRENoSlash : mediaTypeRE;
  if (mediaRE.test(type) === false) {
    return defaultContentType;
  }
  const result = {
    value: type.toLowerCase(),
    parameters: Object.create(null)
  };
  if (index === -1) {
    return result;
  }
  let key;
  let match;
  let value;
  paramRE.lastIndex = index;
  while (match = paramRE.exec(header)) {
    if (match.index !== index) {
      return defaultContentType;
    }
    index += match[0].length;
    key = match[1].toLowerCase();
    value = match[2];
    if (value[0] === '"') {
      value = value.slice(1, value.length - 1);
      if (!withoutSlash && quotedPairRE.test(value)) {
        value = value.replace(quotedPairRE, "$1");
      }
    }
    result.parameters[key] = value;
  }
  if (index !== header.length) {
    return defaultContentType;
  }
  return result;
}

// node_modules/effect/dist/unstable/http/MultipartParser/internal/headers.js
var constMaxPairs = 100;
var constMaxSize = 16 * 1024;
var State = {
  key: 0,
  whitespace: 1,
  value: 2
};
var constContinue = {
  _tag: "Continue"
};
var constNameChars = /* @__PURE__ */ new Uint8Array(256);
for (const char of "!#$%&'*+-.^_`|~0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ") {
  constNameChars[/* @__PURE__ */ char.charCodeAt(0)] = 1;
}
var constValueChars = /* @__PURE__ */ new Uint8Array(256);
constValueChars[9] = 1;
for (let i = 32;i <= 126; i++) {
  constValueChars[i] = 1;
}
for (let i = 128;i <= 255; i++) {
  constValueChars[i] = 1;
}
function make27() {
  const decoder = new TextDecoder;
  const state = {
    state: State.key,
    headers: Object.create(null),
    key: "",
    value: undefined,
    crlf: 0,
    previousChunk: undefined,
    pairs: 0,
    size: 0
  };
  function reset(value) {
    state.state = State.key;
    state.headers = Object.create(null);
    state.key = "";
    state.value = undefined;
    state.crlf = 0;
    state.previousChunk = undefined;
    state.pairs = 0;
    state.size = 0;
    return value;
  }
  function concatUint8Array(a, b) {
    const newUint8Array = new Uint8Array(a.length + b.length);
    newUint8Array.set(a);
    newUint8Array.set(b, a.length);
    return newUint8Array;
  }
  function error(reason) {
    return reset({
      _tag: "Failure",
      reason,
      headers: state.headers
    });
  }
  return function write(chunk, start) {
    let endOffset = 0;
    let previousCursor;
    if (state.previousChunk !== undefined) {
      endOffset = state.previousChunk.length;
      previousCursor = endOffset;
      const newChunk = new Uint8Array(chunk.length + endOffset);
      newChunk.set(state.previousChunk);
      newChunk.set(chunk, endOffset);
      state.previousChunk = undefined;
      chunk = newChunk;
    }
    const end = chunk.length;
    outer:
      while (start < end) {
        if (state.state === State.key) {
          let i = start;
          for (;i < end; i++) {
            if (state.size++ > constMaxSize) {
              return error("HeaderTooLarge");
            }
            if (chunk[i] === 58) {
              state.key += decoder.decode(chunk.subarray(start, i)).toLowerCase();
              if (state.key.length === 0) {
                return error("InvalidHeaderName");
              }
              if (chunk[i + 1] === 32 && chunk[i + 2] !== 32 && chunk[i + 2] !== 9) {
                start = i + 2;
                state.state = State.value;
                state.size++;
              } else if (chunk[i + 1] !== 32 && chunk[i + 1] !== 9) {
                start = i + 1;
                state.state = State.value;
              } else {
                start = i + 1;
                state.state = State.whitespace;
              }
              break;
            } else if (constNameChars[chunk[i]] !== 1) {
              return error("InvalidHeaderName");
            }
          }
          if (i === end) {
            state.key += decoder.decode(chunk.subarray(start, end)).toLowerCase();
            return constContinue;
          }
        }
        if (state.state === State.whitespace) {
          for (;start < end; start++) {
            if (state.size++ > constMaxSize) {
              return error("HeaderTooLarge");
            }
            if (chunk[start] !== 32 && chunk[start] !== 9) {
              state.state = State.value;
              break;
            }
          }
          if (start === end) {
            return constContinue;
          }
        }
        if (state.state === State.value) {
          let i = start;
          if (previousCursor !== undefined) {
            i = previousCursor;
            previousCursor = undefined;
          }
          for (;i < end; i++) {
            if (state.size++ > constMaxSize) {
              return error("HeaderTooLarge");
            }
            if (chunk[i] === 13 || state.crlf > 0) {
              let byte = chunk[i];
              if (byte === 13 && state.crlf === 0) {
                state.crlf = 1;
                i++;
                state.size++;
                byte = chunk[i];
              }
              if (byte === 10 && state.crlf === 1) {
                state.crlf = 2;
                i++;
                state.size++;
                byte = chunk[i];
              }
              if (byte === 13 && state.crlf === 2) {
                state.crlf = 3;
                i++;
                state.size++;
                byte = chunk[i];
              }
              if (byte === 10 && state.crlf === 3) {
                state.crlf = 4;
                i++;
                state.size++;
              }
              if (state.crlf < 4 && i >= end) {
                state.previousChunk = chunk.subarray(start);
                return constContinue;
              } else if (state.crlf >= 2) {
                state.value = state.value === undefined ? chunk.subarray(start, i - state.crlf) : concatUint8Array(state.value, chunk.subarray(start, i - state.crlf));
                const value = decoder.decode(state.value);
                if (state.headers[state.key] === undefined) {
                  state.headers[state.key] = value;
                } else if (typeof state.headers[state.key] === "string") {
                  state.headers[state.key] = [state.headers[state.key], value];
                } else {
                  state.headers[state.key].push(value);
                }
                start = i;
                state.size--;
                if (state.crlf !== 4 && state.pairs === constMaxPairs) {
                  return error("TooManyHeaders");
                } else if (state.crlf === 3) {
                  return error("InvalidHeaderValue");
                } else if (state.crlf === 4) {
                  return reset({
                    _tag: "Headers",
                    headers: state.headers,
                    endPosition: start - endOffset
                  });
                }
                state.pairs++;
                state.key = "";
                state.value = undefined;
                state.crlf = 0;
                state.state = State.key;
                continue outer;
              }
            } else if (constValueChars[chunk[i]] !== 1) {
              return error("InvalidHeaderValue");
            }
          }
          if (i === end) {
            state.value = state.value === undefined ? chunk.subarray(start, end) : concatUint8Array(state.value, chunk.subarray(start, end));
            return constContinue;
          }
        }
      }
    if (start > end) {
      state.size += end - start;
    }
    return constContinue;
  };
}

// node_modules/effect/dist/unstable/http/MultipartParser/internal/search.js
function makeState(needle_) {
  const needle = new TextEncoder().encode(needle_);
  const needleLength = needle.length;
  const indexes = {};
  for (let i = 0;i < needleLength; i++) {
    const b = needle[i];
    if (indexes[b] === undefined)
      indexes[b] = [];
    indexes[b].push(i);
  }
  return {
    needle,
    needleLength,
    indexes,
    firstByte: needle[0],
    previousChunk: undefined,
    previousChunkLength: 0,
    matchIndex: 0
  };
}
function make28(needle, callback, seed, minimumChunkLength) {
  const state = makeState(needle);
  const minChunkLength = minimumChunkLength ?? state.needleLength;
  if (seed !== undefined) {
    state.previousChunk = seed;
    state.previousChunkLength = seed.length;
  }
  function makeIndexOf() {
    if ("Buffer" in globalThis && !(("Bun" in globalThis) || ("Deno" in globalThis))) {
      return function(chunk, needle, fromIndex) {
        return Buffer.prototype.indexOf.call(chunk, needle, fromIndex);
      };
    }
    const skipTable = new Uint8Array(256).fill(state.needle.length);
    for (let i = 0, lastIndex = state.needle.length - 1;i < lastIndex; ++i) {
      skipTable[state.needle[i]] = lastIndex - i;
    }
    return function(chunk, needle, fromIndex) {
      const lengthTotal = chunk.length;
      let i = fromIndex + state.needleLength - 1;
      while (i < lengthTotal) {
        for (let j = state.needleLength - 1, k = i;j >= 0 && chunk[k] === needle[j]; j--, k--) {
          if (j === 0)
            return k;
        }
        i += skipTable[chunk[i]];
      }
      return -1;
    };
  }
  const indexOf = makeIndexOf();
  function write(chunk) {
    let chunkLength = chunk.length;
    if (state.previousChunk !== undefined) {
      const newChunk = new Uint8Array(state.previousChunkLength + chunkLength);
      newChunk.set(state.previousChunk);
      newChunk.set(chunk, state.previousChunkLength);
      chunk = newChunk;
      chunkLength = state.previousChunkLength + chunkLength;
      state.previousChunk = undefined;
    }
    let pos = 0;
    while (pos < chunkLength) {
      const remaining = chunkLength - pos;
      if (remaining < minChunkLength) {
        state.previousChunk = chunk.subarray(pos);
        state.previousChunkLength = remaining;
        return;
      }
      const match = indexOf(chunk, state.needle, pos);
      if (match > -1) {
        if (match > pos) {
          callback(state.matchIndex, chunk.subarray(pos, match));
        }
        state.matchIndex += 1;
        pos = match + state.needleLength;
        continue;
      } else if (chunk[chunkLength - 1] in state.indexes) {
        const indexes = state.indexes[chunk[chunkLength - 1]];
        let earliestIndex = -1;
        for (let i = 0, len = indexes.length;i < len; i++) {
          const index = indexes[i];
          if (chunk[chunkLength - 1 - index] === state.firstByte && i > earliestIndex) {
            earliestIndex = index;
          }
        }
        if (earliestIndex === -1) {
          if (pos === 0) {
            callback(state.matchIndex, chunk);
          } else {
            callback(state.matchIndex, chunk.subarray(pos));
          }
        } else {
          if (chunkLength - 1 - earliestIndex > pos) {
            callback(state.matchIndex, chunk.subarray(pos, chunkLength - 1 - earliestIndex));
          }
          state.previousChunk = chunk.subarray(chunkLength - 1 - earliestIndex);
          state.previousChunkLength = earliestIndex + 1;
        }
      } else if (pos === 0) {
        callback(state.matchIndex, chunk);
      } else {
        callback(state.matchIndex, chunk.subarray(pos));
      }
      break;
    }
  }
  function end() {
    if (state.previousChunk !== undefined && state.previousChunk !== seed) {
      callback(state.matchIndex, state.previousChunk);
    }
    state.previousChunk = seed;
    state.previousChunkLength = seed?.length ?? 0;
    state.matchIndex = 0;
  }
  return {
    write,
    end
  };
}

// node_modules/effect/dist/unstable/http/MultipartParser/internal/multipart.js
var State2 = {
  headers: 0,
  body: 1
};
var errInvalidDisposition = {
  _tag: "InvalidDisposition"
};
var errEndNotReached = {
  _tag: "EndNotReached"
};
var errMaxParts = {
  _tag: "ReachedLimit",
  limit: "MaxParts"
};
var errMaxTotalSize = {
  _tag: "ReachedLimit",
  limit: "MaxTotalSize"
};
var errMaxPartSize = {
  _tag: "ReachedLimit",
  limit: "MaxPartSize"
};
var errMaxFieldSize = {
  _tag: "ReachedLimit",
  limit: "MaxFieldSize"
};
var constCR = /* @__PURE__ */ new TextEncoder().encode(`\r
`);
function defaultIsFile(info) {
  return info.filename !== undefined || info.contentType === "application/octet-stream";
}
function parseBoundary(headers) {
  const contentType = parse2(headers["content-type"]);
  return contentType.parameters.boundary;
}
function noopOnChunk(_chunk) {}
var toLimit = (input) => input === Infinity ? Infinity : Number(fromInputUnsafe2(input));
function make29({
  headers,
  onFile: onPart,
  onField,
  onError,
  onDone,
  isFile = defaultIsFile,
  maxParts = Infinity,
  maxTotalSize: maxTotalSizeInput = Infinity,
  maxPartSize: maxPartSizeInput = Infinity,
  maxFieldSize: maxFieldSizeInput = 1024 * 1024
}) {
  const maxTotalSize = toLimit(maxTotalSizeInput);
  const maxPartSize = toLimit(maxPartSizeInput);
  const maxFieldSize = toLimit(maxFieldSizeInput);
  const boundary = parseBoundary(headers);
  if (boundary === undefined) {
    onError({
      _tag: "InvalidBoundary"
    });
    return {
      write: noopOnChunk,
      end() {}
    };
  }
  const state = {
    state: State2.headers,
    index: 0,
    parts: 0,
    onChunk: noopOnChunk,
    info: undefined,
    headerSkip: 0,
    partSize: 0,
    totalSize: 0,
    isFile: false,
    fieldChunks: [],
    fieldSize: 0,
    done: false,
    stopped: false
  };
  function skipBody() {
    state.state = State2.body;
    state.isFile = true;
    state.onChunk = noopOnChunk;
  }
  function stop(error) {
    state.stopped = true;
    if (state.state === State2.body && state.isFile) {
      state.onChunk(null);
    }
    onError(error);
  }
  const headerParser = make27();
  const split = make28(`\r
--${boundary}`, function(index, chunk) {
    if (state.stopped) {
      return;
    }
    if (index === 0) {
      skipBody();
      return;
    } else if (index !== state.index) {
      if (state.index > 0) {
        if (state.isFile) {
          state.onChunk(null);
        } else {
          if (state.fieldChunks.length === 1) {
            onField(state.info, state.fieldChunks[0]);
          } else {
            const buf = new Uint8Array(state.fieldSize);
            let offset = 0;
            for (let i = 0;i < state.fieldChunks.length; i++) {
              const chunk = state.fieldChunks[i];
              buf.set(chunk, offset);
              offset += chunk.length;
            }
            onField(state.info, buf);
          }
          state.fieldSize = 0;
          state.fieldChunks = [];
        }
      }
      state.partSize = 0;
      state.state = State2.headers;
      state.index = index;
      state.headerSkip = 2;
      if (chunk[0] === 45 && chunk[1] === 45) {
        state.done = true;
        return onDone();
      }
      state.parts++;
      if (state.parts > maxParts) {
        return stop(errMaxParts);
      }
    }
    if ((state.partSize += chunk.length) > maxPartSize) {
      return stop(errMaxPartSize);
    }
    if (state.state === State2.headers) {
      const result = headerParser(chunk, state.headerSkip);
      state.headerSkip = 0;
      if (result._tag === "Continue") {
        return;
      } else if (result._tag === "Failure") {
        skipBody();
        return onError({
          _tag: "BadHeaders",
          error: result
        });
      }
      const contentType = parse2(result.headers["content-type"]);
      const contentDisposition = parse2(result.headers["content-disposition"], true);
      if (contentDisposition.value === "form-data" && !("name" in contentDisposition.parameters)) {
        skipBody();
        return onError(errInvalidDisposition);
      }
      let encodedFilename;
      if ("filename*" in contentDisposition.parameters) {
        const parts = contentDisposition.parameters["filename*"].split("''");
        if (parts.length === 2) {
          try {
            encodedFilename = decodeURIComponent(parts[1]);
          } catch {
            encodedFilename = parts[1];
          }
        }
      }
      state.info = {
        name: contentDisposition.parameters.name ?? "",
        filename: encodedFilename ?? contentDisposition.parameters.filename,
        contentType: contentType.value === "" ? contentDisposition.parameters.filename !== undefined ? "application/octet-stream" : "text/plain" : contentType.value,
        contentTypeParameters: contentType.parameters,
        contentDisposition: contentDisposition.value,
        contentDispositionParameters: contentDisposition.parameters,
        headers: result.headers
      };
      state.state = State2.body;
      state.isFile = isFile(state.info);
      if (state.isFile) {
        state.onChunk = onPart(state.info);
      }
      if (result.endPosition < chunk.length) {
        if (state.isFile) {
          state.onChunk(chunk.subarray(result.endPosition));
        } else {
          const buf = chunk.subarray(result.endPosition);
          if ((state.fieldSize += buf.length) > maxFieldSize) {
            return stop(errMaxFieldSize);
          }
          state.fieldChunks.push(buf);
        }
      }
    } else if (state.isFile) {
      state.onChunk(chunk);
    } else {
      if ((state.fieldSize += chunk.length) > maxFieldSize) {
        return stop(errMaxFieldSize);
      }
      state.fieldChunks.push(chunk);
    }
  }, constCR, 2);
  return {
    write(chunk) {
      if (state.stopped) {
        return;
      }
      if ((state.totalSize += chunk.length) > maxTotalSize) {
        return stop(errMaxTotalSize);
      }
      return split.write(chunk);
    },
    end() {
      split.end();
      if (!state.done && !state.stopped) {
        stop(errEndNotReached);
      }
      state.state = State2.headers;
      state.index = 0;
      state.parts = 0;
      state.onChunk = noopOnChunk;
      state.info = undefined;
      state.totalSize = 0;
      state.partSize = 0;
      state.fieldChunks = [];
      state.fieldSize = 0;
      state.done = false;
      state.stopped = false;
    }
  };
}
var utf8Decoder = /* @__PURE__ */ new TextDecoder("utf-8");
function getDecoder(charset) {
  if (charset === "utf-8" || charset === "utf8" || charset === "") {
    return utf8Decoder;
  }
  try {
    return new TextDecoder(charset);
  } catch (error) {
    return utf8Decoder;
  }
}
function decodeField(info, value) {
  return getDecoder(info.contentTypeParameters.charset ?? "utf-8").decode(value);
}

// node_modules/effect/dist/unstable/http/MultipartParser.js
var make30 = make29;
var defaultIsFile2 = defaultIsFile;
var decodeField2 = decodeField;

// node_modules/effect/dist/unstable/http/Multipart.js
var TypeId37 = "~effect/http/Multipart";
var MultipartErrorTypeId = "~effect/http/Multipart/MultipartError";

class MultipartErrorReason extends Error3 {
}
var responseStatusByReason = {
  FileTooLarge: 413,
  FieldTooLarge: 413,
  BodyTooLarge: 413,
  TooManyParts: 413,
  InternalError: 500,
  Parse: 400
};

class MultipartError extends (/* @__PURE__ */ TaggedError2("MultipartError")) {
  static fromReason(reason, cause) {
    return new MultipartError({
      reason: new MultipartErrorReason({
        _tag: reason,
        cause
      })
    });
  }
  [MultipartErrorTypeId] = MultipartErrorTypeId;
  [ignore4] = true;
  [symbol4]() {
    return succeed6(empty10({
      status: responseStatusByReason[this.reason._tag]
    }));
  }
  get message() {
    return this.reason._tag;
  }
}
var makeConfig = (headers) => withFiber2((fiber) => {
  const mimeTypes = get(fiber.context, FieldMimeTypes);
  return succeed6({
    headers,
    maxParts: fiber.getRef(MaxParts),
    maxFieldSize: fiber.getRef(MaxFieldSize),
    maxPartSize: fiber.getRef(MaxFileSize),
    maxTotalSize: fiber.getRef(MaxBodySize),
    isFile: mimeTypes.length === 0 ? undefined : (info) => !mimeTypes.some((_) => info.contentType.includes(_)) && defaultIsFile2(info)
  });
});
var makeChannel = (headers) => fromTransform((upstream) => map7(makeConfig(headers), (config) => {
  let partsBuffer = [];
  let exit = none2();
  let ended = false;
  const parser = make30({
    ...config,
    onField(info, value) {
      partsBuffer.push(new FieldImpl(info.name, info.contentType, decodeField2(info, value)));
    },
    onFile(info) {
      let chunks = [];
      let finished = false;
      const pullChunks = fromPull(succeed6(suspend2(function loop() {
        if (!isReadonlyArrayNonEmpty(chunks)) {
          return finished ? done3() : flatMap5(pump, loop);
        }
        const chunk = chunks;
        chunks = [];
        return succeed6(chunk);
      })));
      partsBuffer.push(new FileImpl(info, pullChunks));
      return function(chunk) {
        if (chunk === null) {
          finished = true;
        } else {
          chunks.push(chunk);
        }
      };
    },
    onError(error_) {
      exit = some2(fail4(convertError(error_)));
    },
    onDone() {
      if (isNone2(exit)) {
        exit = some2(fail4(Done2()));
      }
    }
  });
  const pump = upstream.pipe(flatMap5((chunk) => {
    for (let i = 0;i < chunk.length; i++) {
      parser.write(chunk[i]);
    }
    return void_3;
  }), catchCause2((cause) => {
    if (isDoneCause(cause)) {
      if (!ended) {
        ended = true;
        parser.end();
      }
    } else {
      exit = some2(failCause2(cause));
    }
    return void_3;
  }));
  return pump.pipe(flatMap5(function loop() {
    if (!isReadonlyArrayNonEmpty(partsBuffer)) {
      if (isSome2(exit)) {
        return exit.value;
      }
      return flatMap5(pump, loop);
    }
    const parts = partsBuffer;
    partsBuffer = [];
    return succeed6(parts);
  }));
}));
function convertError(cause) {
  switch (cause._tag) {
    case "ReachedLimit": {
      switch (cause.limit) {
        case "MaxParts": {
          return MultipartError.fromReason("TooManyParts", cause);
        }
        case "MaxFieldSize": {
          return MultipartError.fromReason("FieldTooLarge", cause);
        }
        case "MaxPartSize": {
          return MultipartError.fromReason("FileTooLarge", cause);
        }
        case "MaxTotalSize": {
          return MultipartError.fromReason("BodyTooLarge", cause);
        }
      }
    }
    default: {
      return MultipartError.fromReason("Parse", cause);
    }
  }
}

class PartBase extends Class2 {
  [TypeId37];
  constructor() {
    super();
    this[TypeId37] = TypeId37;
  }
}

class FieldImpl extends PartBase {
  _tag = "Field";
  key;
  contentType;
  value;
  constructor(key, contentType, value) {
    super();
    this.key = key;
    this.contentType = contentType;
    this.value = value;
  }
  toJSON() {
    return {
      _id: "@effect/platform/Multipart/Part",
      _tag: "Field",
      key: this.key,
      contentType: this.contentType,
      value: this.value
    };
  }
}

class FileImpl extends PartBase {
  _tag = "File";
  key;
  name;
  contentType;
  content;
  contentEffect;
  constructor(info, channel) {
    super();
    this.key = info.name;
    this.name = info.filename ?? info.name;
    this.contentType = info.contentType;
    this.content = fromChannel3(channel);
    this.contentEffect = channel.pipe(mkUint8Array, mapError2((cause) => MultipartError.fromReason("InternalError", cause)));
  }
  toJSON() {
    return {
      _id: "@effect/platform/Multipart/Part",
      _tag: "File",
      key: this.key,
      name: this.name,
      contentType: this.contentType
    };
  }
}
var defaultWriteFile = (path, file) => flatMap5(FileSystem, (fs) => mapError2(run(file.content, fs.sink(path)), (cause) => MultipartError.fromReason("InternalError", cause)));
var toPersisted = (stream, writeFile = defaultWriteFile) => gen2(function* () {
  const fs = yield* FileSystem;
  const path_ = yield* Path;
  const dir = yield* fs.makeTempDirectoryScoped();
  const persisted = Object.create(null);
  const usedPaths = new Set;
  let fileIndex = 0;
  yield* runForEach2(stream, (part) => {
    if (part._tag === "Field") {
      if (!(part.key in persisted)) {
        persisted[part.key] = part.value;
      } else if (typeof persisted[part.key] === "string") {
        persisted[part.key] = [persisted[part.key], part.value];
      } else {
        persisted[part.key].push(part.value);
      }
      return void_3;
    } else if (part.name === "") {
      return void_3;
    }
    const file = part;
    const fileName = path_.basename(file.name).slice(-128);
    let path = path_.join(dir, fileName);
    while (usedPaths.has(path)) {
      path = path_.join(dir, `${fileIndex++}-${fileName}`);
    }
    usedPaths.add(path);
    const filePart = new PersistedFileImpl(file.key, file.name, file.contentType, path);
    if (Array.isArray(persisted[part.key])) {
      persisted[part.key].push(filePart);
    } else {
      persisted[part.key] = [filePart];
    }
    return writeFile(path, file);
  });
  return persisted;
}).pipe(catchTag2("PlatformError", (cause) => fail6(MultipartError.fromReason("InternalError", cause))));

class PersistedFileImpl extends PartBase {
  _tag = "PersistedFile";
  key;
  name;
  contentType;
  path;
  constructor(key, name, contentType, path) {
    super();
    this.key = key;
    this.name = name;
    this.contentType = contentType;
    this.path = path;
  }
  toJSON() {
    return {
      _id: "@effect/platform/Multipart/Part",
      _tag: "PersistedFile",
      key: this.key,
      name: this.name,
      contentType: this.contentType,
      path: this.path
    };
  }
}
var MaxParts = /* @__PURE__ */ Reference("effect/http/Multipart/MaxParts", {
  defaultValue: () => {
    return;
  }
});
var MaxFieldSize = /* @__PURE__ */ Reference("effect/http/Multipart/MaxFieldSize", {
  defaultValue: /* @__PURE__ */ constant(/* @__PURE__ */ mebibytes(10))
});
var MaxFileSize = /* @__PURE__ */ Reference("effect/http/Multipart/MaxFileSize", {
  defaultValue: () => {
    return;
  }
});
var FieldMimeTypes = /* @__PURE__ */ Reference("effect/http/Multipart/FieldMimeTypes", {
  defaultValue: /* @__PURE__ */ constant(["application/json"])
});

// node_modules/effect/dist/unstable/http/HttpServerRequest.js
var TypeId38 = "~effect/http/HttpServerRequest";
var HttpServerRequest = /* @__PURE__ */ Service("effect/http/HttpServerRequest");

class ParsedSearchParams extends (/* @__PURE__ */ Service()("effect/http/ParsedSearchParams")) {
}
var schemaBodyJson2 = (schema, options) => {
  const parse = schemaBodyJson(schema, options);
  return flatMap5(HttpServerRequest, parse);
};
var toURL = (self) => {
  const host = self.headers.host ?? "localhost";
  const protocol = self.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  try {
    return some2(new URL(self.url, `${protocol}://${host}`));
  } catch {
    return none2();
  }
};

// node_modules/effect/dist/unstable/http/internal/preResponseHandler.js
var requestPreResponseHandlers = /* @__PURE__ */ new WeakMap;
var appendPreResponseHandlerUnsafe = (request, handler) => {
  const prev = requestPreResponseHandlers.get(request.source);
  const next = prev ? (request, response) => flatMap5(prev(request, response), (response) => handler(request, response)) : handler;
  requestPreResponseHandlers.set(request.source, next);
};

// node_modules/effect/dist/unstable/http/HttpMiddleware.js
var make31 = (middleware) => middleware;
var loggerDisabledRequests = /* @__PURE__ */ new WeakSet;
var stripSearchAndHash = (url) => {
  const queryIndex = url.indexOf("?");
  const hashIndex = url.indexOf("#");
  if (queryIndex === -1) {
    return hashIndex === -1 ? url : url.slice(0, hashIndex);
  }
  if (hashIndex === -1) {
    return url.slice(0, queryIndex);
  }
  return url.slice(0, Math.min(queryIndex, hashIndex));
};
var withLoggerDisabled = (self) => withFiber2((fiber) => {
  const request = getUnsafe(fiber.context, HttpServerRequest);
  loggerDisabledRequests.add(request.source);
  return self;
});
var TracerDisabledWhen2 = /* @__PURE__ */ Reference("effect/http/HttpMiddleware/TracerDisabledWhen", {
  defaultValue: () => constFalse
});
var SpanNameGenerator2 = /* @__PURE__ */ Reference("@effect/platform/HttpMiddleware/SpanNameGenerator", {
  defaultValue: () => (request) => `http.server ${request.method}`
});
var logger = /* @__PURE__ */ make31((httpApp) => withFiber2((fiber) => {
  const request = getUnsafe(fiber.context, HttpServerRequest);
  const path = stripSearchAndHash(request.url);
  return withLogSpan(flatMap5(exit2(httpApp), (exit) => {
    if (loggerDisabledRequests.has(request.source)) {
      return exit;
    } else if (exit._tag === "Failure") {
      const [response, cause] = causeResponseStripped(exit.cause);
      return andThen2(annotateLogs(log(getOrElse(cause, () => "Sent HTTP Response")), {
        "http.method": request.method,
        "http.url": path,
        "http.status": response.status
      }), exit);
    }
    return andThen2(annotateLogs(log("Sent HTTP response"), {
      "http.method": request.method,
      "http.url": path,
      "http.status": exit.value.status
    }), exit);
  }), "http.span");
}));
var isTracerDisabledUnsafe = (fiber, request) => !fiber.cache.tracerEnabled || fiber.getRef(TracerDisabledWhen2)(request);
var tracer2 = /* @__PURE__ */ make31((httpApp) => withFiber2((fiber) => {
  const request = getUnsafe(fiber.context, HttpServerRequest);
  if (isTracerDisabledUnsafe(fiber, request)) {
    return httpApp;
  }
  const nameGenerator = fiber.getRef(SpanNameGenerator2);
  const span = makeSpanUnsafe(fiber, nameGenerator(request), {
    parent: getOrUndefined(fromHeaders(request.headers)),
    kind: "server"
  });
  const prevServices = fiber.context;
  fiber.setContext(add(fiber.context, ParentSpan, span));
  return onExitPrimitive2(httpApp, (exit) => {
    fiber.setContext(prevServices);
    const endTime = fiber.getRef(Clock).currentTimeNanosUnsafe();
    if (isSuccess3(exit) && (!span.sampled || fiber.getRef(Tracer) === nativeTracer)) {
      span.end(endTime, exit);
      return;
    }
    const redactedHeaderNames = fiber.getRef(CurrentRedactedNames);
    fiber.currentDispatcher.scheduleTask(() => {
      let response;
      let spanExit = exit;
      if (isFailure3(exit)) {
        const [failureResponse, cause] = causeResponseStripped(exit.cause);
        response = failureResponse;
        spanExit = isSome2(cause) ? failCause2(cause.value) : succeed4(response);
      } else {
        response = exit.value;
      }
      if (span.sampled) {
        span.attribute("http.request.method", request.method);
        if (request.url.startsWith("/")) {
          const host = request.headers.host ?? "localhost";
          const protocol = request.headers["x-forwarded-proto"] === "https" ? "https" : "http";
          span.attribute("url.full", `${protocol}://${host}${request.url}`);
          const queryIndex = request.url.indexOf("?");
          if (queryIndex === -1) {
            span.attribute("url.path", request.url);
          } else {
            span.attribute("url.path", request.url.slice(0, queryIndex));
            if (queryIndex < request.url.length - 1) {
              span.attribute("url.query", request.url.slice(queryIndex + 1));
            }
          }
          span.attribute("url.scheme", protocol);
        } else {
          const url = toURL(request);
          if (isSome2(url)) {
            if (url.value.username !== "" || url.value.password !== "") {
              url.value.username = "REDACTED";
              url.value.password = "REDACTED";
            }
            span.attribute("url.full", url.value.toString());
            span.attribute("url.path", url.value.pathname);
            const query = url.value.search.slice(1);
            if (query !== "") {
              span.attribute("url.query", query);
            }
            span.attribute("url.scheme", url.value.protocol.slice(0, -1));
          }
        }
        if (request.headers["user-agent"] !== undefined) {
          span.attribute("user_agent.original", request.headers["user-agent"]);
        }
        for (const name in request.headers) {
          span.attribute(`http.request.header.${name}`, isRedactedName(name, redactedHeaderNames) ? "<redacted>" : request.headers[name]);
        }
        if (isSome2(request.remoteAddress)) {
          span.attribute("client.address", request.remoteAddress.value);
        }
        span.attribute("http.response.status_code", response.status);
        for (const name in response.headers) {
          span.attribute(`http.response.header.${name}`, isRedactedName(name, redactedHeaderNames) ? "<redacted>" : response.headers[name]);
        }
      }
      span.end(endTime, spanExit);
    }, 0);
    return;
  }, true);
}));
var cors = (options) => {
  const opts = {
    allowedOrigins: options?.allowedOrigins ?? [],
    allowedMethods: options?.allowedMethods ?? ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
    allowedHeaders: options?.allowedHeaders ?? [],
    exposedHeaders: options?.exposedHeaders ?? [],
    credentials: options?.credentials ?? false,
    maxAge: options?.maxAge
  };
  const isAllowedOrigin = typeof opts.allowedOrigins === "function" ? opts.allowedOrigins : (origin) => opts.allowedOrigins.includes(origin);
  const allowOrigin = typeof opts.allowedOrigins === "function" || opts.allowedOrigins.length > 1 ? (originHeader) => {
    if (!isAllowedOrigin(originHeader))
      return {
        vary: "Origin"
      };
    return {
      "access-control-allow-origin": originHeader,
      vary: "Origin"
    };
  } : opts.allowedOrigins.length === 0 ? constant({
    "access-control-allow-origin": "*"
  }) : constant({
    "access-control-allow-origin": opts.allowedOrigins[0],
    vary: "Origin"
  });
  const allowMethods = opts.allowedMethods.length > 0 ? {
    "access-control-allow-methods": opts.allowedMethods.join(", ")
  } : undefined;
  const allowCredentials = opts.credentials ? {
    "access-control-allow-credentials": "true"
  } : undefined;
  const allowHeaders = (accessControlRequestHeaders) => {
    if (opts.allowedHeaders.length === 0 && accessControlRequestHeaders) {
      return {
        vary: "Access-Control-Request-Headers",
        "access-control-allow-headers": accessControlRequestHeaders
      };
    }
    if (opts.allowedHeaders) {
      return {
        "access-control-allow-headers": opts.allowedHeaders.join(",")
      };
    }
    return;
  };
  const exposeHeaders = opts.exposedHeaders.length > 0 ? {
    "access-control-expose-headers": opts.exposedHeaders.join(",")
  } : undefined;
  const maxAge = opts.maxAge ? {
    "access-control-max-age": opts.maxAge.toString()
  } : undefined;
  const headersFromRequest = (request) => {
    const origin = request.headers["origin"];
    return fromRecordUnsafe({
      ...allowOrigin(origin),
      ...allowCredentials,
      ...exposeHeaders
    });
  };
  const headersFromRequestOptions = (request) => {
    const origin = request.headers["origin"];
    const accessControlRequestHeaders = request.headers["access-control-request-headers"];
    const headers = fromRecordUnsafe({
      ...allowOrigin(origin),
      ...allowCredentials,
      ...exposeHeaders,
      ...allowMethods,
      ...maxAge
    });
    const accessControlHeaders = allowHeaders(accessControlRequestHeaders);
    if (accessControlHeaders === undefined)
      return headers;
    const vary = accessControlHeaders["vary"];
    return setAll(headers, vary === undefined ? accessControlHeaders : {
      ...accessControlHeaders,
      vary: varyWith(headers, vary)
    });
  };
  const preResponseHandler = (request, response) => {
    const headers = headersFromRequest(request);
    return succeed6(setHeaders2(response, headers["vary"] === undefined ? headers : set2(headers, "vary", varyWith(response.headers, "Origin"))));
  };
  return (httpApp) => withFiber2((fiber) => {
    const request = getUnsafe(fiber.context, HttpServerRequest);
    if (request.method === "OPTIONS") {
      return succeed6(empty10({
        status: 204,
        headers: headersFromRequestOptions(request)
      }));
    }
    appendPreResponseHandlerUnsafe(request, preResponseHandler);
    return httpApp;
  });
};

// node_modules/effect/dist/unstable/http/HttpEffect.js
var toHandled = (self, handleResponse, middleware) => {
  const handleCause = (request, cause) => flatMapEager2(causeResponse(cause), ([response, cause]) => {
    const fiber = getCurrent();
    reportCauseUnsafe(fiber, cause);
    const handler = requestPreResponseHandlers.get(request.source);
    const cont = cause.reasons.length === 0 ? succeed6(response) : failCause3(cause);
    if (handler === undefined) {
      request[handledSymbol] = true;
      return flatMapEager2(handleResponse(request, response), () => cont);
    }
    return flatMapEager2(flatMapEager2(handler(request, response), (response) => {
      request[handledSymbol] = true;
      return handleResponse(request, response);
    }), () => cont);
  });
  const sendResponse = (request, response) => {
    const handler = requestPreResponseHandlers.get(request.source);
    if (handler === undefined) {
      request[handledSymbol] = true;
      return mapEager2(handleResponse(request, response), () => response);
    }
    return flatMapEager2(handler(request, response), (sentResponse) => {
      request[handledSymbol] = true;
      return mapEager2(handleResponse(request, sentResponse), () => response);
    });
  };
  const withMiddleware = (request) => {
    const responded = matchCauseEffect2(self, {
      onSuccess: (response) => sendResponse(request, response),
      onFailure: (cause) => handleCause(request, cause)
    });
    return middleware === undefined ? responded : matchCauseEffect2(tracer2(middleware(responded)), {
      onFailure(cause) {
        reportCauseUnsafe(getCurrent(), cause);
        if (handledSymbol in request)
          return void_3;
        return matchCauseEffectEager2(causeResponse(cause), {
          onFailure(_) {
            return handleResponse(request, empty10({
              status: 500
            }));
          },
          onSuccess([response]) {
            return handleResponse(request, response);
          }
        });
      },
      onSuccess(response) {
        return handledSymbol in request ? void_3 : handleResponse(request, response);
      }
    });
  };
  const traced = (request) => tracer2(withMiddleware(request));
  const finishAfter = (frame, fiber, effect) => onExitPrimitive2(effect, (exit) => {
    fiber.setContext(frame.prev);
    if (scopeEjected in frame.scope)
      return;
    return closeUnsafe(frame.scope, exit);
  }, true);

  class RequestFrame {
    scope;
    prev;
    request;
    constructor(scope, prev, request) {
      this.scope = scope;
      this.prev = prev;
      this.request = request;
    }
    [contA](response, fiber) {
      const sent = sendResponse(this.request, response);
      if (effectIsExit(sent) && sent._tag === "Success") {
        fiber.setContext(this.prev);
        if (scopeEjected in this.scope)
          return sent;
        const closed = closeUnsafe(this.scope, sent);
        return closed === undefined ? sent : flatMap5(closed, () => sent);
      }
      return finishAfter(this, fiber, sent);
    }
    [contE](cause, fiber) {
      return finishAfter(this, fiber, handleCause(this.request, cause));
    }
  }
  return withFiber2((fiber) => {
    fiberEnterUninterruptibleUnsafe(fiber);
    const scope = makeUnsafe3();
    const frame = new RequestFrame(scope, fiber.context, getUnsafe(fiber.context, HttpServerRequest));
    fiber.setContext(add(frame.prev, Scope, scope));
    const currentTracer = fiber.cache.tracer;
    if (middleware === undefined && (currentTracer === undefined || currentTracer === nativeTracer || isTracerDisabledUnsafe(fiber, frame.request))) {
      fiber._stack.push(frame);
      return self;
    }
    return finishAfter(frame, fiber, middleware === undefined ? traced(frame.request) : withMiddleware(frame.request));
  });
};
var handledSymbol = /* @__PURE__ */ Symbol.for("effect/http/HttpEffect/handled");
var scopeDisableClose = (scope) => {
  scope[scopeEjected] = true;
};
var scopeTransferToStream = (response) => {
  if (response.body._tag !== "Stream") {
    return response;
  }
  const fiber = getCurrent();
  const scope = getUnsafe(fiber.context, Scope);
  scopeDisableClose(scope);
  return setBody2(response, stream(onExit4(response.body.stream, (exit) => close(scope, exit)), response.body.contentType, response.body.contentLength));
};
var scopeEjected = /* @__PURE__ */ Symbol.for("effect/http/HttpEffect/scopeEjected");

// node_modules/effect/dist/unstable/http/HttpServer.js
class HttpServer extends (/* @__PURE__ */ Service()("effect/http/HttpServer")) {
}
var make32 = (options) => options;
var serve = /* @__PURE__ */ dual((args) => isEffect2(args[0]), (effect, middleware) => effectDiscard(HttpServer.use((server) => server.serve(effect, middleware))));
var formatAddress = formatUrlUnsafe;
var addressFormattedWith = (f) => flatMap5(HttpServer, (server) => f(formatAddress(server.address)));
var logAddress = /* @__PURE__ */ addressFormattedWith((_) => log(`Listening on ${_}`));
var withLogAddress = (layer) => effectDiscard(logAddress).pipe(provideMerge(layer));

// node_modules/@effect/platform-node-shared/dist/NodeHttpCompression.js
import * as Zlib from "zlib";
var brotliParams = (level, sizeHint) => {
  const params = {};
  if (level !== undefined) {
    params[Zlib.constants.BROTLI_PARAM_QUALITY] = level;
  }
  if (sizeHint !== undefined) {
    params[Zlib.constants.BROTLI_PARAM_SIZE_HINT] = sizeHint;
  }
  return {
    params
  };
};
var zstdParams = (level) => level === undefined || level === 3 ? undefined : {
  params: {
    [Zlib.constants.ZSTD_c_compressionLevel]: level
  }
};
var compress = (data, algorithm, options) => callback2((resume) => {
  const complete = (error, result) => resume(error === null ? succeed6(result) : die2(error));
  switch (algorithm) {
    case "gzip": {
      Zlib.gzip(data, {
        level: options?.level
      }, complete);
      break;
    }
    case "deflate": {
      Zlib.deflate(data, {
        level: options?.level
      }, complete);
      break;
    }
    case "br": {
      Zlib.brotliCompress(data, brotliParams(options?.level, data.byteLength), complete);
      break;
    }
    case "zstd": {
      const params = zstdParams(options?.level);
      if (params === undefined) {
        Zlib.zstdCompress(data, complete);
      } else {
        Zlib.zstdCompress(data, params, complete);
      }
      break;
    }
  }
});
var make33 = (fallback) => ({
  algorithms: fallback.algorithms,
  compressResponse(response, algorithm, options) {
    const body = response.body;
    if (body._tag !== "Uint8Array") {
      return fallback.compressResponse(response, algorithm, options);
    }
    return map7(compress(body.body, algorithm, options), (result) => setHeader2(setBody2(response, uint8Array(result, response.headers["content-type"] ?? body.contentType)), "content-length", result.byteLength.toString()));
  }
});

// node_modules/@effect/platform-node-shared/dist/NodeFileSystem.js
import * as Crypto from "crypto";
import * as NFS from "fs";
import * as OS from "os";
import * as Path2 from "path";

// node_modules/@effect/platform-node-shared/dist/internal/utils.js
var handleErrnoException = (module, method) => (err, [path]) => {
  let reason = "Unknown";
  switch (err.code) {
    case "ENOENT":
      reason = "NotFound";
      break;
    case "EACCES":
      reason = "PermissionDenied";
      break;
    case "EEXIST":
      reason = "AlreadyExists";
      break;
    case "EISDIR":
      reason = "BadResource";
      break;
    case "ENOTDIR":
      reason = "BadResource";
      break;
    case "EBUSY":
      reason = "Busy";
      break;
    case "ELOOP":
      reason = "BadResource";
      break;
  }
  return systemError({
    _tag: reason,
    module,
    method,
    pathOrDescriptor: path,
    syscall: err.syscall,
    cause: err
  });
};

// node_modules/@effect/platform-node-shared/dist/NodeFileSystem.js
var handleBadArgument = (method) => (err) => badArgument({
  module: "FileSystem",
  method,
  description: err.message ?? String(err)
});
var bigintToNumber = (value, field) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new RangeError(`${field} exceeds the safe integer range: ${value}`);
  }
  return number;
};
var bigintToNumberOption = (value) => flatMap(fromNullishOr(value), toNumber);
var positionToNumber = (position, method) => try_3({
  try: () => bigintToNumber(position, "position"),
  catch: handleBadArgument(method)
});
var access2 = /* @__PURE__ */ (() => {
  const nodeAccess = /* @__PURE__ */ effectify(NFS.access, /* @__PURE__ */ handleErrnoException("FileSystem", "access"), /* @__PURE__ */ handleBadArgument("access"));
  return (path, options) => {
    let mode = NFS.constants.F_OK;
    if (options?.readable) {
      mode |= NFS.constants.R_OK;
    }
    if (options?.writable) {
      mode |= NFS.constants.W_OK;
    }
    return nodeAccess(path, mode);
  };
})();
var copy = /* @__PURE__ */ (() => {
  const nodeCp = /* @__PURE__ */ effectify(NFS.cp, /* @__PURE__ */ handleErrnoException("FileSystem", "copy"), /* @__PURE__ */ handleBadArgument("copy"));
  return (fromPath, toPath, options) => nodeCp(fromPath, toPath, {
    force: options?.overwrite ?? false,
    preserveTimestamps: options?.preserveTimestamps ?? false,
    recursive: true
  });
})();
var copyFile2 = /* @__PURE__ */ (() => {
  const nodeCopyFile = /* @__PURE__ */ effectify(NFS.copyFile, /* @__PURE__ */ handleErrnoException("FileSystem", "copyFile"), /* @__PURE__ */ handleBadArgument("copyFile"));
  return (fromPath, toPath) => nodeCopyFile(fromPath, toPath);
})();
var chmod2 = /* @__PURE__ */ (() => {
  const nodeChmod = /* @__PURE__ */ effectify(NFS.chmod, /* @__PURE__ */ handleErrnoException("FileSystem", "chmod"), /* @__PURE__ */ handleBadArgument("chmod"));
  return (path, mode) => nodeChmod(path, mode);
})();
var chown2 = /* @__PURE__ */ (() => {
  const nodeChown = /* @__PURE__ */ effectify(NFS.chown, /* @__PURE__ */ handleErrnoException("FileSystem", "chown"), /* @__PURE__ */ handleBadArgument("chown"));
  return (path, uid, gid) => nodeChown(path, uid, gid);
})();
var glob2 = /* @__PURE__ */ (() => {
  const nodeGlob = /* @__PURE__ */ effectify(NFS.glob, /* @__PURE__ */ handleErrnoException("FileSystem", "glob"), /* @__PURE__ */ handleBadArgument("glob"));
  return (pattern, options) => nodeGlob(pattern, {
    cwd: options?.root,
    exclude: options?.exclude
  });
})();
var link3 = /* @__PURE__ */ (() => {
  const nodeLink = /* @__PURE__ */ effectify(NFS.link, /* @__PURE__ */ handleErrnoException("FileSystem", "link"), /* @__PURE__ */ handleBadArgument("link"));
  return (existingPath, newPath) => nodeLink(existingPath, newPath);
})();
var makeDirectory = /* @__PURE__ */ (() => {
  const nodeMkdir = /* @__PURE__ */ effectify(NFS.mkdir, /* @__PURE__ */ handleErrnoException("FileSystem", "makeDirectory"), /* @__PURE__ */ handleBadArgument("makeDirectory"));
  return (path, options) => nodeMkdir(path, {
    recursive: options?.recursive ?? false,
    mode: options?.mode
  });
})();
var makeTempDirectoryFactory = (method) => {
  const nodeMkdtemp = effectify(NFS.mkdtemp, handleErrnoException("FileSystem", method), handleBadArgument(method));
  return (options) => suspend2(() => {
    const prefix = options?.prefix ?? "";
    const directory = typeof options?.directory === "string" ? Path2.join(options.directory, ".") : OS.tmpdir();
    return nodeMkdtemp(prefix ? Path2.join(directory, prefix) : directory + "/");
  });
};
var makeTempDirectory = /* @__PURE__ */ makeTempDirectoryFactory("makeTempDirectory");
var removeFactory = (method) => {
  const nodeRm = effectify(NFS.rm, handleErrnoException("FileSystem", method), handleBadArgument(method));
  return (path, options) => nodeRm(path, {
    recursive: options?.recursive ?? false,
    force: options?.force ?? false
  });
};
var remove4 = /* @__PURE__ */ removeFactory("remove");
var makeTempDirectoryScoped = /* @__PURE__ */ (() => {
  const makeDirectory = /* @__PURE__ */ makeTempDirectoryFactory("makeTempDirectoryScoped");
  const removeDirectory = /* @__PURE__ */ removeFactory("makeTempDirectoryScoped");
  return (options) => acquireRelease2(makeDirectory(options), (directory) => orDie2(removeDirectory(directory, {
    recursive: true
  })));
})();
var openFactory = (method) => {
  const nodeOpen = effectify(NFS.open, handleErrnoException("FileSystem", method), handleBadArgument(method));
  const nodeClose = effectify(NFS.close, handleErrnoException("FileSystem", method), handleBadArgument(method));
  return (path, options) => pipe(acquireRelease2(nodeOpen(path, options?.flag ?? "r", options?.mode), (fd) => orDie2(nodeClose(fd))), map7((fd) => makeFile(fd, options?.flag?.startsWith("a") ?? false)));
};
var open2 = /* @__PURE__ */ openFactory("open");
var makeFile = /* @__PURE__ */ (() => {
  const nodeReadFactory = (method) => effectify(NFS.read, handleErrnoException("FileSystem", method), handleBadArgument(method));
  const nodeRead = /* @__PURE__ */ nodeReadFactory("read");
  const nodeReadAlloc = /* @__PURE__ */ nodeReadFactory("readAlloc");
  const nodeStat = /* @__PURE__ */ effectify(NFS.fstat, /* @__PURE__ */ handleErrnoException("FileSystem", "stat"), /* @__PURE__ */ handleBadArgument("stat"));
  const nodeTruncate = /* @__PURE__ */ effectify(NFS.ftruncate, /* @__PURE__ */ handleErrnoException("FileSystem", "truncate"), /* @__PURE__ */ handleBadArgument("truncate"));
  const nodeSync = /* @__PURE__ */ effectify(NFS.fsync, /* @__PURE__ */ handleErrnoException("FileSystem", "sync"), /* @__PURE__ */ handleBadArgument("sync"));
  const nodeWriteFactory = (method) => effectify(NFS.write, handleErrnoException("FileSystem", method), handleBadArgument(method));
  const nodeWrite = /* @__PURE__ */ nodeWriteFactory("write");
  const nodeWriteAll = /* @__PURE__ */ nodeWriteFactory("writeAll");

  class FileImpl {
    [FileTypeId];
    fd;
    append;
    position = /* @__PURE__ */ BigInt(0);
    constructor(fd, append) {
      this[FileTypeId] = FileTypeId;
      this.fd = fd;
      this.append = append;
    }
    get stat() {
      return flatMap5(nodeStat(this.fd, {
        bigint: true
      }), makeFileInfo);
    }
    get sync() {
      return nodeSync(this.fd);
    }
    seek(offset, from) {
      return suspend2(() => {
        const position = from === "start" ? offset : this.position + offset;
        if (position < BigInt(0)) {
          return fail6(badArgument({
            module: "FileSystem",
            method: "seek",
            description: "Cannot seek before the start of the file"
          }));
        }
        this.position = position;
        return succeed6(position);
      });
    }
    read(buffer) {
      return suspend2(() => {
        const position = this.position;
        return map7(nodeRead(this.fd, {
          buffer,
          position
        }), (bytesRead) => {
          this.position = position + BigInt(bytesRead);
          return bytesRead;
        });
      });
    }
    readAlloc(size) {
      return suspend2(() => {
        try {
          if (!Number.isInteger(size) || size < 0) {
            throw new RangeError("size must be a non-negative integer");
          }
          const buffer = Buffer.allocUnsafeSlow(size);
          const position = this.position;
          return map7(nodeReadAlloc(this.fd, {
            buffer,
            position
          }), (bytesRead) => {
            if (bytesRead === 0) {
              return none2();
            }
            this.position = position + BigInt(bytesRead);
            if (bytesRead === size) {
              return some2(buffer);
            }
            const dst = Buffer.allocUnsafeSlow(bytesRead);
            buffer.copy(dst, 0, 0, bytesRead);
            return some2(dst);
          });
        } catch (cause) {
          return fail6(handleBadArgument("readAlloc")(cause));
        }
      });
    }
    truncate(length) {
      return map7(nodeTruncate(this.fd, length || undefined), () => {
        if (!this.append) {
          const len = BigInt(length ?? 0);
          if (this.position > len) {
            this.position = len;
          }
        }
      });
    }
    write(buffer) {
      return suspend2(() => {
        const position = this.position;
        return flatMap5(this.append ? succeed6(undefined) : positionToNumber(position, "write"), (nodePosition) => map7(nodeWrite(this.fd, buffer, undefined, undefined, nodePosition), (bytesWritten) => {
          if (!this.append) {
            this.position = position + BigInt(bytesWritten);
          }
          return bytesWritten;
        }));
      });
    }
    writeAllChunk(buffer) {
      return suspend2(() => {
        const position = this.position;
        return flatMap5(this.append ? succeed6(undefined) : positionToNumber(position, "writeAll"), (nodePosition) => flatMap5(nodeWriteAll(this.fd, buffer, undefined, undefined, nodePosition), (bytesWritten) => {
          if (bytesWritten === 0) {
            return fail6(systemError({
              module: "FileSystem",
              method: "writeAll",
              _tag: "WriteZero",
              pathOrDescriptor: this.fd,
              description: "write returned 0 bytes written"
            }));
          }
          if (!this.append) {
            this.position = position + BigInt(bytesWritten);
          }
          return bytesWritten < buffer.length ? this.writeAllChunk(buffer.subarray(bytesWritten)) : void_3;
        }));
      });
    }
    writeAll(buffer) {
      return buffer.length === 0 ? void_3 : this.writeAllChunk(buffer);
    }
  }
  return (fd, append) => new FileImpl(fd, append);
})();
var makeTempFileFactory = (method) => {
  const makeDirectory = makeTempDirectoryFactory(method);
  return fnUntraced2(function* (options) {
    const directory = yield* makeDirectory(options);
    const random = Crypto.randomBytes(6).toString("hex");
    const name = Path2.join(directory, options?.suffix ? `${random}${options.suffix}` : random);
    yield* writeFile2(name, new Uint8Array(0));
    return name;
  });
};
var makeTempFile = /* @__PURE__ */ makeTempFileFactory("makeTempFile");
var makeTempFileScoped = /* @__PURE__ */ (() => {
  const makeFile = /* @__PURE__ */ makeTempFileFactory("makeTempFileScoped");
  const removeDirectory = /* @__PURE__ */ removeFactory("makeTempFileScoped");
  return (options) => acquireRelease2(makeFile(options), (file) => orDie2(removeDirectory(Path2.dirname(file), {
    recursive: true
  })));
})();
var readDirectory = (path, options) => tryPromise2({
  try: () => NFS.promises.readdir(path, options),
  catch: (err) => handleErrnoException("FileSystem", "readDirectory")(err, [path])
});
var readFile2 = (path) => callback2((resume, signal) => {
  try {
    NFS.readFile(path, {
      signal
    }, (err, data) => {
      if (err) {
        resume(fail6(handleErrnoException("FileSystem", "readFile")(err, [path])));
      } else {
        resume(succeed6(data));
      }
    });
  } catch (err) {
    resume(fail6(handleBadArgument("readFile")(err)));
  }
});
var readLink = /* @__PURE__ */ (() => {
  const nodeReadLink = /* @__PURE__ */ effectify(NFS.readlink, /* @__PURE__ */ handleErrnoException("FileSystem", "readLink"), /* @__PURE__ */ handleBadArgument("readLink"));
  return (path) => nodeReadLink(path);
})();
var realPath = /* @__PURE__ */ (() => {
  const nodeRealPath = /* @__PURE__ */ effectify(NFS.realpath, /* @__PURE__ */ handleErrnoException("FileSystem", "realPath"), /* @__PURE__ */ handleBadArgument("realPath"));
  return (path) => nodeRealPath(path);
})();
var rename2 = /* @__PURE__ */ (() => {
  const nodeRename = /* @__PURE__ */ effectify(NFS.rename, /* @__PURE__ */ handleErrnoException("FileSystem", "rename"), /* @__PURE__ */ handleBadArgument("rename"));
  return (oldPath, newPath) => nodeRename(oldPath, newPath);
})();
var makeFileInfo = (stat) => try_3({
  try: () => ({
    type: stat.isFile() ? "File" : stat.isDirectory() ? "Directory" : stat.isSymbolicLink() ? "SymbolicLink" : stat.isBlockDevice() ? "BlockDevice" : stat.isCharacterDevice() ? "CharacterDevice" : stat.isFIFO() ? "FIFO" : stat.isSocket() ? "Socket" : "Unknown",
    mtime: fromNullishOr(stat.mtime),
    atime: fromNullishOr(stat.atime),
    birthtime: fromNullishOr(stat.birthtime),
    dev: bigintToNumber(stat.dev, "dev"),
    rdev: bigintToNumberOption(stat.rdev),
    ino: bigintToNumberOption(stat.ino),
    mode: bigintToNumber(stat.mode, "mode"),
    nlink: bigintToNumberOption(stat.nlink),
    uid: bigintToNumberOption(stat.uid),
    gid: bigintToNumberOption(stat.gid),
    size: bytes(stat.size),
    blksize: stat.blksize !== undefined ? some2(bytes(stat.blksize)) : none2(),
    blocks: bigintToNumberOption(stat.blocks)
  }),
  catch: handleBadArgument("stat")
});
var stat2 = /* @__PURE__ */ (() => {
  const nodeStat = /* @__PURE__ */ effectify(NFS.stat, /* @__PURE__ */ handleErrnoException("FileSystem", "stat"), /* @__PURE__ */ handleBadArgument("stat"));
  return (path) => flatMap5(nodeStat(path, {
    bigint: true
  }), makeFileInfo);
})();
var symlink2 = /* @__PURE__ */ (() => {
  const nodeSymlink = /* @__PURE__ */ effectify(NFS.symlink, /* @__PURE__ */ handleErrnoException("FileSystem", "symlink"), /* @__PURE__ */ handleBadArgument("symlink"));
  return (target, path) => nodeSymlink(target, path);
})();
var truncate2 = /* @__PURE__ */ (() => {
  const nodeTruncate = /* @__PURE__ */ effectify(NFS.truncate, /* @__PURE__ */ handleErrnoException("FileSystem", "truncate"), /* @__PURE__ */ handleBadArgument("truncate"));
  return (path, length) => nodeTruncate(path, length);
})();
var utimes2 = /* @__PURE__ */ (() => {
  const nodeUtimes = /* @__PURE__ */ effectify(NFS.utimes, /* @__PURE__ */ handleErrnoException("FileSystem", "utime"), /* @__PURE__ */ handleBadArgument("utime"));
  return (path, atime, mtime) => nodeUtimes(path, atime, mtime);
})();
var watchNode = (path, info, options) => callback3((queue) => acquireRelease2(sync2(() => {
  const directory = info.type === "Directory" ? path : Path2.dirname(path);
  const watcher = NFS.watch(path, {
    recursive: options?.recursive ?? false
  }, (event, path) => {
    if (!path)
      return;
    switch (event) {
      case "rename": {
        runFork2(matchEffect3(stat2(Path2.resolve(directory, path)), {
          onSuccess: (_) => offer(queue, {
            _tag: "Create",
            path
          }),
          onFailure: (_) => offer(queue, {
            _tag: "Remove",
            path
          })
        }));
        return;
      }
      case "change": {
        offerUnsafe(queue, {
          _tag: "Update",
          path
        });
        return;
      }
    }
  });
  watcher.on("error", (error) => {
    failCauseUnsafe(queue, fail5(systemError({
      module: "FileSystem",
      _tag: "Unknown",
      method: "watch",
      pathOrDescriptor: path,
      cause: error
    })));
  });
  watcher.on("close", () => {
    endUnsafe(queue);
  });
  return watcher;
}), (watcher) => sync2(() => watcher.close())));
var watch2 = (backend, path, options) => stat2(path).pipe(map7((stat) => backend.pipe(flatMap((_) => _.register(path, stat, options)), getOrElse(() => watchNode(path, stat, options)))), unwrap4);
var writeFile2 = (path, data, options) => callback2((resume, signal) => {
  try {
    NFS.writeFile(path, data, {
      signal,
      flag: options?.flag,
      mode: options?.mode
    }, (err) => {
      if (err) {
        resume(fail6(handleErrnoException("FileSystem", "writeFile")(err, [path])));
      } else {
        resume(void_3);
      }
    });
  } catch (err) {
    resume(fail6(handleBadArgument("writeFile")(err)));
  }
});
var makeFileSystem = /* @__PURE__ */ map7(/* @__PURE__ */ serviceOption2(WatchBackend), (backend) => make12({
  access: access2,
  chmod: chmod2,
  chown: chown2,
  copy,
  copyFile: copyFile2,
  glob: glob2,
  link: link3,
  makeDirectory,
  makeTempDirectory,
  makeTempDirectoryScoped,
  makeTempFile,
  makeTempFileScoped,
  open: open2,
  readDirectory,
  readFile: readFile2,
  readLink,
  realPath,
  remove: remove4,
  rename: rename2,
  stat: stat2,
  symlink: symlink2,
  truncate: truncate2,
  utimes: utimes2,
  watch(path, options) {
    return watch2(backend, path, options);
  },
  writeFile: writeFile2
}));
var layer3 = /* @__PURE__ */ effect(FileSystem)(makeFileSystem);

// node_modules/@effect/platform-bun/dist/BunFileSystem.js
var layer4 = layer3;

// node_modules/@effect/platform-bun/dist/BunHttpPlatform.js
var compression = /* @__PURE__ */ make33(/* @__PURE__ */ makeCompressionWeb2({
  algorithms: ["gzip", "deflate", "br", "zstd"],
  transform: (algorithm) => compressionTransformWeb2(algorithm === "br" ? "brotli" : algorithm)
}));
var make34 = /* @__PURE__ */ make25({
  platform: "bun",
  compression,
  fileResponse(path, status, statusText, headers, start, end, contentLength) {
    let file = Bun.file(path);
    if (start > 0 || end !== undefined) {
      file = file.slice(start, end);
    }
    return raw2(file, {
      headers: {
        ...headers,
        "content-length": contentLength.toString()
      },
      status,
      statusText
    });
  },
  fileWebResponse(file, status, statusText, headers, options) {
    const start = options?.offset ?? 0;
    const end = options?.bytesToRead !== undefined ? start + options.bytesToRead : undefined;
    const body = start > 0 || end !== undefined ? file.slice(start, end, file.type) : file;
    return raw2(body, {
      headers,
      status,
      statusText
    });
  }
});
var layer5 = /* @__PURE__ */ effect(HttpPlatform)(make34).pipe(/* @__PURE__ */ provide2(layer4), /* @__PURE__ */ provide2(layer));

// node_modules/@effect/platform-node-shared/dist/NodeSink.js
var fromWritable = (options) => fromChannel2(mapDone(fromWritableChannel(options), (_) => [_]));
var fromWritableChannel = (options) => fromTransform((pull) => {
  const writable = options.evaluate();
  return succeed6(pullIntoWritable({
    ...options,
    writable,
    pull
  }));
});
var pullIntoWritable = (options) => options.pull.pipe(flatMap5((chunk) => {
  let i = 0;
  return callback2((resume) => {
    let cancelled = false;
    const loop = () => {
      for (;i < chunk.length; ) {
        if (cancelled) {
          return;
        }
        const success = options.writable.write(chunk[i++], options.encoding);
        if (!success) {
          if (!cancelled) {
            options.writable.once("drain", loop);
          }
          return;
        }
      }
      if (!cancelled) {
        resume(void_3);
      }
    };
    loop();
    return sync2(() => {
      cancelled = true;
      options.writable.off("drain", loop);
    });
  });
}), forever2({
  disableYield: true
}), options.endOnDone !== false ? catchDone((_) => {
  if ("closed" in options.writable && options.writable.closed) {
    return done3(_);
  }
  return callback2((resume) => {
    const onFinish = () => resume(done3(_));
    options.writable.once("finish", onFinish);
    options.writable.end();
    return sync2(() => {
      options.writable.off("finish", onFinish);
    });
  });
}) : identity, raceFirst2(callback2((resume) => {
  const onError = (error) => resume(fail6(options.onError(error)));
  options.writable.once("error", onError);
  return sync2(() => {
    options.writable.off("error", onError);
  });
})));

// node_modules/@effect/platform-node-shared/dist/NodeStream.js
var fromReadable = (options) => fromChannel3(fromReadableChannel(options));
var fromReadableChannel = (options) => fromTransform((_, scope) => readableToPullUnsafe({
  scope,
  readable: options.evaluate(),
  onError: options.onError ?? defaultOnError,
  chunkSize: options.chunkSize,
  closeOnDone: options.closeOnDone
}));
var readableToPullUnsafe = (options) => {
  const readable = options.readable;
  const closeOnDone = options.closeOnDone ?? true;
  const exit = options.exit ?? make7(undefined);
  const latch = options.latch ?? makeUnsafe4(false);
  function onReadable() {
    latch.openUnsafe();
  }
  function onError(error) {
    exit.current = fail4(options.onError(error));
    latch.openUnsafe();
  }
  function onEnd() {
    exit.current = fail4(Done2());
    latch.openUnsafe();
  }
  readable.on("readable", onReadable);
  readable.once("error", onError);
  readable.once("end", onEnd);
  const pull = suspend2(function loop() {
    let item = options.readable.read(options.chunkSize);
    if (item === null) {
      if (exit.current) {
        return exit.current;
      }
      if (readable.readableEnded) {
        return fail6(Done2());
      }
      latch.closeUnsafe();
      return flatMap5(latch.await, loop);
    }
    const chunk = of(item);
    while (true) {
      item = options.readable.read(options.chunkSize);
      if (item === null)
        break;
      chunk.push(item);
    }
    return succeed6(chunk);
  });
  return as2(addFinalizer2(options.scope, sync2(() => {
    readable.off("readable", onReadable);
    readable.off("error", onError);
    readable.off("end", onEnd);
    if (closeOnDone && "closed" in options.readable && !options.readable.closed) {
      options.readable.destroy();
    }
  })), pull);
};
var defaultOnError = (error) => new UnknownError2(error);

// node_modules/@effect/platform-bun/dist/BunStream.js
var fromReadableStream3 = (options) => fromChannel3(fromTransform(fnUntraced2(function* (_, scope) {
  const reader = options.evaluate().getReader();
  yield* addFinalizer2(scope, options.releaseLockOnEnd ? sync2(() => reader.releaseLock()) : promise2(() => reader.cancel().catch(constVoid)));
  function readMany() {
    let result;
    try {
      result = reader.readMany();
    } catch (error) {
      return fail6(options.onError(error));
    }
    if ("then" in result) {
      return callback2((resume) => {
        result.then((_) => resume(handleResult(_)), (e) => resume(fail6(options.onError(e))));
      });
    }
    return handleResult(result);
  }
  function handleResult(result) {
    if (result.done) {
      return done3();
    } else if (!isReadonlyArrayNonEmpty(result.value)) {
      return readMany();
    }
    return succeed6(result.value);
  }
  return suspend2(readMany);
})));

// node_modules/@effect/platform-bun/dist/BunMultipart.js
var stream2 = (source) => fromReadableStream3({
  evaluate: () => source.body ?? new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array);
      controller.close();
    }
  }),
  onError: (cause) => MultipartError.fromReason("InternalError", cause)
}).pipe(pipeThroughChannel(makeChannel(Object.fromEntries(source.headers))));
var persisted = (source) => toPersisted(stream2(source));

// node_modules/effect/dist/Brand.js
function nominal() {
  return Object.assign((input) => input, {
    option: (input) => some2(input),
    result: (input) => succeed2(input),
    is: (_) => true
  });
}

// node_modules/effect/dist/unstable/process/ChildProcessSpawner.js
var ExitCode = /* @__PURE__ */ nominal();
var ProcessId = /* @__PURE__ */ nominal();
var HandleTypeId = "~effect/process/ChildProcessSpawner/ChildProcessHandle";
var HandleProto = {
  [HandleTypeId]: HandleTypeId,
  ...BaseProto,
  toJSON() {
    return {
      _id: "ChildProcessHandle",
      pid: this.pid
    };
  }
};
var makeHandle = (params) => Object.setPrototypeOf({
  ...params
}, HandleProto);
var make35 = (spawn) => {
  const streamString = (command, options) => spawn(command).pipe(map7((handle) => decodeText(options?.includeStderr === true ? handle.all : handle.stdout)), unwrap4);
  const streamLines = (command, options) => splitLines2(streamString(command, options));
  return ChildProcessSpawner.of({
    spawn,
    exitCode: (command) => scoped2(flatMap5(spawn(command), (handle) => handle.exitCode)),
    streamString,
    streamLines,
    lines: (command, options) => runCollect(streamLines(command, options)),
    string: (command, options) => mkString(streamString(command, options))
  });
};

class ChildProcessSpawner extends (/* @__PURE__ */ Service()("effect/process/ChildProcessSpawner")) {
}

// node_modules/effect/dist/unstable/process/ChildProcess.js
var TypeId39 = "~effect/process/ChildProcess";
var Proto13 = {
  .../* @__PURE__ */ Prototype2({
    label: "Command",
    evaluate(fiber) {
      return getUnsafe(fiber.context, ChildProcessSpawner).spawn(this);
    }
  }),
  [TypeId39]: TypeId39
};
var makeStandardCommand = (command, args, options) => Object.assign(Object.create(Proto13), {
  _tag: "StandardCommand",
  command,
  args,
  options
});
var make36 = function make(...args) {
  if (isTemplateString(args[0])) {
    const [templates, ...expressions] = args;
    const tokens = parseTemplates(templates, expressions);
    return makeStandardCommand(tokens[0] ?? "", tokens.slice(1), {});
  }
  if (typeof args[0] === "object" && !Array.isArray(args[0]) && !isTemplateString(args[0])) {
    const options = args[0];
    return function(templates, ...expressions) {
      const tokens = parseTemplates(templates, expressions);
      return makeStandardCommand(tokens[0] ?? "", tokens.slice(1), options);
    };
  }
  if (typeof args[0] === "string" && !Array.isArray(args[1])) {
    const [command, options = {}] = args;
    return makeStandardCommand(command, [], options);
  }
  const [command, cmdArgs = [], options = {}] = args;
  return makeStandardCommand(command, cmdArgs, options);
};
var isTemplateString = (u) => Array.isArray(u) && ("raw" in u) && Array.isArray(u.raw);
var parseFdName = (name) => {
  const match = /^fd(\d+)$/.exec(name);
  if (match === null)
    return;
  const fd = parseInt(match[1], 10);
  return fd >= 3 ? fd : undefined;
};
var fdName = (fd) => `fd${fd}`;
var parseTemplates = (templates, expressions) => {
  let tokens = [];
  for (const [index, template] of templates.entries()) {
    tokens = parseTemplate(templates, expressions, tokens, template, index);
  }
  return tokens;
};
var parseTemplate = (templates, expressions, prevTokens, template, index) => {
  const rawTemplate = templates.raw[index];
  if (rawTemplate === undefined) {
    throw new Error(`Invalid backslash sequence: ${templates.raw[index]}`);
  }
  const {
    hasLeadingWhitespace,
    hasTrailingWhitespace,
    tokens
  } = splitByWhitespaces(template, rawTemplate);
  const nextTokens = concatTokens(prevTokens, tokens, hasLeadingWhitespace);
  if (index === expressions.length) {
    return nextTokens;
  }
  const expression = expressions[index];
  const expressionTokens = Array.isArray(expression) ? expression.map((expression) => parseExpression(expression)) : [parseExpression(expression)];
  return concatTokens(nextTokens, expressionTokens, hasTrailingWhitespace);
};
var parseExpression = (expression) => {
  const type = typeof expression;
  if (type === "string") {
    return expression;
  }
  return String(expression);
};
var DELIMITERS = /* @__PURE__ */ new Set([" ", "\t", "\r", `
`]);
var ESCAPE_LENGTH = {
  x: 3,
  u: 5
};
var splitByWhitespaces = (template, rawTemplate) => {
  if (rawTemplate.length === 0) {
    return {
      tokens: [],
      hasLeadingWhitespace: false,
      hasTrailingWhitespace: false
    };
  }
  const hasLeadingWhitespace = DELIMITERS.has(rawTemplate[0]);
  const tokens = [];
  let templateCursor = 0;
  for (let templateIndex = 0, rawIndex = 0;templateIndex < template.length; templateIndex += 1, rawIndex += 1) {
    const rawCharacter = rawTemplate[rawIndex];
    if (DELIMITERS.has(rawCharacter)) {
      if (templateCursor !== templateIndex) {
        tokens.push(template.slice(templateCursor, templateIndex));
      }
      templateCursor = templateIndex + 1;
    } else if (rawCharacter === "\\") {
      const nextRawCharacter = rawTemplate[rawIndex + 1];
      if (nextRawCharacter === `
`) {
        templateIndex -= 1;
        rawIndex += 1;
      } else if (nextRawCharacter === "u" && rawTemplate[rawIndex + 2] === "{") {
        const end = rawTemplate.indexOf("}", rawIndex + 3);
        if (parseInt(rawTemplate.slice(rawIndex + 3, end), 16) > 65535) {
          templateIndex += 1;
        }
        rawIndex = end;
      } else {
        rawIndex += ESCAPE_LENGTH[nextRawCharacter] ?? 1;
      }
    }
  }
  const hasTrailingWhitespace = templateCursor === template.length;
  if (!hasTrailingWhitespace) {
    tokens.push(template.slice(templateCursor));
  }
  return {
    tokens,
    hasLeadingWhitespace,
    hasTrailingWhitespace
  };
};
var concatTokens = (prevTokens, nextTokens, isSeparated) => isSeparated || prevTokens.length === 0 || nextTokens.length === 0 ? [...prevTokens, ...nextTokens] : [...prevTokens.slice(0, -1), `${prevTokens.at(-1)}${nextTokens.at(0)}`, ...nextTokens.slice(1)];

// node_modules/@effect/platform-node-shared/dist/NodeChildProcessSpawner.js
import * as NodeChildProcess from "child_process";
import { PassThrough } from "stream";

// node_modules/@effect/platform-node-shared/dist/internal/nodeChildProcessSpawner.js
var buildSpawnOptions = (options, base, platform) => {
  const detached = options.detached ?? platform !== "win32";
  return {
    ...base,
    detached,
    shell: options.shell,
    windowsHide: options.windowsHide ?? !detached
  };
};

// node_modules/@effect/platform-node-shared/dist/NodeChildProcessSpawner.js
var toError = (error) => error instanceof globalThis.Error ? error : new globalThis.Error(String(error));
var toPlatformError = (method, error, command) => {
  const {
    commands
  } = flattenCommand(command);
  const commandStr = commands.reduce((acc, curr) => {
    const cmd = `${curr.command} ${curr.args.join(" ")}`;
    return acc.length === 0 ? cmd : `${acc} | ${cmd}`;
  }, "");
  return handleErrnoException("ChildProcess", method)(error, [commandStr]);
};
var processGroupGraceMillis = 1000;
var processGroupPollIntervalMillis = 10;
var isProcessAlive = (childProcess, exitSignal) => {
  if (!isDoneUnsafe(exitSignal)) {
    return true;
  }
  if (globalThis.process.platform === "win32") {
    return false;
  }
  try {
    globalThis.process.kill(-childProcess.pid, 0);
    return true;
  } catch {
    return false;
  }
};
var taskkill = (childProcess, onExit = () => {}) => NodeChildProcess.execFile("taskkill", ["/pid", String(childProcess.pid), "/T", "/F"], {
  windowsHide: true
}, onExit);
var make37 = /* @__PURE__ */ gen2(function* () {
  const fs = yield* FileSystem;
  const path = yield* Path;
  const resolveWorkingDirectory = fnUntraced2(function* (options) {
    if (isUndefined(options.cwd))
      return;
    yield* fs.access(options.cwd);
    return path.resolve(options.cwd);
  });
  const resolveEnvironment = (options) => {
    return options.extendEnv ? {
      ...globalThis.process.env,
      ...options.env
    } : options.env;
  };
  const inputToStdioOption = (input) => isStream(input) ? "pipe" : input;
  const outputToStdioOption = (input) => isSink(input) ? "pipe" : input;
  const resolveStdinOption = (options) => {
    const defaultConfig = {
      stream: "pipe",
      encoding: "utf-8",
      endOnDone: true
    };
    if (isUndefined(options.stdin)) {
      return defaultConfig;
    }
    if (typeof options.stdin === "string") {
      return {
        ...defaultConfig,
        stream: options.stdin
      };
    }
    if (isStream(options.stdin)) {
      return {
        ...defaultConfig,
        stream: options.stdin
      };
    }
    return {
      stream: options.stdin.stream,
      encoding: options.stdin.encoding ?? defaultConfig.encoding,
      endOnDone: options.stdin.endOnDone ?? defaultConfig.endOnDone
    };
  };
  const resolveOutputOption = (options, streamName) => {
    const option = options[streamName];
    if (isUndefined(option)) {
      return {
        stream: "pipe"
      };
    }
    if (typeof option === "string") {
      return {
        stream: option
      };
    }
    if (isSink(option)) {
      return {
        stream: option
      };
    }
    return {
      stream: option.stream
    };
  };
  const resolveAdditionalFds = (options) => {
    if (isUndefined(options.additionalFds)) {
      return [];
    }
    const result = [];
    for (const [name, config] of Object.entries(options.additionalFds)) {
      const fd = parseFdName(name);
      if (isNotUndefined(fd)) {
        result.push({
          fd,
          config
        });
      }
    }
    return result.sort((a, b) => a.fd - b.fd);
  };
  const buildStdioArray = (stdinConfig, stdoutConfig, stderrConfig, additionalFds) => {
    const stdio = [inputToStdioOption(stdinConfig.stream), outputToStdioOption(stdoutConfig.stream), outputToStdioOption(stderrConfig.stream)];
    if (additionalFds.length === 0) {
      return stdio;
    }
    const maxFd = additionalFds.reduce((max, {
      fd
    }) => Math.max(max, fd), 2);
    for (let i = 3;i <= maxFd; i++) {
      stdio[i] = "ignore";
    }
    for (const {
      fd
    } of additionalFds) {
      stdio[fd] = "pipe";
    }
    return stdio;
  };
  const setupAdditionalFds = fnUntraced2(function* (command, childProcess, additionalFds) {
    if (additionalFds.length === 0) {
      return {
        getInputFd: () => drain,
        getOutputFd: () => empty4
      };
    }
    const inputSinks = new Map;
    const outputStreams = new Map;
    for (const {
      config,
      fd
    } of additionalFds) {
      const nodeStream = childProcess.stdio[fd];
      switch (config.type) {
        case "input": {
          let sink = drain;
          if (nodeStream && "write" in nodeStream) {
            sink = fromWritable({
              evaluate: () => nodeStream,
              onError: (error) => toPlatformError(`fromWritable(fd${fd})`, toError(error), command)
            });
          }
          if (config.stream) {
            yield* forkScoped2(run(config.stream, sink));
          }
          inputSinks.set(fd, sink);
          break;
        }
        case "output": {
          let stream = empty4;
          if (nodeStream && "read" in nodeStream) {
            const passThrough = new PassThrough;
            nodeStream.on("error", (error) => passThrough.destroy(error));
            nodeStream.pipe(passThrough);
            stream = fromReadable({
              evaluate: () => passThrough,
              onError: (error) => toPlatformError(`fromReadable(fd${fd})`, toError(error), command)
            });
          }
          if (config.sink) {
            stream = transduce(stream, config.sink);
          }
          outputStreams.set(fd, stream);
          break;
        }
      }
    }
    return {
      getInputFd: (fd) => inputSinks.get(fd) ?? drain,
      getOutputFd: (fd) => outputStreams.get(fd) ?? empty4
    };
  });
  const setupChildStdin = (command, childProcess, config) => suspend2(() => {
    let sink = drain;
    if (isNotNull(childProcess.stdin)) {
      sink = fromWritable({
        evaluate: () => childProcess.stdin,
        onError: (error) => toPlatformError("fromWritable(stdin)", toError(error), command),
        endOnDone: config.endOnDone,
        encoding: config.encoding
      });
    }
    if (isStream(config.stream)) {
      return as2(forkScoped2(run(config.stream, sink)), sink);
    }
    return succeed6(sink);
  });
  const setupChildOutputStreams = (command, childProcess, stdoutConfig, stderrConfig) => {
    let stdout = childProcess.stdout ? (() => {
      const passThrough = new PassThrough;
      childProcess.stdout.on("error", (error) => passThrough.destroy(error));
      childProcess.stdout.pipe(passThrough);
      return fromReadable({
        evaluate: () => passThrough,
        onError: (error) => toPlatformError("fromReadable(stdout)", toError(error), command)
      });
    })() : empty4;
    let stderr = childProcess.stderr ? (() => {
      const passThrough = new PassThrough;
      childProcess.stderr.on("error", (error) => passThrough.destroy(error));
      childProcess.stderr.pipe(passThrough);
      return fromReadable({
        evaluate: () => passThrough,
        onError: (error) => toPlatformError("fromReadable(stderr)", toError(error), command)
      });
    })() : empty4;
    if (isSink(stdoutConfig.stream)) {
      stdout = transduce(stdout, stdoutConfig.stream);
    }
    if (isSink(stderrConfig.stream)) {
      stderr = transduce(stderr, stderrConfig.stream);
    }
    const all = merge4(stdout, stderr);
    return {
      stdout,
      stderr,
      all
    };
  };
  const spawn2 = (command, spawnOptions) => callback2((resume) => {
    const deferred = makeUnsafe2();
    const handle = NodeChildProcess.spawn(command.command, command.args, spawnOptions);
    handle.on("error", (error) => {
      resume(fail6(toPlatformError("spawn", error, command)));
    });
    handle.on("exit", (...args) => {
      doneUnsafe(deferred, succeed4(args));
    });
    handle.on("spawn", () => {
      resume(succeed6([handle, deferred]));
    });
    return sync2(() => {
      handle.kill("SIGTERM");
    });
  });
  const killProcessGroup = (command, childProcess, signal) => {
    if (globalThis.process.platform === "win32") {
      return callback2((resume) => {
        taskkill(childProcess, (error) => {
          if (error) {
            resume(fail6(toPlatformError("kill", toError(error), command)));
          } else {
            resume(void_3);
          }
        });
      });
    }
    return try_3({
      try: () => {
        globalThis.process.kill(-childProcess.pid, signal);
      },
      catch: (error) => toPlatformError("kill", toError(error), command)
    });
  };
  const killProcessGroupOnExit = (childProcess, signal) => {
    if (globalThis.process.platform === "win32") {
      taskkill(childProcess);
      return;
    }
    try {
      globalThis.process.kill(-childProcess.pid, signal);
    } catch {}
  };
  const killProcess = (command, childProcess, signal) => suspend2(() => {
    const killed = childProcess.kill(signal);
    if (!killed) {
      const error = new globalThis.Error("Failed to kill child process");
      return fail6(toPlatformError("kill", error, command));
    }
    return void_3;
  });
  const awaitProcessExit = (childProcess, exitSignal, timeoutMillis) => callback2((resume) => {
    const deadline = Date.now() + timeoutMillis;
    let timer;
    const stop = () => {
      clearTimeout(timer);
      childProcess.removeListener("exit", poll);
    };
    const poll = () => {
      clearTimeout(timer);
      if (Date.now() >= deadline || !isProcessAlive(childProcess, exitSignal)) {
        stop();
        resume(void_3);
        return;
      }
      timer = setTimeout(poll, processGroupPollIntervalMillis);
    };
    childProcess.on("exit", poll);
    poll();
    return sync2(stop);
  });
  const terminateProcessGroup = fnUntraced2(function* (command, childProcess, exitSignal, options) {
    const signalGroup = (signal) => killProcessGroup(command, childProcess, signal).pipe(catch_2(() => killProcess(command, childProcess, signal)));
    yield* signalGroup(options?.killSignal ?? "SIGTERM");
    if (isUndefined(options?.forceKillAfter)) {
      yield* awaitProcessExit(childProcess, exitSignal, processGroupGraceMillis);
    } else {
      yield* awaitProcessExit(childProcess, exitSignal, toMillis(options.forceKillAfter));
      if (isProcessAlive(childProcess, exitSignal)) {
        yield* signalGroup("SIGKILL");
        yield* awaitProcessExit(childProcess, exitSignal, processGroupGraceMillis);
      }
    }
    yield* _await(exitSignal);
  });
  const getSourceStream = (handle, from) => {
    const fromOption = from ?? "stdout";
    switch (fromOption) {
      case "stdout":
        return handle.stdout;
      case "stderr":
        return handle.stderr;
      case "all":
        return handle.all;
      default: {
        const fd = parseFdName(fromOption);
        if (isNotUndefined(fd)) {
          return handle.getOutputFd(fd);
        }
        return handle.stdout;
      }
    }
  };
  const spawnCommand = fnUntraced2(function* (cmd) {
    switch (cmd._tag) {
      case "StandardCommand": {
        const stdinConfig = resolveStdinOption(cmd.options);
        const stdoutConfig = resolveOutputOption(cmd.options, "stdout");
        const stderrConfig = resolveOutputOption(cmd.options, "stderr");
        const resolvedAdditionalFds = resolveAdditionalFds(cmd.options);
        let isReferenced = true;
        const cwd = yield* resolveWorkingDirectory(cmd.options);
        const env = resolveEnvironment(cmd.options);
        const stdio = buildStdioArray(stdinConfig, stdoutConfig, stderrConfig, resolvedAdditionalFds);
        const [childProcess, exitSignal] = yield* acquireRelease2(spawn2(cmd, buildSpawnOptions(cmd.options, {
          cwd,
          env,
          stdio
        }, process.platform)), fnUntraced2(function* ([childProcess, exitSignal]) {
          const exited = yield* isDone2(exitSignal);
          if (exited) {
            const [code] = yield* _await(exitSignal);
            if (code !== 0 && isNotNull(code)) {
              yield* ignore2(killProcessGroup(cmd, childProcess, cmd.options.killSignal ?? "SIGTERM"));
            }
            return;
          }
          if (!isReferenced) {
            return;
          }
          yield* ignore2(terminateProcessGroup(cmd, childProcess, exitSignal, cmd.options));
        }));
        const pid = ProcessId(childProcess.pid);
        childProcess.on("exit", (code) => {
          if (code !== 0 && isNotNull(code)) {
            killProcessGroupOnExit(childProcess, cmd.options.killSignal ?? "SIGTERM");
          }
        });
        const reref = sync2(() => {
          if (!isReferenced) {
            childProcess.ref();
            isReferenced = true;
          }
        });
        const unref = sync2(() => {
          if (isReferenced) {
            childProcess.unref();
            isReferenced = false;
          }
          return reref;
        });
        const stdin = yield* setupChildStdin(cmd, childProcess, stdinConfig);
        const {
          all,
          stderr,
          stdout
        } = setupChildOutputStreams(cmd, childProcess, stdoutConfig, stderrConfig);
        const {
          getInputFd,
          getOutputFd
        } = yield* setupAdditionalFds(cmd, childProcess, resolvedAdditionalFds);
        const isRunning = map7(isDone2(exitSignal), (done) => !done);
        const exitCode = flatMap5(_await(exitSignal), ([code, signal]) => {
          if (isNotNull(code)) {
            return succeed6(ExitCode(code));
          }
          const error = new globalThis.Error(`Process interrupted due to receipt of signal: '${signal}'`);
          return fail6(toPlatformError("exitCode", error, cmd));
        });
        const kill = (options) => terminateProcessGroup(cmd, childProcess, exitSignal, options);
        return makeHandle({
          pid,
          exitCode,
          isRunning,
          kill,
          stdin,
          stdout,
          stderr,
          all,
          getInputFd,
          getOutputFd,
          unref
        });
      }
      case "PipedCommand": {
        const {
          commands,
          pipeOptions
        } = flattenCommand(cmd);
        const [root, ...pipeline] = commands;
        const handles = [yield* spawnCommand(root)];
        for (let i = 0;i < pipeline.length; i++) {
          const command = pipeline[i];
          const options = pipeOptions[i] ?? {};
          const stdinConfig = resolveStdinOption(command.options);
          const sourceStream = unwrap4(succeed6(getSourceStream(handles[handles.length - 1], options.from)));
          const toOption = options.to ?? "stdin";
          if (toOption === "stdin") {
            handles.push(yield* spawnCommand(make36(command.command, command.args, {
              ...command.options,
              stdin: {
                ...stdinConfig,
                stream: sourceStream
              }
            })));
          } else {
            const fd = parseFdName(toOption);
            if (isNotUndefined(fd)) {
              const fdName2 = fdName(fd);
              const existingFds = command.options.additionalFds ?? {};
              handles.push(yield* spawnCommand(make36(command.command, command.args, {
                ...command.options,
                additionalFds: {
                  ...existingFds,
                  [fdName2]: {
                    type: "input",
                    stream: sourceStream
                  }
                }
              })));
            } else {
              handles.push(yield* spawnCommand(make36(command.command, command.args, {
                ...command.options,
                stdin: {
                  ...stdinConfig,
                  stream: sourceStream
                }
              })));
            }
          }
        }
        const handle = handles[handles.length - 1];
        const kill = (options) => forEach2([...handles].reverse(), (handle) => ignore2(handle.kill(options)), {
          discard: true
        });
        const unref = gen2(function* () {
          const rerefs = [];
          for (const handle of handles) {
            rerefs.push(yield* handle.unref);
          }
          return forEach2([...rerefs].reverse(), (reref) => reref, {
            discard: true
          });
        });
        return makeHandle({
          pid: handle.pid,
          exitCode: handle.exitCode,
          isRunning: handle.isRunning,
          kill,
          stdin: handles[0].stdin,
          stdout: handle.stdout,
          stderr: handle.stderr,
          all: handle.all,
          getInputFd: handle.getInputFd,
          getOutputFd: handle.getOutputFd,
          unref
        });
      }
    }
  });
  return make35(spawnCommand);
});
var layer6 = /* @__PURE__ */ effect(ChildProcessSpawner, make37);
var flattenCommand = (command) => {
  const commands = [];
  const pipeOptions = [];
  const flatten = (cmd) => {
    switch (cmd._tag) {
      case "StandardCommand": {
        commands.push(cmd);
        break;
      }
      case "PipedCommand": {
        flatten(cmd.left);
        pipeOptions.push(cmd.options);
        flatten(cmd.right);
        break;
      }
    }
  };
  flatten(command);
  if (commands.length === 0) {
    throw new Error("flattenCommand produced empty commands array");
  }
  const [first, ...rest] = commands;
  const nonEmptyCommands = [first, ...rest];
  return {
    commands: nonEmptyCommands,
    pipeOptions
  };
};

// node_modules/effect/dist/internal/uuid.js
var hex = (byte) => byte.toString(16).padStart(2, "0");
var stringify = (bytes) => {
  const segments = [bytes.subarray(0, 4), bytes.subarray(4, 6), bytes.subarray(6, 8), bytes.subarray(8, 10), bytes.subarray(10, 16)];
  return segments.map((segment) => Array.from(segment, hex).join("")).join("-");
};
var randomBytes2 = () => globalThis.crypto.getRandomValues(new Uint8Array(16));
function v4Bytes(bytes = randomBytes2()) {
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  return bytes;
}
var v4String = (bytes) => stringify(bytes === undefined ? v4Bytes() : v4Bytes(bytes));
var maxV7Timestamp = 2 ** 48 - 1;
function v7Bytes(timestampMillis, bytes = randomBytes2()) {
  const timestamp = Math.min(Math.max(0, Math.trunc(timestampMillis)), maxV7Timestamp);
  bytes[0] = Math.floor(timestamp / 2 ** 40);
  bytes[1] = Math.floor(timestamp / 2 ** 32) & 255;
  bytes[2] = Math.floor(timestamp / 2 ** 24) & 255;
  bytes[3] = Math.floor(timestamp / 2 ** 16) & 255;
  bytes[4] = Math.floor(timestamp / 2 ** 8) & 255;
  bytes[5] = timestamp & 255;
  bytes[6] = bytes[6] & 15 | 112;
  bytes[8] = bytes[8] & 63 | 128;
  return bytes;
}
var v7String = (timestampMillis, bytes) => stringify(bytes === undefined ? v7Bytes(timestampMillis) : v7Bytes(timestampMillis, bytes));

// node_modules/effect/dist/Crypto.js
var TypeId40 = "~effect/Crypto";
var Crypto2 = /* @__PURE__ */ Service("effect/Crypto");
var make38 = (impl) => {
  const randomBytesUnsafe = impl.randomBytes;
  const randomBytes = (size) => map7(validateSize("randomBytes", size), randomBytesUnsafe);
  const readUint53 = (bytes) => (bytes[0] & 31) * 2 ** 48 + bytes[1] * 2 ** 40 + bytes[2] * 2 ** 32 + bytes[3] * 2 ** 24 + bytes[4] * 2 ** 16 + bytes[5] * 2 ** 8 + bytes[6];
  const nextDoubleUnsafe = () => readUint53(randomBytesUnsafe(7)) / 2 ** 53;
  const nextIntUnsafe = () => {
    while (true) {
      const bytes = randomBytesUnsafe(7);
      const value = readUint53(bytes);
      if ((bytes[0] & 32) === 0) {
        return value + Number.MIN_SAFE_INTEGER;
      }
      if (value < Number.MAX_SAFE_INTEGER) {
        return value + 1;
      }
    }
  };
  return Crypto2.of({
    [TypeId40]: TypeId40,
    randomBytes,
    nextDoubleUnsafe,
    nextIntUnsafe,
    digest: impl.digest,
    random: sync2(() => nextDoubleUnsafe()),
    randomBoolean: sync2(() => nextDoubleUnsafe() > 0.5),
    randomInt: sync2(() => nextIntUnsafe()),
    randomBetween: (min, max) => sync2(() => nextBetween(min, max, nextDoubleUnsafe())),
    randomIntBetween(min, max, options) {
      const extra = options?.halfOpen === true ? 0 : 1;
      return sync2(() => {
        const minInt = Math.ceil(min);
        const maxInt = Math.floor(max);
        return Math.floor(nextDoubleUnsafe() * (maxInt - minInt + extra)) + minInt;
      });
    },
    randomShuffle: (elements) => sync2(() => {
      const buffer = Array.from(elements);
      for (let i = buffer.length - 1;i >= 1; i = i - 1) {
        const index = Math.min(i, Math.floor(nextDoubleUnsafe() * (i + 1)));
        const value = buffer[i];
        buffer[i] = buffer[index];
        buffer[index] = value;
      }
      return buffer;
    }),
    randomUUIDv4: sync2(() => v4String(randomBytesUnsafe(16))),
    randomUUIDv7: clockWith2((clock) => succeed6(v7String(clock.currentTimeMillisUnsafe(), randomBytesUnsafe(16))))
  });
};
var validateSize = (method, size) => Number.isSafeInteger(size) && size >= 0 ? succeed6(size) : fail6(badArgument({
  module: "Crypto",
  method,
  description: "size must be a non-negative safe integer"
}));

// node_modules/@effect/platform-node-shared/dist/NodeCrypto.js
import * as NodeCrypto from "crypto";
var toHashAlgorithm = (algorithm) => {
  switch (algorithm) {
    case "SHA-1":
      return "sha1";
    case "SHA-256":
      return "sha256";
    case "SHA-384":
      return "sha384";
    case "SHA-512":
      return "sha512";
  }
};
var digest = (algorithm, data) => try_3({
  try: () => Uint8Array.from(NodeCrypto.createHash(toHashAlgorithm(algorithm)).update(data).digest()),
  catch: (cause) => systemError({
    module: "Crypto",
    method: "digest",
    _tag: "Unknown",
    description: "Could not compute digest",
    cause
  })
});
var make39 = /* @__PURE__ */ make38({
  randomBytes: NodeCrypto.randomBytes,
  digest
});
var layer7 = /* @__PURE__ */ succeed5(Crypto2, make39);

// node_modules/@effect/platform-bun/dist/BunCrypto.js
var layer8 = layer7;

// node_modules/@effect/platform-node-shared/dist/NodePath.js
import * as NodePath from "path";
import * as NodeUrl from "url";
var fileUrlOps = (windows) => ({
  fromFileUrl: (url) => try_3({
    try: () => NodeUrl.fileURLToPath(url, {
      windows
    }),
    catch: (cause) => new BadArgument({
      module: "Path",
      method: "fromFileUrl",
      cause
    })
  }),
  toFileUrl: (path) => try_3({
    try: () => NodeUrl.pathToFileURL(path, {
      windows
    }),
    catch: (cause) => new BadArgument({
      module: "Path",
      method: "toFileUrl",
      cause
    })
  })
});
var layerPosix = /* @__PURE__ */ succeed5(Path)({
  [TypeId16]: TypeId16,
  ...NodePath.posix,
  .../* @__PURE__ */ fileUrlOps(false)
});
var layerWin32 = /* @__PURE__ */ succeed5(Path)({
  [TypeId16]: TypeId16,
  ...NodePath.win32,
  .../* @__PURE__ */ fileUrlOps(true)
});
var layer9 = /* @__PURE__ */ succeed5(Path)({
  [TypeId16]: TypeId16,
  ...NodePath,
  .../* @__PURE__ */ fileUrlOps(undefined)
});

// node_modules/@effect/platform-bun/dist/BunPath.js
var layer10 = layer9;

// node_modules/effect/dist/Stdio.js
var TypeId41 = "~effect/Stdio";
var Stdio = /* @__PURE__ */ Service(TypeId41);
var make40 = (options) => ({
  [TypeId41]: TypeId41,
  stdinIsTerminal: succeed6(false),
  stdoutIsTerminal: succeed6(false),
  ...options
});

// node_modules/@effect/platform-node-shared/dist/NodeStdio.js
var layer11 = /* @__PURE__ */ succeed5(Stdio, /* @__PURE__ */ make40({
  args: /* @__PURE__ */ sync2(() => process.argv.slice(2)),
  stdinIsTerminal: /* @__PURE__ */ sync2(() => process.stdin.isTTY === true),
  stdoutIsTerminal: /* @__PURE__ */ sync2(() => process.stdout.isTTY === true),
  stdout: (options) => fromWritable({
    evaluate: () => process.stdout,
    onError: (cause) => systemError({
      module: "Stdio",
      method: "stdout",
      _tag: "Unknown",
      cause
    }),
    endOnDone: options?.endOnDone ?? false
  }),
  stderr: (options) => fromWritable({
    evaluate: () => process.stderr,
    onError: (cause) => systemError({
      module: "Stdio",
      method: "stderr",
      _tag: "Unknown",
      cause
    }),
    endOnDone: options?.endOnDone ?? false
  }),
  stdin: /* @__PURE__ */ fromReadable({
    evaluate: () => process.stdin,
    onError: (cause) => systemError({
      module: "Stdio",
      method: "stdin",
      _tag: "Unknown",
      cause
    }),
    closeOnDone: false
  })
}));

// node_modules/@effect/platform-bun/dist/BunStdio.js
var layer12 = layer11;

// node_modules/effect/dist/Terminal.js
var TypeId42 = "~effect/Terminal";
var QuitErrorTypeId = "~effect/Terminal/QuitError";

class QuitError extends (/* @__PURE__ */ Error4("QuitError")({
  _tag: /* @__PURE__ */ tag("QuitError")
})) {
  [QuitErrorTypeId] = QuitErrorTypeId;
}
var isQuitError = (u) => hasProperty(u, QuitErrorTypeId);
var Terminal = /* @__PURE__ */ Service("effect/Terminal");
var make41 = (impl) => Terminal.of({
  ...impl,
  [TypeId42]: TypeId42
});

// node_modules/@effect/platform-node-shared/dist/NodeTerminal.js
import * as readline from "readline";
var make42 = /* @__PURE__ */ fnUntraced2(function* (shouldQuit = defaultShouldQuit) {
  const stdin = process.stdin;
  const stdout = process.stdout;
  const lines = yield* make9();
  let inputEnded = stdin.readableEnded;
  let readlineActive = false;
  const onStdinEnd = () => {
    inputEnded = true;
    if (!readlineActive) {
      endUnsafe(lines);
    }
  };
  stdin.once("end", onStdinEnd);
  yield* addFinalizer3(() => sync2(() => stdin.off("end", onStdinEnd)));
  const rlRef = yield* make11({
    acquire: acquireRelease2(sync2(() => {
      const rl = readline.createInterface({
        input: stdin,
        escapeCodeTimeout: 50
      });
      const onLine = (line) => offerUnsafe(lines, line);
      const onClose = () => {
        readlineActive = false;
        endUnsafe(lines);
      };
      readlineActive = true;
      readline.emitKeypressEvents(stdin, rl);
      rl.on("line", onLine);
      rl.once("close", onClose);
      if (stdin.isTTY) {
        stdin.setRawMode(true);
      }
      return {
        rl,
        onClose,
        onLine
      };
    }), ({
      rl,
      onClose,
      onLine
    }) => sync2(() => {
      readlineActive = false;
      rl.off("line", onLine);
      rl.off("close", onClose);
      if (stdin.isTTY) {
        stdin.setRawMode(false);
      }
      rl.close();
      if (inputEnded) {
        endUnsafe(lines);
      }
    })),
    idleTimeToLive: "10 millis"
  });
  const columns = sync2(() => stdout.columns ?? 0);
  const rows = sync2(() => stdout.rows ?? 0);
  const readInput = gen2(function* () {
    const queue = yield* make9();
    const handleKeypress = (s, k) => {
      const userInput = {
        input: fromUndefinedOr(s),
        key: {
          name: k.name ?? "",
          ctrl: !!k.ctrl,
          meta: !!k.meta,
          shift: !!k.shift
        }
      };
      offerUnsafe(queue, userInput);
      if (shouldQuit(userInput)) {
        endUnsafe(queue);
      }
    };
    const keepAlive = setInterval(() => {}, 2147483647);
    const handleEnd = () => {
      clearInterval(keepAlive);
      endUnsafe(queue);
    };
    yield* addFinalizer3(() => sync2(() => {
      clearInterval(keepAlive);
      stdin.off("keypress", handleKeypress);
      stdin.off("end", handleEnd);
    }));
    stdin.on("keypress", handleKeypress);
    if (inputEnded) {
      handleEnd();
    } else {
      yield* get3(rlRef);
      stdin.once("end", handleEnd);
    }
    return queue;
  });
  const readLine = suspend2(() => poll(lines).pipe(flatMap5(match({
    onNone: () => scoped2(andThen2(get3(rlRef), take2(lines))),
    onSome: succeed6
  })), mapError2(() => new QuitError({}))));
  const display = (prompt) => uninterruptible2(callback2((resume) => {
    stdout.write(prompt, (err) => isNullish(err) ? resume(void_3) : resume(fail6(badArgument({
      module: "Terminal",
      method: "display",
      description: "Failed to write prompt to stdout",
      cause: err
    }))));
  }));
  return make41({
    columns,
    rows,
    readInput,
    readLine,
    display
  });
});
var layer13 = /* @__PURE__ */ effect(Terminal, /* @__PURE__ */ make42(defaultShouldQuit));
function defaultShouldQuit(input) {
  return input.key.ctrl && (input.key.name === "c" || input.key.name === "d");
}

// node_modules/@effect/platform-bun/dist/BunTerminal.js
var layer14 = layer13;

// node_modules/@effect/platform-bun/dist/BunServices.js
var layer15 = /* @__PURE__ */ layer6.pipe(/* @__PURE__ */ provideMerge(/* @__PURE__ */ mergeAll2(layer4, layer8, layer10, layer12, layer14)));

// node_modules/@effect/platform-bun/dist/BunHttpServer.js
var make43 = /* @__PURE__ */ fnUntraced2(function* (options) {
  const scope = yield* scope2;
  let listenOptions = options;
  if (!("unix" in options) || options.unix === undefined) {
    const internetOptions = options;
    let hostname = internetOptions.hostname ?? "::";
    if (isFailure2(ipFromString(hostname))) {
      hostname = yield* tryPromise2({
        try: async () => {
          const result = await Bun.dns.lookup(hostname, {
            socketType: "tcp"
          });
          if (result.length === 0)
            throw new globalThis.Error(`Could not resolve hostname: ${hostname}`);
          return result[0].address;
        },
        catch: (cause) => new ServeError({
          cause
        })
      });
    }
    listenOptions = {
      ...options,
      hostname
    };
  }
  const {
    compressionThreshold = MIN_COMPRESSIBLE_SIZE,
    ...websocket
  } = options.websocket ?? {};
  const handlerStack = [function(_request, _server) {
    return new Response("not found", {
      status: 404
    });
  }];
  const server = Bun.serve({
    ...listenOptions,
    fetch: handlerStack[0],
    websocket: {
      ...websocket,
      open(ws) {
        doneUnsafe(ws.data.deferred, succeed4(ws));
      },
      message(ws, message) {
        ws.data.run(message);
      },
      close(ws, code, closeReason) {
        code = typeof code === "number" ? code : 1001;
        const error = new SocketError({
          reason: new SocketCloseError({
            code,
            closeReason
          })
        });
        ws.data.closeError = error;
        ws.data.onClose(error);
      }
    }
  });
  const shutdown = yield* promise2(() => server.stop()).pipe(cached2);
  const preemptiveShutdown = options.disablePreemptiveShutdown ? void_3 : timeoutOrElse2(shutdown, {
    duration: options.gracefulShutdownTimeout ?? seconds(20),
    orElse: () => void_3
  });
  yield* addFinalizer2(scope, shutdown);
  const address = "unix" in options && options.unix !== undefined ? unixPathAddress(options.unix) : yield* fromResult2(inetAddressFromIpString(server.hostname, server.port)).pipe(mapError2((cause) => new ServeError({
    cause
  })));
  return make32({
    address,
    serve: fnUntraced2(function* (httpApp, middleware) {
      const parent = yield* fiber2;
      const services = parent.context;
      const serveScope = getUnsafe(services, Scope);
      const scope = forkUnsafe2(serveScope, "parallel");
      const httpEffect = toHandled(httpApp, (request, response) => sync2(() => {
        request.resolve(makeResponse2(request, response, services, scope));
      }), middleware);
      function handler(request, server) {
        return new Promise((resolve, _reject) => {
          const context = add(services, HttpServerRequest, new BunServerRequest(request, resolve, removeHost(request.url), server, compressionThreshold));
          const fiber = runIn(runForkWith2(context)(httpEffect), scope);
          request.signal.addEventListener("abort", () => {
            fiber.interruptUnsafe(parent.id, ClientAbort.annotation);
          }, {
            once: true
          });
        });
      }
      yield* addFinalizerExit(serveScope, () => {
        const index = handlerStack.indexOf(handler);
        if (index !== -1)
          handlerStack.splice(index, 1);
        server.reload({
          fetch: handlerStack[handlerStack.length - 1],
          ...options.routes === undefined ? undefined : {
            routes: options.routes
          }
        });
        return handlerStack.length === 1 ? preemptiveShutdown : void_3;
      });
      handlerStack.push(handler);
      server.reload({
        fetch: handler,
        ...options.routes === undefined ? undefined : {
          routes: options.routes
        }
      });
    })
  });
});
var MIN_COMPRESSIBLE_SIZE = 1024;
var makeResponse2 = (request, response, context, scope) => {
  if (omitsBody(response, request.method === "HEAD")) {
    return toWeb(response, {
      withoutBody: true
    });
  }
  const fields = {
    headers: new globalThis.Headers(response.headers),
    status: response.status
  };
  if (!isEmpty(response.cookies)) {
    for (const header of toSetCookieHeaders(response.cookies)) {
      fields.headers.append("set-cookie", header);
    }
  }
  if (response.statusText !== undefined) {
    fields.statusText = response.statusText;
  }
  response = scopeTransferToStream(response);
  const body = response.body;
  switch (body._tag) {
    case "Empty": {
      return new Response(undefined, fields);
    }
    case "Uint8Array": {
      return new Response(body.text ?? body.body, fields);
    }
    case "Raw": {
      if (body.body instanceof Response) {
        for (const [key, value] of fields.headers.entries()) {
          body.body.headers.set(key, value);
        }
        return body.body;
      }
      return new Response(body.body, fields);
    }
    case "FormData": {
      return new Response(body.formData, fields);
    }
    case "Stream": {
      return new Response(toReadableStreamWith(unwrap4(withFiber2((fiber) => {
        runIn(fiber, scope);
        return succeed6(body.stream);
      })), context), fields);
    }
  }
};
var layerServer = /* @__PURE__ */ flow(make43, /* @__PURE__ */ effect(HttpServer));
var layerHttpServices = /* @__PURE__ */ mergeAll2(layer5, layerWeak, layer15);
var layer16 = (options) => mergeAll2(layerServer(options), layerHttpServices);
function wsDefaultRun(_) {
  this.buffer.push(_);
}

class BunServerRequest extends Class2 {
  [TypeId38];
  [TypeId31];
  source;
  resolve;
  url;
  bunServer;
  compressionThreshold;
  headersOverride;
  remoteAddressOverride;
  constructor(source, resolve, url, bunServer, compressionThreshold, headersOverride, remoteAddressOverride) {
    super();
    this[TypeId38] = TypeId38;
    this[TypeId31] = TypeId31;
    this.source = source;
    this.resolve = resolve;
    this.url = url;
    this.bunServer = bunServer;
    this.compressionThreshold = compressionThreshold;
    this.headersOverride = headersOverride;
    this.remoteAddressOverride = remoteAddressOverride;
  }
  toJSON() {
    return inspect(this, {
      _id: "HttpServerRequest",
      method: this.method,
      url: this.originalUrl
    });
  }
  modify(options) {
    return new BunServerRequest(this.source, this.resolve, options.url ?? this.url, this.bunServer, this.compressionThreshold, options.headers ?? this.headersOverride, "remoteAddress" in options ? options.remoteAddress : this.remoteAddressOverride);
  }
  get method() {
    return this.source.method.toUpperCase();
  }
  get originalUrl() {
    return this.source.url;
  }
  get remoteAddress() {
    return this.remoteAddressOverride ?? fromNullishOr(this.bunServer.requestIP(this.source)?.address);
  }
  get headers() {
    this.headersOverride ??= fromInput2(this.source.headers);
    return this.headersOverride;
  }
  cachedCookies;
  get cookies() {
    if (this.cachedCookies) {
      return this.cachedCookies;
    }
    return this.cachedCookies = parseHeader(this.headers.cookie ?? "");
  }
  get stream() {
    return this.source.body ? fromReadableStream3({
      evaluate: () => this.source.body ?? emptyReadbleStream,
      onError: (cause) => new HttpServerError({
        reason: new RequestParseError({
          request: this,
          cause
        })
      })
    }) : fail8(new HttpServerError({
      reason: new RequestParseError({
        request: this,
        description: "can not create stream from empty body"
      })
    }));
  }
  textEffect;
  get text() {
    if (this.textEffect) {
      return this.textEffect;
    }
    this.textEffect = runSync2(cached2(tryPromise2({
      try: () => this.source.text(),
      catch: (cause) => new HttpServerError({
        reason: new RequestParseError({
          request: this,
          cause
        })
      })
    })));
    return this.textEffect;
  }
  get json() {
    return flatMap5(this.text, (_) => try_3({
      try: () => JSON.parse(_),
      catch: (cause) => new HttpServerError({
        reason: new RequestParseError({
          request: this,
          cause
        })
      })
    }));
  }
  get urlParamsBody() {
    return flatMap5(this.text, (_) => try_3({
      try: () => fromInput3(new URLSearchParams(_)),
      catch: (cause) => new HttpServerError({
        reason: new RequestParseError({
          request: this,
          cause
        })
      })
    }));
  }
  multipartEffect;
  get multipart() {
    if (this.multipartEffect) {
      return this.multipartEffect;
    }
    this.multipartEffect = runSync2(cached2(persisted(this.source)));
    return this.multipartEffect;
  }
  get multipartStream() {
    return stream2(this.source);
  }
  arrayBufferEffect;
  get arrayBuffer() {
    if (this.arrayBufferEffect) {
      return this.arrayBufferEffect;
    }
    this.arrayBufferEffect = runSync2(cached2(tryPromise2({
      try: () => this.source.arrayBuffer(),
      catch: (cause) => new HttpServerError({
        reason: new RequestParseError({
          request: this,
          cause
        })
      })
    })));
    this.textEffect = map7(this.arrayBufferEffect, (_) => new TextDecoder().decode(_));
    return this.arrayBufferEffect;
  }
  get upgrade() {
    return callback2((resume) => {
      const deferred = makeUnsafe2();
      const semaphore = makeUnsafe5(1);
      const success = this.bunServer.upgrade(this.source, {
        data: {
          deferred,
          buffer: [],
          closeError: undefined,
          run: wsDefaultRun,
          onClose: constVoid
        }
      });
      if (!success) {
        resume(fail6(new HttpServerError({
          reason: new RequestParseError({
            request: this,
            description: "Not an upgradeable ServerRequest"
          })
        })));
        return;
      }
      const compressionThreshold = this.compressionThreshold;
      resume(map7(_await(deferred), (ws) => {
        const write = (chunk) => sync2(() => {
          if (typeof chunk === "string") {
            ws.sendText(chunk, chunk.length >= compressionThreshold);
          } else if (isCloseEvent(chunk)) {
            ws.close(chunk.code, chunk.reason);
          } else {
            ws.sendBinary(chunk, chunk.byteLength >= compressionThreshold);
          }
        });
        const writeAll = (chunks) => sync2(() => {
          for (let i = 0;i < chunks.length; i++) {
            const chunk = chunks[i];
            if (typeof chunk === "string") {
              ws.sendText(chunk, chunk.length >= compressionThreshold);
            } else {
              ws.sendBinary(chunk, chunk.byteLength >= compressionThreshold);
            }
          }
        });
        const writer = succeed6({
          write,
          writeAll
        });
        const reader = gen2(function* () {
          const dispatcher = (yield* Scheduler).makeDispatcher();
          yield* acquireRelease2(semaphore.take(1), () => semaphore.release(1));
          const closeError = ws.data.closeError ?? (ws.readyState >= 2 ? new SocketError({
            reason: new SocketCloseError({
              code: 1006
            })
          }) : undefined);
          if (closeError !== undefined && ws.data.buffer.length === 0) {
            return yield* closeError;
          }
          const scope = yield* scope2;
          let buffer = ws.data.buffer.splice(0);
          let error = closeError;
          let waiter;
          let flushScheduled = false;
          function takeBuffer() {
            const chunk = buffer;
            buffer = [];
            return chunk;
          }
          function deliver() {
            flushScheduled = false;
            if (waiter === undefined || buffer.length === 0)
              return;
            const resumeRead = waiter;
            waiter = undefined;
            resumeRead(succeed6(takeBuffer()));
          }
          function push(data) {
            buffer.push(data);
            if (waiter !== undefined && !flushScheduled) {
              flushScheduled = true;
              dispatcher.scheduleTask(deliver, 0);
            }
          }
          function fail(err) {
            if (error === undefined)
              error = err;
            if (waiter !== undefined) {
              const resumeRead = waiter;
              waiter = undefined;
              resumeRead(buffer.length > 0 ? succeed6(takeBuffer()) : fail6(error));
            }
          }
          ws.data.run = push;
          ws.data.onClose = fail;
          yield* addFinalizer2(scope, suspend2(() => {
            fail(new SocketError({
              reason: new SocketCloseError({
                code: 1006
              })
            }));
            ws.data.run = wsDefaultRun;
            ws.data.onClose = constVoid;
            ws.close(1000);
            return void_3;
          }));
          return {
            pull: callback2((resumeRead) => {
              if (buffer.length > 0)
                return resumeRead(succeed6(takeBuffer()));
              if (error !== undefined)
                return resumeRead(fail6(error));
              waiter = resumeRead;
              return sync2(() => {
                if (waiter === resumeRead)
                  waiter = undefined;
              });
            }),
            upgrade: SocketUpgradeError.unsupported
          };
        });
        return make26({
          reader,
          writer
        });
      }));
    });
  }
}
var emptyReadbleStream = /* @__PURE__ */ new ReadableStream({
  start(controller) {
    controller.enqueue(new Uint8Array);
    controller.close();
  }
});
var removeHost = (url) => {
  if (url[0] === "/") {
    return url;
  }
  const index = url.indexOf("/", url.indexOf("//") + 2);
  return index === -1 ? "/" : url.slice(index);
};
// node_modules/effect/dist/Runtime.js
var defaultTeardown = (exit, onExit) => {
  if (isSuccess3(exit))
    return onExit(0);
  if (hasInterruptsOnly2(exit.cause))
    return onExit(130);
  return onExit(getErrorExitCode(squash(exit.cause)));
};
var makeRunMain = (f) => dual((args) => isEffect2(args[0]), (effect, options) => {
  const fiber = options?.disableErrorReporting === true ? runFork2(effect) : runFork2(tapCause2(effect, (cause) => {
    if (hasInterruptsOnly2(cause))
      return void_3;
    const isReported = getErrorReported(squash(cause));
    return isReported ? logError(cause) : void_3;
  }));
  try {
    const keepAlive = globalThis.setInterval(constVoid, 2147483647);
    fiber.addObserver(() => {
      clearInterval(keepAlive);
    });
  } catch {}
  const teardown = options?.teardown ?? defaultTeardown;
  return f({
    fiber,
    teardown
  });
});
var errorExitCode = "~effect/Runtime/errorExitCode";
var getErrorExitCode = (u) => {
  if (typeof u === "object" && u !== null && errorExitCode in u) {
    const code = u[errorExitCode];
    if (typeof code === "number") {
      return code;
    }
  }
  return 1;
};
var errorReported = "~effect/Runtime/errorReported";
var getErrorReported = (u) => {
  if (typeof u === "object" && u !== null && errorReported in u) {
    const isReported = u[errorReported];
    if (typeof isReported === "boolean") {
      return isReported;
    }
  }
  return true;
};

// node_modules/@effect/platform-node-shared/dist/NodeRuntime.js
var runMain = /* @__PURE__ */ makeRunMain(({
  fiber,
  teardown
}) => {
  let receivedSignal = false;
  fiber.addObserver((exit) => {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigint);
    teardown(exit, (code) => {
      if (receivedSignal || code !== 0) {
        process.exit(code);
      }
    });
  });
  function onSigint() {
    receivedSignal = true;
    fiber.interruptUnsafe(fiber.id);
  }
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigint);
});

// node_modules/@effect/platform-bun/dist/BunRuntime.js
var runMain2 = runMain;
// node_modules/effect/dist/unstable/cli/CliError.js
var TypeId43 = "~effect/cli/CliError";
var isCliError = (u) => hasProperty(u, TypeId43);

class UnrecognizedOption extends (/* @__PURE__ */ TaggedError3(`${TypeId43}/UnrecognizedOption`)("UnrecognizedOption", {
  option: String4,
  command: /* @__PURE__ */ optional2(/* @__PURE__ */ ArraySchema(String4)),
  suggestions: /* @__PURE__ */ ArraySchema(String4)
})) {
  [TypeId43] = TypeId43;
  get message() {
    const suggestionText = this.suggestions.length > 0 ? `

  Did you mean this?
    ${this.suggestions.join(`
    `)}` : "";
    const baseMessage = this.command ? `Unrecognized flag: ${this.option} in command ${this.command.join(" ")}` : `Unrecognized flag: ${this.option}`;
    return baseMessage + suggestionText;
  }
}

class DuplicateOption extends (/* @__PURE__ */ TaggedError3(`${TypeId43}/DuplicateOption`)("DuplicateOption", {
  option: String4,
  parentCommand: String4,
  childCommand: String4
})) {
  [TypeId43] = TypeId43;
  get message() {
    return `Duplicate flag name "${this.option}" in parent command "${this.parentCommand}" and subcommand "${this.childCommand}". ` + `Parent will always claim this flag (Mode A semantics). Consider renaming one of them to avoid confusion.`;
  }
}

class MissingOption extends (/* @__PURE__ */ TaggedError3(`${TypeId43}/MissingOption`)("MissingOption", {
  option: String4
})) {
  [TypeId43] = TypeId43;
  get message() {
    return `Missing required flag: --${this.option}`;
  }
}

class MissingArgument extends (/* @__PURE__ */ TaggedError3(`${TypeId43}/MissingArgument`)("MissingArgument", {
  argument: String4
})) {
  [TypeId43] = TypeId43;
  get message() {
    return `Missing required argument: ${this.argument}`;
  }
}

class UnexpectedArgument extends (/* @__PURE__ */ TaggedError3(`${TypeId43}/UnexpectedArgument`)("UnexpectedArgument", {
  arguments: /* @__PURE__ */ ArraySchema(String4)
})) {
  [TypeId43] = TypeId43;
  get message() {
    const label = this.arguments.length === 1 ? "argument" : "arguments";
    return `Unexpected positional ${label}: ${this.arguments.map((value) => JSON.stringify(value)).join(", ")}`;
  }
}

class InvalidValue2 extends (/* @__PURE__ */ TaggedError3(`${TypeId43}/InvalidValue`)("InvalidValue", {
  option: String4,
  value: String4,
  expected: String4,
  kind: /* @__PURE__ */ Union2([/* @__PURE__ */ Literal2("flag"), /* @__PURE__ */ Literal2("argument")])
})) {
  [TypeId43] = TypeId43;
  get message() {
    const expectation = this.expected.startsWith("Expected ") || this.expected.startsWith("Expected:") ? this.expected : `Expected: ${this.expected}`;
    if (this.kind === "argument") {
      return `Invalid value for argument <${this.option}>: "${this.value}". ${expectation}`;
    }
    if (this.value.length === 0) {
      return `Missing value for flag --${this.option}. ${expectation}`;
    }
    return `Invalid value for flag --${this.option}: "${this.value}". ${expectation}`;
  }
}

class UnknownSubcommand extends (/* @__PURE__ */ TaggedError3(`${TypeId43}/UnknownSubcommand`)("UnknownSubcommand", {
  subcommand: String4,
  parent: /* @__PURE__ */ optional2(/* @__PURE__ */ ArraySchema(String4)),
  suggestions: /* @__PURE__ */ ArraySchema(String4)
})) {
  [TypeId43] = TypeId43;
  get message() {
    const suggestionText = this.suggestions.length > 0 ? `

  Did you mean this?
    ${this.suggestions.join(`
    `)}` : "";
    return this.parent ? `Unknown subcommand "${this.subcommand}" for "${this.parent.join(" ")}"${suggestionText}` : `Unknown subcommand "${this.subcommand}"${suggestionText}`;
  }
}

class UserError extends (/* @__PURE__ */ TaggedError3(`${TypeId43}/UserError`)("UserError", {
  cause: /* @__PURE__ */ Defect(),
  userMessage: /* @__PURE__ */ optionalKey2(String4)
})) {
  [TypeId43] = TypeId43;
  [errorReported] = true;
  get message() {
    if (this.userMessage)
      return this.userMessage;
    if (typeof this.cause === "string" && this.cause)
      return this.cause;
    if (this.cause instanceof Error && this.cause.message)
      return this.cause.message;
    return "An error occurred";
  }
}
var NonShowHelpErrors = /* @__PURE__ */ Union2([UnrecognizedOption, DuplicateOption, MissingOption, MissingArgument, UnexpectedArgument, InvalidValue2, UnknownSubcommand, UserError]);

class ShowHelp extends (/* @__PURE__ */ TaggedError3(`${TypeId43}/ShowHelp`)("ShowHelp", {
  commandPath: /* @__PURE__ */ ArraySchema(String4),
  errors: /* @__PURE__ */ ArraySchema(NonShowHelpErrors)
})) {
  [TypeId43] = TypeId43;
  [errorExitCode] = this.errors.length ? 1 : 0;
  [errorReported] = false;
  get message() {
    return "Help requested";
  }
}

// node_modules/effect/dist/unstable/cli/Primitive.js
var TypeId44 = "~effect/cli/Primitive";
var Proto14 = {
  [TypeId44]: {
    _A: identity
  }
};
var isTrueLiteral = /* @__PURE__ */ is2(TrueLiterals);
var isFalseLiteral = /* @__PURE__ */ is2(FalseLiterals);
var isBoolean2 = (p) => p._tag === "Boolean";
var makePrimitive2 = (tag, parse) => Object.assign(Object.create(Proto14), {
  _tag: tag,
  parse
});
var makeSchemaPrimitive = (tag, schema) => {
  const toCodecStringTree = toCodecStringTree2(schema);
  const decode = decodeUnknownEffect2(toCodecStringTree);
  return makePrimitive2(tag, (value) => mapError2(decode(value), (error) => error.message));
};
var Boolean4 = /* @__PURE__ */ makeSchemaPrimitive("Boolean", BooleanLiterals);
var String7 = /* @__PURE__ */ makePrimitive2("String", (value) => succeed6(value));
var Choice = (choices) => {
  const choiceMap = new Map(choices);
  const validChoices = choices.map(([key]) => format(key)).join(" | ");
  const primitive = makePrimitive2("Choice", (value) => {
    if (choiceMap.has(value)) {
      return succeed6(choiceMap.get(value));
    }
    return fail6(validChoices);
  });
  return Object.assign(primitive, {
    choiceKeys: choices.map(([key]) => key)
  });
};
var getTypeName = (primitive) => {
  switch (primitive._tag) {
    case "Boolean":
      return "boolean";
    case "String":
      return "string";
    case "Int":
      return "integer";
    case "Finite":
      return "number";
    case "Date":
      return "date";
    case "Path":
      return "path";
    case "Choice":
      return "choice";
    case "Redacted":
      return "string";
    case "FileText":
      return "file";
    case "FileParse":
      return "file";
    case "FileSchema":
      return "file";
    case "KeyValuePair":
      return "key=value";
    case "Never":
      return "none";
    default:
      return "value";
  }
};
var getChoiceKeys = (primitive) => primitive._tag === "Choice" ? primitive.choiceKeys : undefined;
var getPathType = (primitive) => primitive._tag === "Path" ? primitive.pathType : undefined;

// node_modules/effect/dist/unstable/cli/internal/ansi.js
var ESC = "\x1B[";
var BEL = "\x07";
var SEP = ";";
var reset = `${ESC}0m`;
var bold = `${ESC}1m`;
var italicized = `${ESC}3m`;
var underlined = `${ESC}4m`;
var strikethrough = `${ESC}9m`;
var cursorShow = `${ESC}?25h`;
var cursorHide = `${ESC}?25l`;
var cursorLeft = `${ESC}G`;
var cursorSavePosition = `${ESC}s`;
var cursorRestorePosition = `${ESC}u`;
var eraseLine = `${ESC}2K`;
var beep = BEL;
var red = `${ESC}31m`;
var green = `${ESC}32m`;
var magenta = `${ESC}35m`;
var white = `${ESC}37m`;
var blackBright = `${ESC}90m`;
var cyanBright = `${ESC}96m`;
var annotate2 = (text, ...styles) => {
  const flat = styles.flat();
  return `${flat.join("")}${text}${reset}`;
};
var combine3 = (...styles) => styles;
var cursorTo = (column, row) => {
  if (row === undefined) {
    return `${ESC}${Math.max(column + 1, 0)}G`;
  }
  return `${ESC}${row + 1}${SEP}${Math.max(column + 1, 0)}H`;
};
var cursorDown = (lines = 1) => {
  return `${ESC}${lines}B`;
};
var cursorMove = (column, row = 0) => {
  let command = "";
  if (row < 0) {
    command += `${ESC}${-row}A`;
  }
  if (row > 0) {
    command += `${ESC}${row}B`;
  }
  if (column > 0) {
    command += `${ESC}${column}C`;
  }
  if (column < 0) {
    command += `${ESC}${-column}D`;
  }
  return command;
};
var eraseLines = (rows) => {
  let command = "";
  for (let i = 0;i < rows; i++) {
    command += `${ESC}2K` + (i < rows - 1 ? `${ESC}1A` : "");
  }
  if (rows > 0) {
    command += `${ESC}G`;
  }
  return command;
};

// node_modules/effect/dist/unstable/cli/Prompt.js
var TypeId45 = "~effect/cli/Prompt";
var defaultTheme = {
  prefix: "?",
  arrowUp: "\u2191",
  arrowDown: "\u2193",
  checkboxOn: "\u2612",
  checkboxOff: "\u2610",
  tick: "\u2714",
  ellipsis: "\u2026",
  pointerSmall: "\u203A",
  pointer: "\u276F",
  descriptionSeparator: "- ",
  passwordMask: "*",
  toggleSeparator: "/",
  primaryColor: cyanBright,
  mutedColor: blackBright,
  successColor: green,
  errorColor: red,
  submittedColor: white
};
var windowsTheme = {
  ...defaultTheme,
  checkboxOn: "[*]",
  checkboxOff: "[ ]",
  tick: "\u221A",
  ellipsis: "...",
  pointerSmall: "\xBB",
  pointer: ">"
};
var makeTheme = (options) => ({
  ...process.platform === "win32" ? windowsTheme : defaultTheme,
  ...options
});
var Theme = /* @__PURE__ */ Reference("effect/unstable/cli/Prompt/Theme", {
  defaultValue: makeTheme
});
var getTheme = (options) => map7(Theme, (theme) => ({
  ...theme,
  ...options.theme
}));
var annotateLine = (line) => annotate2(line, bold);
var annotateErrorLine = (line, color) => annotate2(line, combine3(italicized, color));
var annotateSymbol = (symbol, ...styles) => symbol.length === 0 ? "" : annotate2(symbol, ...styles);
var separateSymbol = (symbol, text) => symbol.length === 0 ? text : symbol + " " + text;
var renderPagingPrefix = (theme, showArrowUp, showArrowDown) => {
  const width = Math.max(theme.arrowUp.length, theme.arrowDown.length);
  if (showArrowUp) {
    return theme.arrowUp.padEnd(width);
  }
  if (showArrowDown) {
    return theme.arrowDown.padEnd(width);
  }
  return " ".repeat(width);
};
var Confirm = (options) => {
  const opts = {
    initial: false,
    ...options,
    label: {
      confirm: "yes",
      deny: "no",
      ...options.label
    },
    placeholder: {
      defaultConfirm: "(Y/n)",
      defaultDeny: "(y/N)",
      ...options.placeholder
    }
  };
  const initialState = {
    value: opts.initial
  };
  return Custom(initialState, {
    render: handleConfirmRender(opts),
    process: (input) => handleConfirmProcess(input, opts.initial),
    clear: handleConfirmClear(opts)
  });
};
var Custom = (initialState, ...args) => {
  const [events, handlers] = args.length === 1 ? [undefined, args[0]] : [args[0], args[1]];
  const op = Object.create(proto);
  op._tag = "Loop";
  op.initialState = initialState;
  op.render = handlers.render;
  op.process = handlers.process;
  op.clear = handlers.clear;
  op.events = events;
  return op;
};
var Date4 = (options) => {
  const opts = {
    initial: new globalThis.Date,
    dateMask: "YYYY-MM-DD HH:mm:ss",
    validate: succeed6,
    ...options,
    locales: {
      ...defaultLocales,
      ...options.locales
    }
  };
  const dateParts = makeDateParts(opts.dateMask, opts.initial, opts.locales);
  const initialCursorPosition = dateParts.findIndex((part) => !part.isToken());
  const initialState = {
    dateParts,
    typed: "",
    cursor: initialCursorPosition,
    value: opts.initial,
    error: none2()
  };
  return Custom(initialState, {
    render: handleDateRender(opts),
    process: handleDateProcess(opts),
    clear: handleDateClear(opts)
  });
};
var flatMap7 = /* @__PURE__ */ dual(2, (self, f) => {
  const op = Object.create(proto);
  op._tag = "OnSuccess";
  op.prompt = self;
  op.onSuccess = f;
  return op;
});
var Number8 = (options) => {
  const opts = {
    default: 0,
    min: globalThis.Number.NEGATIVE_INFINITY,
    max: globalThis.Number.POSITIVE_INFINITY,
    incrementBy: 1,
    decrementBy: 1,
    precision: 2,
    validate: (n) => {
      if (n < opts.min) {
        return fail6(`${n} must be greater than or equal to ${opts.min}`);
      }
      if (n > opts.max) {
        return fail6(`${n} must be less than or equal to ${opts.max}`);
      }
      return succeed6(n);
    },
    ...options
  };
  const initialValue = options.default === undefined ? "" : `${opts.default}`;
  const initialState = {
    cursor: initialValue.length,
    value: initialValue,
    error: none2()
  };
  return Custom(initialState, {
    render: handleRenderFloat(opts),
    process: handleProcessFloat(opts),
    clear: handleNumberClear(opts)
  });
};
var Int3 = (options) => {
  const opts = {
    default: 0,
    min: globalThis.Number.NEGATIVE_INFINITY,
    max: globalThis.Number.POSITIVE_INFINITY,
    incrementBy: 1,
    decrementBy: 1,
    validate: (n) => {
      if (n < opts.min) {
        return fail6(`${n} must be greater than or equal to ${opts.min}`);
      }
      if (n > opts.max) {
        return fail6(`${n} must be less than or equal to ${opts.max}`);
      }
      return succeed6(n);
    },
    ...options
  };
  const initialValue = options.default === undefined ? "" : `${opts.default}`;
  const initialState = {
    cursor: initialValue.length,
    value: initialValue,
    error: none2()
  };
  return Custom(initialState, {
    render: handleRenderInteger(opts),
    process: handleProcessInteger(opts),
    clear: handleNumberClear(opts)
  });
};
var map10 = /* @__PURE__ */ dual(2, (self, f) => flatMap7(self, (a) => succeed10(f(a))));
var Password = (options) => basePrompt(options, "password").pipe(map10(make17));
var run3 = /* @__PURE__ */ fnUntraced2(function* (self) {
  const terminal = yield* Terminal;
  const input = yield* terminal.readInput;
  return yield* runWithInput(self, terminal, input);
}, /* @__PURE__ */ mapError2(() => new QuitError({})), scoped2);
var getSelectInitialIndex = (choices) => {
  let initialIndex = 0;
  let seenSelected = -1;
  for (let i = 0;i < choices.length; i++) {
    const choice = choices[i];
    if (choice.selected === true) {
      if (seenSelected !== -1) {
        throw new Error("InvalidArgumentException: only a single choice can be selected by default for Prompt.Select");
      }
      seenSelected = i;
    }
  }
  if (seenSelected !== -1) {
    initialIndex = seenSelected;
  }
  return initialIndex;
};
var Select = (options) => {
  const opts = {
    maxPerPage: 10,
    ...options
  };
  const initialIndex = getSelectInitialIndex(opts.choices);
  return Custom(initialIndex, {
    render: handleSelectRender(opts),
    process: handleSelectProcess(opts),
    clear: handleSelectClear(opts)
  });
};
var succeed10 = (value) => {
  const op = Object.create(proto);
  op._tag = "Succeed";
  op.value = value;
  return op;
};
var String8 = (options) => basePrompt(options, "text");
var Toggle = (options) => {
  const opts = {
    initial: false,
    active: "on",
    inactive: "off",
    ...options
  };
  return Custom(opts.initial, {
    render: handleToggleRender(opts),
    process: handleToggleProcess,
    clear: () => handleToggleClear(opts)
  });
};
var proto = {
  .../* @__PURE__ */ Prototype2({
    label: "Prompt",
    evaluate() {
      return run3(this);
    }
  }),
  [TypeId45]: {
    _Output: (_) => _
  }
};
var runWithInput = (prompt, terminal, input) => suspend2(() => {
  const op = prompt;
  switch (op._tag) {
    case "Loop": {
      return runLoop(op, terminal, input);
    }
    case "OnSuccess": {
      return flatMap5(runWithInput(op.prompt, terminal, input), (a) => runWithInput(op.onSuccess(a), terminal, input));
    }
    case "Succeed": {
      return succeed6(op.value);
    }
  }
});
var runLoop = /* @__PURE__ */ fnUntraced2(function* (loop, terminal, input) {
  let state = isEffect2(loop.initialState) ? yield* loop.initialState : loop.initialState;
  let action = Action.NextFrame({
    state
  });
  let clear = "";
  while (true) {
    const msg = yield* loop.render(state, action);
    yield* orDie2(terminal.display(clear + msg));
    clear = "";
    if (loop.events) {
      const takeInput = take2(input).pipe(map7((input) => ({
        _tag: "Input",
        input
      })));
      const result = yield* raceFirst2(takeInput, take2(loop.events).pipe(map7((value) => ({
        _tag: "Event",
        value
      }))));
      action = yield* loop.process(result, state);
    } else {
      const result = yield* take2(input);
      action = yield* loop.process(result, state);
    }
    switch (action._tag) {
      case "Beep":
        continue;
      case "NextFrame": {
        clear = yield* loop.clear(state, action);
        state = action.state;
        continue;
      }
      case "Submit": {
        clear = yield* loop.clear(state, action);
        const msg = yield* loop.render(state, action);
        yield* orDie2(terminal.display(clear + msg));
        return action.value;
      }
    }
  }
}, (effect, _, terminal) => ensuring2(effect, orDie2(terminal.display(cursorShow))));
var Action = /* @__PURE__ */ taggedEnum();
var eraseText = (text, columns) => {
  if (columns === 0) {
    return eraseLine + cursorTo(0);
  }
  let rows = 0;
  const lines = text.split(NEWLINE_REGEXP);
  for (const line of lines) {
    rows += 1 + Math.floor(Math.max(line.length - 1, 0) / columns);
  }
  return eraseLines(rows);
};
var lines = (prompt, columns) => {
  const lines = prompt.split(NEWLINE_REGEXP);
  return columns === 0 ? lines.length : pipe(map4(lines, (line) => Math.ceil(line.length / columns)), reduce(0, (left, right) => left + right));
};
var clearOutputWithError = (outputText, columns, errorText) => {
  if (errorText !== undefined && errorText.length > 0) {
    return cursorDown(lines(errorText, columns)) + eraseText(`
${errorText}`, columns) + eraseText(outputText, columns);
  }
  return eraseText(outputText, columns);
};
var renderBeep = beep;
var NEWLINE_REGEXP = /\r?\n/;
var handleConfirmClear = (options) => {
  return fnUntraced2(function* (state, _) {
    const terminal = yield* Terminal;
    const columns = yield* terminal.columns;
    const figures = yield* getTheme(options);
    const confirmMessage = state.value ? options.placeholder.defaultConfirm : options.placeholder.defaultDeny;
    const promptText = renderConfirmOutput(confirmMessage, figures.prefix, figures.pointerSmall, options, {
      plain: true
    });
    const clearOutput = eraseText(promptText, columns);
    const resetCurrentLine = eraseLine + cursorLeft;
    return clearOutput + resetCurrentLine;
  });
};
var renderConfirmOutput = (confirm, leadingSymbol, trailingSymbol, options, renderOptions) => renderPrompt(confirm, options.message, leadingSymbol, trailingSymbol, renderOptions);
var renderConfirmNextFrame = /* @__PURE__ */ fnUntraced2(function* (state, options) {
  const figures = yield* getTheme(options);
  const leadingSymbol = annotateSymbol(figures.prefix, figures.primaryColor);
  const trailingSymbol = annotateSymbol(figures.pointerSmall, figures.mutedColor);
  const confirmMessage = state.value ? options.placeholder.defaultConfirm : options.placeholder.defaultDeny;
  const confirm = annotate2(confirmMessage, figures.mutedColor);
  const promptMsg = renderConfirmOutput(confirm, leadingSymbol, trailingSymbol, options);
  return cursorHide + promptMsg;
});
var renderConfirmSubmission = /* @__PURE__ */ fnUntraced2(function* (value, options) {
  const figures = yield* getTheme(options);
  const leadingSymbol = annotateSymbol(figures.tick, figures.successColor);
  const trailingSymbol = annotateSymbol(figures.ellipsis, figures.mutedColor);
  const confirmMessage = value ? options.label.confirm : options.label.deny;
  const promptMsg = renderConfirmOutput(confirmMessage, leadingSymbol, trailingSymbol, options);
  return promptMsg + `
`;
});
var handleConfirmRender = (options) => {
  return (_, action) => {
    return Action.$match(action, {
      Beep: () => succeed6(renderBeep),
      NextFrame: ({
        state
      }) => renderConfirmNextFrame(state, options),
      Submit: ({
        value
      }) => renderConfirmSubmission(value, options)
    });
  };
};
var TRUE_VALUE_REGEXP = /^y|t$/;
var FALSE_VALUE_REGEXP = /^n|f$/;
var handleConfirmProcess = (input, defaultValue) => {
  const value = getOrElse(input.input, () => "");
  if (input.key.name === "enter" || input.key.name === "return") {
    return succeed6(Action.Submit({
      value: defaultValue
    }));
  }
  if (TRUE_VALUE_REGEXP.test(value.toLowerCase())) {
    return succeed6(Action.Submit({
      value: true
    }));
  }
  if (FALSE_VALUE_REGEXP.test(value.toLowerCase())) {
    return succeed6(Action.Submit({
      value: false
    }));
  }
  return succeed6(Action.Beep());
};
var handleDateClear = (options) => {
  return fnUntraced2(function* (state, _) {
    const terminal = yield* Terminal;
    const columns = yield* terminal.columns;
    const figures = yield* getTheme(options);
    const resetCurrentLine = eraseLine + cursorLeft;
    const parts = reduce(state.dateParts, "", (doc, part) => doc + part.toString());
    const promptText = renderDateOutput(figures.prefix, figures.pointerSmall, parts, options, {
      plain: true
    });
    const errorText = isSome2(state.error) ? match3(state.error.value.split(NEWLINE_REGEXP), {
      onEmpty: () => "",
      onNonEmpty: (errorLines) => separateSymbol(figures.pointerSmall, errorLines.join(`
`))
    }) : "";
    const clearOutput = clearOutputWithError(promptText, columns, errorText);
    return clearOutput + resetCurrentLine;
  });
};
var renderDateError = (state, pointer, theme) => {
  if (isSome2(state.error)) {
    const errorLines = state.error.value.split(NEWLINE_REGEXP);
    if (isReadonlyArrayNonEmpty(errorLines)) {
      const prefix = annotateSymbol(pointer, theme.errorColor);
      const lines = map4(errorLines, (str) => annotateErrorLine(str, theme.errorColor));
      return cursorSavePosition + `
` + separateSymbol(prefix, lines.join(`
`)) + cursorRestorePosition;
    }
  }
  return "";
};
var renderParts = (state, theme, submitted = false) => {
  return reduce(state.dateParts, "", (doc, part, currentIndex) => {
    const partDoc = part.toString();
    if (currentIndex === state.cursor && !submitted) {
      const annotation = combine3(underlined, theme.primaryColor);
      return doc + annotate2(partDoc, annotation);
    }
    return doc + partDoc;
  });
};
var renderDateOutput = (leadingSymbol, trailingSymbol, parts, options, renderOptions) => renderPrompt(parts, options.message, leadingSymbol, trailingSymbol, renderOptions);
var renderDateNextFrame = /* @__PURE__ */ fnUntraced2(function* (state, options) {
  const figures = yield* getTheme(options);
  const leadingSymbol = annotateSymbol(figures.prefix, figures.primaryColor);
  const trailingSymbol = annotateSymbol(figures.pointerSmall, figures.mutedColor);
  const parts = renderParts(state, figures);
  const promptMsg = renderDateOutput(leadingSymbol, trailingSymbol, parts, options);
  const errorMsg = renderDateError(state, figures.pointerSmall, figures);
  return cursorHide + promptMsg + errorMsg;
});
var renderDateSubmission = /* @__PURE__ */ fnUntraced2(function* (state, options) {
  const figures = yield* getTheme(options);
  const leadingSymbol = annotateSymbol(figures.tick, figures.successColor);
  const trailingSymbol = annotateSymbol(figures.ellipsis, figures.mutedColor);
  const parts = renderParts(state, figures, true);
  const promptMsg = renderDateOutput(leadingSymbol, trailingSymbol, parts, options);
  return promptMsg + `
`;
});
var processUp = (state) => {
  state.dateParts[state.cursor].increment();
  return Action.NextFrame({
    state: {
      ...state,
      typed: ""
    }
  });
};
var processDown = (state) => {
  state.dateParts[state.cursor].decrement();
  return Action.NextFrame({
    state: {
      ...state,
      typed: ""
    }
  });
};
var processDateCursorLeft = (state) => {
  const previous = state.dateParts[state.cursor].previousPart();
  if (isSome2(previous)) {
    return Action.NextFrame({
      state: {
        ...state,
        typed: "",
        cursor: state.dateParts.indexOf(previous.value)
      }
    });
  }
  return Action.Beep();
};
var processDateCursorRight = (state) => {
  const next = state.dateParts[state.cursor].nextPart();
  if (isSome2(next)) {
    return Action.NextFrame({
      state: {
        ...state,
        typed: "",
        cursor: state.dateParts.indexOf(next.value)
      }
    });
  }
  return Action.Beep();
};
var processDateNext = (state) => {
  const next = state.dateParts[state.cursor].nextPart();
  const cursor = match(next, {
    onNone: () => state.dateParts.findIndex((part) => !part.isToken()),
    onSome: (next) => state.dateParts.indexOf(next)
  });
  return Action.NextFrame({
    state: {
      ...state,
      typed: "",
      cursor
    }
  });
};
var defaultDateProcessor = (value, state) => {
  if (/\d/.test(value)) {
    const typed = state.typed + value;
    state.dateParts[state.cursor].setValue(typed);
    return Action.NextFrame({
      state: {
        ...state,
        typed
      }
    });
  }
  return Action.Beep();
};
var defaultLocales = {
  months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  weekdaysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
};
var handleDateRender = (options) => {
  return (state, action) => {
    return Action.$match(action, {
      Beep: () => succeed6(renderBeep),
      NextFrame: ({
        state
      }) => renderDateNextFrame(state, options),
      Submit: () => renderDateSubmission(state, options)
    });
  };
};
var handleDateProcess = (options) => {
  return (input, state) => {
    switch (input.key.name) {
      case "left": {
        return succeed6(processDateCursorLeft(state));
      }
      case "right": {
        return succeed6(processDateCursorRight(state));
      }
      case "k":
      case "up": {
        return succeed6(processUp(state));
      }
      case "j":
      case "down": {
        return succeed6(processDown(state));
      }
      case "tab": {
        return succeed6(processDateNext(state));
      }
      case "enter":
      case "return": {
        return match6(options.validate(state.value), {
          onFailure: (error) => Action.NextFrame({
            state: {
              ...state,
              error: some2(error)
            }
          }),
          onSuccess: (value) => Action.Submit({
            value
          })
        });
      }
      default: {
        return succeed6(defaultDateProcessor(getOrElse(input.input, () => ""), state));
      }
    }
  };
};
var DATE_PART_REGEXP = /\\(.)|"((?:\\["\\]|[^"])+)"|(D[Do]?|d{3,4}|d)|(M{1,4})|(YY(?:YY)?)|([aA])|([Hh]{1,2})|(m{1,2})|(s{1,2})|(S{1,4})|./g;
var regExpGroups = {
  1: ({
    token,
    ...opts
  }) => new Token({
    token: token.replace(/\\(.)/g, "$1"),
    ...opts
  }),
  2: (opts) => new Day(opts),
  3: (opts) => new Month(opts),
  4: (opts) => new Year(opts),
  5: (opts) => new Meridiem(opts),
  6: (opts) => new Hours(opts),
  7: (opts) => new Minutes(opts),
  8: (opts) => new Seconds(opts),
  9: (opts) => new Milliseconds(opts)
};
var makeDateParts = (dateMask, date, locales) => {
  const parts = [];
  let result = null;
  while (result = DATE_PART_REGEXP.exec(dateMask)) {
    const match = result.shift();
    const index = result.findIndex((group) => group !== undefined);
    if (index in regExpGroups) {
      const token = result[index] || match;
      parts.push(regExpGroups[index]({
        token,
        date,
        parts,
        locales
      }));
    } else {
      parts.push(new Token({
        token: result[index] || match,
        date,
        parts,
        locales
      }));
    }
  }
  const orderedParts = parts.reduce((array, element) => {
    const lastElement = array[array.length - 1];
    if (element.isToken() && lastElement !== undefined && lastElement.isToken()) {
      lastElement.setValue(element.token);
    } else {
      array.push(element);
    }
    return array;
  }, empty());
  parts.splice(0, parts.length, ...orderedParts);
  return parts;
};

class DatePart {
  token;
  date;
  parts;
  locales;
  constructor(params) {
    this.token = params.token;
    this.locales = params.locales;
    this.date = params.date || new globalThis.Date;
    this.parts = params.parts || [this];
  }
  isToken() {
    return false;
  }
  nextPart() {
    const currentPartIndex = getOrElse(findFirstIndex(this.parts, (part) => part === this), () => 0);
    return findFirst2(this.parts.slice(currentPartIndex + 1), (part) => !part.isToken());
  }
  previousPart() {
    const currentPartIndex = findFirstIndex(this.parts, (part) => part === this);
    if (isSome2(currentPartIndex)) {
      return findLast(this.parts.slice(0, currentPartIndex.value), (part) => !part.isToken());
    }
    return none2();
  }
  toString() {
    return globalThis.String(this.date);
  }
}

class Token extends DatePart {
  increment() {}
  decrement() {}
  setValue(value) {
    this.token = this.token + value;
  }
  isToken() {
    return true;
  }
  toString() {
    return this.token;
  }
}

class Milliseconds extends DatePart {
  increment() {
    this.date.setMilliseconds(this.date.getMilliseconds() + 1);
  }
  decrement() {
    this.date.setMilliseconds(this.date.getMilliseconds() - 1);
  }
  setValue(value) {
    this.date.setMilliseconds(globalThis.Number.parseInt(value.slice(-this.token.length)));
  }
  toString() {
    const millis = `${this.date.getMilliseconds()}`;
    return millis.padStart(4, "0").substring(0, this.token.length);
  }
}

class Seconds extends DatePart {
  increment() {
    this.date.setSeconds(this.date.getSeconds() + 1);
  }
  decrement() {
    this.date.setSeconds(this.date.getSeconds() - 1);
  }
  setValue(value) {
    this.date.setSeconds(globalThis.Number.parseInt(value.slice(-2)));
  }
  toString() {
    const seconds = `${this.date.getSeconds()}`;
    return this.token.length > 1 ? seconds.padStart(2, "0") : seconds;
  }
}

class Minutes extends DatePart {
  increment() {
    this.date.setMinutes(this.date.getMinutes() + 1);
  }
  decrement() {
    this.date.setMinutes(this.date.getMinutes() - 1);
  }
  setValue(value) {
    this.date.setMinutes(globalThis.Number.parseInt(value.slice(-2)));
  }
  toString() {
    const minutes = `${this.date.getMinutes()}`;
    return this.token.length > 1 ? minutes.padStart(2, "0") : minutes;
  }
}

class Hours extends DatePart {
  increment() {
    this.date.setHours(this.date.getHours() + 1);
  }
  decrement() {
    this.date.setHours(this.date.getHours() - 1);
  }
  setValue(value) {
    this.date.setHours(globalThis.Number.parseInt(value.slice(-2)));
  }
  toString() {
    const hours = /h/.test(this.token) ? this.date.getHours() % 12 || 12 : this.date.getHours();
    return this.token.length > 1 ? `${hours}`.padStart(2, "0") : `${hours}`;
  }
}

class Day extends DatePart {
  increment() {
    this.date.setDate(this.date.getDate() + 1);
  }
  decrement() {
    this.date.setDate(this.date.getDate() - 1);
  }
  setValue(value) {
    this.date.setDate(globalThis.Number.parseInt(value.slice(-2)));
  }
  toString() {
    const date = this.date.getDate();
    const day = this.date.getDay();
    switch (this.token) {
      case "DD":
        return `${date}`.padStart(2, "0");
      case "Do":
        return `${date}${this.ordinalIndicator(date)}`;
      case "d":
        return `${day + 1}`;
      case "ddd":
        return this.locales.weekdaysShort[day];
      case "dddd":
        return this.locales.weekdays[day];
      default:
        return `${date}`;
    }
  }
  ordinalIndicator(day) {
    if (day >= 11 && day <= 13) {
      return "th";
    }
    switch (day % 10) {
      case 1:
        return "st";
      case 2:
        return "nd";
      case 3:
        return "rd";
      default:
        return "th";
    }
  }
}

class Month extends DatePart {
  increment() {
    this.date.setMonth(this.date.getMonth() + 1);
  }
  decrement() {
    this.date.setMonth(this.date.getMonth() - 1);
  }
  setValue(value) {
    const month = globalThis.Number.parseInt(value.slice(-2)) - 1;
    this.date.setMonth(month < 0 ? 0 : month);
  }
  toString() {
    const month = this.date.getMonth();
    switch (this.token.length) {
      case 2:
        return `${month + 1}`.padStart(2, "0");
      case 3:
        return this.locales.monthsShort[month];
      case 4:
        return this.locales.months[month];
      default:
        return `${month + 1}`;
    }
  }
}

class Year extends DatePart {
  increment() {
    this.date.setFullYear(this.date.getFullYear() + 1);
  }
  decrement() {
    this.date.setFullYear(this.date.getFullYear() - 1);
  }
  setValue(value) {
    this.date.setFullYear(globalThis.Number.parseInt(value.slice(-4)));
  }
  toString() {
    const year = `${this.date.getFullYear()}`.padStart(4, "0");
    return this.token.length === 2 ? year.slice(-2) : year;
  }
}

class Meridiem extends DatePart {
  increment() {
    this.date.setHours((this.date.getHours() + 12) % 24);
  }
  decrement() {
    this.increment();
  }
  setValue(_value) {}
  toString() {
    const meridiem = this.date.getHours() >= 12 ? "pm" : "am";
    return /A/.test(this.token) ? meridiem.toUpperCase() : meridiem;
  }
}
var renderPrompt = (confirm, message, leadingSymbol, trailingSymbol, options) => {
  const prefix = leadingSymbol.length === 0 ? "" : leadingSymbol + " ";
  const renderLine = (line) => {
    let output = prefix + line;
    if (trailingSymbol.length > 0) {
      output += " " + trailingSymbol;
    }
    if (confirm.length > 0) {
      output += " " + confirm;
    } else if (trailingSymbol.length > 0) {
      output += " ";
    }
    return output;
  };
  const annotate = options?.plain === true ? (line) => line : annotateLine;
  return match3(message.split(NEWLINE_REGEXP), {
    onEmpty: () => renderLine(""),
    onNonEmpty: (promptLines) => {
      const lines = map4(promptLines, (line) => annotate(line));
      return renderLine(lines.join(`
`));
    }
  });
};
var renderChoiceDescription = (choice, isActive, theme, renderOptions) => {
  if (!choice.disabled && choice.description && isActive) {
    const text = theme.descriptionSeparator + choice.description;
    return renderOptions?.plain === true ? text : annotate2(text, theme.mutedColor);
  }
  return "";
};
var handleNumberClear = (options) => {
  return fnUntraced2(function* (state, _) {
    const terminal = yield* Terminal;
    const columns = yield* terminal.columns;
    const figures = yield* getTheme(options);
    const resetCurrentLine = eraseLine + cursorLeft;
    const errorText = renderNumberError(state, figures.pointerSmall, figures, {
      plain: true
    });
    const promptText = renderNumberOutput(state, figures.prefix, figures.pointerSmall, options, figures, {
      plain: true
    });
    const clearOutput = clearOutputWithError(promptText, columns, errorText);
    return clearOutput + resetCurrentLine;
  });
};
var renderNumberInput = (state, submitted, theme, renderOptions) => {
  const value = state.value === "" ? "" : `${state.value}`;
  if (submitted || renderOptions?.plain === true) {
    return value;
  }
  const annotation = isSome2(state.error) ? theme.errorColor : combine3(underlined, theme.primaryColor);
  return annotate2(value, annotation);
};
var renderNumberError = (state, pointer, theme, renderOptions) => {
  if (isSome2(state.error)) {
    return match3(state.error.value.split(NEWLINE_REGEXP), {
      onEmpty: () => "",
      onNonEmpty: (errorLines) => {
        if (renderOptions?.plain === true) {
          return separateSymbol(pointer, errorLines.join(`
`));
        }
        const prefix = annotateSymbol(pointer, theme.errorColor);
        const lines = map4(errorLines, (str) => annotateErrorLine(str, theme.errorColor));
        return cursorSavePosition + `
` + separateSymbol(prefix, lines.join(`
`)) + cursorRestorePosition;
      }
    });
  }
  return "";
};
var renderNumberOutput = (state, leadingSymbol, trailingSymbol, options, theme, renderOptions, submitted = false) => {
  const value = renderNumberInput(state, submitted, theme, renderOptions);
  return renderPrompt(value, options.message, leadingSymbol, trailingSymbol, renderOptions);
};
var renderNumberNextFrame = /* @__PURE__ */ fnUntraced2(function* (state, options) {
  const figures = yield* getTheme(options);
  const leadingSymbol = annotateSymbol(figures.prefix, figures.primaryColor);
  const trailingSymbol = annotateSymbol(figures.pointerSmall, figures.mutedColor);
  const errorMsg = renderNumberError(state, figures.pointerSmall, figures);
  const promptMsg = renderNumberOutput(state, leadingSymbol, trailingSymbol, options, figures);
  return promptMsg + errorMsg;
});
var renderNumberSubmission = /* @__PURE__ */ fnUntraced2(function* (nextState, options) {
  const figures = yield* getTheme(options);
  const leadingSymbol = annotateSymbol(figures.tick, figures.successColor);
  const trailingSymbol = annotateSymbol(figures.ellipsis, figures.mutedColor);
  const promptMsg = renderNumberOutput(nextState, leadingSymbol, trailingSymbol, options, figures, undefined, true);
  return promptMsg + `
`;
});
var processNumberBackspace = (state) => {
  if (state.value.length <= 0) {
    return succeed6(Action.Beep());
  }
  const value = state.value.slice(0, state.value.length - 1);
  return succeed6(Action.NextFrame({
    state: {
      ...state,
      value,
      error: none2()
    }
  }));
};
var processNumberClear = (state) => succeed6(Action.NextFrame({
  state: {
    ...state,
    cursor: 0,
    value: "",
    error: none2()
  }
}));
var defaultIntProcessor = (input, state) => {
  if (state.value.length === 0 && input === "-") {
    return succeed6(Action.NextFrame({
      state: {
        ...state,
        value: "-",
        error: none2()
      }
    }));
  }
  const parsed = globalThis.Number.parseInt(state.value + input);
  if (globalThis.Number.isNaN(parsed)) {
    return succeed6(Action.Beep());
  } else {
    return succeed6(Action.NextFrame({
      state: {
        ...state,
        value: `${parsed}`,
        error: none2()
      }
    }));
  }
};
var defaultFloatProcessor = (input, state) => {
  if (input === "." && state.value.includes(".")) {
    return succeed6(Action.Beep());
  }
  if (state.value.length === 0 && input === "-") {
    return succeed6(Action.NextFrame({
      state: {
        ...state,
        value: "-",
        error: none2()
      }
    }));
  }
  const parsed = globalThis.Number.parseFloat(state.value + input);
  if (globalThis.Number.isNaN(parsed)) {
    return succeed6(Action.Beep());
  } else {
    return succeed6(Action.NextFrame({
      state: {
        ...state,
        value: input === "." ? `${parsed}.` : state.value.includes(".") && /^\d$/.test(input) ? state.value + input : `${parsed}`,
        error: none2()
      }
    }));
  }
};
var handleRenderInteger = (options) => {
  return (state, action) => {
    return Action.$match(action, {
      Beep: () => succeed6(renderBeep),
      NextFrame: ({
        state
      }) => renderNumberNextFrame(state, options),
      Submit: () => renderNumberSubmission(state, options)
    });
  };
};
var handleProcessInteger = (options) => {
  return (input, state) => {
    if (input.key.ctrl && input.key.name === "u") {
      return processNumberClear(state);
    }
    switch (input.key.name) {
      case "backspace": {
        return processNumberBackspace(state);
      }
      case "k":
      case "up": {
        return succeed6(Action.NextFrame({
          state: {
            ...state,
            value: state.value === "" || state.value === "-" ? `${options.incrementBy}` : `${globalThis.Number.parseInt(state.value) + options.incrementBy}`,
            error: none2()
          }
        }));
      }
      case "j":
      case "down": {
        return succeed6(Action.NextFrame({
          state: {
            ...state,
            value: state.value === "" || state.value === "-" ? `-${options.decrementBy}` : `${globalThis.Number.parseInt(state.value) - options.decrementBy}`,
            error: none2()
          }
        }));
      }
      case "enter":
      case "return": {
        const parsed = globalThis.Number.parseInt(state.value);
        if (globalThis.Number.isNaN(parsed)) {
          return succeed6(Action.NextFrame({
            state: {
              ...state,
              error: some2("Must provide an integer value")
            }
          }));
        } else {
          return match6(options.validate(parsed), {
            onFailure: (error) => Action.NextFrame({
              state: {
                ...state,
                error: some2(error)
              }
            }),
            onSuccess: (value) => Action.Submit({
              value
            })
          });
        }
      }
      default: {
        return defaultIntProcessor(getOrElse(input.input, () => ""), state);
      }
    }
  };
};
var handleRenderFloat = (options) => {
  return (state, action) => {
    return Action.$match(action, {
      Beep: () => succeed6(renderBeep),
      NextFrame: ({
        state
      }) => renderNumberNextFrame(state, options),
      Submit: () => renderNumberSubmission(state, options)
    });
  };
};
var handleProcessFloat = (options) => {
  return (input, state) => {
    if (input.key.ctrl && input.key.name === "u") {
      return processNumberClear(state);
    }
    switch (input.key.name) {
      case "backspace": {
        return processNumberBackspace(state);
      }
      case "k":
      case "up": {
        return succeed6(Action.NextFrame({
          state: {
            ...state,
            value: state.value === "" || state.value === "-" ? `${options.incrementBy}` : `${globalThis.Number.parseFloat(state.value) + options.incrementBy}`,
            error: none2()
          }
        }));
      }
      case "j":
      case "down": {
        return succeed6(Action.NextFrame({
          state: {
            ...state,
            value: state.value === "" || state.value === "-" ? `-${options.decrementBy}` : `${globalThis.Number.parseFloat(state.value) - options.decrementBy}`,
            error: none2()
          }
        }));
      }
      case "enter":
      case "return": {
        const parsed = globalThis.Number.parseFloat(state.value);
        if (globalThis.Number.isNaN(parsed)) {
          return succeed6(Action.NextFrame({
            state: {
              ...state,
              error: some2("Must provide a floating point value")
            }
          }));
        } else {
          return flatMap5(sync2(() => round(parsed, options.precision)), (rounded) => match6(options.validate(rounded), {
            onFailure: (error) => Action.NextFrame({
              state: {
                ...state,
                error: some2(error)
              }
            }),
            onSuccess: (value) => Action.Submit({
              value
            })
          }));
        }
      }
      default: {
        return defaultFloatProcessor(getOrElse(input.input, () => ""), state);
      }
    }
  };
};
var renderSelectOutput = (leadingSymbol, trailingSymbol, options, renderOptions) => options.message === undefined ? undefined : renderPrompt("", options.message, leadingSymbol, trailingSymbol, renderOptions);
var withSelectHeader = (header, body) => header === undefined ? body : header + `
` + body;
var renderChoicePrefix = (state, choices, toDisplay, currentIndex, figures, renderOptions) => {
  const prefix = renderPagingPrefix(figures, currentIndex === toDisplay.startIndex && toDisplay.startIndex > 0, currentIndex === toDisplay.endIndex - 1 && toDisplay.endIndex < choices.length);
  if (renderOptions?.plain === true) {
    return state === currentIndex ? figures.pointer + prefix : prefix + " ".repeat(figures.pointer.length);
  }
  if (choices[currentIndex].disabled) {
    const annotation = combine3(bold, figures.mutedColor);
    return state === currentIndex ? annotateSymbol(figures.pointer, annotation) + prefix : prefix + " ".repeat(figures.pointer.length);
  }
  return state === currentIndex ? annotateSymbol(figures.pointer, figures.primaryColor) + prefix : prefix + " ".repeat(figures.pointer.length);
};
var renderChoiceTitle = (choice, isSelected, theme, renderOptions) => {
  if (renderOptions?.plain === true) {
    return choice.title;
  }
  const title = choice.title;
  if (isSelected) {
    return choice.disabled ? annotate2(title, combine3(underlined, theme.mutedColor)) : annotate2(title, combine3(underlined, theme.primaryColor));
  }
  return choice.disabled ? annotate2(title, combine3(strikethrough, theme.mutedColor)) : title;
};
var renderSelectChoices = (state, options, figures, renderOptions) => {
  const choices = options.choices;
  const toDisplay = entriesToDisplay(state, choices.length, options.maxPerPage);
  const documents = [];
  for (let index = toDisplay.startIndex;index < toDisplay.endIndex; index++) {
    const choice = choices[index];
    const isSelected = state === index;
    const prefix = renderChoicePrefix(state, choices, toDisplay, index, figures, renderOptions);
    const title = renderChoiceTitle(choice, isSelected, figures, renderOptions);
    const description = renderChoiceDescription(choice, isSelected, figures, renderOptions);
    documents.push(prefix + title + " " + description);
  }
  return documents.join(`
`);
};
var renderSelectNextFrame = /* @__PURE__ */ fnUntraced2(function* (state, options) {
  const figures = yield* getTheme(options);
  const choices = renderSelectChoices(state, options, figures);
  const leadingSymbol = annotateSymbol(figures.prefix, figures.primaryColor);
  const trailingSymbol = annotateSymbol(figures.pointerSmall, figures.mutedColor);
  const promptMsg = renderSelectOutput(leadingSymbol, trailingSymbol, options);
  return cursorHide + withSelectHeader(promptMsg, choices);
});
var renderSelectSubmission = /* @__PURE__ */ fnUntraced2(function* (state, options) {
  const figures = yield* getTheme(options);
  const selected = options.choices[state].title;
  const leadingSymbol = annotateSymbol(figures.tick, figures.successColor);
  const trailingSymbol = annotateSymbol(figures.ellipsis, figures.mutedColor);
  const promptMsg = renderSelectOutput(leadingSymbol, trailingSymbol, options) ?? leadingSymbol;
  return promptMsg + " " + annotate2(selected, figures.submittedColor) + `
`;
});
var processSelectCursorUp = (state, choices) => {
  if (state === 0) {
    return succeed6(Action.NextFrame({
      state: choices.length - 1
    }));
  }
  return succeed6(Action.NextFrame({
    state: state - 1
  }));
};
var processSelectCursorDown = (state, choices) => {
  if (state === choices.length - 1) {
    return succeed6(Action.NextFrame({
      state: 0
    }));
  }
  return succeed6(Action.NextFrame({
    state: state + 1
  }));
};
var processSelectNext = (state, choices) => {
  return succeed6(Action.NextFrame({
    state: (state + 1) % choices.length
  }));
};
var handleSelectRender = (options) => {
  return (state, action) => {
    return Action.$match(action, {
      Beep: () => succeed6(renderBeep),
      NextFrame: ({
        state
      }) => renderSelectNextFrame(state, options),
      Submit: () => renderSelectSubmission(state, options)
    });
  };
};
var handleSelectClear = (options) => fnUntraced2(function* (state, _) {
  const terminal = yield* Terminal;
  const columns = yield* terminal.columns;
  const figures = yield* getTheme(options);
  const clearPrompt = eraseLine + cursorLeft;
  const promptText = renderSelectOutput(figures.prefix, figures.pointerSmall, options, {
    plain: true
  });
  const choicesText = renderSelectChoices(state, options, figures, {
    plain: true
  });
  const clearOutput = eraseText(withSelectHeader(promptText, choicesText), columns);
  return clearOutput + clearPrompt;
});
var handleSelectProcess = (options) => {
  return (input, state) => {
    switch (input.key.name) {
      case "k":
      case "up": {
        return processSelectCursorUp(state, options.choices);
      }
      case "j":
      case "down": {
        return processSelectCursorDown(state, options.choices);
      }
      case "tab": {
        return processSelectNext(state, options.choices);
      }
      case "enter":
      case "return": {
        const selected = options.choices[state];
        if (selected.disabled) {
          return succeed6(Action.Beep());
        }
        return succeed6(Action.Submit({
          value: selected.value
        }));
      }
      default: {
        return succeed6(Action.Beep());
      }
    }
  };
};
var renderClearScreen = /* @__PURE__ */ fnUntraced2(function* (state, options) {
  const terminal = yield* Terminal;
  const columns = yield* terminal.columns;
  const figures = yield* getTheme(options);
  const resetCurrentLine = eraseLine + cursorLeft;
  const errorText = renderTextError(state, figures.pointerSmall, figures, {
    plain: true
  });
  const clearOutput = clearOutputWithError(renderTextOutput(state, figures.prefix, figures.pointerSmall, options, figures, {
    plain: true
  }), columns, errorText);
  return clearOutput + resetCurrentLine;
});
var renderTextInput = (nextState, options, theme, submitted, renderOptions) => {
  const text = nextState.value;
  if (renderOptions?.plain === true) {
    switch (options.type) {
      case "hidden": {
        return "";
      }
      case "password": {
        return theme.passwordMask.repeat(text.length);
      }
      case "text": {
        return text;
      }
    }
  }
  if (text.length === 0) {
    return "";
  }
  const annotation = isSome2(nextState.error) ? theme.errorColor : submitted ? theme.submittedColor : combine3(underlined, theme.primaryColor);
  switch (options.type) {
    case "hidden": {
      return "";
    }
    case "password": {
      return annotateSymbol(theme.passwordMask.repeat(text.length), annotation);
    }
    case "text": {
      return annotate2(text, annotation);
    }
  }
};
var renderTextError = (nextState, pointer, theme, renderOptions) => {
  if (isSome2(nextState.error)) {
    return match3(nextState.error.value.split(NEWLINE_REGEXP), {
      onEmpty: () => "",
      onNonEmpty: (errorLines) => {
        if (renderOptions?.plain === true) {
          return separateSymbol(pointer, errorLines.join(`
`));
        }
        const prefix = annotateSymbol(pointer, theme.errorColor);
        const lines = map4(errorLines, (str) => annotateErrorLine(str, theme.errorColor));
        return cursorSavePosition + `
` + separateSymbol(prefix, lines.join(`
`)) + cursorRestorePosition;
      }
    });
  }
  return "";
};
var renderTextOutput = (nextState, leadingSymbol, trailingSymbol, options, theme, renderOptions, submitted = false) => {
  const value = renderTextInput(nextState, options, theme, submitted, renderOptions);
  return renderPrompt(value, options.message, leadingSymbol, trailingSymbol, renderOptions);
};
var renderTextNextFrame = /* @__PURE__ */ fnUntraced2(function* (state, options) {
  const figures = yield* getTheme(options);
  const leadingSymbol = annotateSymbol(figures.prefix, figures.primaryColor);
  const trailingSymbol = annotateSymbol(figures.pointerSmall, figures.mutedColor);
  const promptMsg = renderTextOutput(state, leadingSymbol, trailingSymbol, options, figures);
  const errorMsg = renderTextError(state, figures.pointerSmall, figures);
  const cursorWidth = options.type === "password" ? figures.passwordMask.length : 1;
  const offset = (state.cursor - state.value.length) * cursorWidth;
  return promptMsg + errorMsg + cursorMove(offset);
});
var renderTextSubmission = /* @__PURE__ */ fnUntraced2(function* (state, options) {
  const figures = yield* getTheme(options);
  const leadingSymbol = annotateSymbol(figures.tick, figures.successColor);
  const trailingSymbol = annotateSymbol(figures.ellipsis, figures.mutedColor);
  const promptMsg = renderTextOutput(state, leadingSymbol, trailingSymbol, options, figures, undefined, true);
  return promptMsg + `
`;
});
var processTextBackspace = (state) => {
  if (state.cursor <= 0) {
    return succeed6(Action.Beep());
  }
  const beforeCursor = state.value.slice(0, state.cursor - 1);
  const afterCursor = state.value.slice(state.cursor);
  const cursor = state.cursor - 1;
  const value = `${beforeCursor}${afterCursor}`;
  return succeed6(Action.NextFrame({
    state: {
      ...state,
      cursor,
      value,
      error: none2()
    }
  }));
};
var processTextClear = (state) => succeed6(Action.NextFrame({
  state: {
    ...state,
    cursor: 0,
    value: "",
    error: none2()
  }
}));
var processTextCursorLeft = (state) => {
  if (state.cursor <= 0) {
    return succeed6(Action.Beep());
  }
  const cursor = state.cursor - 1;
  return succeed6(Action.NextFrame({
    state: {
      ...state,
      cursor,
      error: none2()
    }
  }));
};
var processTextCursorRight = (state) => {
  if (state.cursor >= state.value.length) {
    return succeed6(Action.Beep());
  }
  const cursor = Math.min(state.cursor + 1, state.value.length);
  return succeed6(Action.NextFrame({
    state: {
      ...state,
      cursor,
      error: none2()
    }
  }));
};
var processTextCursorStart = (state) => succeed6(Action.NextFrame({
  state: {
    ...state,
    cursor: 0,
    error: none2()
  }
}));
var processTextCursorEnd = (state) => succeed6(Action.NextFrame({
  state: {
    ...state,
    cursor: state.value.length,
    error: none2()
  }
}));
var processTab = (state, options) => {
  if (state.value === options.default) {
    return succeed6(Action.Beep());
  }
  const value = state.value.length === 0 ? options.default : state.value;
  return succeed6(Action.NextFrame({
    state: {
      ...state,
      value,
      cursor: value.length,
      error: none2()
    }
  }));
};
var defaultTextProcessor = (input, state) => {
  const beforeCursor = state.value.slice(0, state.cursor);
  const afterCursor = state.value.slice(state.cursor);
  const value = `${beforeCursor}${input}${afterCursor}`;
  const cursor = state.cursor + input.length;
  return succeed6(Action.NextFrame({
    state: {
      ...state,
      cursor,
      value,
      error: none2()
    }
  }));
};
var handleTextRender = (options) => {
  return (state, action) => {
    return Action.$match(action, {
      Beep: () => succeed6(renderBeep),
      NextFrame: ({
        state
      }) => renderTextNextFrame(state, options),
      Submit: () => renderTextSubmission(state, options)
    });
  };
};
var handleTextProcess = (options) => {
  return (input, state) => {
    if (input.key.ctrl) {
      switch (input.key.name) {
        case "u": {
          return processTextClear(state);
        }
        case "a": {
          return processTextCursorStart(state);
        }
        case "e": {
          return processTextCursorEnd(state);
        }
        default: {
          return succeed6(Action.Beep());
        }
      }
    }
    switch (input.key.name) {
      case "backspace": {
        return processTextBackspace(state);
      }
      case "left": {
        return processTextCursorLeft(state);
      }
      case "right": {
        return processTextCursorRight(state);
      }
      case "home": {
        return processTextCursorStart(state);
      }
      case "end": {
        return processTextCursorEnd(state);
      }
      case "enter":
      case "return": {
        const value = state.value;
        return match6(options.validate(value), {
          onFailure: (error) => Action.NextFrame({
            state: {
              ...state,
              value,
              error: some2(error)
            }
          }),
          onSuccess: (value) => Action.Submit({
            value
          })
        });
      }
      case "tab": {
        return processTab(state, options);
      }
      default: {
        return defaultTextProcessor(getOrElse(input.input, () => ""), state);
      }
    }
  };
};
var handleTextClear = (options) => {
  return (state, _) => {
    return renderClearScreen(state, options);
  };
};
var basePrompt = (options, type) => {
  const opts = {
    default: "",
    type,
    validate: succeed6,
    ...options
  };
  const initialState = {
    cursor: opts.default.length,
    value: opts.default,
    error: none2()
  };
  return Custom(initialState, {
    render: handleTextRender(opts),
    process: handleTextProcess(opts),
    clear: handleTextClear(opts)
  });
};
var handleToggleClear = /* @__PURE__ */ fnUntraced2(function* (options) {
  const terminal = yield* Terminal;
  const columns = yield* terminal.columns;
  const figures = yield* getTheme(options);
  const clearPrompt = eraseLine + cursorLeft;
  const toggleText = options.active + " " + separateSymbol(figures.toggleSeparator, options.inactive);
  const promptText = renderPrompt(toggleText, options.message, figures.prefix, figures.pointerSmall, {
    plain: true
  });
  const clearOutput = eraseText(promptText, columns);
  return clearOutput + clearPrompt;
});
var renderToggle = (value, options, theme, submitted = false) => {
  const separator = annotateSymbol(theme.toggleSeparator, theme.mutedColor);
  const selectedAnnotation = combine3(underlined, submitted ? theme.submittedColor : theme.primaryColor);
  const inactive = value ? options.inactive : annotate2(options.inactive, selectedAnnotation);
  const active = value ? annotate2(options.active, selectedAnnotation) : options.active;
  return active + " " + separateSymbol(separator, inactive);
};
var renderToggleOutput = (toggle, leadingSymbol, trailingSymbol, options) => {
  return renderPrompt(toggle, options.message, leadingSymbol, trailingSymbol);
};
var renderToggleNextFrame = /* @__PURE__ */ fnUntraced2(function* (state, options) {
  const figures = yield* getTheme(options);
  const leadingSymbol = annotateSymbol(figures.prefix, figures.primaryColor);
  const trailingSymbol = annotateSymbol(figures.pointerSmall, figures.mutedColor);
  const toggle = renderToggle(state, options, figures);
  const promptMsg = renderToggleOutput(toggle, leadingSymbol, trailingSymbol, options);
  return cursorHide + promptMsg;
});
var renderToggleSubmission = /* @__PURE__ */ fnUntraced2(function* (value, options) {
  const figures = yield* getTheme(options);
  const leadingSymbol = annotateSymbol(figures.tick, figures.successColor);
  const trailingSymbol = annotateSymbol(figures.ellipsis, figures.mutedColor);
  const toggle = renderToggle(value, options, figures, true);
  const promptMsg = renderToggleOutput(toggle, leadingSymbol, trailingSymbol, options);
  return promptMsg + `
`;
});
var activate = /* @__PURE__ */ succeed6(/* @__PURE__ */ Action.NextFrame({
  state: true
}));
var deactivate = /* @__PURE__ */ succeed6(/* @__PURE__ */ Action.NextFrame({
  state: false
}));
var handleToggleRender = (options) => {
  return (state, action) => {
    switch (action._tag) {
      case "Beep": {
        return succeed6(renderBeep);
      }
      case "NextFrame": {
        return renderToggleNextFrame(state, options);
      }
      case "Submit": {
        return renderToggleSubmission(state, options);
      }
    }
  };
};
var handleToggleProcess = (input, state) => {
  switch (input.key.name) {
    case "0":
    case "j":
    case "delete":
    case "right":
    case "down": {
      return deactivate;
    }
    case "1":
    case "k":
    case "left":
    case "up": {
      return activate;
    }
    case " ":
    case "tab": {
      return state ? deactivate : activate;
    }
    case "enter":
    case "return": {
      return succeed6(Action.Submit({
        value: state
      }));
    }
    default: {
      return succeed6(Action.Beep());
    }
  }
};
var entriesToDisplay = (cursor, total, maxVisible) => {
  const max = maxVisible === undefined ? total : maxVisible;
  let startIndex = Math.min(total - max, cursor - Math.floor(max / 2));
  if (startIndex < 0) {
    startIndex = 0;
  }
  const endIndex = Math.min(startIndex + max, total);
  return {
    startIndex,
    endIndex
  };
};

// node_modules/effect/dist/unstable/cli/Param.js
var TypeId46 = "~effect/cli/Param";
var argumentKind = "argument";
var flagKind = "flag";
var Proto15 = {
  [TypeId46]: {
    _A: identity
  },
  pipe() {
    return pipeArguments(this, arguments);
  }
};
var isParam = (u) => hasProperty(u, TypeId46);
var isFlagParam = (single) => single.kind === "flag";
var makeSingle2 = (params) => {
  const parse = (args) => params.kind === argumentKind ? parsePositional(params.name, params.primitiveType, args) : parseFlag(params.name, params.primitiveType, args);
  return Object.setPrototypeOf({
    _tag: "Single",
    ...params,
    description: params.description ?? none2(),
    aliases: params.aliases ?? [],
    hidden: params.hidden ?? false,
    parse
  }, Proto15);
};
var String9 = (kind, name) => makeSingle2({
  name,
  primitiveType: String7,
  kind
});
var Boolean5 = (kind, name) => makeSingle2({
  name,
  primitiveType: Boolean4,
  kind
});
var ChoiceWithValue = (kind, name, choices) => makeSingle2({
  name,
  primitiveType: Choice(choices),
  kind
});
var Literals2 = (kind, name, choices) => {
  const mappedChoices = choices.map((value) => [value, value]);
  return ChoiceWithValue(kind, name, mappedChoices);
};
var FLAG_DASH_REGEXP = /^-+/;
var withAlias = /* @__PURE__ */ dual(2, (self, alias) => {
  return transformSingle(self, (single) => makeSingle2({
    ...single,
    aliases: [...single.aliases, alias.replace(FLAG_DASH_REGEXP, "")]
  }));
});
var withDescription = /* @__PURE__ */ dual(2, (self, description) => {
  return transformSingle(self, (single) => makeSingle2({
    ...single,
    description: some2(description)
  }));
});
var map11 = /* @__PURE__ */ dual(2, (self, f) => {
  const parse = (args) => map7(self.parse(args), ([operands, value]) => [operands, f(value)]);
  return Object.assign(Object.create(Proto15), {
    _tag: "Map",
    kind: self.kind,
    param: self,
    f,
    parse
  });
});
var transform3 = (self, f, alternatives = []) => {
  const alternativeParsers = alternatives.map((alternative) => () => alternative().parse);
  return Object.assign(Object.create(Proto15), {
    _tag: "Transform",
    kind: self.kind,
    param: self,
    alternatives,
    f,
    parse: f(self.parse, alternativeParsers)
  });
};
var mapEffect2 = /* @__PURE__ */ dual(2, (self, f) => transform3(self, (parse) => (args) => flatMap5(parse(args), ([leftover, a]) => f(a).pipe(map7((b) => [leftover, b])))));
var optional3 = (param) => {
  const parse = (args) => param.parse(args).pipe(map7(([leftover, value]) => [leftover, some2(value)]), catchTags2({
    MissingOption: () => succeed6([args.arguments, none2()]),
    MissingArgument: () => succeed6([args.arguments, none2()])
  }));
  return Object.assign(Object.create(Proto15), {
    _tag: "Optional",
    kind: param.kind,
    param,
    parse
  });
};
var withDefault3 = /* @__PURE__ */ dual(2, (self, defaultValue) => {
  if (!isEffect2(defaultValue)) {
    return map11(optional3(self), getOrElse(() => defaultValue));
  }
  return mapEffect2(optional3(self), match({
    onNone: () => defaultValue,
    onSome: succeed6
  }));
});
var variadic = (self, options) => {
  const single = getUnderlyingSingleOrThrow(self);
  const parse = (args) => {
    if (single.kind === "argument") {
      return parsePositionalVariadic(self, single, args, options);
    } else {
      return parseOptionVariadic(self, single, args, options);
    }
  };
  return Object.assign(Object.create(Proto15), {
    _tag: "Variadic",
    kind: self.kind,
    param: self,
    min: fromUndefinedOr(options?.min),
    max: fromUndefinedOr(options?.max),
    parse
  });
};
var withMetavar = /* @__PURE__ */ dual(2, (self, metavar) => transformSingle(self, (single) => makeSingle2({
  ...single,
  typeName: metavar
})));
var parsePositional = /* @__PURE__ */ fnUntraced2(function* (name, primitiveType, args) {
  if (args.arguments.length === 0) {
    return yield* new MissingArgument({
      argument: name
    });
  }
  const arg = args.arguments[0];
  const value = yield* mapError2(primitiveType.parse(arg), (error) => new InvalidValue2({
    option: name,
    value: arg,
    expected: error,
    kind: "argument"
  }));
  return [args.arguments.slice(1), value];
});
var parseFlag = /* @__PURE__ */ fnUntraced2(function* (name, primitiveType, args) {
  const providedValues = args.flags[name];
  if (providedValues === undefined || providedValues.length === 0) {
    return yield* new MissingOption({
      option: name
    });
  }
  const arg = providedValues[0];
  const value = yield* mapError2(primitiveType.parse(arg), (error) => new InvalidValue2({
    option: name,
    value: arg,
    expected: error,
    kind: "flag"
  }));
  return [args.arguments, value];
});
var parsePositionalVariadic = /* @__PURE__ */ fnUntraced2(function* (self, single, args, options) {
  const results = [];
  const minValue = options?.min ?? 0;
  const maxValue = options?.max ?? Number.POSITIVE_INFINITY;
  let count = 0;
  let currentArgs = args.arguments;
  while (currentArgs.length > 0 && count < maxValue) {
    const [remainingArgs, value] = yield* self.parse({
      flags: args.flags,
      arguments: currentArgs
    });
    results.push(value);
    currentArgs = remainingArgs;
    count++;
  }
  if (count < minValue) {
    return yield* count === 0 ? new MissingArgument({
      argument: single.name
    }) : new InvalidValue2({
      option: single.name,
      value: `${count} values`,
      expected: `at least ${minValue} value${minValue === 1 ? "" : "s"}`,
      kind: single.kind
    });
  }
  return [currentArgs, results];
});
var parseOptionVariadic = /* @__PURE__ */ fnUntraced2(function* (self, single, args, options) {
  const results = [];
  const names = [single.name, ...single.aliases];
  const values = names.flatMap((name) => args.flags[name] ?? []);
  const count = values.length;
  if (isNotUndefined(options?.min) && count < options.min) {
    return yield* count === 0 ? new MissingOption({
      option: single.name
    }) : new InvalidValue2({
      option: single.name,
      value: `${count} occurrences`,
      expected: `at least ${options.min} value${options.min === 1 ? "" : "s"}`,
      kind: single.kind
    });
  }
  if (isNotUndefined(options?.max) && count > options.max) {
    return yield* new InvalidValue2({
      option: single.name,
      value: `${count} occurrences`,
      expected: `at most ${options.max} value${options.max === 1 ? "" : "s"}`,
      kind: single.kind
    });
  }
  for (const value of values) {
    const [, parsedValue] = yield* self.parse({
      flags: {
        [single.name]: [value]
      },
      arguments: []
    });
    results.push(parsedValue);
  }
  return [args.arguments, results];
});
var matchParam = (param, patterns) => {
  const p = param;
  switch (p._tag) {
    case "Single":
      return patterns.Single(p);
    case "Map":
      return patterns.Map(p);
    case "Transform":
      return patterns.Transform(p);
    case "Optional":
      return patterns.Optional(p);
    case "Variadic":
      return patterns.Variadic(p);
  }
};
var transformSingle = (param, f) => {
  return matchParam(param, {
    Single: (single) => f(single),
    Map: (mapped) => map11(transformSingle(mapped.param, f), mapped.f),
    Transform: (mapped) => transform3(transformSingle(mapped.param, f), mapped.f, mapped.alternatives.map((alternative) => () => transformSingle(alternative(), f))),
    Optional: (p) => optional3(transformSingle(p.param, f)),
    Variadic: (p) => variadic(transformSingle(p.param, f), {
      min: getOrUndefined(p.min),
      max: getOrUndefined(p.max)
    })
  });
};
var extractSingleParams = (param) => {
  return matchParam(param, {
    Single: (single) => [single],
    Map: (mapped) => extractSingleParams(mapped.param),
    Transform: (mapped) => [...extractSingleParams(mapped.param), ...mapped.alternatives.flatMap((alternative) => extractSingleParams(alternative()))],
    Optional: (optional) => extractSingleParams(optional.param),
    Variadic: (variadic) => extractSingleParams(variadic.param)
  });
};
var getUnderlyingSingleOrThrow = (param) => {
  const singles = extractSingleParams(param);
  if (singles.length === 0) {
    throw new Error("No Single param found in param structure");
  }
  if (singles.length > 1) {
    throw new Error(`Multiple Single params found: ${singles.map((s) => s.name).join(", ")}`);
  }
  return singles[0];
};
var getParamMetadata = (param) => {
  return matchParam(param, {
    Single: () => ({
      isOptional: false,
      isVariadic: false,
      variadicMin: none2(),
      variadicMax: none2()
    }),
    Map: (mapped) => getParamMetadata(mapped.param),
    Transform: (mapped) => getParamMetadata(mapped.param),
    Optional: (optional) => ({
      ...getParamMetadata(optional.param),
      isOptional: true
    }),
    Variadic: (variadic) => ({
      ...getParamMetadata(variadic.param),
      isVariadic: true,
      variadicMin: variadic.min,
      variadicMax: variadic.max
    })
  });
};

// node_modules/effect/dist/unstable/cli/Argument.js
var String10 = (name) => String9(argumentKind, name);
var withDescription2 = /* @__PURE__ */ dual(2, (self, description) => withDescription(self, description));
var ChoiceWithValue2 = (name, choices) => ChoiceWithValue(argumentKind, name, choices);
// node_modules/effect/dist/Console.js
var Console2 = ConsoleRef;
var consoleWith = (f) => withFiber((fiber) => f(fiber.getRef(Console2)));
var error = (...args) => consoleWith((console) => sync(() => {
  console.error(...args);
}));
var log2 = (...args) => consoleWith((console) => sync(() => {
  console.log(...args);
}));

// node_modules/effect/dist/unstable/cli/CliOutput.js
var Formatter2 = /* @__PURE__ */ Reference("effect/cli/CliOutput", {
  defaultValue: () => defaultFormatter2()
});
var escapeControlCharacters = (text) => text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, (character) => `\\x${character.charCodeAt(0).toString(16).padStart(2, "0")}`);
var defaultFormatter2 = (options) => {
  const globalProcess = globalThis.process;
  const hasProcess = typeof globalProcess === "object" && globalProcess !== null;
  const useColor = options?.colors !== undefined ? options.colors : hasProcess && typeof globalProcess.stdout === "object" && globalProcess.stdout !== null && globalProcess.stdout.isTTY === true && !globalProcess.env?.NO_COLOR;
  const colors = useColor ? {
    bold: (text) => `\x1B[1m${text}\x1B[0m`,
    dim: (text) => `\x1B[2m${text}\x1B[0m`,
    cyan: (text) => `\x1B[36m${text}\x1B[0m`,
    green: (text) => `\x1B[32m${text}\x1B[0m`,
    blue: (text) => `\x1B[34m${text}\x1B[0m`,
    yellow: (text) => `\x1B[33m${text}\x1B[0m`,
    magenta: (text) => `\x1B[35m${text}\x1B[0m`
  } : {
    bold: (text) => text,
    dim: (text) => text,
    cyan: (text) => text,
    green: (text) => text,
    blue: (text) => text,
    yellow: (text) => text,
    magenta: (text) => text
  };
  const reset = useColor ? "\x1B[0m" : "";
  const red = useColor ? "\x1B[31m" : "";
  const bold = useColor ? "\x1B[1m" : "";
  return {
    formatHelpDoc: (doc) => formatHelpDocImpl(doc, colors),
    formatCliError: (error) => escapeControlCharacters(error.message),
    formatError: (error) => {
      return `
${bold}${red}ERROR${reset}
  ${escapeControlCharacters(error.message)}${reset}`;
    },
    formatErrors: (errors) => {
      if (errors.length === 0)
        return "";
      if (errors.length === 1) {
        return `
${bold}${red}ERROR${reset}
  ${escapeControlCharacters(errors[0].message)}${reset}`;
      }
      const grouped = new Map;
      for (const error of errors) {
        const tag = error._tag ?? "Error";
        const group = grouped.get(tag) ?? [];
        group.push(error);
        grouped.set(tag, group);
      }
      const sections = [];
      sections.push(`
${bold}${red}ERRORS${reset}`);
      for (const [, group] of grouped) {
        for (const error of group) {
          sections.push(`  ${escapeControlCharacters(error.message)}${reset}`);
        }
      }
      return sections.join(`
`);
    },
    formatVersion: (name, version) => `${colors.bold(name)} ${colors.dim("v")}${colors.bold(version)}`
  };
};
var stripAnsi = (text) => {
  return text.replace(/\u001B\[[0-9;]*m/g, "");
};
var graphemeSegmenter = /* @__PURE__ */ new Intl.Segmenter(undefined, {
  granularity: "grapheme"
});
var zeroWidthCodePoints = /[\p{Mark}\p{Control}\p{Default_Ignorable_Code_Point}]/gu;
var emojiPresentation = /\p{Emoji_Presentation}/u;
var isFullWidthCodePoint = (codePoint) => {
  if (codePoint < 4352)
    return false;
  return codePoint <= 4447 || codePoint === 9001 || codePoint === 9002 || codePoint >= 11904 && codePoint <= 12350 || codePoint >= 12352 && codePoint <= 42191 || codePoint >= 44032 && codePoint <= 55203 || codePoint >= 63744 && codePoint <= 64255 || codePoint >= 65040 && codePoint <= 65049 || codePoint >= 65072 && codePoint <= 65135 || codePoint >= 65280 && codePoint <= 65376 || codePoint >= 65504 && codePoint <= 65510 || codePoint >= 110592 && codePoint <= 111359 || codePoint >= 127488 && codePoint <= 127569 || codePoint >= 131072 && codePoint <= 262141;
};
var graphemeWidth = (grapheme) => {
  const visible = grapheme.replace(zeroWidthCodePoints, "");
  if (visible.length === 0)
    return 0;
  if (emojiPresentation.test(grapheme) || grapheme.includes("\uFE0F"))
    return 2;
  return isFullWidthCodePoint(visible.codePointAt(0)) ? 2 : 1;
};
var visualLength = (text) => {
  let length = 0;
  for (const {
    segment
  } of graphemeSegmenter.segment(stripAnsi(text))) {
    length += graphemeWidth(segment);
  }
  return length;
};
var pad = (s, width) => {
  const actualLength = visualLength(s);
  const padding = Math.max(0, width - actualLength);
  return s + " ".repeat(padding);
};
var renderTable = (rows, widthCap) => {
  const maxColumn = Math.max(...rows.map((r) => visualLength(r.left))) + 4;
  const col = widthCap === undefined ? maxColumn : Math.min(maxColumn, widthCap);
  return rows.map(({
    left,
    right
  }) => `  ${pad(left, Math.max(col, visualLength(left) + 1))}${right}`).join(`
`);
};
var formatSubcommandName = (name, alias) => alias ? `${name}, ${alias}` : name;
var formatHelpDocImpl = (doc, colors) => {
  const sections = [];
  if (doc.description) {
    sections.push(colors.bold("DESCRIPTION"));
    sections.push(`  ${doc.description}`);
    sections.push("");
  }
  sections.push(colors.bold("USAGE"));
  sections.push(`  ${colors.cyan(doc.usage)}`);
  sections.push("");
  if (doc.args && doc.args.length > 0) {
    sections.push(colors.bold("ARGUMENTS"));
    const argRows = doc.args.map((arg) => {
      let name = arg.name;
      if (arg.variadic) {
        name += "...";
      }
      const coloredName = colors.green(name);
      const coloredType = colors.dim(arg.type);
      const nameType = `${coloredName} ${coloredType}`;
      const optionalSuffix = arg.required ? "" : colors.dim(" (optional)");
      const description = getOrElse(arg.description, () => "") + optionalSuffix;
      return {
        left: nameType,
        right: description
      };
    });
    sections.push(renderTable(argRows, 25));
    sections.push("");
  }
  if (doc.flags.length > 0) {
    sections.push(colors.bold("FLAGS"));
    const flagRows = doc.flags.map((flag) => {
      const names = [];
      names.push(colors.green(`--${flag.name}`));
      for (const alias of flag.aliases) {
        names.push(colors.green(alias));
      }
      const namesPart = names.join(", ");
      const typePart = flag.type !== "boolean" ? ` ${colors.dim(flag.type)}` : "";
      return {
        left: namesPart + typePart,
        right: getOrElse(flag.description, () => "")
      };
    });
    sections.push(renderTable(flagRows));
    sections.push("");
  }
  if (doc.globalFlags && doc.globalFlags.length > 0) {
    sections.push(colors.bold("GLOBAL FLAGS"));
    const globalFlagRows = doc.globalFlags.map((flag) => {
      const names = [];
      names.push(colors.green(`--${flag.name}`));
      for (const alias of flag.aliases) {
        names.push(colors.green(alias));
      }
      const namesPart = names.join(", ");
      const typePart = flag.type !== "boolean" ? ` ${colors.dim(flag.type)}` : "";
      return {
        left: namesPart + typePart,
        right: getOrElse(flag.description, () => "")
      };
    });
    sections.push(renderTable(globalFlagRows));
    sections.push("");
  }
  if (doc.subcommands && doc.subcommands.length > 0) {
    const ungrouped = doc.subcommands.find((group) => group.group === undefined);
    if (ungrouped) {
      sections.push(colors.bold("SUBCOMMANDS"));
      sections.push(renderTable(ungrouped.commands.map((sub) => ({
        left: colors.cyan(formatSubcommandName(sub.name, sub.alias)),
        right: sub.shortDescription ?? sub.description
      })), 20));
      if (doc.subcommands.length > 1) {
        sections.push("");
      }
    }
    for (const group of doc.subcommands) {
      if (group.group === undefined)
        continue;
      sections.push(colors.bold(`${group.group}:`));
      sections.push(renderTable(group.commands.map((sub) => ({
        left: colors.cyan(formatSubcommandName(sub.name, sub.alias)),
        right: sub.shortDescription ?? sub.description
      })), 20));
      sections.push("");
    }
  }
  if (doc.examples && doc.examples.length > 0) {
    sections.push(colors.bold("EXAMPLES"));
    let first = true;
    let previousHadDescription = false;
    for (const example of doc.examples) {
      if (example.description) {
        if (!first)
          sections.push("");
        sections.push(`  ${colors.dim(`# ${example.description}`)}`);
      } else if (previousHadDescription) {
        sections.push("");
      }
      sections.push(`  ${colors.cyan(example.command)}`);
      first = false;
      previousHadDescription = !!example.description;
    }
    sections.push("");
  }
  if (sections[sections.length - 1] === "") {
    sections.pop();
  }
  return sections.join(`
`);
};

// node_modules/effect/dist/unstable/cli/internal/completions/bash.js
var escapeForBash = (s) => s.replace(/'/g, "'\\''");
var sanitizeFunctionName = (s) => s.replace(/[^a-zA-Z0-9_]/g, "_");
var flagNamesForWordlist = (flag) => {
  const names = [`--${flag.name}`];
  for (const alias of flag.aliases) {
    names.push(alias.length === 1 ? `-${alias}` : `--${alias}`);
  }
  if (flag.type._tag === "Boolean") {
    names.push(`--no-${flag.name}`);
  }
  return names;
};
var buildFlagGroupDeclarations = (flags, lines) => {
  if (flags.length === 0)
    return;
  const groups = flags.map(flagNamesForWordlist);
  lines.push(`  local ${groups.map((_, index) => `_used_${index}=""`).join(" ")}`);
  lines.push(`  for ((i = 1; i < cword; i++)); do`);
  lines.push(`    case "\${words[i]%%=*}" in`);
  groups.forEach((forms, index) => {
    lines.push(`      ${forms.join("|")}) _used_${index}=1 ;;`);
  });
  lines.push(`    esac`);
  lines.push(`  done`);
  lines.push(`  local _filtered_flags=""`);
  groups.forEach((forms, index) => {
    lines.push(`  [[ -n "$_used_${index}" ]] || _filtered_flags+=" ${forms.join(" ")}"`);
  });
  lines.push(``);
};
var choicesHelper = (helperName, lines) => {
  lines.push(`${helperName}()`);
  lines.push(`{`);
  lines.push(`  local _cur="$1" _word="$2"; shift 2`);
  lines.push(``);
  lines.push(`  local _head="\${_cur%"$_word"}"`);
  lines.push(`  local _open=""`);
  lines.push(`  case "$_head" in`);
  lines.push(`    *\\') _open="'" ;;`);
  lines.push(`    *\\") _open='"' ;;`);
  lines.push(`  esac`);
  lines.push(``);
  lines.push(`  local _prefix="$_cur" _committed="$_head"`);
  lines.push(`  _prefix=\${_prefix//\\\\/}; _prefix=\${_prefix//\\"/}; _prefix=\${_prefix//\\'/}`);
  lines.push(`  _committed=\${_committed//\\\\/}; _committed=\${_committed//\\"/}; _committed=\${_committed//\\'/}`);
  lines.push(``);
  lines.push(`  COMPREPLY=()`);
  lines.push(`  local _choice _rest _match`);
  lines.push(`  for _choice in "$@"; do`);
  lines.push(`    [[ "$_choice" == "$_prefix"* ]] || continue`);
  lines.push(`    _rest="\${_choice#"$_committed"}"`);
  lines.push(`    case "$_open" in`);
  lines.push(`      "'")`);
  lines.push(`        if [[ "$_head" == "'" ]]; then`);
  lines.push(`          _match=\${_rest//\\'/\\'\\\\\\'\\'}`);
  lines.push(`        else`);
  lines.push(`          [[ "$_rest" == *\\'* ]] && continue`);
  lines.push(`          _match="$_rest"`);
  lines.push(`        fi`);
  lines.push(`        ;;`);
  lines.push(`      '"')`);
  lines.push(`        _match="\${_rest//\\\\/\\\\\\\\}"`);
  lines.push(`        _match="\${_match//\\$/\\\\$}"`);
  lines.push('        _match="${_match//\\`/\\\\\\`}"');
  lines.push(`        _match="\${_match//\\"/\\\\\\"}"`);
  lines.push(`        ;;`);
  lines.push(`      *)`);
  lines.push(`        printf -v _match '%q' "$_rest"`);
  lines.push(`        [[ -z "$_head" && "$_match" == '~'* ]] && _match="\\\\$_match"`);
  lines.push(`        ;;`);
  lines.push(`    esac`);
  lines.push(`    [[ -n "$_open" && "$_match" == *"$_open" ]] && _match+="$_open"`);
  lines.push(`    COMPREPLY+=("$_match")`);
  lines.push(`  done`);
  lines.push(`}`);
  lines.push(``);
};
var choiceCompletion = (helperName, values) => `${helperName} "$cur" "$_comp_word" ${values.map((value) => `'${escapeForBash(value)}'`).join(" ")}`;
var flagValueCompletion = (type, helperName) => {
  switch (type._tag) {
    case "Boolean":
      return;
    case "Choice":
      return choiceCompletion(helperName, type.values);
    case "Path":
      if (type.pathType === "directory")
        return `COMPREPLY=( $(compgen -d -- "$cur") )`;
      return `COMPREPLY=( $(compgen -f -- "$cur") )`;
    default:
      return;
  }
};
var argCompletion = (type, helperName) => {
  switch (type._tag) {
    case "Choice":
      return choiceCompletion(helperName, type.values);
    case "Path":
      if (type.pathType === "directory")
        return `COMPREPLY=( $(compgen -d -- "$cur") )`;
      return `COMPREPLY=( $(compgen -f -- "$cur") )`;
    default:
      return;
  }
};
var generateFunction = (descriptor, parentPath, lines, helperName) => {
  const currentPath = [...parentPath, descriptor.name];
  const funcName = `_${currentPath.map(sanitizeFunctionName).join("_")}`;
  lines.push(`${funcName}()`);
  lines.push(`{`);
  lines.push(`  local cur prev words cword i`);
  lines.push(parentPath.length === 0 ? `  local _command_index=0` : `  local _command_index="$1"`);
  lines.push(`  _init_completion -n "$COMP_WORDBREAKS" || return`);
  if (parentPath.length === 0) {
    lines.push(`  local _comp_word="$2"`);
  }
  lines.push(``);
  const flagsWithValues = descriptor.flags.filter((f) => f.type._tag !== "Boolean");
  if (flagsWithValues.length > 0) {
    lines.push(`  # Flag value completions`);
    lines.push(`  case "$prev" in`);
    for (const flag of flagsWithValues) {
      const longNames = [`--${flag.name}`];
      for (const alias of flag.aliases) {
        longNames.push(alias.length === 1 ? `-${alias}` : `--${alias}`);
      }
      const completion = flagValueCompletion(flag.type, helperName);
      if (completion) {
        lines.push(`    ${longNames.join("|")})`);
        lines.push(`      ${completion}`);
        lines.push(`      return`);
        lines.push(`      ;;`);
      }
    }
    lines.push(`  esac`);
    lines.push(``);
  }
  if (descriptor.subcommands.length > 0) {
    lines.push(`  # Subcommand dispatch`);
    lines.push(`  local cmd _skip_next=0`);
    lines.push(`  for ((i = _command_index + 1; i < cword; i++)); do`);
    lines.push(`    if (( _skip_next )); then`);
    lines.push(`      _skip_next=0`);
    lines.push(`      continue`);
    lines.push(`    fi`);
    lines.push(`    case "\${words[i]}" in`);
    for (const flag of descriptor.flags) {
      if (flag.type._tag === "Boolean")
        continue;
      const forms = flagNamesForWordlist(flag);
      lines.push(`      ${forms.join("|")}) _skip_next=1 ;;`);
      lines.push(`      ${forms.map((form) => `${form}=*`).join("|")}) ;;`);
    }
    for (const sub of descriptor.subcommands) {
      const subFuncName = `_${[...currentPath, sub.name].map(sanitizeFunctionName).join("_")}`;
      lines.push(`      ${sub.name})`);
      lines.push(`        ${subFuncName} "$i"`);
      lines.push(`        return`);
      lines.push(`        ;;`);
    }
    lines.push(`    esac`);
    lines.push(`  done`);
    lines.push(``);
  }
  buildFlagGroupDeclarations(descriptor.flags, lines);
  if (descriptor.flags.length > 0 || descriptor.subcommands.length > 0) {
    lines.push(`  # Complete flags (filtered) and subcommands`);
    lines.push(`  if [[ "$cur" == -* ]]; then`);
    if (descriptor.flags.length > 0) {
      lines.push(`    COMPREPLY=( $(compgen -W "$_filtered_flags" -- "$cur") )`);
    }
    lines.push(`    return`);
    lines.push(`  fi`);
    lines.push(``);
  }
  const argsWithCompletions = descriptor.arguments.flatMap((argument, index) => {
    const completion = argCompletion(argument.type, helperName);
    return completion === undefined ? [] : [{
      argument,
      completion,
      index
    }];
  });
  if (argsWithCompletions.length > 0) {
    lines.push(`  # Positional argument completions`);
    lines.push(`  local _position=0 _skip_next=0 _end_of_options=0`);
    lines.push(`  for ((i = _command_index + 1; i < cword; i++)); do`);
    lines.push(`    if (( _skip_next )); then`);
    lines.push(`      _skip_next=0`);
    lines.push(`      continue`);
    lines.push(`    fi`);
    lines.push(`    if (( _end_of_options )); then`);
    lines.push(`      ((_position += 1))`);
    lines.push(`      continue`);
    lines.push(`    fi`);
    lines.push(`    case "\${words[i]}" in`);
    lines.push(`      --) _end_of_options=1 ;;`);
    for (const flag of descriptor.flags) {
      const forms = flagNamesForWordlist(flag);
      if (flag.type._tag === "Boolean") {
        lines.push(`      ${forms.join("|")}) ;;`);
      } else {
        lines.push(`      ${forms.join("|")}) _skip_next=1 ;;`);
        lines.push(`      ${forms.map((form) => `${form}=*`).join("|")}) ;;`);
      }
    }
    lines.push(`      -*) ;;`);
    lines.push(`      *) ((_position += 1)) ;;`);
    lines.push(`    esac`);
    lines.push(`  done`);
    lines.push(`  case "$_position" in`);
    for (const {
      argument,
      completion,
      index
    } of argsWithCompletions) {
      if (argument.variadic)
        continue;
      lines.push(`    ${index})`);
      lines.push(`      ${completion}`);
      lines.push(`      return`);
      lines.push(`      ;;`);
    }
    lines.push(`  esac`);
    const variadic = argsWithCompletions.find(({
      argument
    }) => argument.variadic);
    if (variadic !== undefined) {
      lines.push(`  if (( _position >= ${variadic.index} )); then`);
      lines.push(`    ${variadic.completion}`);
      lines.push(`    return`);
      lines.push(`  fi`);
    }
  } else if (descriptor.subcommands.length > 0) {
    const subNames = descriptor.subcommands.map((s) => s.name);
    lines.push(`  COMPREPLY=( $(compgen -W '${subNames.join(" ")}' -- "$cur") )`);
  }
  lines.push(`}`);
  lines.push(``);
  for (const sub of descriptor.subcommands) {
    generateFunction(sub, currentPath, lines, helperName);
  }
};
var generate = (executableName, descriptor) => {
  const lines = [];
  const safeName = sanitizeFunctionName(executableName);
  const helperName = `_${safeName}--choices`;
  lines.push(`###-begin-${escapeForBash(executableName)}-completions-###`);
  lines.push(`#`);
  lines.push(`# Static completion script for Bash`);
  lines.push(`#`);
  lines.push(`# Installation:`);
  lines.push(`#   ${escapeForBash(executableName)} --completions bash >> ~/.bashrc`);
  lines.push(`#`);
  lines.push(``);
  lines.push(`if ! type _init_completion &>/dev/null; then`);
  lines.push(`  _init_completion()`);
  lines.push(`  {`);
  lines.push(`    COMPREPLY=()`);
  lines.push(`    local _i _j=0 _piece _line="$COMP_LINE"`);
  lines.push(`    words=("\${COMP_WORDS[0]}")`);
  lines.push(`    cword=0`);
  lines.push(`    _line="\${_line#*"\${COMP_WORDS[0]}"}"`);
  lines.push(`    for ((_i = 1; _i < \${#COMP_WORDS[@]}; _i++)); do`);
  lines.push(`      _piece="\${COMP_WORDS[_i]}"`);
  lines.push(`      if [[ "$_line" == [[:blank:]]* ]]; then`);
  lines.push(`        ((_j++))`);
  lines.push(`        words[_j]="$_piece"`);
  lines.push(`      else`);
  lines.push(`        words[_j]="\${words[_j]}$_piece"`);
  lines.push(`      fi`);
  lines.push(`      ((_i == COMP_CWORD)) && cword=$_j`);
  lines.push(`      _line="\${_line#*"$_piece"}"`);
  lines.push(`    done`);
  lines.push(`    cur="\${words[cword]}"`);
  lines.push(`    prev=""`);
  lines.push(`    ((cword > 0)) && prev="\${words[cword-1]}"`);
  lines.push(`    return 0`);
  lines.push(`  }`);
  lines.push(`fi`);
  lines.push(``);
  choicesHelper(helperName, lines);
  generateFunction(descriptor, [], lines, helperName);
  lines.push(`complete -F _${safeName} ${escapeForBash(executableName)}`);
  lines.push(`###-end-${escapeForBash(executableName)}-completions-###`);
  return lines.join(`
`);
};

// node_modules/effect/dist/unstable/cli/internal/completions/fish.js
var escapeFishString = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
var escapeFishChoice = (s) => escapeFishString(s.replace(/[^A-Za-z0-9_.,/@%+-]/gu, "\\$&"));
var subcommandCondition = (parentPath, childSubcommandNames) => {
  if (parentPath.length === 0) {
    if (childSubcommandNames.length > 0) {
      return `__fish_use_subcommand`;
    }
    return ``;
  }
  const parentCondition = parentPath.map((parent) => `__fish_seen_subcommand_from ${parent}`).join("; and ");
  if (childSubcommandNames.length > 0) {
    return `${parentCondition}; and not __fish_seen_subcommand_from ${childSubcommandNames.join(" ")}`;
  }
  return parentCondition;
};
var flagContainsOptCondition = (flag) => {
  const optArgs = [];
  for (const alias of flag.aliases) {
    if (alias.length === 1) {
      optArgs.push(`-s ${alias}`);
    }
  }
  optArgs.push(flag.name);
  for (const alias of flag.aliases) {
    if (alias.length > 1) {
      optArgs.push(alias);
    }
  }
  if (flag.type._tag === "Boolean") {
    optArgs.push(`no-${flag.name}`);
  }
  return `not __fish_contains_opt ${optArgs.join(" ")}`;
};
var valueFlagDedupCondition = (flag) => {
  const forms = [`--${flag.name}`];
  for (const alias of flag.aliases) {
    forms.push(alias.length === 1 ? `-${alias}` : `--${alias}`);
  }
  return `begin; ${flagContainsOptCondition(flag)}; or contains -- (commandline -poc)[-1] ${forms.join(" ")}; end`;
};
var flagCompletionArgs = (flag) => {
  const args = [`-l ${flag.name}`];
  for (const alias of flag.aliases) {
    if (alias.length === 1) {
      args.push(`-s ${alias}`);
    } else {
      args.push(`-l ${alias}`);
    }
  }
  if (flag.description) {
    args.push(`-d '${escapeFishString(flag.description)}'`);
  }
  const valueArgs = flagValueArgs(flag.type);
  if (valueArgs) {
    args.push(valueArgs);
  }
  return args;
};
var flagValueArgs = (type) => {
  switch (type._tag) {
    case "Boolean":
      return;
    case "Choice":
      return `-r -f -a '${type.values.map(escapeFishChoice).join(" ")}'`;
    case "Path":
      if (type.pathType === "directory")
        return `-r -F`;
      return `-r -F`;
    default:
      return `-r -f`;
  }
};
var argValueArgs = (type) => {
  switch (type._tag) {
    case "Choice":
      return `-r -f -a '${type.values.map(escapeFishChoice).join(" ")}'`;
    case "Path":
      return `-r -F`;
    default:
      return;
  }
};
var generateCompletions = (executableName, descriptor, parentPath, lines) => {
  const allSubNames = descriptor.subcommands.map((s) => s.name);
  const condition = subcommandCondition(parentPath, allSubNames);
  const conditionArg = condition ? `-n '${condition}'` : ``;
  const hasPathArgs = descriptor.arguments.some((a) => a.type._tag === "Path");
  if (!hasPathArgs) {
    const parts = [`complete -c ${executableName}`];
    if (conditionArg)
      parts.push(conditionArg);
    parts.push(`-f`);
    lines.push(parts.join(" "));
  }
  for (const sub of descriptor.subcommands) {
    const parts = [`complete -c ${executableName}`];
    if (conditionArg)
      parts.push(conditionArg);
    parts.push(`-f -a '${escapeFishString(sub.name)}'`);
    if (sub.description) {
      parts.push(`-d '${escapeFishString(sub.description)}'`);
    }
    lines.push(parts.join(" "));
  }
  for (const flag of descriptor.flags) {
    const isBoolean = flag.type._tag === "Boolean";
    const dedup = isBoolean ? flagContainsOptCondition(flag) : valueFlagDedupCondition(flag);
    const flagCondition = condition ? `${condition}; and ${dedup}` : dedup;
    const flagCondArg = flagCondition ? `-n '${flagCondition}'` : ``;
    const parts = [`complete -c ${executableName}`];
    if (flagCondArg)
      parts.push(flagCondArg);
    parts.push(...flagCompletionArgs(flag));
    lines.push(parts.join(" "));
    if (isBoolean) {
      const negParts = [`complete -c ${executableName}`];
      if (flagCondArg)
        negParts.push(flagCondArg);
      negParts.push(`-l no-${flag.name}`);
      if (flag.description) {
        negParts.push(`-d '${escapeFishString(`Disable ${flag.name}`)}'`);
      }
      lines.push(negParts.join(" "));
    }
  }
  if (descriptor.flags.length > 0) {
    const notDash = `not string match -q -- "-*" (commandline -ct)`;
    const bareBase = condition ? `${condition}; and ${notDash}` : notDash;
    for (const flag of descriptor.flags) {
      const bareCondition = `${bareBase}; and ${flagContainsOptCondition(flag)}`;
      const isBoolean = flag.type._tag === "Boolean";
      const parts = [`complete -c ${executableName}`];
      parts.push(`-n '${bareCondition}'`);
      parts.push(`-f -a '--${flag.name}'`);
      if (flag.description) {
        parts.push(`-d '${escapeFishString(flag.description)}'`);
      }
      lines.push(parts.join(" "));
      if (isBoolean) {
        const negParts = [`complete -c ${executableName}`];
        negParts.push(`-n '${bareCondition}'`);
        negParts.push(`-f -a '--no-${flag.name}'`);
        if (flag.description) {
          negParts.push(`-d '${escapeFishString(`Disable ${flag.name}`)}'`);
        }
        lines.push(negParts.join(" "));
      }
    }
  }
  for (const arg of descriptor.arguments) {
    const valueArg = argValueArgs(arg.type);
    if (valueArg) {
      const parts = [`complete -c ${executableName}`];
      if (conditionArg)
        parts.push(conditionArg);
      parts.push(valueArg);
      if (arg.description) {
        parts.push(`-d '${escapeFishString(arg.description)}'`);
      }
      lines.push(parts.join(" "));
    }
  }
  for (const sub of descriptor.subcommands) {
    generateCompletions(executableName, sub, [...parentPath, sub.name], lines);
  }
};
var generate2 = (executableName, descriptor) => {
  const lines = [];
  lines.push(`###-begin-${executableName}-completions-###`);
  lines.push(`#`);
  lines.push(`# Static completion script for Fish`);
  lines.push(`#`);
  lines.push(`# Installation:`);
  lines.push(`#   ${executableName} --completions fish > ~/.config/fish/completions/${executableName}.fish`);
  lines.push(`#`);
  lines.push(``);
  generateCompletions(executableName, descriptor, [], lines);
  lines.push(``);
  lines.push(`###-end-${executableName}-completions-###`);
  return lines.join(`
`);
};

// node_modules/effect/dist/unstable/cli/internal/completions/zsh.js
var escapeZsh = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "'\\''").replace(/:/g, "\\:");
var escapeZshChoice = (s) => s.replace(/[^A-Za-z0-9_.,/@%+-]/gu, "\\$&").replace(/'/g, "'\\''");
var sanitize = (s) => s.replace(/[^a-zA-Z0-9_]/g, "_");
var allForms = (flag) => {
  const forms = [`--${flag.name}`];
  for (const alias of flag.aliases) {
    forms.push(alias.length === 1 ? `-${alias}` : `--${alias}`);
  }
  if (flag.type._tag === "Boolean") {
    forms.push(`--no-${flag.name}`);
  }
  return forms;
};
var valueAction = (type) => {
  switch (type._tag) {
    case "Boolean":
      return "";
    case "Choice":
      return `:value:(${type.values.map(escapeZshChoice).join(" ")})`;
    case "Path":
      return type.pathType === "directory" ? `:directory:_directories` : `:file:_files`;
    case "Int":
      return `:integer:`;
    case "Finite":
      return `:float:`;
    case "Date":
      return `:date:`;
    default:
      return `:value:`;
  }
};
var argAction = (type) => {
  switch (type._tag) {
    case "Choice":
      return `(${type.values.map(escapeZshChoice).join(" ")})`;
    case "Path":
      return type.pathType === "directory" ? `_directories` : `_files`;
    default:
      return ``;
  }
};
var flagSpecs = (flag) => {
  const specs = [];
  const desc = flag.description ? `[${escapeZsh(flag.description)}]` : "";
  const action = valueAction(flag.type);
  const excl = `(${allForms(flag).join(" ")})`;
  specs.push(`'${excl}--${flag.name}${desc}${action}'`);
  for (const alias of flag.aliases) {
    const prefix = alias.length === 1 ? "-" : "--";
    specs.push(`'${excl}${prefix}${alias}${desc}${action}'`);
  }
  if (flag.type._tag === "Boolean") {
    const negDesc = flag.description ? `[${escapeZsh(`Disable ${flag.name}`)}]` : "";
    specs.push(`'${excl}--no-${flag.name}${negDesc}'`);
  }
  return specs;
};
var argSpec = (arg) => {
  const desc = arg.description ? escapeZsh(arg.description) : arg.name;
  const action = argAction(arg.type);
  const prefix = arg.variadic ? "*" : "";
  return `'${prefix}:${desc}:${action}'`;
};
var generateFunction2 = (descriptor, parentPath, lines) => {
  const currentPath = [...parentPath, descriptor.name];
  const funcName = `_${currentPath.map(sanitize).join("_")}`;
  lines.push(`${funcName}() {`);
  if (descriptor.subcommands.length > 0) {
    lines.push(`  local context state state_descr line`);
    lines.push(`  typeset -A opt_args`);
    lines.push(``);
    lines.push(`  local -a commands`);
    lines.push(`  commands=(`);
    for (const sub of descriptor.subcommands) {
      const desc = sub.description ? escapeZsh(sub.description) : "";
      lines.push(`    '${sub.name}:${desc}'`);
    }
    lines.push(`  )`);
    lines.push(``);
    lines.push(`  local -a specs`);
    lines.push(`  specs=(`);
    for (const flag of descriptor.flags) {
      for (const spec of flagSpecs(flag)) {
        lines.push(`    ${spec}`);
      }
    }
    if (descriptor.arguments.length > 0) {
      lines.push(`    -`);
      lines.push(`    parent-arguments`);
      for (const arg of descriptor.arguments) {
        lines.push(`    ${argSpec(arg)}`);
      }
      lines.push(`    -`);
      lines.push(`    subcommands`);
    }
    lines.push(`    '1:command:->command'`);
    lines.push(`    '*::arg:->args'`);
    lines.push(`  )`);
    lines.push(``);
    lines.push(`  _arguments -C "\${specs[@]}"`);
    lines.push(``);
    lines.push(`  case "$state" in`);
    lines.push(`    command)`);
    lines.push(`      _describe -t commands 'commands' commands`);
    lines.push(`      ;;`);
    lines.push(`    args)`);
    lines.push(`      case "$words[1]" in`);
    for (const sub of descriptor.subcommands) {
      const subFunc = `_${[...currentPath, sub.name].map(sanitize).join("_")}`;
      lines.push(`        ${sub.name})`);
      lines.push(`          ${subFunc}`);
      lines.push(`          ;;`);
    }
    lines.push(`      esac`);
    lines.push(`      ;;`);
    lines.push(`  esac`);
  } else {
    const allSpecs = [];
    for (const flag of descriptor.flags) {
      allSpecs.push(...flagSpecs(flag));
    }
    for (const arg of descriptor.arguments) {
      allSpecs.push(argSpec(arg));
    }
    if (allSpecs.length > 0) {
      lines.push(`  local -a specs`);
      lines.push(`  specs=(`);
      for (const spec of allSpecs) {
        lines.push(`    ${spec}`);
      }
      lines.push(`  )`);
      lines.push(`  _arguments "\${specs[@]}"`);
    }
  }
  lines.push(`}`);
  lines.push(``);
  for (const sub of descriptor.subcommands) {
    generateFunction2(sub, currentPath, lines);
  }
};
var generate3 = (executableName, descriptor) => {
  const lines = [];
  const safeName = sanitize(executableName);
  lines.push(`#compdef ${executableName}`);
  lines.push(`###-begin-${executableName}-completions-###`);
  lines.push(`#`);
  lines.push(`# Static completion script for Zsh`);
  lines.push(`#`);
  lines.push(`# Installation:`);
  lines.push(`#   ${executableName} --completions zsh > ~/.zsh/completions/_${executableName}`);
  lines.push(`#   then add ~/.zsh/completions to your fpath`);
  lines.push(`#`);
  lines.push(``);
  generateFunction2(descriptor, [], lines);
  lines.push(`# Handle both direct invocation and autoload`);
  lines.push(`if [[ "\${zsh_eval_context[-1]}" == "loadautofunc" ]]; then`);
  lines.push(`  _${safeName} "$@"`);
  lines.push(`else`);
  lines.push(`  compdef _${safeName} ${executableName}`);
  lines.push(`fi`);
  lines.push(`###-end-${executableName}-completions-###`);
  return lines.join(`
`);
};

// node_modules/effect/dist/unstable/cli/Completions.js
var generate4 = (executableName, shell, descriptor) => {
  switch (shell) {
    case "bash":
      return generate(executableName, descriptor);
    case "zsh":
      return generate3(executableName, descriptor);
    case "fish":
      return generate2(executableName, descriptor);
  }
};

// node_modules/effect/dist/unstable/cli/Flag.js
var Boolean6 = (name) => Boolean5(flagKind, name);
var ChoiceWithValue3 = (name, choices) => ChoiceWithValue(flagKind, name, choices);
var Literals3 = (name, literals) => Literals2(flagKind, name, literals);
var withAlias2 = /* @__PURE__ */ dual(2, (self, alias) => withAlias(self, alias));
var withDescription3 = /* @__PURE__ */ dual(2, (self, description) => withDescription(self, description));
var withMetavar2 = /* @__PURE__ */ dual(2, (self, metavar) => withMetavar(self, metavar));
var optional4 = (param) => optional3(param);
var withDefault4 = withDefault3;
var map12 = /* @__PURE__ */ dual(2, (self, f) => map11(self, f));

// node_modules/effect/dist/unstable/cli/internal/config.js
var ConfigInternalTypeId = "~effect/cli/Command/Config/Internal";
var parseConfig = (config) => {
  const orderedParams = [];
  const flags = [];
  const args = [];
  function parse(config) {
    const tree = Object.create(null);
    for (const key of Object.keys(config)) {
      tree[key] = parseValue(config[key]);
    }
    return tree;
  }
  function parseValue(value) {
    if (Array.isArray(value)) {
      return {
        _tag: "Array",
        children: value.map((v) => parseValue(v))
      };
    } else if (isParam(value)) {
      const index = orderedParams.length;
      orderedParams.push(value);
      if (value.kind === "argument") {
        args.push(value);
      } else {
        flags.push(value);
      }
      return {
        _tag: "Param",
        index
      };
    } else {
      return {
        _tag: "Nested",
        tree: parse(value)
      };
    }
  }
  return {
    [ConfigInternalTypeId]: ConfigInternalTypeId,
    flags,
    arguments: args,
    orderedParams,
    tree: parse(config)
  };
};
var emptyConfig = /* @__PURE__ */ parseConfig({});
var reconstructTree = (tree, results) => {
  const output = {};
  for (const key of Object.keys(tree)) {
    assignProperty(output, key, nodeValue(tree[key]));
  }
  return output;
  function nodeValue(node) {
    switch (node._tag) {
      case "Param":
        return results[node.index];
      case "Array":
        return node.children.map((child) => nodeValue(child));
      case "Nested":
        return reconstructTree(node.tree, results);
    }
  }
};

// node_modules/effect/dist/unstable/cli/internal/command.js
var TypeId47 = "~effect/cli/Command";
var toImpl = (self) => self;
var Proto16 = {
  .../* @__PURE__ */ Prototype2({
    label: "Command",
    evaluate() {
      return toImpl(this).service;
    }
  })
};
var makeCommand = (options) => {
  const config = options.config;
  const contextConfig = options.contextConfig ?? emptyConfig;
  const service = options.service ?? Service(`${TypeId47}/${options.name}`);
  const annotations = options.annotations ?? empty2();
  const globalFlags = options.globalFlags ?? [];
  const subcommands = options.subcommands ?? [];
  const handle = (input, commandPath) => isNotUndefined(options.handle) ? options.handle(input, commandPath) : fail6(new ShowHelp({
    commandPath,
    errors: []
  }));
  const parse = options.parse ?? makeParser2(config);
  const parseContext = options.parseContext ?? makeParser2(contextConfig, {
    allowLeftovers: true
  });
  const buildHelpDoc = (commandPath) => {
    const args = [];
    const flags = [];
    for (const arg of config.arguments) {
      const singles = extractSingleParams(arg);
      const metadata = getParamMetadata(arg);
      for (const single of singles) {
        args.push({
          name: single.name,
          type: single.typeName ?? getTypeName(single.primitiveType),
          description: single.description,
          required: !metadata.isOptional && (!metadata.isVariadic || exists(metadata.variadicMin, (min) => min > 0)),
          variadic: metadata.isVariadic
        });
      }
    }
    let usage = commandPath.length > 0 ? commandPath.join(" ") : options.name;
    if (subcommands.some((group) => group.commands.some((c) => !c.unlisted))) {
      usage += " <subcommand>";
    }
    usage += " [flags]";
    for (const arg of args) {
      const argName = arg.variadic ? `<${arg.name}...>` : `<${arg.name}>`;
      usage += ` ${arg.required ? argName : `[${argName}]`}`;
    }
    for (const option of config.flags) {
      const singles = extractSingleParams(option);
      const metadata = getParamMetadata(option);
      for (const single of singles) {
        if (single.hidden)
          continue;
        flags.push(toFlagDoc(single, metadata));
      }
    }
    const subcommandDocs = [];
    for (const group of subcommands) {
      const visible = group.commands.filter((c) => !c.unlisted);
      if (visible.length === 0)
        continue;
      subcommandDocs.push({
        group: group.group,
        commands: map4(visible, (subcommand) => ({
          name: subcommand.name,
          alias: subcommand.alias,
          shortDescription: subcommand.shortDescription,
          description: subcommand.description ?? ""
        }))
      });
    }
    const examples = options.examples ?? [];
    return {
      description: options.description ?? "",
      usage,
      flags,
      annotations,
      ...args.length > 0 && {
        args
      },
      ...subcommandDocs.length > 0 && {
        subcommands: subcommandDocs
      },
      ...examples.length > 0 && {
        examples
      }
    };
  };
  return Object.assign(Object.create(Proto16), {
    [TypeId47]: TypeId47,
    name: options.name,
    examples: options.examples ?? [],
    annotations,
    globalFlags,
    subcommands,
    unlisted: options.unlisted ?? false,
    config,
    contextConfig,
    service,
    parse,
    parseContext,
    handle,
    buildHelpDoc,
    ...isNotUndefined(options.description) ? {
      description: options.description
    } : {},
    ...isNotUndefined(options.shortDescription) ? {
      shortDescription: options.shortDescription
    } : {},
    ...isNotUndefined(options.alias) ? {
      alias: options.alias
    } : {}
  });
};
var toFlagDoc = (single, metadata) => {
  const formattedAliases = single.aliases.map((alias) => alias.length === 1 ? `-${alias}` : `--${alias}`);
  return {
    name: single.name,
    aliases: formattedAliases,
    type: single.typeName ?? getTypeName(single.primitiveType),
    description: appendChoiceKeys(single.description, getChoiceKeys(single.primitiveType)),
    required: single.primitiveType._tag !== "Boolean" && !metadata.isOptional
  };
};
var appendChoiceKeys = (description, choiceKeys) => {
  if (choiceKeys === undefined || choiceKeys.length === 0) {
    return description;
  }
  const choiceSuffix = `(choices: ${choiceKeys.join(", ")})`;
  return match(description, {
    onNone: () => some2(choiceSuffix),
    onSome: (value) => some2(`${value} ${choiceSuffix}`)
  });
};
var makeParser2 = (cfg, options) => fnUntraced2(function* (input) {
  const parsedArgs = {
    flags: input.flags,
    arguments: input.arguments
  };
  const [remainingArguments, values] = yield* parseParams(parsedArgs, cfg.orderedParams);
  if (options?.allowLeftovers !== true && remainingArguments.length > 0) {
    return yield* new UnexpectedArgument({
      arguments: remainingArguments
    });
  }
  return reconstructTree(cfg.tree, values);
});
var parseParams = /* @__PURE__ */ fnUntraced2(function* (parsedArgs, params) {
  const results = [];
  let currentArguments = parsedArgs.arguments;
  for (const option of params) {
    const [remainingArguments, parsed] = yield* option.parse({
      flags: parsedArgs.flags,
      arguments: currentArguments
    });
    results.push(parsed);
    currentArguments = remainingArguments;
  }
  return [currentArguments, results];
});
var checkForDuplicateFlags = (parent, subcommands, options) => {
  const parentImpl = toImpl(parent);
  const parentOptionNames = new Set;
  const extractNames = (flags) => {
    for (const option of flags) {
      const singles = extractSingleParams(option);
      for (const single of singles) {
        parentOptionNames.add(single.name);
      }
    }
  };
  extractNames((options?.contextConfig ?? parentImpl.contextConfig).flags);
  for (const subcommand of subcommands) {
    const subImpl = toImpl(subcommand);
    for (const option of subImpl.config.flags) {
      const singles = extractSingleParams(option);
      for (const single of singles) {
        if (parentOptionNames.has(single.name)) {
          throw new DuplicateOption({
            option: single.name,
            parentCommand: parent.name,
            childCommand: subcommand.name
          });
        }
      }
    }
  }
};

// node_modules/effect/dist/unstable/cli/internal/completions/descriptor.js
var toFlagType = (single) => {
  const tag = single.primitiveType._tag;
  switch (tag) {
    case "Boolean":
      return {
        _tag: "Boolean"
      };
    case "Int":
      return {
        _tag: "Int"
      };
    case "Finite":
      return {
        _tag: "Finite"
      };
    case "Date":
      return {
        _tag: "Date"
      };
    case "Choice": {
      const keys = getChoiceKeys(single.primitiveType);
      return {
        _tag: "Choice",
        values: keys ?? []
      };
    }
    case "Path":
      return {
        _tag: "Path",
        pathType: getPathType(single.primitiveType) ?? "either"
      };
    case "FileText":
    case "FileParse":
    case "FileSchema":
      return {
        _tag: "Path",
        pathType: "file"
      };
    default:
      return {
        _tag: "String"
      };
  }
};
var toArgumentType = (single) => {
  const tag = single.primitiveType._tag;
  switch (tag) {
    case "Int":
      return {
        _tag: "Int"
      };
    case "Finite":
      return {
        _tag: "Finite"
      };
    case "Date":
      return {
        _tag: "Date"
      };
    case "Choice": {
      const keys = getChoiceKeys(single.primitiveType);
      return {
        _tag: "Choice",
        values: keys ?? []
      };
    }
    case "Path":
      return {
        _tag: "Path",
        pathType: getPathType(single.primitiveType) ?? "either"
      };
    case "FileText":
    case "FileParse":
    case "FileSchema":
      return {
        _tag: "Path",
        pathType: "file"
      };
    default:
      return {
        _tag: "String"
      };
  }
};
var fromCommand = (cmd, inheritedFlags = []) => {
  const impl = toImpl(cmd);
  const config = impl.config;
  const flags = [];
  const seen = new Set;
  for (const [index, flag] of [...config.flags, ...inheritedFlags].entries()) {
    const singles = extractSingleParams(flag);
    for (const single of singles) {
      if (single.kind !== "flag")
        continue;
      if (single.hidden)
        continue;
      if (index >= config.flags.length && seen.has(single.name))
        continue;
      seen.add(single.name);
      flags.push({
        name: single.name,
        aliases: single.aliases,
        description: getOrUndefined(single.description),
        type: toFlagType(single)
      });
    }
  }
  const args = [];
  for (const arg of config.arguments) {
    const singles = extractSingleParams(arg);
    const metadata = getParamMetadata(arg);
    for (const single of singles) {
      if (single.kind !== "argument")
        continue;
      args.push({
        name: single.name,
        description: getOrUndefined(single.description),
        required: !metadata.isOptional,
        variadic: metadata.isVariadic,
        type: toArgumentType(single)
      });
    }
  }
  const subcommands = [];
  const sharedFlags = [...inheritedFlags, ...impl.contextConfig.flags];
  for (const group of cmd.subcommands) {
    for (const subcommand of group.commands) {
      if (subcommand.unlisted)
        continue;
      const descriptor = fromCommand(subcommand, sharedFlags);
      subcommands.push(descriptor);
      if (subcommand.alias && subcommand.alias !== subcommand.name) {
        subcommands.push({
          ...descriptor,
          name: subcommand.alias
        });
      }
    }
  }
  return {
    name: cmd.name,
    description: cmd.shortDescription ?? cmd.description,
    flags,
    arguments: args,
    subcommands
  };
};

// node_modules/effect/dist/unstable/cli/internal/help.js
var dedupeGlobalFlags = (flags) => {
  const seen = new Set;
  const deduped = [];
  for (const flag of flags) {
    if (seen.has(flag)) {
      continue;
    }
    seen.add(flag);
    deduped.push(flag);
  }
  return deduped;
};
var getCommandsForCommandPath = (command, commandPath) => {
  const commands = [command];
  let currentCommand = command;
  for (let i = 1;i < commandPath.length; i++) {
    const subcommandName = commandPath[i];
    let subcommand = undefined;
    for (const group of currentCommand.subcommands) {
      subcommand = group.commands.find((sub) => sub.name === subcommandName);
      if (subcommand) {
        break;
      }
    }
    if (!subcommand) {
      break;
    }
    commands.push(subcommand);
    currentCommand = subcommand;
  }
  return commands;
};
var getGlobalFlagsForCommandPath = (command, commandPath, builtIns) => {
  const commands = getCommandsForCommandPath(command, commandPath);
  const declared = commands.flatMap((current) => toImpl(current).globalFlags);
  return dedupeGlobalFlags([...builtIns, ...declared]);
};
var collectDeclaredGlobalFlags = (command) => {
  const collected = [];
  const visit = (current) => {
    const impl = toImpl(current);
    for (const flag of impl.globalFlags) {
      collected.push(flag);
    }
    for (const group of current.subcommands) {
      for (const subcommand of group.commands) {
        visit(subcommand);
      }
    }
  };
  visit(command);
  return dedupeGlobalFlags(collected);
};
var getSharedFlagsForCommandPath = (commands, currentFlags) => {
  if (commands.length <= 1) {
    return [];
  }
  const seen = new Set(currentFlags.map((flag) => flag.name));
  const sharedFlags = [];
  for (const ancestor of commands.slice(0, -1)) {
    const ancestorImpl = toImpl(ancestor);
    for (const flag of ancestorImpl.contextConfig.flags) {
      const singles = extractSingleParams(flag);
      const metadata = getParamMetadata(flag);
      for (const single of singles) {
        if (seen.has(single.name)) {
          continue;
        }
        if (single.hidden) {
          continue;
        }
        seen.add(single.name);
        sharedFlags.push(toFlagDoc(single, metadata));
      }
    }
  }
  return sharedFlags;
};
var getGlobalFlagsForCommandTree = (command, builtIns) => dedupeGlobalFlags([...builtIns, ...collectDeclaredGlobalFlags(command)]);
var getHelpForCommandPath = (command, commandPath, builtIns) => gen2(function* () {
  const commands = getCommandsForCommandPath(command, commandPath);
  const currentCommand = commands.length > 0 ? commands[commands.length - 1] : command;
  const baseDoc = toImpl(currentCommand).buildHelpDoc(commandPath);
  const sharedFlags = getSharedFlagsForCommandPath(commands, baseDoc.flags);
  const flags = getGlobalFlagsForCommandPath(command, commandPath, builtIns);
  const globalFlagDocs = [];
  for (const flag of flags) {
    const singles = extractSingleParams(flag.flag);
    const metadata = getParamMetadata(flag.flag);
    for (const single of singles) {
      if (single.hidden)
        continue;
      globalFlagDocs.push({
        ...toFlagDoc(single, metadata),
        required: false
      });
    }
  }
  return {
    ...baseDoc,
    flags: [...sharedFlags, ...baseDoc.flags],
    globalFlags: globalFlagDocs
  };
});

// node_modules/effect/dist/unstable/cli/GlobalFlag.js
var Action2 = (options) => ({
  _tag: "Action",
  flag: options.flag,
  run: options.run
});
var Setting = (id) => (options) => {
  settingIdCounter += 1;
  const ref = Service(`effect/unstable/cli/GlobalFlag/${id}/${settingIdCounter}`);
  return Object.assign(ref, {
    _tag: "Setting",
    id,
    flag: options.flag
  });
};
var settingIdCounter = 0;
var Help = /* @__PURE__ */ Action2({
  flag: /* @__PURE__ */ Boolean6("help").pipe(/* @__PURE__ */ withAlias2("h"), /* @__PURE__ */ withDescription3("Show help information"), /* @__PURE__ */ withDefault4(false)),
  run: /* @__PURE__ */ fnUntraced2(function* (_, {
    builtIns,
    command,
    commandPath
  }) {
    const formatter = yield* Formatter2;
    const helpDoc = yield* getHelpForCommandPath(command, commandPath, builtIns);
    yield* log2(formatter.formatHelpDoc(helpDoc));
  })
});
var Version = /* @__PURE__ */ Action2({
  flag: /* @__PURE__ */ Boolean6("version").pipe(/* @__PURE__ */ withAlias2("v"), /* @__PURE__ */ withDescription3("Show version information"), /* @__PURE__ */ withDefault4(false)),
  run: /* @__PURE__ */ fnUntraced2(function* (_, {
    command,
    version
  }) {
    const formatter = yield* Formatter2;
    yield* log2(formatter.formatVersion(command.name, version));
  })
});
var Wizard = /* @__PURE__ */ Action2({
  flag: /* @__PURE__ */ Boolean6("wizard").pipe(/* @__PURE__ */ withDescription3("Start wizard mode for a command"), /* @__PURE__ */ withDefault4(false)),
  run: () => void_3
});
var Completions = /* @__PURE__ */ Action2({
  flag: /* @__PURE__ */ Literals3("completions", ["bash", "zsh", "fish", "sh"]).pipe(optional4, /* @__PURE__ */ map12((v) => map(v, (s) => s === "sh" ? "bash" : s)), /* @__PURE__ */ withMetavar2("<bash|zsh|fish|sh>"), /* @__PURE__ */ withDescription3("Print shell completion script")),
  run: /* @__PURE__ */ fnUntraced2(function* (shell, {
    command
  }) {
    if (isNone2(shell))
      return;
    const descriptor = fromCommand(command);
    yield* log2(generate4(command.name, shell.value, descriptor));
  })
});
var LogLevel2 = /* @__PURE__ */ Setting("log-level")({
  flag: /* @__PURE__ */ ChoiceWithValue3("log-level", [["all", "All"], ["trace", "Trace"], ["debug", "Debug"], ["info", "Info"], ["warn", "Warn"], ["warning", "Warn"], ["error", "Error"], ["fatal", "Fatal"], ["none", "None"]]).pipe(optional4, /* @__PURE__ */ withDescription3("Sets the minimum log level"), /* @__PURE__ */ withMetavar2("<all|trace|debug|info|warn|warning|error|fatal|none>"))
});
var BuiltIns = [Help, Version, Wizard, Completions, LogLevel2];

// node_modules/effect/dist/unstable/cli/CliConfig.js
class CliConfig extends (/* @__PURE__ */ Reference("effect/unstable/cli/CliConfig", {
  defaultValue: () => defaults
})) {
}
var defaults = {
  builtIns: BuiltIns
};

// node_modules/effect/dist/unstable/cli/internal/lexer.js
function lex(argv) {
  const endIndex = argv.indexOf("--");
  if (endIndex === -1) {
    return {
      tokens: lexTokens(argv),
      trailingOperands: []
    };
  }
  return {
    tokens: lexTokens(argv.slice(0, endIndex)),
    trailingOperands: argv.slice(endIndex + 1)
  };
}
var lexTokens = (args) => {
  const tokens = [];
  for (const arg of args) {
    if (!arg.startsWith("-")) {
      tokens.push({
        _tag: "Value",
        value: arg
      });
    } else if (arg.startsWith("--")) {
      const equalIndex = arg.indexOf("=");
      if (equalIndex !== -1) {
        const name = arg.slice(2, equalIndex);
        const value = arg.slice(equalIndex + 1);
        tokens.push({
          _tag: "LongOption",
          name,
          raw: arg,
          value
        });
      } else {
        tokens.push({
          _tag: "LongOption",
          name: arg.slice(2),
          raw: arg
        });
      }
    } else if (arg.length > 1) {
      const flags = arg.slice(1);
      const equalIndex = flags.indexOf("=");
      if (equalIndex !== -1) {
        const flag = flags.slice(0, equalIndex);
        const value = flags.slice(equalIndex + 1);
        tokens.push({
          _tag: "ShortOption",
          flag,
          raw: `-${flag}`,
          value
        });
      } else {
        for (const ch of flags) {
          tokens.push({
            _tag: "ShortOption",
            flag: ch,
            raw: `-${ch}`
          });
        }
      }
    } else {
      tokens.push({
        _tag: "Value",
        value: arg
      });
    }
  }
  return tokens;
};

// node_modules/effect/dist/unstable/cli/internal/auto-suggest.js
var levenshtein = (a, b) => {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({
    length: m + 1
  }, () => new Array(n + 1).fill(0));
  for (let i = 0;i <= m; i++)
    dp[i][0] = i;
  for (let j = 0;j <= n; j++)
    dp[0][j] = j;
  for (let i = 1;i <= m; i++) {
    for (let j = 1;j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
};
var suggest = (input, candidates) => {
  const distances = candidates.map((c) => [levenshtein(input, c), c]).filter(([d]) => d <= 2).sort(([a], [b]) => a - b);
  if (distances.length === 0)
    return [];
  const minDistance = distances[0][0];
  return distances.filter(([d]) => d === minDistance).map(([, c]) => c);
};

// node_modules/effect/dist/unstable/cli/internal/parser.js
var getCommandPath = (parsedInput) => match(parsedInput.subcommand, {
  onNone: () => [],
  onSome: (subcommand) => [subcommand.name, ...getCommandPath(subcommand.parsedInput)]
});
var parseArgs = (lexResult, command, commandPath = []) => gen2(function* () {
  const {
    tokens,
    trailingOperands: afterEndOfOptions
  } = lexResult;
  const newCommandPath = [...commandPath, command.name];
  const commandImpl = toImpl(command);
  const singles = commandImpl.config.flags.flatMap(extractSingleParams);
  const flagParams = singles.filter(isFlagParam);
  const flagRegistry = createFlagRegistry(flagParams);
  const inheritedSingles = commandImpl.contextConfig.flags.flatMap(extractSingleParams);
  const inheritedFlagParams = inheritedSingles.filter(isFlagParam);
  const inheritedFlagRegistry = createFlagRegistry(inheritedFlagParams);
  const inheritedNames = new Set(inheritedFlagParams.map((param) => param.name));
  const context = {
    command,
    commandPath: newCommandPath,
    flagRegistry,
    inheritedFlagRegistry,
    localFlagNames: flagParams.filter((param) => !inheritedNames.has(param.name)).map((param) => param.name)
  };
  const result = scanCommandLevel(tokens, context);
  if (result._tag === "Leaf") {
    return {
      flags: result.flags,
      arguments: [...result.arguments, ...afterEndOfOptions],
      subcommand: none2(),
      ...result.errors.length > 0 && {
        errors: result.errors
      }
    };
  }
  const subLex = {
    tokens: result.childTokens,
    trailingOperands: afterEndOfOptions
  };
  const subParsed = yield* parseArgs(subLex, result.sub, newCommandPath);
  const allErrors = [...result.errors, ...subParsed.errors ?? []];
  return {
    flags: result.flags,
    arguments: [],
    subcommand: some2({
      name: result.sub.name,
      parsedInput: subParsed
    }),
    ...allErrors.length > 0 && {
      errors: allErrors
    }
  };
});
var makeCursor = (tokens) => {
  let i = 0;
  return {
    peek: () => tokens[i],
    take: () => tokens[i++],
    rest: () => tokens.slice(i)
  };
};
var createFlagRegistry = (params) => {
  const index = new Map;
  for (const param of params) {
    if (index.has(param.name)) {
      throw new Error(`Duplicate flag name "${param.name}" in command definition`);
    }
    index.set(param.name, param);
    for (const alias of param.aliases) {
      if (index.has(alias)) {
        throw new Error(`Duplicate flag/alias "${alias}" in command definition (conflicts with "${index.get(alias).name}")`);
      }
      index.set(alias, param);
    }
  }
  return {
    params,
    index
  };
};
var buildSubcommandIndex = (subcommands) => {
  const index = new Map;
  const setKey = (key, command) => {
    const existing = index.get(key);
    if (existing && existing !== command) {
      throw new Error(`Duplicate subcommand name/alias "${key}" in command definition (conflicts with "${existing.name}")`);
    }
    index.set(key, command);
  };
  for (const group of subcommands) {
    for (const subcommand of group.commands) {
      setKey(subcommand.name, subcommand);
      if (subcommand.alias && subcommand.alias !== subcommand.name) {
        setKey(subcommand.alias, subcommand);
      }
    }
  }
  return index;
};
var createEmptyFlagMap = (params) => Object.fromEntries(params.map((p) => [p.name, []]));
var createFlagAccumulator = (params) => {
  const map = createEmptyFlagMap(params);
  return {
    add: (name, raw) => {
      if (raw !== undefined)
        map[name].push(raw);
    },
    merge: (from) => {
      for (const key in from) {
        const values = from[key];
        if (values?.length) {
          for (let i = 0;i < values.length; i++) {
            map[key].push(values[i]);
          }
        }
      }
    },
    snapshot: () => map
  };
};
var isFlagToken = (t) => t._tag === "LongOption" || t._tag === "ShortOption";
var getFlagName = (t) => t._tag === "LongOption" ? t.name : t.flag;
var resolveFlag = (token, registry) => {
  const tokenName = getFlagName(token);
  const direct = registry.index.get(tokenName);
  if (direct && direct.name === tokenName) {
    return {
      param: direct,
      negated: false
    };
  }
  if (token._tag === "LongOption" && token.name.startsWith("no-")) {
    const canonicalName = token.name.slice(3);
    const param = registry.index.get(canonicalName);
    if (param && param.name === canonicalName && isBoolean2(param.primitiveType)) {
      return {
        param,
        negated: true
      };
    }
  }
  if (direct) {
    return {
      param: direct,
      negated: false
    };
  }
  return;
};
var invalidNegatedFlagValue = (token, spec, value) => new InvalidValue2({
  option: spec.name,
  value,
  expected: `omit the value and use ${token.raw} by itself to set --${spec.name} to false`,
  kind: "flag"
});
var missingFlagValue = (spec) => {
  const choices = getChoiceKeys(spec.primitiveType);
  return new InvalidValue2({
    option: spec.name,
    value: "",
    expected: choices === undefined ? spec.typeName ?? getTypeName(spec.primitiveType) : choices.join(" | "),
    kind: "flag"
  });
};
var asBooleanLiteral = (token) => token?._tag === "Value" && (isTrueLiteral(token.value) || isFalseLiteral(token.value)) ? token.value : undefined;
var consumeFlagValue = (cursor, token, spec, negated = false) => {
  const consumed = consumeFlagValueWithTokens(cursor, token, spec, negated);
  switch (consumed._tag) {
    case "Value":
      return {
        _tag: "Value",
        value: consumed.value
      };
    case "Error":
      return {
        _tag: "Error",
        error: consumed.error
      };
  }
};
var consumeFlagValueWithTokens = (cursor, token, spec, negated = false) => {
  if (negated) {
    if (token.value !== undefined) {
      return {
        _tag: "Error",
        error: invalidNegatedFlagValue(token, spec, token.value),
        tokens: []
      };
    }
    const literal = asBooleanLiteral(cursor.peek());
    if (literal !== undefined) {
      const literalToken = cursor.take();
      return {
        _tag: "Error",
        error: invalidNegatedFlagValue(token, spec, literal),
        tokens: literalToken === undefined ? [] : [literalToken]
      };
    }
    return {
      _tag: "Value",
      value: "false",
      tokens: []
    };
  }
  if (token.value !== undefined) {
    return {
      _tag: "Value",
      value: token.value,
      tokens: []
    };
  }
  if (isBoolean2(spec.primitiveType)) {
    const literal = asBooleanLiteral(cursor.peek());
    const literalToken = literal !== undefined ? cursor.take() : undefined;
    return {
      _tag: "Value",
      value: literal ?? "true",
      tokens: literalToken === undefined ? [] : [literalToken]
    };
  }
  const next = cursor.peek();
  if (next?._tag === "Value") {
    const valueToken = cursor.take();
    return {
      _tag: "Value",
      value: next.value,
      tokens: valueToken === undefined ? [] : [valueToken]
    };
  }
  return {
    _tag: "Error",
    error: missingFlagValue(spec),
    tokens: []
  };
};
var consumeKnownFlags = (tokens, registry) => {
  const flagMap = createEmptyFlagMap(registry.params);
  const remainder = [];
  const errors = [];
  const cursor = makeCursor(tokens);
  for (let t = cursor.take();t; t = cursor.take()) {
    if (!isFlagToken(t)) {
      remainder.push(t);
      continue;
    }
    const resolved = resolveFlag(t, registry);
    if (!resolved) {
      remainder.push(t);
      continue;
    }
    const consumed = consumeFlagValue(cursor, t, resolved.param, resolved.negated);
    if (consumed._tag === "Error") {
      errors.push(consumed.error);
      continue;
    }
    if (consumed.value !== undefined) {
      flagMap[resolved.param.name].push(consumed.value);
    }
  }
  return {
    flagMap,
    remainder,
    errors
  };
};
var extractFlagParams = (command) => {
  const commandImpl = toImpl(command);
  const singles = commandImpl.config.flags.flatMap(extractSingleParams);
  return singles.filter(isFlagParam);
};
var extractContextFlagParams = (command) => {
  const commandImpl = toImpl(command);
  const singles = commandImpl.contextConfig.flags.flatMap(extractSingleParams);
  return singles.filter(isFlagParam);
};
var resolveFromRegistries = (token, registries) => {
  for (const registry of registries) {
    const resolved = resolveFlag(token, registry);
    if (resolved !== undefined) {
      return resolved;
    }
  }
  return;
};
var preserveFlag = (remainder, cursor, token, resolved) => {
  remainder.push(token);
  const consumed = consumeFlagValueWithTokens(cursor, token, resolved.param, resolved.negated);
  remainder.push(...consumed.tokens);
};
var localFlagWouldPrecedeSubcommand = (token, remainingTokens, resolved, subIndex, registries) => {
  const cursor = makeCursor(remainingTokens);
  consumeFlagValueWithTokens(cursor, token, resolved.param, resolved.negated);
  for (let token = cursor.take();token; token = cursor.take()) {
    if (isFlagToken(token)) {
      const known = resolveFromRegistries(token, registries);
      if (known !== undefined) {
        consumeFlagValueWithTokens(cursor, token, known.param, known.negated);
      }
      continue;
    }
    if (token._tag === "Value") {
      return subIndex.has(token.value);
    }
  }
  return false;
};
var consumeGlobalFlags = (tokens, command, registry) => {
  const flagMap = createEmptyFlagMap(registry.params);
  const errors = [];
  const consumeLevel = (tokens, command, ignoredRegistries) => {
    const localRegistry = createFlagRegistry(extractFlagParams(command));
    const inheritedRegistry = createFlagRegistry(extractContextFlagParams(command));
    const subIndex = buildSubcommandIndex(command.subcommands);
    const cursor = makeCursor(tokens);
    const remainder = [];
    let awaitingFirstValue = true;
    for (let token = cursor.take();token; token = cursor.take()) {
      if (isFlagToken(token)) {
        const ignored = resolveFromRegistries(token, ignoredRegistries);
        if (ignored !== undefined) {
          preserveFlag(remainder, cursor, token, ignored);
          continue;
        }
        const inherited = resolveFlag(token, inheritedRegistry);
        if (inherited !== undefined) {
          preserveFlag(remainder, cursor, token, inherited);
          continue;
        }
        const local = resolveFlag(token, localRegistry);
        const global = resolveFlag(token, registry);
        if (local !== undefined) {
          if (global === undefined || !awaitingFirstValue || !localFlagWouldPrecedeSubcommand(token, cursor.rest(), local, subIndex, [localRegistry, inheritedRegistry, registry])) {
            preserveFlag(remainder, cursor, token, local);
            continue;
          }
        }
        if (global !== undefined) {
          const consumed = consumeFlagValueWithTokens(cursor, token, global.param, global.negated);
          if (consumed._tag === "Error") {
            errors.push(consumed.error);
            continue;
          }
          if (consumed.value !== undefined) {
            flagMap[global.param.name].push(consumed.value);
          }
          continue;
        }
        remainder.push(token);
        continue;
      }
      if (token._tag === "Value" && awaitingFirstValue) {
        const sub = subIndex.get(token.value);
        if (sub !== undefined) {
          remainder.push(token);
          remainder.push(...consumeLevel(cursor.rest(), sub, [...ignoredRegistries, inheritedRegistry]));
          return remainder;
        }
        awaitingFirstValue = false;
      }
      remainder.push(token);
    }
    return remainder;
  };
  return {
    flagMap,
    remainder: consumeLevel(tokens, command, []),
    errors
  };
};
var createUnrecognizedFlagError = (token, params, commandPath) => {
  const printable = token._tag === "LongOption" ? `--${token.name}` : `-${token.flag}`;
  const validNames = [];
  for (const p of params) {
    if (p.hidden)
      continue;
    validNames.push(p.name);
    if (isBoolean2(p.primitiveType)) {
      validNames.push(`no-${p.name}`);
    }
    for (const alias of p.aliases) {
      validNames.push(alias);
    }
  }
  const suggestions = suggest(getFlagName(token), validNames).map((n) => n.length === 1 ? `-${n}` : `--${n}`);
  return new UnrecognizedOption({
    option: printable,
    suggestions,
    command: commandPath
  });
};
var createParseState = (registry) => ({
  flags: createFlagAccumulator(registry.params),
  arguments: [],
  errors: [],
  mode: {
    _tag: "AwaitingFirstValue"
  }
});
var toLeafResult = (state) => ({
  _tag: "Leaf",
  flags: state.flags.snapshot(),
  arguments: state.arguments,
  errors: state.errors
});
var resolveFirstValue = (value, cursor, context, state) => {
  const {
    command,
    commandPath,
    inheritedFlagRegistry,
    localFlagNames
  } = context;
  const subIndex = buildSubcommandIndex(command.subcommands);
  const sub = subIndex.get(value);
  if (sub) {
    const selectedPath = [...commandPath, sub.name];
    const parentFlags = state.flags.snapshot();
    for (const localFlagName of localFlagNames) {
      const values = parentFlags[localFlagName];
      if (values !== undefined && values.length > 0) {
        state.errors.push(new UnrecognizedOption({
          option: `--${localFlagName}`,
          suggestions: [],
          command: selectedPath
        }));
      }
    }
    const tail = consumeKnownFlags(cursor.rest(), inheritedFlagRegistry);
    state.flags.merge(tail.flagMap);
    state.errors.push(...tail.errors);
    return {
      _tag: "Subcommand",
      result: {
        _tag: "Sub",
        flags: state.flags.snapshot(),
        sub,
        childTokens: tail.remainder,
        errors: state.errors
      }
    };
  }
  const expectsArgs = toImpl(command).config.arguments.length > 0;
  if (!expectsArgs && subIndex.size > 0) {
    const visibleKeys = [];
    for (const [key, sub] of subIndex) {
      if (!sub.unlisted)
        visibleKeys.push(key);
    }
    const suggestions = suggest(value, visibleKeys);
    state.errors.push(new UnknownSubcommand({
      subcommand: value,
      parent: commandPath,
      suggestions
    }));
  }
  return {
    _tag: "Argument"
  };
};
var processFlag = (token, cursor, context, state) => {
  const {
    commandPath,
    flagRegistry
  } = context;
  const resolved = resolveFlag(token, flagRegistry);
  if (!resolved) {
    state.errors.push(createUnrecognizedFlagError(token, flagRegistry.params, commandPath));
    return;
  }
  const consumed = consumeFlagValue(cursor, token, resolved.param, resolved.negated);
  if (consumed._tag === "Error") {
    state.errors.push(consumed.error);
    return;
  }
  state.flags.add(resolved.param.name, consumed.value);
};
var processValue = (value, cursor, context, state) => {
  if (state.mode._tag === "AwaitingFirstValue") {
    const result = resolveFirstValue(value, cursor, context, state);
    if (result._tag === "Subcommand") {
      return result.result;
    }
    state.mode = {
      _tag: "CollectingArguments"
    };
  }
  state.arguments.push(value);
  return;
};
var scanCommandLevel = (tokens, context) => {
  const cursor = makeCursor(tokens);
  const state = createParseState(context.flagRegistry);
  for (let token = cursor.take();token; token = cursor.take()) {
    if (isFlagToken(token)) {
      processFlag(token, cursor, context, state);
      continue;
    }
    if (token._tag === "Value") {
      const subResult = processValue(token.value, cursor, context, state);
      if (subResult)
        return subResult;
    }
  }
  return toLeafResult(state);
};

// node_modules/effect/dist/unstable/cli/internal/wizard.js
var run4 = /* @__PURE__ */ fnUntraced2(function* (command, options) {
  const commandPath = options?.commandPath ?? [command.name];
  const selected = getCommandAtPath(command, commandPath);
  const commandLine = (options?.prefix ?? commandPath).map((value) => commandLineArg(value));
  yield* logCurrentCommand(commandLine);
  yield* promptCommand(selected, commandLine, selected === command ? "ROOT" : selected.name);
  return {
    args: commandLine.map((arg) => arg.value),
    displayArgs: commandLine.map((arg) => arg.displayValue)
  };
});
var getCommandAtPath = (command, commandPath) => {
  let current = command;
  for (const name of commandPath.slice(1)) {
    const child = current.subcommands.flatMap((group) => group.commands).find((candidate) => candidate.name === name || candidate.alias === name);
    if (child === undefined) {
      break;
    }
    current = child;
  }
  return current;
};
var promptCommand = /* @__PURE__ */ fnUntraced2(function* (command, commandLine, sectionName) {
  const impl = toImpl(command);
  const visibleSubcommands = command.subcommands.flatMap((group) => group.commands.filter((child) => !child.unlisted));
  const config = visibleSubcommands.length === 0 ? impl.config : impl.contextConfig;
  if (config.flags.length > 0) {
    yield* log2(renderSection(sectionName, "FLAGS"));
    for (const param of config.flags) {
      commandLine.push(...yield* promptParam(param));
    }
    if (config.arguments.length > 0 || visibleSubcommands.length > 0) {
      yield* logCurrentCommand(commandLine);
    }
  }
  if (config.arguments.length > 0) {
    yield* log2(renderSection(sectionName, "ARGUMENTS"));
    for (const param of config.arguments) {
      commandLine.push(...yield* promptParam(param));
    }
    if (visibleSubcommands.length > 0) {
      yield* logCurrentCommand(commandLine);
    }
  }
  if (visibleSubcommands.length === 0) {
    return;
  }
  const child = yield* run3(Select({
    message: "Command",
    choices: visibleSubcommands.map((command) => ({
      title: command.name,
      value: command,
      ...command.shortDescription !== undefined ? {
        description: command.shortDescription
      } : command.description !== undefined ? {
        description: command.description
      } : {}
    }))
  }));
  yield* log2();
  commandLine.push(commandLineArg(child.name));
  if (hasWizardSteps(child)) {
    yield* logCurrentCommand(commandLine);
  }
  yield* promptCommand(child, commandLine, child.name);
});
var hasWizardSteps = (command) => {
  const hasVisibleSubcommands = command.subcommands.some((group) => group.commands.some((child) => !child.unlisted));
  return hasVisibleSubcommands || toImpl(command).config.orderedParams.length > 0;
};
var promptParam = /* @__PURE__ */ fnUntraced2(function* (param) {
  const single = getUnderlyingSingleOrThrow(param);
  const metadata = getParamMetadata(param);
  if (metadata.isOptional) {
    const include = yield* run3(Confirm({
      message: `Set ${renderParamLabel(single)}?`,
      initial: false
    }));
    if (!include) {
      yield* log2();
      return [];
    }
  }
  const count = !metadata.isVariadic ? 1 : yield* run3(Int3({
    message: `${renderParamLabel(single)} count`,
    default: getOrElse(metadata.variadicMin, () => 0),
    min: getOrElse(metadata.variadicMin, () => 0),
    ...isSome2(metadata.variadicMax) ? {
      max: metadata.variadicMax.value
    } : {}
  }));
  const values = [];
  for (let i = 0;i < count; i++) {
    values.push(yield* promptSingle(single));
  }
  const parsed = single.kind === flagKind ? {
    flags: {
      [single.name]: values.map((arg) => arg.value)
    },
    arguments: []
  } : {
    flags: {},
    arguments: values.map((arg) => arg.value)
  };
  yield* param.parse(parsed);
  yield* log2();
  if (single.kind === argumentKind) {
    return values;
  }
  return values.flatMap((value) => value.value.startsWith("-") && value.value.length > 1 ? [commandLineArg(`--${single.name}=${value.value}`, `--${single.name}=${value.displayValue}`)] : [commandLineArg(`--${single.name}`), value]);
});
var promptSingle = (single) => {
  const message = renderParamMessage(single);
  switch (single.primitiveType._tag) {
    case "Boolean":
      return map7(run3(Confirm({
        message,
        label: {
          confirm: "true",
          deny: "false"
        },
        placeholder: {
          defaultConfirm: "(T/f)",
          defaultDeny: "(t/F)"
        }
      })), (value) => commandLineArg(String(value)));
    case "Choice": {
      const choices = getChoiceKeys(single.primitiveType) ?? [];
      return map7(run3(Select({
        message,
        choices: choices.map((choice) => ({
          title: choice,
          value: choice
        }))
      })), commandLineArg);
    }
    case "Date":
      return map7(run3(Date4({
        message
      })), (date) => commandLineArg(date.toISOString()));
    case "Finite":
      return map7(run3(Number8({
        message
      })), (value) => commandLineArg(String(value)));
    case "Int":
      return map7(run3(Int3({
        message
      })), (value) => commandLineArg(String(value)));
    case "Redacted":
      return map7(run3(Password({
        message
      })), (value) => commandLineArg(value2(value), "<redacted>"));
    default:
      return map7(run3(String8({
        message
      })), commandLineArg);
  }
};
var commandLineArg = (value, displayValue = value) => ({
  value,
  displayValue
});
var formatName = (single) => single.kind === flagKind ? `--${single.name}` : single.name;
var renderParamMessage = (single) => renderParamLabel(single);
var renderParamLabel = (single) => {
  const description = getOrUndefined(single.description)?.trim();
  const label = single.kind === flagKind && description !== undefined && description.length <= 32 ? description : humanize(single.name);
  return single.kind === flagKind ? `${label} (${formatName(single)})` : label;
};
var humanize = (name) => {
  const words = name.split(/[-_]+/).filter((word) => word.length > 0);
  if (words.length === 0)
    return name;
  return [words[0][0].toUpperCase() + words[0].slice(1), ...words.slice(1)].join(" ");
};
var logCurrentCommand = (commandLine) => log2(renderCommandBlock("Current command", commandLine.map((arg) => arg.displayValue), magenta));
var renderSection = (commandName, section) => `${annotate2(commandName.toUpperCase(), bold, cyanBright)} ${annotate2("\xB7", blackBright)} ${annotate2(section, bold, white)}`;
var renderIntroduction = (name, version, summary) => {
  const title = `${annotate2(name, bold, cyanBright)} ${annotate2(`v${version}`, white)} ${annotate2("\xB7 Command wizard", bold, white)}`;
  return [title, ...summary === undefined || summary.length === 0 ? [] : [summary], annotate2("Build a command interactively. Press Ctrl+C to cancel.", blackBright), ""].join(`
`);
};
var renderCompletion = (commandLine) => renderCommandBlock("Command ready", commandLine, cyanBright, green);
var renderQuit = () => `
${annotate2("Wizard cancelled.", red)}`;
var renderCommandBlock = (label, commandLine, commandColor, labelColor = white) => {
  const lines = wrapCommand(commandLine);
  return [annotate2(label, bold, labelColor), ...lines.map((line) => annotate2(line, commandColor)), ""].join(`
`);
};
var wrapCommand = (commandLine) => {
  const width = 88;
  const firstIndent = "  $ ";
  const continuationIndent = "    ";
  const args = commandLine.map(formatShellArg);
  const lines = [];
  let current = firstIndent;
  for (const arg of args) {
    const separator = current === firstIndent || current === continuationIndent ? "" : " ";
    if (current.length + separator.length + arg.length > width && current !== firstIndent) {
      lines.push(`${current} \\`);
      current = `${continuationIndent}${arg}`;
    } else {
      current += `${separator}${arg}`;
    }
  }
  if (current !== firstIndent) {
    lines.push(current);
  }
  return lines;
};
var formatShellArg = (arg) => /^[A-Za-z0-9_./:@%+=,-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'"'"'`)}'`;

// node_modules/effect/dist/unstable/cli/Command.js
var isCommand = (u) => hasProperty(u, TypeId47);
var make44 = (name, config, handler) => {
  const parsedConfig = parseConfig(config ?? {});
  return makeCommand({
    name,
    config: parsedConfig,
    ...isNotUndefined(handler) ? {
      handle: handler
    } : {}
  });
};
var normalizeSubcommandEntries = (entries) => {
  const flat = [];
  const grouped = new Map;
  const addToGroup = (group, command) => {
    flat.push(command);
    const existing = grouped.get(group);
    if (existing) {
      existing.push(command);
    } else {
      grouped.set(group, [command]);
    }
  };
  for (const entry of entries) {
    if (isCommand(entry)) {
      addToGroup(undefined, entry);
      continue;
    }
    for (const command of entry.commands) {
      addToGroup(entry.group, command);
    }
  }
  const groups = [];
  const ungroupedCommands = grouped.get(undefined);
  if (ungroupedCommands && ungroupedCommands.length > 0) {
    groups.push({
      group: undefined,
      commands: ungroupedCommands
    });
  }
  for (const [group, commands] of grouped) {
    if (group === undefined) {
      continue;
    }
    groups.push({
      group,
      commands
    });
  }
  return {
    flat,
    groups
  };
};
var withSubcommands = /* @__PURE__ */ dual(2, (self, subcommands) => {
  const normalized = normalizeSubcommandEntries(subcommands);
  checkForDuplicateFlags(self, normalized.flat);
  const impl = toImpl(self);
  const byName = new Map(normalized.flat.map((s) => [s.name, toImpl(s)]));
  const SubcommandStateSymbol = Symbol("effect/cli/SubcommandState");
  const parse = fnUntraced2(function* (raw) {
    if (isNone2(raw.subcommand)) {
      return yield* impl.parse(raw);
    }
    const sub = byName.get(raw.subcommand.value.name);
    if (!sub) {
      return yield* impl.parse(raw);
    }
    const context = yield* impl.parseContext(raw);
    const result = yield* sub.parse(raw.subcommand.value.parsedInput);
    return {
      ...context,
      [SubcommandStateSymbol]: {
        name: sub.name,
        result
      }
    };
  });
  const handle = fnUntraced2(function* (input, path) {
    const internal = input;
    const selectedSubcommand = internal[SubcommandStateSymbol];
    if (selectedSubcommand) {
      const child = byName.get(selectedSubcommand.name);
      if (!child) {
        return yield* new ShowHelp({
          commandPath: path,
          errors: []
        });
      }
      return yield* child.handle(selectedSubcommand.result, [...path, child.name]).pipe(provideService2(impl.service, input));
    }
    return yield* impl.handle(input, path);
  });
  return makeCommand({
    name: impl.name,
    config: impl.config,
    contextConfig: impl.contextConfig,
    description: impl.description,
    shortDescription: impl.shortDescription,
    alias: impl.alias,
    unlisted: impl.unlisted,
    annotations: impl.annotations,
    globalFlags: impl.globalFlags,
    examples: impl.examples,
    service: impl.service,
    subcommands: normalized.groups,
    parse,
    parseContext: impl.parseContext,
    handle
  });
});
var getOutOfScopeGlobalFlagErrors = (allFlags, activeFlags, flagMap, commandPath) => {
  const activeSet = new Set(activeFlags);
  const errors = [];
  const seen = new Set;
  for (const flag of allFlags) {
    if (activeSet.has(flag)) {
      continue;
    }
    const singles = extractSingleParams(flag.flag);
    for (const single of singles) {
      const entries = flagMap[single.name];
      if (!entries || entries.length === 0) {
        continue;
      }
      const option = `--${single.name}`;
      if (seen.has(option)) {
        continue;
      }
      seen.add(option);
      errors.push(new UnrecognizedOption({
        option,
        suggestions: [],
        command: commandPath
      }));
    }
  }
  return errors;
};
var showHelp = (command, error2, renderErrors) => gen2(function* () {
  const {
    builtIns
  } = yield* CliConfig;
  const formatter = yield* Formatter2;
  const helpDoc = yield* getHelpForCommandPath(command, error2.commandPath, builtIns);
  yield* log2(formatter.formatHelpDoc(helpDoc));
  if (renderErrors && error2.errors.length > 0) {
    yield* error(formatter.formatErrors(error2.errors));
  }
});
var showUserError = (error2) => gen2(function* () {
  const formatter = yield* Formatter2;
  yield* error(formatter.formatError(error2));
  error2[errorReported] = false;
});
var run5 = /* @__PURE__ */ dual(2, (command, config) => Stdio.use(({
  args
}) => flatMap5(args, (args) => runWith2(command, config)(args))));
var runWith2 = (command, config) => {
  const commandImpl = toImpl(command);
  return fnUntraced2(function* (args) {
    const {
      builtIns
    } = yield* CliConfig;
    const {
      tokens,
      trailingOperands
    } = lex(args);
    const allFlags = getGlobalFlagsForCommandTree(command, builtIns);
    const allFlagParams = allFlags.flatMap((f) => extractSingleParams(f.flag));
    const globalRegistry = createFlagRegistry(allFlagParams.filter(isFlagParam));
    const {
      flagMap,
      remainder,
      errors: globalFlagErrors
    } = consumeGlobalFlags(tokens, command, globalRegistry);
    const emptyArgs = {
      flags: flagMap,
      arguments: []
    };
    const parsedArgs = yield* parseArgs({
      tokens: remainder,
      trailingOperands
    }, command);
    const commandPath = [command.name, ...getCommandPath(parsedArgs)];
    const handlerCtx = {
      builtIns,
      command,
      commandPath,
      version: config.version
    };
    const activeFlags = getGlobalFlagsForCommandPath(command, commandPath, builtIns);
    const outOfScopeErrors = getOutOfScopeGlobalFlagErrors(allFlags, activeFlags, flagMap, commandPath);
    if (outOfScopeErrors.length > 0 || globalFlagErrors.length > 0) {
      const parseErrors = parsedArgs.errors ?? [];
      return yield* new ShowHelp({
        commandPath,
        errors: [...globalFlagErrors, ...outOfScopeErrors, ...parseErrors]
      });
    }
    for (const flag of activeFlags) {
      if (flag._tag !== "Action")
        continue;
      const singles = extractSingleParams(flag.flag);
      const hasEntry = singles.some((s) => {
        const entries = flagMap[s.name];
        return entries !== undefined && entries.length > 0;
      });
      if (!hasEntry)
        continue;
      const [, value] = yield* flag.flag.parse(emptyArgs);
      if (flag === Wizard) {
        return yield* gen2(function* () {
          yield* log2(renderIntroduction(command.name, config.version, command.description));
          const prefix = [command.name, ...args.filter((arg) => arg !== "--wizard" && !arg.startsWith("--wizard="))];
          const wizardResult = yield* run4(command, {
            commandPath,
            prefix
          });
          yield* log2(renderCompletion(wizardResult.displayArgs));
          const shouldRun = yield* run3(Toggle({
            message: "Run this command?",
            initial: true,
            active: "yes",
            inactive: "no"
          }));
          if (shouldRun) {
            yield* log2();
            yield* runWith2(command, {
              ...config,
              renderErrors: false
            })(wizardResult.args.slice(1));
          }
        }).pipe(catchTag2("QuitError", () => log2(renderQuit())));
      }
      yield* flag.run(value, handlerCtx);
      return;
    }
    if (parsedArgs.errors && parsedArgs.errors.length > 0) {
      return yield* new ShowHelp({
        commandPath,
        errors: parsedArgs.errors
      });
    }
    const parseResult = yield* result2(commandImpl.parse(parsedArgs));
    if (parseResult._tag === "Failure") {
      return yield* new ShowHelp({
        commandPath,
        errors: [parseResult.failure]
      });
    }
    let program = commandImpl.handle(parseResult.success, [command.name]);
    const logLevel = activeFlags.includes(LogLevel2) ? (yield* LogLevel2.flag.parse(emptyArgs))[1] : none2();
    program = provideService2(program, LogLevel2, logLevel);
    for (const flag of activeFlags) {
      if (flag._tag !== "Setting" || flag === LogLevel2)
        continue;
      const [, value] = yield* flag.flag.parse(emptyArgs);
      program = provideService2(program, flag, value);
    }
    const services = match(logLevel, {
      onNone: () => empty2(),
      onSome: (level) => make3(MinimumLogLevel2, level)
    });
    yield* provideContext2(program, services);
  }, catchFilter2((error) => isCliError(error) && error._tag === "ShowHelp" ? succeed2(error) : fail2(error), (error) => andThen2(showHelp(command, error, config.renderErrors !== false), fail6(error))), catchFilter2((error) => config.renderErrors !== false && isCliError(error) && error._tag === "UserError" ? succeed2(error) : fail2(error), (error) => andThen2(showUserError(error), fail6(error))), catchFilter2((e) => isQuitError(e) ? succeed2(e) : fail2(e), (_) => interrupt2));
};
// node_modules/effect/dist/unstable/http/FindMyWay/internal/queryString.js
var plusRegex = /\+/g;
var Empty3 = function() {};
Empty3.prototype = /* @__PURE__ */ Object.create(null);
function parse3(input) {
  const result = new Empty3;
  if (typeof input !== "string") {
    return result;
  }
  const inputLength = input.length;
  let key = "";
  let value = "";
  let startingIndex = -1;
  let equalityIndex = -1;
  let shouldDecodeKey = false;
  let shouldDecodeValue = false;
  let keyHasPlus = false;
  let valueHasPlus = false;
  let hasBothKeyValuePair = false;
  let c = 0;
  for (let i = 0;i < inputLength + 1; i++) {
    c = i !== inputLength ? input.charCodeAt(i) : 38;
    if (c === 38) {
      hasBothKeyValuePair = equalityIndex > startingIndex;
      if (!hasBothKeyValuePair) {
        equalityIndex = i;
      }
      key = input.slice(startingIndex + 1, equalityIndex);
      if (hasBothKeyValuePair || key.length > 0) {
        if (keyHasPlus) {
          key = key.replace(plusRegex, " ");
        }
        if (shouldDecodeKey) {
          try {
            key = decodeURIComponent(key) || key;
          } catch {}
        }
        if (hasBothKeyValuePair) {
          value = input.slice(equalityIndex + 1, i);
          if (valueHasPlus) {
            value = value.replace(plusRegex, " ");
          }
          if (shouldDecodeValue) {
            try {
              value = decodeURIComponent(value) || value;
            } catch {}
          }
        }
        const currentValue = result[key];
        if (currentValue === undefined) {
          result[key] = value;
        } else {
          if (currentValue.pop) {
            currentValue.push(value);
          } else {
            result[key] = [currentValue, value];
          }
        }
      }
      value = "";
      startingIndex = i;
      equalityIndex = i;
      shouldDecodeKey = false;
      shouldDecodeValue = false;
      keyHasPlus = false;
      valueHasPlus = false;
    } else if (c === 61) {
      if (equalityIndex <= startingIndex) {
        equalityIndex = i;
      } else {
        shouldDecodeValue = true;
      }
    } else if (c === 43) {
      if (equalityIndex > startingIndex) {
        valueHasPlus = true;
      } else {
        keyHasPlus = true;
      }
    } else if (c === 37) {
      if (equalityIndex > startingIndex) {
        shouldDecodeValue = true;
      } else {
        shouldDecodeKey = true;
      }
    }
  }
  return result;
}

// node_modules/effect/dist/unstable/http/FindMyWay/internal/router.js
var FULL_PATH_REGEXP = /^https?:\/\/.*?\//;
var OPTIONAL_PARAM_REGEXP = /(\/:[^/()]*?)\?(\/?)/;
var emptyParamsArray = [];
var CLEAN_SINGLE_PARAM_REGEXP = /^[^:*(]*\/:[^/:*(.-]+$/;
var isCleanSingleTrailingParam = (path) => CLEAN_SINGLE_PARAM_REGEXP.test(path);
var make45 = (options = {}) => new RouterImpl(options);

class RouterImpl {
  constructor(options = {}) {
    this.options = {
      ignoreTrailingSlash: true,
      ignoreDuplicateSlashes: true,
      caseSensitive: false,
      maxParamLength: 100,
      ...options
    };
  }
  options;
  routes = [];
  trees = /* @__PURE__ */ Object.create(null);
  staticRoutes = /* @__PURE__ */ Object.create(null);
  singleParamRoutes = /* @__PURE__ */ Object.create(null);
  singleParamDisabled = /* @__PURE__ */ Object.create(null);
  brothersNodesStack = [];
  singleParamArray = [""];
  on(method, path, handler) {
    const optionalParamMatch = path.match(OPTIONAL_PARAM_REGEXP);
    if (optionalParamMatch && optionalParamMatch.index !== undefined) {
      assert(path.length === optionalParamMatch.index + optionalParamMatch[0].length, "Optional Parameter needs to be the last parameter of the path");
      const pathFull = path.replace(OPTIONAL_PARAM_REGEXP, "$1$2");
      const pathOptional = path.replace(OPTIONAL_PARAM_REGEXP, "$2") || "/";
      this.on(method, pathFull, handler);
      this.on(method, pathOptional, handler);
      return;
    }
    if (this.options.ignoreDuplicateSlashes) {
      path = removeDuplicateSlashes(path);
    }
    if (this.options.ignoreTrailingSlash) {
      path = trimLastSlash(path);
    }
    const methods = typeof method === "string" ? [method] : method;
    for (const method of methods) {
      this._on(method, path, handler);
    }
  }
  all(path, handler) {
    this.on(httpMethods, path, handler);
  }
  _on(method, path, handler) {
    if (this.trees[method] === undefined) {
      this.trees[method] = new StaticNode("/");
    }
    let pattern = path;
    if (pattern === "*" && this.trees[method].prefix.length !== 0) {
      const currentRoot = this.trees[method];
      this.trees[method] = new StaticNode("");
      this.trees[method].staticChildren["/"] = currentRoot;
    }
    let parentNodePathIndex = this.trees[method].prefix.length;
    let currentNode = this.trees[method];
    const params = [];
    for (let i = 0;i <= pattern.length; i++) {
      if (pattern.charCodeAt(i) === 58 && pattern.charCodeAt(i + 1) === 58) {
        i++;
        continue;
      }
      const isParametricNode = pattern.charCodeAt(i) === 58 && pattern.charCodeAt(i + 1) !== 58;
      const isWildcardNode = pattern.charCodeAt(i) === 42;
      if (isParametricNode || isWildcardNode || i === pattern.length && i !== parentNodePathIndex) {
        let staticNodePath = pattern.slice(parentNodePathIndex, i);
        if (!this.options.caseSensitive) {
          staticNodePath = staticNodePath.toLowerCase();
        }
        staticNodePath = staticNodePath.split("::").join(":");
        staticNodePath = staticNodePath.split("%").join("%25");
        currentNode = currentNode.createStaticChild(staticNodePath);
      }
      if (isParametricNode) {
        let isRegexNode = false;
        let isParamSafe = true;
        let backtrack = "";
        const regexps = [];
        let nodePatternParts = "";
        let lastParamStartIndex = i + 1;
        for (let j = lastParamStartIndex;; j++) {
          const charCode = pattern.charCodeAt(j);
          const isRegexParam = charCode === 40;
          const isStaticPart = charCode === 45 || charCode === 46;
          const isEndOfNode = charCode === 47 || j === pattern.length;
          if (isRegexParam || isStaticPart || isEndOfNode) {
            const paramName = pattern.slice(lastParamStartIndex, j);
            params.push(paramName);
            isRegexNode = isRegexNode || isRegexParam || isStaticPart;
            if (isRegexParam) {
              const endOfRegexIndex = getClosingParenthensePosition(pattern, j);
              const regexString = pattern.slice(j, endOfRegexIndex + 1);
              regexps.push(trimRegExpStartAndEnd(regexString));
              j = endOfRegexIndex + 1;
              isParamSafe = true;
            } else {
              regexps.push(isParamSafe ? "(.*?)" : `(${backtrack}|(?:(?!${backtrack}).)*)`);
              isParamSafe = false;
            }
            const staticPartStartIndex = j;
            for (;j < pattern.length; j++) {
              const charCode = pattern.charCodeAt(j);
              if (charCode === 47)
                break;
              if (charCode === 58) {
                const nextCharCode = pattern.charCodeAt(j + 1);
                if (nextCharCode === 58)
                  j++;
                else
                  break;
              }
            }
            let staticPart = pattern.slice(staticPartStartIndex, j);
            if (staticPart) {
              staticPart = staticPart.split("::").join(":");
              staticPart = staticPart.split("%").join("%25");
              regexps.push(backtrack = escapeRegExp(staticPart));
            }
            lastParamStartIndex = j + 1;
            nodePatternParts += "()" + staticPart;
            if (isEndOfNode || pattern.charCodeAt(j) === 47 || j === pattern.length) {
              const nodePattern = isRegexNode ? nodePatternParts : staticPart;
              const nodePath = pattern.slice(i, j);
              pattern = pattern.slice(0, i + 1) + nodePattern + pattern.slice(j);
              i += nodePattern.length;
              const regex = isRegexNode ? new RegExp("^" + regexps.join("") + "$") : undefined;
              currentNode = currentNode.createParametricChild(regex, staticPart, nodePath);
              parentNodePathIndex = i + 1;
              break;
            }
          }
        }
      } else if (isWildcardNode) {
        params.push("*");
        currentNode = currentNode.createWildcardChild();
        parentNodePathIndex = i + 1;
        if (i !== pattern.length - 1) {
          throw new Error("Wildcard must be the last character in the route");
        }
      }
    }
    if (!this.options.caseSensitive) {
      pattern = pattern.toLowerCase();
    }
    if (pattern === "*") {
      pattern = "/*";
    }
    for (const existRoute of this.routes) {
      if (existRoute.method === method && existRoute.pattern === pattern) {
        throw new Error(`Method '${method}' already declared for route '${pattern}'`);
      }
    }
    const route = {
      method,
      path,
      pattern,
      params,
      handler
    };
    this.routes.push(route);
    currentNode.addRoute(route);
    if (params.length === 0) {
      const staticKey = pattern.split("::").join(":").split("%").join("%25");
      const store = this.staticRoutes[method] ??= new Map;
      if (!store.has(staticKey)) {
        store.set(staticKey, currentNode.handlerStorage.unconstrainedHandler);
      }
    } else if (isCleanSingleTrailingParam(path)) {
      if (this.singleParamDisabled[method] !== true) {
        let prefix = path.slice(0, path.indexOf(":"));
        if (!this.options.caseSensitive) {
          prefix = prefix.toLowerCase();
        }
        prefix = prefix.split("%").join("%25");
        const store = this.singleParamRoutes[method] ??= new Map;
        if (!store.has(prefix)) {
          store.set(prefix, currentNode.handlerStorage.unconstrainedHandler);
        }
      }
    } else if (/[(*]|[^/]:|:[^/]*[-.]/.test(path)) {
      this.singleParamDisabled[method] = true;
      delete this.singleParamRoutes[method];
    }
  }
  has(method, path) {
    const node = this.trees[method];
    if (node === undefined) {
      return false;
    }
    const staticNode = node.getStaticChild(path);
    if (staticNode === undefined) {
      return false;
    }
    return staticNode.isLeafNode;
  }
  find(method, path) {
    let currentNode = this.trees[method];
    if (currentNode === undefined)
      return;
    let querystring = "";
    let shouldDecodeParam = false;
    let clean = path.charCodeAt(0) === 47 && (path.length === 1 || path.charCodeAt(path.length - 1) !== 47);
    if (clean) {
      for (let i = 1;i < path.length; i++) {
        const code = path.charCodeAt(i);
        if (code === 37 || code === 63 || code === 59 || code === 35 || code >= 65 && code <= 90 || code === 47 && path.charCodeAt(i - 1) === 47) {
          clean = false;
          break;
        }
      }
    }
    if (!clean) {
      if (path.charCodeAt(0) !== 47) {
        path = path.replace(FULL_PATH_REGEXP, "/");
      }
      if (this.options.ignoreDuplicateSlashes) {
        path = removeDuplicateSlashes(path);
      }
      let sanitizedUrl;
      try {
        sanitizedUrl = safeDecodeURI(path);
        path = sanitizedUrl.path;
        querystring = sanitizedUrl.querystring;
        shouldDecodeParam = sanitizedUrl.shouldDecodeParam;
      } catch (error) {
        return;
      }
      if (this.options.ignoreTrailingSlash) {
        path = trimLastSlash(path);
      }
    }
    const originPath = path;
    if (!clean && this.options.caseSensitive === false) {
      path = path.toLowerCase();
    }
    const maxParamLength = this.options.maxParamLength;
    const staticStore = this.staticRoutes[method];
    if (staticStore !== undefined) {
      const handle = staticStore.get(path);
      if (handle !== undefined) {
        return {
          handler: handle.handler,
          params: handle.createParams(emptyParamsArray),
          searchParams: parse3(querystring)
        };
      }
    }
    const singleParamStore = this.singleParamRoutes[method];
    if (singleParamStore !== undefined) {
      const prefixLength = path.lastIndexOf("/") + 1;
      const handle = singleParamStore.get(path.slice(0, prefixLength));
      if (handle !== undefined && path.length > prefixLength) {
        let param = originPath.slice(prefixLength);
        if (shouldDecodeParam) {
          param = safeDecodeURIComponent(param);
        }
        if (param.length <= maxParamLength) {
          this.singleParamArray[0] = param;
          return {
            handler: handle.handler,
            params: handle.createParams(this.singleParamArray),
            searchParams: parse3(querystring)
          };
        }
      }
    }
    let pathIndex = currentNode.prefix.length;
    const params = [];
    const pathLen = path.length;
    const brothersNodesStack = this.brothersNodesStack;
    brothersNodesStack.length = 0;
    while (true) {
      if (pathIndex === pathLen && currentNode.isLeafNode) {
        const handle = currentNode.handlerStorage?.find();
        if (handle !== undefined) {
          return {
            handler: handle.handler,
            params: handle.createParams(params),
            searchParams: parse3(querystring)
          };
        }
      }
      let node = currentNode.getNextNode(path, pathIndex, brothersNodesStack, params.length);
      if (node === undefined) {
        if (brothersNodesStack.length === 0) {
          return;
        }
        const brotherNodeState = brothersNodesStack.pop();
        pathIndex = brotherNodeState.brotherPathIndex;
        params.splice(brotherNodeState.paramsCount);
        node = brotherNodeState.brotherNode;
      }
      currentNode = node;
      while (true) {
        if (currentNode._tag === "StaticNode") {
          pathIndex += currentNode.prefix.length;
          break;
        }
        if (currentNode._tag === "WildcardNode") {
          let param = originPath.slice(pathIndex);
          if (shouldDecodeParam) {
            param = safeDecodeURIComponent(param);
          }
          params.push(param);
          pathIndex = pathLen;
          break;
        }
        let paramEndIndex = originPath.indexOf("/", pathIndex);
        if (paramEndIndex === -1) {
          paramEndIndex = pathLen;
        }
        let param = originPath.slice(pathIndex, paramEndIndex);
        if (shouldDecodeParam) {
          param = safeDecodeURIComponent(param);
        }
        if (currentNode.regex !== undefined) {
          const matchedParameters = currentNode.regex.exec(param);
          if (matchedParameters === null) {
            if (brothersNodesStack.length === 0) {
              return;
            }
            const brotherNodeState = brothersNodesStack.pop();
            pathIndex = brotherNodeState.brotherPathIndex;
            params.splice(brotherNodeState.paramsCount);
            currentNode = brotherNodeState.brotherNode;
            continue;
          }
          let maxParamLengthExceeded = false;
          for (let i = 1;i < matchedParameters.length; i++) {
            const matchedParam = matchedParameters[i] ?? "";
            if (matchedParam.length > maxParamLength) {
              maxParamLengthExceeded = true;
              break;
            }
          }
          if (maxParamLengthExceeded) {
            if (brothersNodesStack.length === 0) {
              return;
            }
            const brotherNodeState = brothersNodesStack.pop();
            pathIndex = brotherNodeState.brotherPathIndex;
            params.splice(brotherNodeState.paramsCount);
            currentNode = brotherNodeState.brotherNode;
            continue;
          }
          for (let i = 1;i < matchedParameters.length; i++) {
            params.push(matchedParameters[i] ?? "");
          }
        } else {
          if (param.length > maxParamLength) {
            if (brothersNodesStack.length === 0) {
              return;
            }
            const brotherNodeState = brothersNodesStack.pop();
            pathIndex = brotherNodeState.brotherPathIndex;
            params.splice(brotherNodeState.paramsCount);
            currentNode = brotherNodeState.brotherNode;
            continue;
          }
          params.push(param);
        }
        pathIndex = paramEndIndex;
        break;
      }
    }
  }
}

class HandlerStorage {
  handlers = [];
  unconstrainedHandler;
  find() {
    return this.unconstrainedHandler;
  }
  add(route) {
    const handler = {
      params: route.params,
      handler: route.handler,
      createParams: compileCreateParams(route.params)
    };
    this.handlers.push(handler);
    this.unconstrainedHandler = this.handlers[0];
  }
}

class NodeBase {
  isLeafNode = false;
  routes;
  handlerStorage;
  addRoute(route) {
    if (this.routes === undefined) {
      this.routes = [route];
    } else {
      this.routes.push(route);
    }
    if (this.handlerStorage === undefined) {
      this.handlerStorage = new HandlerStorage;
    }
    this.isLeafNode = true;
    this.handlerStorage.add(route);
  }
}

class ParentNode extends NodeBase {
  staticChildren = /* @__PURE__ */ Object.create(null);
  findStaticMatchingChild(path, pathIndex) {
    const staticChild = this.staticChildren[path.charAt(pathIndex)];
    if (staticChild === undefined || !staticChild.matchPrefix(path, pathIndex)) {
      return;
    }
    return staticChild;
  }
  getStaticChild(path, pathIndex = 0) {
    if (path.length === pathIndex) {
      return this;
    }
    const staticChild = this.findStaticMatchingChild(path, pathIndex);
    if (staticChild === undefined) {
      return;
    }
    return staticChild.getStaticChild(path, pathIndex + staticChild.prefix.length);
  }
  createStaticChild(path) {
    if (path.length === 0) {
      return this;
    }
    let staticChild = this.staticChildren[path.charAt(0)];
    if (staticChild) {
      let i = 1;
      for (;i < staticChild.prefix.length; i++) {
        if (path.charCodeAt(i) !== staticChild.prefix.charCodeAt(i)) {
          staticChild = staticChild.split(this, i);
          break;
        }
      }
      return staticChild.createStaticChild(path.slice(i));
    }
    const label = path.charAt(0);
    this.staticChildren[label] = new StaticNode(path);
    return this.staticChildren[label];
  }
}

class StaticNode extends ParentNode {
  _tag = "StaticNode";
  constructor(prefix) {
    super();
    this.setPrefix(prefix);
  }
  prefix;
  matchPrefix;
  parametricChildren = [];
  wildcardChild;
  setPrefix(prefix) {
    this.prefix = prefix;
    if (prefix.length === 1) {
      this.matchPrefix = (_path, _pathIndex) => true;
    } else {
      const tail = prefix.slice(1);
      this.matchPrefix = (path, pathIndex) => path.startsWith(tail, pathIndex + 1);
    }
  }
  getParametricChild(regex) {
    if (regex === undefined) {
      return this.parametricChildren.find((child) => child.isRegex === false);
    }
    const source = regex.source;
    return this.parametricChildren.find((child) => {
      if (child.regex === undefined) {
        return false;
      }
      return child.regex.source === source;
    });
  }
  createParametricChild(regex, staticSuffix, nodePath) {
    let child = this.getParametricChild(regex);
    if (child !== undefined) {
      child.nodePaths.add(nodePath);
      return child;
    }
    child = new ParametricNode(regex, staticSuffix, nodePath);
    this.parametricChildren.push(child);
    this.parametricChildren.sort((child1, child2) => {
      if (!child1.isRegex)
        return 1;
      if (!child2.isRegex)
        return -1;
      if (child1.staticSuffix === undefined)
        return 1;
      if (child2.staticSuffix === undefined)
        return -1;
      if (child2.staticSuffix.endsWith(child1.staticSuffix))
        return 1;
      if (child1.staticSuffix.endsWith(child2.staticSuffix))
        return -1;
      return 0;
    });
    return child;
  }
  createWildcardChild() {
    if (this.wildcardChild === undefined) {
      this.wildcardChild = new WildcardNode;
    }
    return this.wildcardChild;
  }
  split(parentNode, length) {
    const parentPrefix = this.prefix.slice(0, length);
    const childPrefix = this.prefix.slice(length);
    this.setPrefix(childPrefix);
    const staticNode = new StaticNode(parentPrefix);
    staticNode.staticChildren[childPrefix.charAt(0)] = this;
    parentNode.staticChildren[parentPrefix.charAt(0)] = staticNode;
    return staticNode;
  }
  getNextNode(path, pathIndex, nodeStack, paramsCount) {
    let node = this.findStaticMatchingChild(path, pathIndex);
    let parametricBrotherNodeIndex = 0;
    if (node === undefined) {
      if (this.parametricChildren.length === 0) {
        return this.wildcardChild;
      }
      node = this.parametricChildren[0];
      parametricBrotherNodeIndex = 1;
    }
    if (this.wildcardChild !== undefined) {
      nodeStack.push({
        paramsCount,
        brotherPathIndex: pathIndex,
        brotherNode: this.wildcardChild
      });
    }
    for (let i = this.parametricChildren.length - 1;i >= parametricBrotherNodeIndex; i--) {
      nodeStack.push({
        paramsCount,
        brotherPathIndex: pathIndex,
        brotherNode: this.parametricChildren[i]
      });
    }
    return node;
  }
}

class ParametricNode extends ParentNode {
  _tag = "ParametricNode";
  regex;
  staticSuffix;
  constructor(regex, staticSuffix, nodePath) {
    super();
    this.regex = regex;
    this.staticSuffix = staticSuffix;
    this.isRegex = !!regex;
    this.nodePaths = new Set([nodePath]);
  }
  isRegex;
  nodePaths;
  getNextNode(path, pathIndex) {
    return this.findStaticMatchingChild(path, pathIndex);
  }
}

class WildcardNode extends NodeBase {
  _tag = "WildcardNode";
  getNextNode(_path, _pathIndex, _nodeStack, _paramsCount) {
    return;
  }
}
var assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};
function removeDuplicateSlashes(path) {
  if (path.indexOf("//") === -1) {
    return path;
  }
  return path.replace(/\/\/+/g, "/");
}
function trimLastSlash(path) {
  if (path.length > 1 && path.charCodeAt(path.length - 1) === 47) {
    return path.slice(0, -1);
  }
  return path;
}
var safeParamName = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
var isCompilableParamName = (name) => name !== "__proto__" && safeParamName.test(name);
function compileCreateParams(params) {
  const len = params.length;
  if (len === 0) {
    return () => Object.create(null);
  }
  if (params.every(isCompilableParamName) && new Set(params).size === len) {
    try {
      return new Function("a", `return {__proto__:null,${params.map((name, i) => `${name}:a[${i}]`).join(",")}}`);
    } catch {}
  }
  return function(paramsArray) {
    const paramsObject = Object.create(null);
    for (let i = 0;i < len; i++) {
      paramsObject[params[i]] = paramsArray[i];
    }
    return paramsObject;
  };
}
function getClosingParenthensePosition(path, idx) {
  let parentheses = 1;
  while (idx < path.length) {
    idx++;
    if (path[idx] === "\\") {
      idx++;
      continue;
    }
    if (path[idx] === ")") {
      parentheses--;
    } else if (path[idx] === "(") {
      parentheses++;
    }
    if (!parentheses)
      return idx;
  }
  throw new TypeError('Invalid regexp expression in "' + path + '"');
}
function trimRegExpStartAndEnd(regexString) {
  if (regexString.charCodeAt(1) === 94) {
    regexString = regexString.slice(0, 1) + regexString.slice(2);
  }
  if (regexString.charCodeAt(regexString.length - 2) === 36) {
    regexString = regexString.slice(0, regexString.length - 2) + regexString.slice(regexString.length - 1);
  }
  return regexString;
}
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function decodeComponentChar(highCharCode, lowCharCode) {
  if (highCharCode === 50) {
    if (lowCharCode === 53)
      return "%";
    if (lowCharCode === 51)
      return "#";
    if (lowCharCode === 52)
      return "$";
    if (lowCharCode === 54)
      return "&";
    if (lowCharCode === 66)
      return "+";
    if (lowCharCode === 98)
      return "+";
    if (lowCharCode === 67)
      return ",";
    if (lowCharCode === 99)
      return ",";
    if (lowCharCode === 70)
      return "/";
    if (lowCharCode === 102)
      return "/";
    return;
  }
  if (highCharCode === 51) {
    if (lowCharCode === 65)
      return ":";
    if (lowCharCode === 97)
      return ":";
    if (lowCharCode === 66)
      return ";";
    if (lowCharCode === 98)
      return ";";
    if (lowCharCode === 68)
      return "=";
    if (lowCharCode === 100)
      return "=";
    if (lowCharCode === 70)
      return "?";
    if (lowCharCode === 102)
      return "?";
    return;
  }
  if (highCharCode === 52 && lowCharCode === 48) {
    return "@";
  }
  return;
}
function safeDecodeURI(path) {
  let shouldDecode = false;
  let shouldDecodeParam = false;
  let querystring = "";
  for (let i = 1;i < path.length; i++) {
    const charCode = path.charCodeAt(i);
    if (charCode === 37) {
      const highCharCode = path.charCodeAt(i + 1);
      const lowCharCode = path.charCodeAt(i + 2);
      if (decodeComponentChar(highCharCode, lowCharCode) === undefined) {
        shouldDecode = true;
      } else {
        shouldDecodeParam = true;
        if (highCharCode === 50 && lowCharCode === 53) {
          shouldDecode = true;
          path = path.slice(0, i + 1) + "25" + path.slice(i + 1);
          i += 2;
        }
        i += 2;
      }
    } else if (charCode === 63 || charCode === 59 || charCode === 35) {
      querystring = path.slice(i + 1);
      path = path.slice(0, i);
      break;
    }
  }
  const decodedPath = shouldDecode ? decodeURI(path) : path;
  return {
    path: decodedPath,
    querystring,
    shouldDecodeParam
  };
}
function safeDecodeURIComponent(uriComponent) {
  const startIndex = uriComponent.indexOf("%");
  if (startIndex === -1)
    return uriComponent;
  let decoded = "";
  let lastIndex = startIndex;
  for (let i = startIndex;i < uriComponent.length; i++) {
    if (uriComponent.charCodeAt(i) === 37) {
      if (i + 2 >= uriComponent.length)
        break;
      const highCharCode = uriComponent.charCodeAt(i + 1);
      const lowCharCode = uriComponent.charCodeAt(i + 2);
      const decodedChar = decodeComponentChar(highCharCode, lowCharCode);
      decoded += uriComponent.slice(lastIndex, i) + decodedChar;
      lastIndex = i + 3;
    }
  }
  return uriComponent.slice(0, startIndex) + decoded + uriComponent.slice(lastIndex);
}
var httpMethods = ["ACL", "BIND", "CHECKOUT", "CONNECT", "COPY", "DELETE", "GET", "HEAD", "LINK", "LOCK", "M-SEARCH", "MERGE", "MKACTIVITY", "MKCALENDAR", "MKCOL", "MOVE", "NOTIFY", "OPTIONS", "PATCH", "POST", "PROPFIND", "PROPPATCH", "PURGE", "PUT", "QUERY", "REBIND", "REPORT", "SEARCH", "SOURCE", "SUBSCRIBE", "TRACE", "UNBIND", "UNLINK", "UNLOCK", "UNSUBSCRIBE"];

// node_modules/effect/dist/unstable/http/FindMyWay.js
var make46 = make45;

// node_modules/effect/dist/unstable/http/HttpRouter.js
var TypeId48 = "~effect/http/HttpRouter";
var HttpRouter = /* @__PURE__ */ Service("effect/http/HttpRouter");
var make47 = /* @__PURE__ */ gen2(function* () {
  const router = make46(yield* RouterConfig);
  const middleware = new Set;
  const addAll = (routes) => contextWith2((context) => {
    const middleware = getMiddleware(context);
    const applyMiddleware = (effect) => {
      for (let i = 0;i < middleware.length; i++) {
        effect = middleware[i](effect);
      }
      return effect;
    };
    for (let i = 0;i < routes.length; i++) {
      const route = middleware.length === 0 ? routes[i] : makeRoute({
        ...routes[i],
        handler: applyMiddleware(routes[i].handler)
      });
      if (route.method === "*") {
        if (route.path.endsWith("/*")) {
          router.all(route.path, route);
          router.all(route.path.slice(0, -2), route);
        } else {
          router.all(route.path, route);
        }
      } else {
        if (route.path.endsWith("/*")) {
          router.on(route.method, route.path, route);
          router.on(route.method, route.path.slice(0, -2), route);
        } else {
          router.on(route.method, route.path, route);
        }
      }
    }
    return void_3;
  });
  return HttpRouter.of({
    [TypeId48]: TypeId48,
    prefixed(prefix) {
      prefix = removeTrailingSlash(prefix);
      return HttpRouter.of({
        ...this,
        prefixed: (newPrefix) => this.prefixed(prefixPath(newPrefix, prefix)),
        addAll: (routes) => addAll(routes.map(prefixRoute(prefix))),
        add: (method, path, handler, options) => addAll([makeRoute({
          method,
          path: prefixPath(path, prefix),
          handler: isHttpServerResponse(handler) ? succeed6(handler) : isEffect2(handler) ? handler : flatMap5(HttpServerRequest, handler),
          uninterruptible: options?.uninterruptible ?? false,
          prefix
        })])
      });
    },
    addAll,
    add: (method, path, handler, options) => addAll([route(method, path, handler, options)]),
    addGlobalMiddleware: (middleware_) => sync2(() => {
      middleware.add(middleware_);
    }),
    asHttpEffect() {
      let handler = withFiber2((fiber) => {
        let context = fiber.context;
        const request = getUnsafe(context, HttpServerRequest);
        let result = router.find(request.method, request.url);
        if (result === undefined && request.method === "HEAD") {
          result = router.find("GET", request.url);
        }
        if (result === undefined) {
          return fail6(new HttpServerError({
            reason: new RouteNotFound({
              request
            })
          }));
        }
        const route = result.handler;
        if (isSome2(route.prefix)) {
          context = add(context, HttpServerRequest, sliceRequestUrl(request, route.prefix.value));
        }
        context = add(context, ParsedSearchParams, result.searchParams);
        context = add(context, RouteContext, {
          route,
          params: result.params
        });
        if (fiber.getRef(Tracer) !== nativeTracer) {
          const span = getOrUndefined2(context, ParentSpan);
          if (span !== undefined && span._tag === "Span" && span.sampled) {
            span.attribute("http.route", route.path);
          }
        }
        fiber.setContext(context);
        if (!route.uninterruptible) {
          const interrupted = fiberEnterInterruptibleUnsafe(fiber);
          if (interrupted !== undefined)
            return interrupted;
        }
        return route.handler;
      });
      if (middleware.size === 0)
        return handler;
      for (const fn of reverse(middleware)) {
        handler = fn(handler);
      }
      return handler;
    }
  });
});
function sliceRequestUrl(request, prefix) {
  const prefexLen = prefix.length;
  return request.modify({
    url: request.url.length <= prefexLen ? "/" : request.url.slice(prefexLen)
  });
}
var RouterConfig = /* @__PURE__ */ Reference("effect/http/HttpRouter/RouterConfig", {
  defaultValue: () => ({})
});

class RouteContext extends (/* @__PURE__ */ Service()("effect/http/HttpRouter/RouteContext")) {
}
var addAll = (routes, options) => effectDiscard(gen2(function* () {
  const toAdd = isEffect2(routes) ? yield* routes : routes;
  let router = yield* HttpRouter;
  if (options?.prefix) {
    router = router.prefixed(options.prefix);
  }
  yield* router.addAll(toAdd);
}));
var layer17 = /* @__PURE__ */ effect(HttpRouter)(make47);
var RouteTypeId = "~effect/http/HttpRouter/Route";
var makeRoute = (options) => ({
  ...options,
  uninterruptible: options.uninterruptible ?? false,
  prefix: typeof options.prefix === "string" ? some2(options.prefix) : options.prefix ?? none2(),
  [RouteTypeId]: RouteTypeId
});
var route = (method, path, handler, options) => makeRoute({
  ...options,
  method,
  path,
  handler: isHttpServerResponse(handler) ? succeed6(handler) : isEffect2(handler) ? handler : flatMap5(HttpServerRequest, handler),
  uninterruptible: options?.uninterruptible ?? false
});
var removeTrailingSlash = (path) => path.endsWith("/") ? path.slice(0, -1) : path;
var prefixPath = /* @__PURE__ */ dual(2, (self, prefix) => {
  prefix = removeTrailingSlash(prefix);
  if (self === "*")
    return `${prefix}/*`;
  else if (self === "/")
    return prefix;
  return prefix + self;
});
var prefixRoute = /* @__PURE__ */ dual(2, (self, prefix) => makeRoute({
  ...self,
  path: prefixPath(self.path, prefix),
  prefix: match(self.prefix, {
    onNone: () => removeTrailingSlash(prefix),
    onSome: (existingPrefix) => prefixPath(existingPrefix, prefix)
  })
}));
var MiddlewareTypeId = "~effect/http/HttpRouter/Middleware";
var middleware = function() {
  if (arguments.length === 0) {
    return makeMiddleware;
  }
  return makeMiddleware(arguments[0], arguments[1]);
};
var makeMiddleware = (middleware, options) => options?.global ? effectDiscard(gen2(function* () {
  const router = yield* HttpRouter;
  const fn = isEffect2(middleware) ? yield* middleware : middleware;
  yield* router.addGlobalMiddleware(fn);
})) : new MiddlewareImpl(isEffect2(middleware) ? effectContext(map7(middleware, (fn) => makeUnsafe(new Map([[fnContextKey, fn]])))) : succeedContext(makeUnsafe(new Map([[fnContextKey, middleware]]))));
var middlewareId = 0;
var fnContextKey = "effect/http/HttpRouter/MiddlewareFn";

class MiddlewareImpl {
  [MiddlewareTypeId] = {};
  layerFn;
  dependencies;
  constructor(layerFn, dependencies) {
    this.layerFn = layerFn;
    this.dependencies = dependencies;
    const contextKey = `effect/http/HttpRouter/Middleware-${++middlewareId}`;
    this.layer = effectContext(gen2({
      self: this
    }, function* () {
      const context = yield* context2();
      const stack = [getOrUndefinedUnsafe(context, fnContextKey)];
      if (this.dependencies) {
        const memoMap = yield* CurrentMemoMap;
        const scope = get(context, Scope);
        const depsContext = yield* buildWithMemoMap(this.dependencies, memoMap, scope);
        stack.push(...getMiddleware(depsContext));
      }
      return makeUnsafe(new Map([[contextKey, stack]]));
    })).pipe(provide2(this.layerFn));
  }
  layer;
  combine(other) {
    return new MiddlewareImpl(this.layerFn, this.dependencies ? provideMerge(this.dependencies, other.layer) : other.layer);
  }
}
var middlewareCache = /* @__PURE__ */ new WeakMap;
var getMiddleware = (context) => {
  let arr = middlewareCache.get(context);
  if (arr)
    return arr;
  const topLevel = empty();
  let maxLength = 0;
  for (const [key, value] of context.mapUnsafe) {
    if (key.startsWith("effect/http/HttpRouter/Middleware-")) {
      topLevel.push(value);
      if (value.length > maxLength) {
        maxLength = value.length;
      }
    }
  }
  if (topLevel.length === 0) {
    arr = [];
  } else {
    const middleware = new Set;
    for (let i = maxLength - 1;i >= 0; i--) {
      for (const arr of topLevel) {
        if (i < arr.length) {
          middleware.add(arr[i]);
        }
      }
    }
    arr = fromIterable(middleware).reverse();
  }
  middlewareCache.set(context, arr);
  return arr;
};
var disableLogger = middleware(withLoggerDisabled).layer;
var serve2 = (appLayer, options) => {
  let middleware = options?.middleware;
  if (options?.disableLogger !== true) {
    middleware = middleware ? compose(middleware, logger) : logger;
  }
  const RouterLayer = options?.routerConfig ? provide2(layer17, succeed5(RouterConfig)(options.routerConfig)) : layer17;
  return gen2(function* () {
    const router = yield* HttpRouter;
    const handler = router.asHttpEffect();
    return middleware ? serve(handler, middleware) : serve(handler);
  }).pipe(unwrap, provideMerge(appLayer), provide2(RouterLayer), options?.disableListenLog ? identity : withLogAddress);
};
// scripts/cli.ts
import * as Crypto4 from "crypto";
var generateId = () => Crypto4.randomBytes(3).toString("hex");
var toKebabCase = (str) => str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
var SessionBody = Struct({
  name: String4.pipe(withDecodingDefaultType(succeed6("debug")))
});
var LogBody = StructWithRest(Struct({
  sessionId: String4.pipe(withDecodingDefaultType(succeed6("default"))),
  msg: optional2(String4)
}), [Record(String4, Unknown2)]);
var makeRouter = (logDir) => addAll([
  route("GET", "/", json2({
    status: "ok",
    log_dir: logDir
  })),
  route("POST", "/session", gen2(function* () {
    const path = yield* Path;
    const fs = yield* FileSystem;
    const body = yield* schemaBodyJson2(SessionBody);
    const name = toKebabCase(body.name);
    const sessionId = `${name}-${generateId()}`;
    const logFile = path.join(logDir, `debug-${sessionId}.log`);
    yield* fs.writeFileString(logFile, "");
    yield* log(`[session] Created: ${sessionId}`);
    return yield* json2({
      session_id: sessionId,
      log_file: logFile
    });
  })),
  route("POST", "/log", gen2(function* () {
    const path = yield* Path;
    const fs = yield* FileSystem;
    const body = yield* schemaBodyJson2(LogBody);
    const { sessionId, ...rest } = body;
    const logFile = path.join(logDir, `debug-${sessionId}.log`);
    const entry = { ts: new Date().toISOString(), ...rest };
    yield* fs.writeFileString(logFile, `${JSON.stringify(entry)}
`, {
      flag: "a"
    });
    yield* log(`[${sessionId}] ${entry.msg ?? JSON.stringify(entry).slice(0, 80)}`);
    return yield* json2({
      ok: true,
      log_file: logFile
    });
  }))
]);
var directory = pipe(String10("directory"), withDescription2("The relative path to your project's directory. A .debug/ directory will be created at this path."));
var serve3 = make44("serve", { directory }, ({ directory }) => gen2(function* () {
  const logSubdir = yield* String5("DEBUG_LOG_DIR").pipe(withDefault2(".debug"));
  const port = yield* Int2("DEBUG_PORT").pipe(withDefault2(8787));
  const path = yield* Path;
  const logDir = path.resolve(directory, logSubdir);
  const client = yield* HttpClient;
  const alreadyRunning = yield* client.get(`http://localhost:${port}`).pipe(map7((res) => res.status === 200), timeout2(millis(500)), orElseSucceed2(() => false));
  if (alreadyRunning) {
    yield* log(JSON.stringify({
      status: "already_running",
      log_dir: logDir,
      endpoint: `http://localhost:${port}/log`
    }));
    return;
  }
  const fs = yield* FileSystem;
  yield* fs.makeDirectory(logDir, { recursive: true });
  const app = serve2(makeRouter(logDir), {
    middleware: (httpEffect) => pipe(httpEffect, catch_2((error) => json2({ error: String(error) }, { status: 400 })), cors())
  }).pipe(provide2(layer16({ port })));
  yield* launch(app);
}));
var toLogFileBase = (raw) => {
  const base = raw.endsWith(".log") ? raw.slice(0, -4) : raw;
  return base.startsWith("debug-") ? base : `debug-${base}`;
};
var action = pipe(ChoiceWithValue2("action", [["clear", "clear"], ["remove", "remove"]]), withDescription2("Action to perform: clear (truncate) or remove (delete)"));
var sessionId = pipe(String10("sessionId"), withDescription2("Session ID or log file base name"));
var cleanup = make44("cleanup", { action, directory, sessionId }, ({ action, directory, sessionId }) => gen2(function* () {
  const logSubdir = yield* String5("DEBUG_LOG_DIR").pipe(withDefault2(".debug"));
  const path = yield* Path;
  const fs = yield* FileSystem;
  const logDir = path.join(directory, logSubdir);
  const logFile = path.join(logDir, `${toLogFileBase(sessionId)}.log`);
  const exists = yield* fs.exists(logFile);
  if (!exists) {
    yield* fail6(new Error(`Log file not found: ${logFile}`));
  }
  if (action === "clear") {
    yield* fs.writeFileString(logFile, "");
    yield* log(`Cleared: ${logFile}`);
  } else {
    yield* fs.remove(logFile);
    yield* log(`Removed: ${logFile}`);
  }
}));
var debug = make44("debug", {}, succeed6);
var command = pipe(debug, withSubcommands([serve3, cleanup]));
var cli = run5(command, {
  version: "v1.0.0"
});
cli.pipe(provide4(merge2(layer15, layer2)), runMain2);
