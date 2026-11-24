import { Effect, Schema } from "effect";
import { logicError } from "@/errors/evaluation";
import { over, overEffect } from "@/modules/lib/shared";
import {
  difference,
  fromRational,
  isInteger,
  type LionNumber,
  product,
  quotient,
  ratio,
  sum,
  toRational,
} from "@/numbers/exact";
import { NumberSchema } from "@/schemas/number";

/**
 * Deterministic proleptic Gregorian UTC calendar and timestamp functions.
 * Every instant is an exact integer count of milliseconds since
 * 1970-01-01T00:00:00.000Z, with zero dependence on the host's local time zone.
 */

const MS_PER_SECOND = 1000n;
const MS_PER_MINUTE = 60_000n;
const MS_PER_HOUR = 3_600_000n;
const MS_PER_DAY = 86_400_000n;

const UNIT_MS: Readonly<Record<string, number>> = {
  ms: 1,
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

const PRECISIONS = ["date", "minute", "second", "ms"] as const;
type Precision = (typeof PRECISIONS)[number];

const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeapYear = (year: bigint) =>
  (year % 4n === 0n && year % 100n !== 0n) || year % 400n === 0n;

const daysInMonth = (year: bigint, month: number) =>
  month === 2 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[month] ?? 0);

const floorDiv = (a: bigint, b: bigint) => {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
};

const floorMod = (a: bigint, b: bigint) => a - floorDiv(a, b) * b;

/** Days since 1970-01-01 (Howard Hinnant's proleptic Gregorian formula). */
const daysFromCivil = (year: bigint, month: number, day: number): bigint => {
  const y = month <= 2 ? year - 1n : year;
  const era = floorDiv(y, 400n);
  const yoe = y - era * 400n;
  const m = BigInt(month);
  const doy = (153n * (m + (m > 2n ? -3n : 9n)) + 2n) / 5n + BigInt(day) - 1n;
  const doe = yoe * 365n + yoe / 4n - yoe / 100n + doy;
  return era * 146_097n + doe - 719_468n;
};

/** Civil UTC date from days since 1970-01-01. */
const civilFromDays = (days: bigint) => {
  const z = days + 719_468n;
  const era = floorDiv(z, 146_097n);
  const doe = z - era * 146_097n;
  const yoe = (doe - doe / 1460n + doe / 36_524n - doe / 146_096n) / 365n;
  const y = yoe + era * 400n;
  const doy = doe - (365n * yoe + yoe / 4n - yoe / 100n);
  const mp = (5n * doy + 2n) / 153n;
  const day = Number(doy - (153n * mp + 2n) / 5n + 1n);
  const month = Number(mp + (mp < 10n ? 3n : -9n));
  const year = y + (month <= 2 ? 1n : 0n);
  // 1970-01-01 was Thursday (4); Sunday = 0 .. Saturday = 6.
  const dayOfWeek = Number(floorMod(days + 4n, 7n));
  return { year, month, day, dayOfWeek };
};

const pad = (value: number | bigint, width: number) => {
  const negative = typeof value === "bigint" ? value < 0n : value < 0;
  const digits = String(negative ? -value : value).padStart(width, "0");
  return negative ? `-${digits}` : digits;
};

const validParts = (
  year: bigint,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  offsetMinutes: number
) =>
  month >= 1 &&
  month <= 12 &&
  day >= 1 &&
  day <= daysInMonth(year, month) &&
  hour >= 0 &&
  hour <= 23 &&
  minute >= 0 &&
  minute <= 59 &&
  second >= 0 &&
  second <= 59 &&
  ms >= 0 &&
  ms <= 999 &&
  offsetMinutes >= -1439 &&
  offsetMinutes <= 1439;

const toEpochMs = (
  year: bigint,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  offsetMinutes: number
): LionNumber =>
  fromRational(
    ratio(
      daysFromCivil(year, month, day) * MS_PER_DAY +
        BigInt(hour) * MS_PER_HOUR +
        BigInt(minute) * MS_PER_MINUTE +
        BigInt(second) * MS_PER_SECOND +
        BigInt(ms) -
        BigInt(offsetMinutes) * MS_PER_MINUTE
    )
  );

