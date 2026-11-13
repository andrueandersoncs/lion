/**
 * What the pages of lionlang.dev decide without a page: which section of a
 * document "On this page" marks as the one being read, and how an example
 * shows how long its program ran.
 *
 * A page here is a model: headings at places down a document that can scroll
 * so far, moved the way a browser moves it.
 */
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { sectionBeingRead, timeLabel } from "../../../../docs/pure.js";
import { evaluateSource } from "../evaluate.ts";

const OPTIONS = { arbitrary: { runs: 300 } };

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

interface Page {
  /** How far the page can scroll. */
  readonly end: number;
  /** Each heading's scroll-margin-top. */
  readonly margins: readonly number[];
  /** The page's scroll-padding-top. */
  readonly padding: number;
  /** How far down the document each section's heading is. */
  readonly places: readonly number[];
}

const MARGINS = [0, 16, 88, 120];
const MOST_SECTIONS = 8;
/** Headings are at least a line apart. */
const LINE = 24;

/**
 * How far a link to a section would scroll the page if the page could scroll
 * any distance: until the heading is the page's scroll padding and its own
 * scroll margin below the top of the window, as CSS says.
 */
const wants = (
  { margins, padding, places }: Omit<Page, "end">,
  section: number
) => (places[section] as number) - padding - (margins[section] as number);

/**
 * A document of one to eight sections in a window. Its headings share one
 * scroll margin, as the site's do, or each has its own. Places are in half
 * pixels, since a browser lays out between pixels. One page in three can
 * scroll just as far as a link to one of its sections wants, so that the
 * link leaves the page at its end.
 */
const page = (shared: boolean) =>
  Arbitrary.map(
    Arbitrary.all([
      int(0, 1200),
      Arbitrary.array(int(2 * LINE, 1800), { maxLength: MOST_SECTIONS - 1 }),
      Arbitrary.array(int(0, MARGINS.length - 1), {
        maxLength: MOST_SECTIONS,
        minLength: MOST_SECTIONS,
      }),
      int(0, 120),
      int(200, 1400),
      int(0, 3000),
      int(0, 3 * MOST_SECTIONS - 1),
    ]),
    ([first, gaps, picks, padding, height, tail, fit]): Page => {
      const places = [first / 2];
      for (const gap of gaps) {
        places.push((places.at(-1) as number) + gap / 2);
      }
      const margins = places.map(
        (_, at) => MARGINS[picks[shared ? 0 : at] as number] as number
      );
      const laid = { margins, padding, places };
      const length = (places.at(-1) as number) + LINE + tail / 2;
      const end =
        fit < MOST_SECTIONS
          ? wants(laid, fit % places.length)
          : length - height;
      return { ...laid, end: Math.max(0, end) };
    }
  );

/** Where following a link to a section leaves the page. */
const leaves = (document: Page, section: number) =>
  Math.min(document.end, Math.max(0, wants(document, section)));

/** The section being read with the page scrolled so far, after a link or not. */
const read = (
  { end, margins, padding, places }: Page,
  scrolled: number,
  link = { leftAt: 0, named: -1 }
) =>
  sectionBeingRead({
    end,
    margins,
    padding,
    scrolled,
    tops: places.map((place) => place - scrolled),
    ...link,
  });

/** A place to scroll to, as a share of how far the page can scroll. */
const share = int(0, 1000);
const scrolledTo = ({ end }: Page, part: number) => (end * part) / 1000;

const section = int(0, MOST_SECTIONS - 1);

