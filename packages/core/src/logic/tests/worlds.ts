/**
 * Small worlds of facts for property tests of goals: two sets of numbers, a
 * relation between numbers, and relations that rules derive from them. A
 * model reads a world as plain sets.
 */
import { Arbitrary } from "effect";
import { element } from "./programs";

export const DOMAIN = [0, 1, 2, 3, 4, 5];

export const member = element(DOMAIN);

export const subset = Arbitrary.map(
  Arbitrary.array(member, { maxLength: 6 }),
  (items) => [...new Set(items)]
);

export interface World {
  /** Pairs of the `link` relation. */
  readonly links: readonly (readonly [number, number])[];
  readonly p: readonly number[];
  readonly q: readonly number[];
}

export const world: Arbitrary.Arbitrary<World> = Arbitrary.all({
  p: subset,
  q: subset,
  links: Arbitrary.array(Arbitrary.all([member, member]), { maxLength: 5 }),
});

/** A path is a link, or a path and then a link. */
const ONE_LINK = ["rule", ["path", "?a", "?b"], ["link", "?a", "?b"]];
const MORE_LINKS = [
  "rule",
  ["path", "?a", "?c"],
  ["path", "?a", "?b"],
  ["link", "?b", "?c"],
];

/**
 * Declares the world's relations and adds its facts. Rules derive `big`, the
 * members of `p` above 2, and `path`, the pairs joined by one or more links.
 */
export const setup = ({ links, p, q }: World) => [
  ["relation", "p", ["x"]],
  ["relation", "q", ["x"]],
  ["relation", "link", ["from", "to"]],
  ["relation", "big", ["x"]],
  ["relation", "path", ["from", "to"]],
  ["relation", "answer", ["x"]],
  ["fact", ["p", -1], ...p.map((x) => ["p", x])],
  ["fact", ["q", -1], ...q.map((x) => ["q", x])],
  ["fact", ["link", -1, -1], ...links.map(([from, to]) => ["link", from, to])],
  ["rule", ["big", "?x"], ["p", "?x"], ["number/greaterThan", "?x", 2]],
  ONE_LINK,
  MORE_LINKS,
];

/** Binds `?x` to every member of the domain. */
export const everyone = ["in", "?x", ["quote", DOMAIN]];

/** The distinct pairs of `link`, as the database holds them. */
export const linksOf = ({ links }: World) => [
  ...new Map(links.map((pair) => [pair.join(), pair])).values(),
];

/** The members a member reaches by one or more links. */
export const reach = (facts: World, from: number): number[] => {
  const seen = new Set<number>();
  const pending = [from];
  for (let at = pending.pop(); at !== undefined; at = pending.pop()) {
    for (const [source, target] of facts.links) {
      if (source === at && !seen.has(target)) {
        seen.add(target);
        pending.push(target);
      }
    }
  }
  return [...seen].sort((a, b) => a - b);
};

/**
 * How `why` explains `path(from, to)`, as a model: by a shortest chain of
 * links from `from` to `to`, the one that takes the least member at each
 * step. A rule gives a path one link longer in each round of a new
 * database, and of the answers that give a row in its first round, `why`
 * takes the least.
 */
export const chainOf = (
  links: readonly (readonly [number, number])[],
  from: number,
  to: number
): unknown => {
  const steps = new Map<number, number>();
  let ends = links.filter(([source]) => source === from).map(([, end]) => end);
  for (let count = 1; ends.length > 0; count += 1) {
    const fresh = ends.filter((end) => !steps.has(end));
    for (const end of fresh) {
      steps.set(end, count);
    }
    ends = links
      .filter(([source]) => fresh.includes(source))
      .map(([, end]) => end);
  }
  const explain = (end: number): unknown => {
    const count = steps.get(end);
    if (count === 1) {
      return {
        fact: ["path", from, end],
        rule: ONE_LINK,
        because: [{ fact: ["link", from, end], given: true }],
      };
    }
    const via = Math.min(
      ...links
        .filter(
          ([source, target]) =>
            target === end && steps.get(source) === (count ?? 0) - 1
        )
        .map(([source]) => source)
    );
    return {
      fact: ["path", from, end],
      rule: MORE_LINKS,
      because: [explain(via), { fact: ["link", via, end], given: true }],
    };
  };
  return explain(to);
};
