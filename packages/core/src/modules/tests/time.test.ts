import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { run } from "@/evaluation/evaluate";
import { loadDatabase, saveDatabase } from "@/logic/snapshot";
import { stdlib } from "@/modules";

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

const pad = (n: number, width: number) => String(n).padStart(width, "0");

const validInstant = Arbitrary.map(
  Arbitrary.all({
    year: int(1970, 2100),
    month: int(1, 12),
    day: int(1, 28),
    hour: int(0, 23),
    minute: int(0, 59),
    second: int(0, 59),
    ms: int(0, 999),
    offsetHour: int(-12, 14),
    offsetMinute: Arbitrary.map(int(0, 3), (k) => k * 15),
  }),
  (p) => {
    const sign = p.offsetHour < 0 ? -1 : 1;
    const absH = Math.abs(p.offsetHour);
    const offsetMinutes =
      absH === 14 ? 14 * 60 : sign * (absH * 60 + p.offsetMinute);
    return { ...p, offsetMinutes };
  }
);

const unitArb = Arbitrary.map(
  int(0, 4),
  (i) => (["ms", "seconds", "minutes", "hours", "days"] as const)[i] ?? "ms"
);

describe("time module", () => {
  it.effect.prop(
    "time/parse agrees with Date.parse on ISO-8601 UTC and offset timestamps",
    { p: validInstant },
    ({ p }) =>
      Effect.gen(function* () {
        const sign = p.offsetMinutes < 0 ? "-" : "+";
        const abs = Math.abs(p.offsetMinutes);
        const oh = pad(Math.floor(abs / 60), 2);
        const om = pad(abs % 60, 2);
        const iso = `${pad(p.year, 4)}-${pad(p.month, 2)}-${pad(p.day, 2)}T${pad(p.hour, 2)}:${pad(p.minute, 2)}:${pad(p.second, 2)}.${pad(p.ms, 3)}${sign}${oh}:${om}`;
        const expected = Date.parse(iso);
        expect(yield* run(["time/parse", iso], stdlib)).toBe(expected);

        const dateOnly = `${pad(p.year, 4)}-${pad(p.month, 2)}-${pad(p.day, 2)}`;
        expect(yield* run(["time/parse", dateOnly], stdlib)).toBe(
          Date.UTC(p.year, p.month - 1, p.day)
        );
      })
  );

  it.effect.prop(
    "time/fromParts agrees with Date.UTC and round-trips through time/parts",
    { p: validInstant },
    ({ p }) =>
      Effect.gen(function* () {
        const expected =
          Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
          p.offsetMinutes * 60_000;
        const ms = yield* run(
          [
            "time/fromParts",
            p.year,
            p.month,
            p.day,
            p.hour,
            p.minute,
            p.second,
            p.offsetMinutes,
          ],
          stdlib
        );
        expect(ms).toBe(expected);

        const parts = (yield* run(["time/parts", ms], stdlib)) as Record<
          string,
          number
        >;
        const d = new Date(expected);
        expect(parts).toEqual({
          year: d.getUTCFullYear(),
          month: d.getUTCMonth() + 1,
          day: d.getUTCDate(),
          hour: d.getUTCHours(),
          minute: d.getUTCMinutes(),
          second: d.getUTCSeconds(),
          ms: d.getUTCMilliseconds(),
          dayOfWeek: d.getUTCDay(),
        });

        // Round-trip UTC parts back to the exact instant.
        const rebuilt = yield* run(
          [
            "time/fromParts",
            parts.year,
            parts.month,
            parts.day,
            parts.hour,
            parts.minute,
            parts.second,
          ],
          stdlib
        );
        expect(rebuilt).toBe(expected);
      })
  );

  it.effect.prop(
    "time/format and time/parse round-trip across every precision",
    { p: validInstant },
    ({ p }) =>
      Effect.gen(function* () {
        const ms = Date.UTC(
          p.year,
          p.month - 1,
          p.day,
          p.hour,
          p.minute,
          p.second,
          p.ms
        );
        const formattedMs = yield* run(["time/format", ms, "ms"], stdlib);
        expect(yield* run(["time/parse", formattedMs], stdlib)).toBe(ms);

        const formattedSec = yield* run(["time/format", ms, "second"], stdlib);
        expect(yield* run(["time/format", ms], stdlib)).toBe(formattedSec);
        expect(yield* run(["time/parse", formattedSec], stdlib)).toBe(
          Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
        );

        const formattedMin = yield* run(["time/format", ms, "minute"], stdlib);
        expect(yield* run(["time/parse", formattedMin], stdlib)).toBe(
          Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
        );

        const formattedDate = yield* run(["time/format", ms, "date"], stdlib);
        expect(yield* run(["time/parse", formattedDate], stdlib)).toBe(
          Date.UTC(p.year, p.month - 1, p.day)
        );
      })
  );

  it.effect.prop(
    "time/add and time/diff are exact inverses across all units",
    {
      base: int(-500_000_000, 2_000_000_000),
      amount: int(-1000, 1000),
      unit: unitArb,
    },
    ({ base, amount, unit }) =>
      Effect.gen(function* () {
        const shifted = yield* run(["time/add", base, amount, unit], stdlib);
        const delta = yield* run(["time/diff", shifted, base, unit], stdlib);
        expect(delta).toBe(amount);
      })
  );

  it.effect.prop(
    "time/parse returns null and time/fromParts fails on impossible calendar dates",
    {
      year: int(1970, 2100),
      badDay: int(30, 40),
    },
    ({ year, badDay }) =>
      Effect.gen(function* () {
        const text = `${pad(year, 4)}-02-${pad(badDay, 2)}`;
        expect(yield* run(["time/parse", text], stdlib)).toBeNull();
        const failed = yield* Effect.flip(
          run(["time/fromParts", year, 2, badDay], stdlib)
        );
        expect(String(failed)).toContain("not a valid calendar date");
      })
  );

  it.effect.prop(
    "time functions wait for logic variables in rules and survive snapshots",
    {
      year: int(2020, 2030),
      month: int(1, 12),
      day: int(1, 28),
      gapMinutes: int(1, 600),
    },
    ({ year, month, day, gapMinutes }) =>
      Effect.gen(function* () {
        const startIso = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}T10:00:00Z`;
        const program = [
          "begin",
          ["relation", "ev", ["name", "ts"]],
          ["relation", "parsed", ["name", "ms", "utc"]],
          ["fact", ["ev", "start", startIso]],
          [
            "rule",
            [
              "parsed",
              "?n",
              ["time/add", "?ms", gapMinutes, "minutes"],
              [
                "time/format",
                ["time/add", "?ms", gapMinutes, "minutes"],
                "minute",
              ],
            ],
            ["ev", "?n", "?s"],
            ["=", "?ms", ["time/parse", "?s"]],
          ],
        ];
        const db = yield* loadDatabase(program, stdlib);
        const saved = yield* saveDatabase(db);
        const reloaded = yield* loadDatabase(saved, stdlib);
        const expectedMs = Date.parse(startIso) + gapMinutes * 60_000;
        const out = yield* run(
          ["query", ["parsed", "?n", "?ms", "?utc"]],
          stdlib,
          {
            database: reloaded,
          }
        );
        expect(out).toEqual([
          {
            n: "start",
            ms: expectedMs,
            utc: `${new Date(expectedMs).toISOString().slice(0, 16)}Z`,
          },
        ]);
      })
  );
});
