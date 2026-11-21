import { Effect } from "effect";
import { run } from "../../../packages/core/src/evaluation/evaluate";
import { stdlib } from "../../../packages/core/src/modules";

// A model of exact numbers for Lion, run beside JavaScript's doubles, and
// what it costs. It prints one line for each property and each timing.
//
//   E1  Sums and products of exact numbers keep the field laws, associativity
//       and distributivity, for random decimals; doubles break them, and the
//       line counts how often.
//   E2  A decimal read from its digits and written back reads as the same
//       number, and a fraction is refused when written as JSON exactly when no
//       decimal writes it, as for a third of most decimals, for random values.
//   E3  A double that a host passes, read from the shortest digits that write
//       it, is the decimal the host wrote, for random decimals of up to 15
//       significant digits.
//   E4  Sums and products of exact integers equal BigInt's, for random
//       integers up to 2^80; doubles differ, and the line counts how often.
//   E5  The two proofs Lion's solver gives that its doubles break hold of
//       exact numbers: (x + 0.2) - 0.2 = x, and n + 1 differs from n past 2^53.
//   T1  Adding a million small integers, exact numbers with a fast path for
//       safe integers against doubles.
//   T2  Adding a hundred thousand decimals with two places, exact against
//       doubles.
//   T3  Multiplying and adding a hundred thousand decimals with two places,
//       exact against doubles.
//
//   T4  How large a fraction grows when a loop halves it.
//   T5  The same hundred thousand additions run by Lion's evaluator, this
//       worktree's core, as `array/reduce` with `number/add`.
//
//   bun run test.ts [runs]

/** An exact number: a safe integer as a JavaScript number, or a fraction. */
type Exact = number | { readonly n: bigint; readonly d: bigint };

const gcd = (a: bigint, b: bigint): bigint => {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
};

const fraction = (n: bigint, d: bigint): Exact => {
  if (d === 0n) {
    throw new Error("division by zero");
  }
  const sign = d < 0n ? -1n : 1n;
  const g = gcd(n, d);
  const top = (sign * n) / g;
  const bottom = (sign * d) / g;
  if (
    bottom === 1n &&
    top <= BigInt(Number.MAX_SAFE_INTEGER) &&
    top >= -BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return Number(top);
  }
  return { n: top, d: bottom };
};

const parts = (x: Exact) =>
  typeof x === "number" ? { n: BigInt(x), d: 1n } : x;

const add = (a: Exact, b: Exact): Exact => {
  if (typeof a === "number" && typeof b === "number") {
    const sum = a + b;
    if (Number.isSafeInteger(sum)) {
      return sum;
    }
  }
  const x = parts(a);
  const y = parts(b);
  return fraction(x.n * y.d + y.n * x.d, x.d * y.d);
};

const negate = (a: Exact): Exact => {
  const x = parts(a);
  return fraction(-x.n, x.d);
};

const multiply = (a: Exact, b: Exact): Exact => {
  if (typeof a === "number" && typeof b === "number") {
    const product = a * b;
    if (Number.isSafeInteger(product)) {
      return product;
    }
  }
  const x = parts(a);
  const y = parts(b);
  return fraction(x.n * y.n, x.d * y.d);
};

const same = (a: Exact, b: Exact) => {
  const x = parts(a);
  const y = parts(b);
  return x.n === y.n && x.d === y.d;
};

/** The exact number decimal digits write, with a sign and an exponent. */
const read = (text: string): Exact => {
  const found = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (found === null) {
    throw new Error(`not a number: ${text}`);
  }
  const [, sign, whole, fractionDigits = "", exponent = "0"] = found;
  const digits = BigInt(`${sign}${whole}${fractionDigits}`);
  const power = Number(exponent) - fractionDigits.length;
  return power >= 0
    ? fraction(digits * 10n ** BigInt(power), 1n)
    : fraction(digits, 10n ** BigInt(-power));
};