describe("the section being read", () => {
  it.prop(
    "is the one a link was followed to, wherever that leaves the page",
    { document: page(false), pick: section },
    ({ document, pick }) => {
      const named = pick % document.places.length;
      const leftAt = leaves(document, named);
      expect(read(document, leftAt, { leftAt, named })).toBe(named);
    },
    OPTIONS
  );

  it.prop(
    "is the same for a reader who scrolls to where a link leaves the page, and the one before for a reader who stops short",
    { document: page(true), pick: section },
    ({ document, pick }) => {
      const named = pick % document.places.length;
      const wanted = wants(document, named);
      if (wanted < 0 || wanted > document.end) {
        // The page cannot scroll there, so no reader can either.
        return;
      }
      const last = document.places.length - 1;
      // At its end, a page that scrolls is past every heading it can reach.
      const atEnd = wanted > 0 && wanted >= document.end - 1;
      expect(read(document, wanted)).toBe(atEnd ? last : named);
      if (wanted >= 2) {
        expect(read(document, wanted - 2)).toBe(named - 1);
      }
    },
    OPTIONS
  );

  it.prop(
    "never goes back as the page scrolls down",
    { document: page(false), from: share, to: share },
    ({ document, from, to }) => {
      const higher = scrolledTo(document, Math.min(from, to));
      const lower = scrolledTo(document, Math.max(from, to));
      expect(read(document, higher)).toBeLessThanOrEqual(read(document, lower));
    },
    OPTIONS
  );

  it.prop(
    "is the last at the end of a page that scrolls, and none while every heading is below where a link would put it",
    { document: page(false) },
    ({ document }) => {
      const last = document.places.length - 1;
      if (document.end > 0) {
        expect(read(document, document.end)).toBe(last);
      }
      const reached = document.places.some((_, at) => wants(document, at) <= 1);
      if (!reached) {
        expect(read(document, 0)).toBe(-1);
      }
    },
    OPTIONS
  );

  it.prop(
    "does not depend on a link once the page has moved from where the link left it",
    { document: page(false), part: share, pick: section },
    ({ document, part, pick }) => {
      const named = pick % document.places.length;
      const leftAt = leaves(document, named);
      const scrolled = scrolledTo(document, part);
      if (scrolled !== leftAt) {
        expect(read(document, scrolled, { leftAt, named })).toBe(
          read(document, scrolled)
        );
      }
    },
    OPTIONS
  );
});

/**
 * A time a clock can measure, in milliseconds: none at all, under one, one,
 * a few, ten, or many. A coarse clock often sees no time pass over a short
 * program.
 */
const measured = Arbitrary.flatMap(int(0, 5), (pick) =>
  Arbitrary.map(
    [
      int(0, 0),
      int(1, 99),
      int(100, 100),
      int(101, 999),
      int(1000, 1000),
      int(1001, 500_000),
    ][pick] as Arbitrary.Arbitrary<number>,
    (hundredths) => hundredths / 100
  )
);

/** A program that is JSON, some of which fail when they run. */
const program = Arbitrary.map(
  Arbitrary.all([int(-50, 50), int(-50, 50), int(0, 5)]),
  ([a, b, pick]): unknown =>
    [
      a,
      ["number/add", a, b],
      ["quote", { a, b }],
      ["array/make", a, b],
      ["number/add", a, ["quote", "b"]],
      ["nothing", a],
    ][pick]
);

/** The text of a program, whole or broken so that it may not be JSON. */
const source = Arbitrary.map(
  Arbitrary.all([program, int(0, 3), int(0, 60)]),
  ([made, how, cut]) => {
    const text = JSON.stringify(made);
    return [
      text,
      text.slice(0, cut % (text.length + 1)),
      `${text}]`,
      text.replace('"', "'"),
    ][how] as string;
  }
);

const isJson = (text: string) => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

const TENTHS = /^\d+\.\d ms$/;
const WHOLE = /^\d+ ms$/;

describe("the time an example shows", () => {
  it.prop(
    "is how long its program ran, also when the clock saw no time pass, and nothing for no time",
    { ms: measured },
    ({ ms }) => {
      const label = timeLabel(ms);
      expect(label === "<1 ms").toBe(ms < 1);
      if (ms >= 1) {
        // To a tenth of a millisecond under ten, and to a whole one from ten.
        const [form, within] = ms < 10 ? [TENTHS, 0.05] : [WHOLE, 0.5];
        expect(label).toMatch(form);
        expect(Math.abs(Number.parseFloat(label) - ms)).toBeLessThanOrEqual(
          within + 1e-9
        );
      }
      expect(timeLabel(undefined)).toBe("");
    },
    OPTIONS
  );

  it.effect.prop(
    "is there exactly when the program ran, which it does when its text is JSON",
    { text: source },
    ({ text }) =>
      Effect.gen(function* () {
        const response = yield* Effect.promise(() =>
          evaluateSource({ id: 1, source: text })
        );
        const ran = isJson(text);
        expect(response.ms !== undefined).toBe(ran);
        expect(timeLabel(response.ms) !== "").toBe(ran);
        if (!ran) {
          expect(response).toMatchObject({ ok: false });
        }
      }),
    OPTIONS
  );
});
