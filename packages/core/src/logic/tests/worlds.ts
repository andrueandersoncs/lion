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
  ["rule", ["path", "?a", "?b"], ["link", "?a", "?b"]],
  ["rule", ["path", "?a", "?c"], ["path", "?a", "?b"], ["link", "?b", "?c"]],
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