/** The JSON text of an exact number, or undefined when no decimal writes it. */
const write = (x: Exact): string | undefined => {
  if (typeof x === "number") {
    return String(x);
  }
  let d = x.d;
  let twos = 0;
  let fives = 0;
  while (d % 2n === 0n) {
    d /= 2n;
    twos += 1;
  }
  while (d % 5n === 0n) {
    d /= 5n;
    fives += 1;
  }
  if (d !== 1n) {
    return undefined;
  }
  const places = Math.max(twos, fives);
  const scaled = (x.n * 10n ** BigInt(places)) / x.d;
  const negative = scaled < 0n;
  const text = (negative ? -scaled : scaled)
    .toString()
    .padStart(places + 1, "0");
  const point = text.length - places;
  const shown =
    places === 0 ? text : `${text.slice(0, point)}.${text.slice(point)}`;
  return `${negative ? "-" : ""}${shown}`;
};

/** A seeded generator, so every run tries the same values. */
const random = (() => {
  let state = 0x2545f491;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
})();

const decimalText = (places: number, wholeDigits: number) => {
  const whole = Math.floor(random() * 10 ** wholeDigits);
  const part = Math.floor(random() * 10 ** places)
    .toString()
    .padStart(places, "0");
  const sign = random() < 0.5 ? "-" : "";
  return places === 0 ? `${sign}${whole}` : `${sign}${whole}.${part}`;
};

const runs = Number(process.argv[2] ?? "10000");
const lines: string[] = [];

{
  let exactBroken = 0;
  let addBroken = 0;
  let multiplyBroken = 0;
  let distributeBroken = 0;
  for (let i = 0; i < runs; i++) {
    const [a, b, c] = [0, 1, 2].map(() => decimalText(2, 3));
    const [x, y, z] = [a, b, c].map(read);
    const [p, q, r] = [a, b, c].map(Number);
    if (
      !same(add(add(x, y), z), add(x, add(y, z))) ||
      !same(multiply(multiply(x, y), z), multiply(x, multiply(y, z))) ||
      !same(multiply(x, add(y, z)), add(multiply(x, y), multiply(x, z)))
    ) {
      exactBroken += 1;
    }
    if (p + q + r !== p + (q + r)) {
      addBroken += 1;
    }
    if (p * q * r !== p * (q * r)) {
      multiplyBroken += 1;
    }
    if (p * (q + r) !== p * q + p * r) {
      distributeBroken += 1;
    }
  }
  lines.push(
    `E1  for ${runs} random triples of decimals with two places, exact numbers broke associativity or distributivity ${exactBroken} times; doubles broke associativity of addition ${addBroken} times, of multiplication ${multiplyBroken} times, and distributivity ${distributeBroken} times`
  );
}

{
  let roundTripBroken = 0;
  let refusedRight = 0;
  for (let i = 0; i < runs; i++) {
    const text = decimalText(1 + Math.floor(random() * 6), 4);
    const x = read(text);
    const written = write(x);
    if (written === undefined || !same(read(written), x)) {
      roundTripBroken += 1;
    }
    // A third of x is a decimal exactly when 3 divides x's numerator.
    const third = multiply(x, fraction(1n, 3n));
    if ((write(third) === undefined) === (parts(x).n % 3n !== 0n)) {
      refusedRight += 1;
    }
  }
  lines.push(
    `E2  for ${runs} random decimals, writing an exact number as JSON and reading it back changed it ${roundTripBroken} times, and a third of one was refused as JSON exactly when no decimal writes it ${refusedRight} times out of ${runs}`
  );
}

{
  let differed = 0;
  for (let i = 0; i < runs; i++) {
    const places = Math.floor(random() * 8);
    const text = decimalText(places, 15 - places - 1);
    if (!same(read(String(Number(text))), read(text))) {
      differed += 1;
    }
  }
  lines.push(
    `E3  for ${runs} random decimals of up to 15 significant digits, the shortest digits of the double a host would pass read as another number ${differed} times`
  );
}