const DATE_ONLY = /^(-?\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME =
  /^(-?\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:([Zz])|(?: UTC)|([+-])(\d{2}):?(\d{2}))$/;

/**
 * Parses an ISO-8601 date (`"2026-03-03"`) or UTC/offset timestamp
 * (`"2026-03-03T11:40:00-05:00"`, `"2026-03-03 16:40 UTC"`) into exact integer
 * UTC epoch milliseconds, or null when the string is not a valid date/timestamp.
 */
const parseTimestamp = (text: string): LionNumber | null => {
  const dateOnly = DATE_ONLY.exec(text);
  if (dateOnly !== null) {
    const year = BigInt(dateOnly[1] as string);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    return validParts(year, month, day, 0, 0, 0, 0, 0)
      ? toEpochMs(year, month, day, 0, 0, 0, 0, 0)
      : null;
  }
  const found = DATE_TIME.exec(text);
  if (found === null) {
    return null;
  }
  const year = BigInt(found[1] as string);
  const month = Number(found[2]);
  const day = Number(found[3]);
  const hour = Number(found[4]);
  const minute = Number(found[5]);
  const second = found[6] === undefined ? 0 : Number(found[6]);
  const ms = found[7] === undefined ? 0 : Number(found[7].padEnd(3, "0"));
  let offsetMinutes = 0;
  if (found[9] !== undefined) {
    const offsetHours = Number(found[10]);
    const offsetMins = Number(found[11]);
    if (offsetHours > 23 || offsetMins > 59) {
      return null;
    }
    const sign = found[9] === "-" ? -1 : 1;
    offsetMinutes = sign * (offsetHours * 60 + offsetMins);
  }
  return validParts(year, month, day, hour, minute, second, ms, offsetMinutes)
    ? toEpochMs(year, month, day, hour, minute, second, ms, offsetMinutes)
    : null;
};

const decompose = (epochMs: LionNumber) => {
  const totalMs = toRational(epochMs).n;
  const days = floorDiv(totalMs, MS_PER_DAY);
  const remDay = floorMod(totalMs, MS_PER_DAY);
  const hour = Number(remDay / MS_PER_HOUR);
  const remHour = remDay % MS_PER_HOUR;
  const minute = Number(remHour / MS_PER_MINUTE);
  const remMinute = remHour % MS_PER_MINUTE;
  const second = Number(remMinute / MS_PER_SECOND);
  const ms = Number(remMinute % MS_PER_SECOND);
  const { year, month, day, dayOfWeek } = civilFromDays(days);
  return {
    year: fromRational(ratio(year)),
    yearBig: year,
    month,
    day,
    hour,
    minute,
    second,
    ms,
    dayOfWeek,
  };
};

const requireWholeEpoch = (name: string, epochMs: LionNumber) =>
  isInteger(epochMs)
    ? Effect.succeed(epochMs)
    : logicError(
        `${name} expects a whole number of UTC milliseconds, but found ${String(epochMs)}.`
      );

const requireUnit = (name: string, unit: string) => {
  const factor = UNIT_MS[unit];
  return factor === undefined
    ? logicError(
        `${name} expects a unit of "ms", "seconds", "minutes", "hours", or "days", but found ${JSON.stringify(unit)}.`
      )
    : Effect.succeed(factor);
};

export const module = {
  symbol: Symbol("time"),

  /**
   * Parses an ISO-8601 date or timestamp with an explicit time zone into exact
   * integer UTC milliseconds since 1970-01-01T00:00:00.000Z, or null when invalid.
   */
  parse: over([Schema.String], parseTimestamp),

  /**
   * Builds exact integer UTC epoch milliseconds from calendar parts:
   * `(year, month, day, hour?, minute?, second?, offsetMinutes?)`.
   */
  fromParts: overEffect(
    [
      Schema.Int,
      Schema.Int,
      Schema.Int,
      Schema.Int,
      Schema.Int,
      Schema.Int,
      Schema.Int,
    ],
    (year, month, day, hour = 0, minute = 0, second = 0, offsetMinutes = 0) => {
      const y = BigInt(year);
      return validParts(y, month, day, hour, minute, second, 0, offsetMinutes)
        ? Effect.succeed(
            toEpochMs(y, month, day, hour, minute, second, 0, offsetMinutes)
          )
        : logicError(
            `time/fromParts: ${year}-${pad(month, 2)}-${pad(day, 2)} ${pad(hour, 2)}:${pad(minute, 2)}:${pad(second, 2)} (offset ${offsetMinutes}) is not a valid calendar date or time.`
          );
    },
    3
  ),

  /**
   * Formats exact integer UTC milliseconds as an ISO-8601 UTC string at the
   * requested precision: `"date"`, `"minute"`, `"second"` (default), or `"ms"`.
   */
  format: overEffect(
    [NumberSchema, Schema.String],
    (epochMs, precision = "second") =>
      Effect.gen(function* () {
        yield* requireWholeEpoch("time/format", epochMs);
        if (!PRECISIONS.includes(precision as Precision)) {
          return yield* logicError(
            `time/format expects precision "date", "minute", "second", or "ms", but found ${JSON.stringify(precision)}.`
          );
        }
        const { yearBig, month, day, hour, minute, second, ms } =
          decompose(epochMs);
        const date = `${pad(yearBig, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
        if (precision === "date") {
          return date;
        }
        const hm = `${date}T${pad(hour, 2)}:${pad(minute, 2)}`;
        if (precision === "minute") {
          return `${hm}Z`;
        }
        const hms = `${hm}:${pad(second, 2)}`;
        return precision === "second" ? `${hms}Z` : `${hms}.${pad(ms, 3)}Z`;
      }),
    1
  ),

  /** Breaks integer UTC milliseconds into UTC calendar parts and dayOfWeek (0=Sunday..6=Saturday). */
  parts: overEffect([NumberSchema], (epochMs) =>
    Effect.map(requireWholeEpoch("time/parts", epochMs), () => {
      const { year, month, day, hour, minute, second, ms, dayOfWeek } =
        decompose(epochMs);
      return { year, month, day, hour, minute, second, ms, dayOfWeek };
    })
  ),

  /**
   * Exact elapsed duration `end - start` in `"ms"` (default), `"seconds"`,
   * `"minutes"`, `"hours"`, or `"days"`.
   */
  diff: overEffect(
    [NumberSchema, NumberSchema, Schema.String],
    (endMs, startMs, unit = "ms") =>
      Effect.map(requireUnit("time/diff", unit), (factor) => {
        const delta = difference(endMs, startMs);
        return factor === 1 ? delta : (quotient(delta, factor) as LionNumber);
      }),
    2
  ),

  /**
   * Shifts an instant by an exact `amount` in `"ms"`, `"seconds"`, `"minutes"`,
   * `"hours"`, or `"days"`.
   */
  add: overEffect(
    [NumberSchema, NumberSchema, Schema.String],
    (epochMs, amount, unit) =>
      Effect.map(requireUnit("time/add", unit), (factor) =>
        sum(epochMs, product(amount, factor))
      )
  ),
};
