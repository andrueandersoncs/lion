/**
 * Readers of the trees `why` returns, for property tests: every node of a
 * tree however deep, and the unknowns a result holds.
 */

/** What a tree says of one goal: that it holds, or that it is absent. */
export interface Told {
  readonly absent?: unknown;
  readonly assumed?: true;
  /** Premises of a goal that holds, or the ways of one that is absent. */
  readonly because?: readonly (Told | Way)[];
  readonly check?: unknown;
  readonly computed?: true;
  readonly fact?: unknown;
  readonly given?: true;
  readonly matches?: readonly (readonly Told[])[];
  readonly rule?: unknown;
  readonly same?: unknown;
}

/** A way an absent goal could have held, and what stood in it. */
export interface Way {
  readonly because?: readonly Told[];
  readonly but: Told;
  readonly rule?: unknown;
}

const isWay = (item: Told | Way): item is Way => "but" in item;

/** Every way a tree tells of, however deep. */
export const waysOf = (tree: Told | Way): Way[] => {
  const inner = [
    ...(tree.because ?? []),
    ...("matches" in tree ? (tree.matches ?? []).flat() : []),
    ...(isWay(tree) ? [tree.but] : []),
  ].flatMap(waysOf);
  return isWay(tree) ? [tree, ...inner] : inner;
};

/** Every goal a tree tells of, however deep, the tree's own first. */
export const toldIn = (tree: Told | Way): Told[] => {
  const inner = [
    ...(tree.because ?? []),
    ...("matches" in tree ? (tree.matches ?? []).flat() : []),
    ...(isWay(tree) ? [tree.but] : []),
  ].flatMap(toldIn);
  return isWay(tree) ? inner : [tree, ...inner];
};

/**
 * True when a tree says that what it tells could change once an unknown is
 * known. An absent goal says so itself. A goal that holds says so itself,
 * or rests on a goal that does: what stood in the way of an absent goal it
 * rests on is not what it rests on.
 */
export const isAssumed = (tree: Told): boolean =>
  tree.assumed === true ||
  (tree.absent === undefined &&
    [...(tree.because ?? []), ...(tree.matches ?? []).flat()].some((item) =>
      isAssumed(item as Told)
    ));

/** What a tree says of its first goal, without what that rests on. */
const said = ({ absent, check, fact }: Told) => ({ absent, check, fact });

/**
 * A tree without what its goals rest on: the fact that holds, or the absent
 * goal with each way it could have held, the goals that held there, and the
 * goal that did not. A row that several answers give is explained by one of
 * them, and which one depends on the order the facts came in. This much of
 * a tree does not.
 */
export const outlineOf = (tree: Told) => ({
  ...said(tree),
  ways:
    tree.absent === undefined
      ? undefined
      : ((tree.because ?? []) as Way[]).map(({ because, but, rule }) => ({
          because: because?.map(said),
          but: said(but),
          rule,
        })),
});

const isSome = (value: unknown): value is [string, string, unknown] =>
  Array.isArray(value) &&
  value.length === 3 &&
  value[0] === "some" &&
  typeof value[1] === "string" &&
  value[1].startsWith("?");

/** The unknowns in written data, however deep, each by its form's text. */
export const unknownsIn = (
  value: unknown,
  into = new Map<string, [string, string, unknown]>()
) => {
  if (isSome(value)) {
    into.set(JSON.stringify(value), value);
    unknownsIn(value[2], into);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      unknownsIn(item, into);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) {
      unknownsIn(item, into);
    }
  }
  return into;
};

/**
 * Written data with a value in place of each unknown that has one. The
 * unknowns inside an unknown's own form are replaced first, so the form
 * reads as it would once they are known.
 */
export const known = (
  value: unknown,
  values: ReadonlyMap<string, unknown>
): unknown => {
  if (isSome(value)) {
    const key = JSON.stringify(value);
    return values.has(key)
      ? values.get(key)
      : [value[0], value[1], known(value[2], values)];
  }
  return Array.isArray(value)
    ? value.map((item) => known(item, values))
    : value;
};

/**
 * The facts that say what an unknown is: what its form describes, with the
 * value in place of its variable.
 */
export const sayingItIs = (
  [, variable, goal]: [string, string, unknown],
  value: unknown,
  values: ReadonlyMap<string, unknown>
): unknown[] => {
  const calls = (
    Array.isArray(goal) && goal[0] === "and" ? goal.slice(1) : [goal]
  ) as unknown[][];
  return calls.map(([relation, ...args]) => [
    relation,
    ...args.map((arg) => (arg === variable ? value : known(arg, values))),
  ]);
};