{
  let exactWrong = 0;
  let doubleWrong = 0;
  const big = () => BigInt(Math.floor(random() * 2 ** 40)) * BigInt(Math.floor(random() * 2 ** 40));
  for (let i = 0; i < runs; i++) {
    const a = big();
    const b = big();
    const x = fraction(a, 1n);
    const y = fraction(b, 1n);
    if (!same(add(x, y), fraction(a + b, 1n)) || !same(multiply(x, y), fraction(a * b, 1n))) {
      exactWrong += 1;
    }
    if (BigInt(Number(a) + Number(b)) !== a + b) {
      doubleWrong += 1;
    }
  }
  lines.push(
    `E4  for ${runs} random pairs of integers up to 2^80, exact sums and products differed from BigInt's ${exactWrong} times; double sums differed ${doubleWrong} times`
  );
}

{
  const tenth = read("0.1");
  const fifth = read("0.2");
  const back = add(add(tenth, fifth), negate(fifth));
  const power = fraction(2n ** 53n, 1n);
  lines.push(
    `E5  exact: (0.1 + 0.2) - 0.2 is ${write(back)}, which equals 0.1: ${same(back, tenth)}; 2^53 + 1 is ${write(add(power, 1))}, which equals 2^53: ${same(add(power, 1), power)}`
  );
}

const time = (work: () => unknown) => {
  let best = Number.POSITIVE_INFINITY;
  for (let round = 0; round < 7; round++) {
    const start = performance.now();
    work();
    best = Math.min(best, performance.now() - start);
  }
  return best;
};

const ratio = (label: string, exact: () => unknown, double: () => unknown) => {
  const e = time(exact);
  const d = time(double);
  lines.push(
    `${label}: exact ${e.toFixed(1)} ms, doubles ${d.toFixed(1)} ms, ${(e / d).toFixed(1)} times as long`
  );
};

{
  const integers = Array.from({ length: 1_000_000 }, () => Math.floor(random() * 1000));
  ratio(
    "T1  adding a million small integers",
    () => integers.reduce<Exact>((sum, n) => add(sum, n), 0),
    () => integers.reduce((sum, n) => sum + n, 0)
  );
}

{
  const texts = Array.from({ length: 100_000 }, () => decimalText(2, 3));
  const exact = texts.map(read);
  const doubles = texts.map(Number);
  ratio(
    "T2  adding a hundred thousand decimals with two places",
    () => exact.reduce<Exact>((sum, x) => add(sum, x), 0),
    () => doubles.reduce((sum, x) => sum + x, 0)
  );
  const others = texts.map(() => decimalText(2, 3));
  const exactOthers = others.map(read);
  const doubleOthers = others.map(Number);
  ratio(
    "T3  adding a hundred thousand products of decimals with two places",
    () => exact.reduce<Exact>((sum, x, i) => add(sum, multiply(x, exactOthers[i] as Exact)), 0),
    () => doubles.reduce((sum, x, i) => sum + x * (doubleOthers[i] as number), 0)
  );
}

{
  const half = fraction(1n, 2n);
  const tenth = read("0.1");
  let x: Exact = 0;
  const steps = 2000;
  const start = performance.now();
  for (let i = 0; i < steps; i++) {
    x = add(multiply(x, half), tenth);
  }
  const elapsed = performance.now() - start;
  lines.push(
    `T4  halving and adding 0.1 ${steps} times: the exact result's denominator has ${parts(x).d.toString().length} digits, and it took ${elapsed.toFixed(1)} ms`
  );
}

{
  const numbers = Array.from({ length: 100_000 }, () => Number(decimalText(2, 3)));
  const program = ["array/reduce", ["quote", numbers], 0, "number/add"];
  const lion = time(() => Effect.runSync(run(program, stdlib) as Effect.Effect<unknown, unknown, never>));
  lines.push(
    `T5  Lion's evaluator adding the same hundred thousand decimals with array/reduce: ${lion.toFixed(1)} ms`
  );
}

console.log(lines.join("\n"));
