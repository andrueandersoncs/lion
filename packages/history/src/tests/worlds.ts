/**
 * Generated histories for the record's properties, and a plain TypeScript
 * model of what the rules in `history/core.json` derive from them.
 *
 * A world is a graph of commits, merges among them, and the entry files of a
 * record: releases at commits, changes made by commits, and decisions that
 * cite commits, quote their messages, and supersede each other. The model
 * reads the same world with sets and loops.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Arbitrary, Schema } from "effect";
import { type Commit, WORKING_TREE } from "../git.ts";
import { formsOf, REPOSITORY, type Sources } from "../record.ts";

export const RULES = formsOf(
  JSON.parse(
    readFileSync(join(REPOSITORY, "history/core.json"), "utf8")
  ) as unknown
);

export const OUTPUTS = JSON.parse(
  readFileSync(join(REPOSITORY, "history/outputs.json"), "utf8")
) as unknown;

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

const boolean = Arbitrary.schema(Schema.Boolean);

/** A value, or nothing about half the time. */
const option = <A>(item: Arbitrary.Arbitrary<A>) =>
  Arbitrary.flatMap(boolean, (some) =>
    some
      ? Arbitrary.map(item, (value): A | undefined => value)
      : Arbitrary.Constant<A | undefined>(undefined)
  );

const pick = <A>(items: readonly A[]) =>
  Arbitrary.map(int(0, items.length - 1), (at) => items[at] as A);

/** Some of the items, in their order. */
const someOf = <A>(items: readonly A[]) =>
  Arbitrary.map(
    Arbitrary.array(boolean, {
      maxLength: items.length,
      minLength: items.length,
    }),
    (keep) => items.filter((_, at) => keep[at])
  );

/**
 * A commit's hash. Every third one starts with the same seven characters, so
 * a reference that short names several commits and a longer one names one.
 */
export const hashOf = (index: number) => {
  const digest = createHash("sha1").update(`commit ${index}`).digest("hex");
  return index % 3 === 0 ? `aaaaaaa${digest.slice(7)}` : digest;
};

const WORDS = ["lion", "rule", "fact", "query", "schema", "record", "list"];
const SUBJECTS = [
  "feat: add",
  "feat(core): add",
  "fix: mend",
  "fix(site)!: mend",
  "docs: write",
  "chore(release): release",
  "refactor: move",
  "featured work on",
];
export const KINDS = [
  "Breaking",
  "Added",
  "Changed",
  "Fixed",
  "Documentation",
  "Trial notes",
];
const NAMES = ["@lionlang/core", "@lionlang/cli", "a skill"];
const VERSIONS = ["0.1.0", "0.2.0", "0.10.0"];

const sentence = Arbitrary.map(
  Arbitrary.array(pick(WORDS), { maxLength: 6, minLength: 1 }),
  (words) => words.join(" ")
);

export interface Ref {
  readonly commit: string;
  readonly quote?: string;
}

export interface ChangeItem {
  readonly commits?: readonly Ref[];
  readonly decisions?: readonly string[];
  readonly internal?: string;
  readonly kind?: string;
  readonly text?: string;
}

export interface DecisionFile {
  readonly commits?: readonly Ref[];
  readonly id: string;
  readonly supersedes?: readonly string[];
}

export interface ReleaseFile {
  readonly commit?: string;
  /** The next release, being written: not a release yet. */
  readonly draft?: true;
  readonly notes?: readonly { readonly kind: string; readonly text: string }[];
  readonly ships: readonly {
    readonly name: string;
    readonly version?: string;
  }[];
  readonly summary?: string;
}

export interface World {
  /** Each file's commit, as an index into `commits`, or -1 for the working tree. */
  readonly added: Readonly<Record<string, number>>;
  readonly changes: Readonly<Record<string, readonly ChangeItem[]>>;
  readonly commits: readonly Commit[];
  readonly decisions: Readonly<Record<string, DecisionFile>>;
  readonly releases: Readonly<Record<string, ReleaseFile>>;
  readonly tags: readonly { readonly commit: string; readonly name: string }[];
}

interface Options {
  /** Only references that name one commit, and decisions that exist. */
  readonly clean: boolean;
}

/** A commit graph: each commit follows the one before, and some merge an older one. */
const graph = Arbitrary.flatMap(int(1, 9), (count) =>
  Arbitrary.map(
    Arbitrary.all([
      Arbitrary.array(int(-3, 8), { maxLength: count, minLength: count }),
      Arbitrary.array(pick(SUBJECTS), { maxLength: count, minLength: count }),
      Arbitrary.array(sentence, { maxLength: count, minLength: count }),
    ]),
    ([merges, subjects, bodies]): Commit[] =>
      Array.from({ length: count }, (_, index) => {
        // A merge's other parent is an older commit, so the graph has no cycle.
        const other = merges[index] ?? -1;
        const parents =
          index === 0
            ? []
            : [
                hashOf(index - 1),
                ...(other >= 0 && other < index - 1 ? [hashOf(other)] : []),
              ];
        return {
          date: `2026-01-${String(index + 1).padStart(2, "0")}`,
          hash: hashOf(index),
          message: `${subjects[index]} ${bodies[index]}\n\nWhy:  it\n  wraps ${bodies[index]} here`,
          parents,
          time: 1000 + index * 10,
        };
      })
  )
);

const prefixOf = (hash: string, length: number) => hash.slice(0, length);

/** A reference to a commit, sometimes with a quote that may not be in its message. */
const ref = (commits: readonly Commit[], options: Options) =>
  Arbitrary.map(
    Arbitrary.all([
      pick(commits),
      int(options.clean ? 8 : 7, 12),
      int(0, 3),
      sentence,
      options.clean ? Arbitrary.Constant(true) : boolean,
    ]),
    ([commit, length, quoting, other, real]): Ref => {
      const commitRef = real ? prefixOf(commit.hash, length) : "abcdef0";
      const body = commit.message.split("\n\n")[1] ?? "";
      // Quotes that are in the message only once whitespace is read loosely.
      const quotes = [
        undefined,
        commit.message.split("\n")[0],
        body.replace(/\s+/g, " ").trim(),
        other,
      ];
      const quote = quotes[quoting];
      return quote === undefined
        ? { commit: commitRef }
        : { commit: commitRef, quote };
    }
  );

const refs = (commits: readonly Commit[], options: Options) =>
  Arbitrary.array(ref(commits, options), { maxLength: 3 });

const DECISION_IDS = ["d0", "d1", "d2"];

export const world = (options: Options = { clean: false }) =>
  Arbitrary.flatMap(graph, (commits) => {
    const files = int(-1, commits.length - 1);
    const decisionIds = options.clean
      ? DECISION_IDS
      : [...DECISION_IDS, "gone"];
    const change = Arbitrary.map(
      Arbitrary.all([
        pick(KINDS),
        sentence,
        option(refs(commits, options)),
        option(someOf(decisionIds)),
        int(0, 4),
      ]),
      ([kind, text, commitRefs, decisions, form]): ChangeItem =>
        form === 0
          ? { commits: commitRefs ?? [], internal: text }
          : {
              kind,
              text,
              ...(commitRefs === undefined ? {} : { commits: commitRefs }),
              ...(decisions === undefined ? {} : { decisions }),
            }
    );
    const release = Arbitrary.map(
      Arbitrary.all([
        Arbitrary.array(
          Arbitrary.map(
            Arbitrary.all([pick(NAMES), option(pick(VERSIONS))]),
            ([name, version]) =>
              name === "a skill" || version === undefined
                ? { name }
                : { name, version }
          ),
          { maxLength: 2, minLength: 1 }
        ),
        option(pick(commits)),
        option(sentence),
        option(
          Arbitrary.array(Arbitrary.all([pick(KINDS), sentence]), {
            maxLength: 2,
          })
        ),
        Arbitrary.schema(
          Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 4 }))
        ),
      ]),
      ([ships, at, summary, notes, draft]): ReleaseFile => ({
        ...(draft === 0 ? { draft: true as const } : {}),
        ships,
        ...(at === undefined
          ? {}
          : { commit: prefixOf(at.hash, options.clean ? 8 : 7) }),
        ...(summary === undefined ? {} : { summary }),
        ...(notes === undefined || notes.length === 0
          ? {}
          : { notes: notes.map(([kind, text]) => ({ kind, text })) }),
      })
    );
    const decision = (id: string) =>
      Arbitrary.map(
        Arbitrary.all([option(refs(commits, options)), someOf(decisionIds)]),
        ([commitRefs, supersedes]): DecisionFile => ({
          id,
          ...(commitRefs === undefined ? {} : { commits: commitRefs }),
          ...(supersedes.filter((old) => old !== id).length === 0
            ? {}
            : { supersedes: supersedes.filter((old) => old !== id) }),
        })
      );
    return Arbitrary.map(
      Arbitrary.all([
        Arbitrary.array(
          Arbitrary.array(change, { maxLength: 3, minLength: 1 }),
          { maxLength: 3 }
        ),
        Arbitrary.array(release, { maxLength: 3 }),
        Arbitrary.all(DECISION_IDS.map((id) => option(decision(id)))),
        Arbitrary.array(files, { maxLength: 12, minLength: 12 }),
        Arbitrary.array(
          Arbitrary.all([pick(NAMES), pick(VERSIONS), pick(commits)]),
          { maxLength: 3 }
        ),
      ]),
      ([changeLists, releaseList, decisionList, addedAt, tagList]): World => {
        const held = new Set(
          decisionList.flatMap((d) => (d === undefined ? [] : [d.id]))
        );
        const known = (ids: readonly string[]) =>
          options.clean ? ids.filter((id) => held.has(id)) : ids;
        const changes = Object.fromEntries(
          changeLists.map((list, at) => [
            `history/changes/c${at}.json`,
            list.map((item) =>
              item.decisions === undefined
                ? item
                : { ...item, decisions: known(item.decisions) }
            ),
          ])
        );
        const releases = Object.fromEntries(
          releaseList.map((data, at) => [`history/releases/r${at}.json`, data])
        );
        const decisions = Object.fromEntries(
          decisionList.flatMap((data) =>
            data === undefined
              ? []
              : [
                  [
                    `history/decisions/${data.id}.json`,
                    data.supersedes === undefined
                      ? data
                      : { ...data, supersedes: known(data.supersedes) },
                  ],
                ]
          )
        );
        const paths = [
          ...Object.keys(changes),
          ...Object.keys(releases),
          ...Object.keys(decisions),
        ];
        const added = Object.fromEntries(
          paths.map((path, at) => [path, addedAt[at] ?? -1])
        );
        const tags = [
          ...new Map(
            tagList.map(([name, version, commit]) => [
              `${name}@${version}`,
              { commit: commit.hash, name: `${name}@${version}` },
            ])
          ).values(),
        ];
        return { added, changes, commits, decisions, releases, tags };
      }
    );
  });

const day = "2026-02-01";

/** The world as what the record is built from. */
export const sourcesOf = (w: World): Sources => {
  const last = w.commits.at(-1);
  const workingTree: Commit = {
    date: day,
    hash: WORKING_TREE,
    message: "",
    parents: last === undefined ? [] : [last.hash],
    time: 5000,
  };
  const decisionData = (d: DecisionFile) => ({
    alternatives: [{ option: `not ${d.id}`, rejected: "it was not chosen" }],
    consequences: `What follows from ${d.id}.`,
    context: `Why ${d.id} came up.`,
    decision: `What ${d.id} decides.`,
    id: d.id,
    title: `Decision ${d.id}`,
    ...(d.commits === undefined ? {} : { commits: d.commits.map(refData) }),
    ...(d.supersedes === undefined ? {} : { supersedes: d.supersedes }),
  });
  const entries = [
    ...Object.entries(w.changes).map(([path, list]) => ({
      data: list.map((item) => ({
        ...item,
        ...(item.commits === undefined
          ? {}
          : { commits: item.commits.map(refData) }),
      })),
      path,
    })),
    ...Object.entries(w.releases).map(([path, data]) => ({ data, path })),
    ...Object.entries(w.decisions).map(([path, d]) => ({
      data: decisionData(d),
      path,
    })),
  ];
  return {
    entries,
    history: {
      added: new Map(
        Object.entries(w.added).map(([path, at]) => [
          path,
          at < 0 ? WORKING_TREE : (w.commits[at]?.hash ?? WORKING_TREE),
        ])
      ),
      commits: [...w.commits, workingTree],
      tags: w.tags,
    },
    rules: RULES,
  };
};

const refData = (r: Ref) => (r.quote === undefined ? r.commit : r);

// ------------------------------------------------------------------ the model

const SPACE = /\s+/;

const words = (text: string) =>
  text
    .split(SPACE)
    .filter((word) => word !== "")
    .join(" ");

export interface Derived {
  ambiguous: string[];
  backwards: string[];
  inEffectFrom: string[];
  inForce: string[];
  misquoted: string[];
  mistagged: string[];
  regressed: string[];
  repeatedVersion: string[];
  sharedCommit: string[];
  shipped: string[];
  unaccounted: string[];
  unjustified: string[];
  unknownDecision: string[];
  unreleased: string[];
  unresolved: string[];
  untagged: string[];
}

interface Entry {
  readonly data: ChangeItem | DecisionFile | ReleaseFile;
  readonly id: string;
  readonly index: number;
  readonly kind: "change" | "decision" | "internal" | "release";
  readonly path: string;
}

export const entriesOf = (w: World): Entry[] => [
  ...Object.entries(w.changes).flatMap(([path, list]) =>
    list.map((data, index) => ({
      data,
      id: `${path}#${index}`,
      index,
      kind:
        data.internal === undefined
          ? ("change" as const)
          : ("internal" as const),
      path,
    }))
  ),
  ...Object.entries(w.releases).map(([path, data]) => ({
    data,
    id: path,
    index: 0,
    kind: "release" as const,
    path,
  })),
  ...Object.entries(w.decisions).map(([path, data]) => ({
    data,
    id: path,
    index: 0,
    kind: "decision" as const,
    path,
  })),
];

/** What the rules derive, each row written as text so rows compare as sets. */
export const model = (w: World): Derived => {
  const all = [...sourcesOf(w).history.commits];
  const byHash = new Map(all.map((c) => [c.hash, c]));
  const resolve = (prefix: string) =>
    all
      .filter((c) => c.hash !== WORKING_TREE && c.hash.startsWith(prefix))
      .map((c) => c.hash);
  const entries = entriesOf(w);
  const namesOf = (e: Entry): Ref[] => {
    if (e.kind !== "release") {
      return [...((e.data as ChangeItem | DecisionFile).commits ?? [])];
    }
    const { commit } = e.data as ReleaseFile;
    return commit === undefined ? [] : [{ commit }];
  };
  const addedCommit = (path: string) => {
    const at = w.added[path] ?? -1;
    return at < 0 ? WORKING_TREE : (w.commits[at]?.hash ?? WORKING_TREE);
  };
  const madeBy = (e: Entry) => {
    const names = namesOf(e);
    return names.length === 0
      ? new Set([addedCommit(e.path)])
      : new Set(names.flatMap((r) => resolve(r.commit)));
  };
  const ancestors = (hash: string) => {
    const seen = new Set<string>();
    const stack = [hash];
    while (stack.length > 0) {
      const next = stack.pop() as string;
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(...(byHash.get(next)?.parents ?? []));
      }
    }
    return seen;
  };
  const releases = entries.filter(
    (e) => e.kind === "release" && (e.data as ReleaseFile).draft !== true
  );
  const at = new Map(releases.map((r) => [r.id, [...madeBy(r)]]));
  const contains = new Map(
    releases.map((r) => [
      r.id,
      new Set((at.get(r.id) ?? []).flatMap((c) => [...ancestors(c)])),
    ])
  );
  const before = (r1: string, r2: string) =>
    (at.get(r1) ?? []).some((c1) =>
      (at.get(r2) ?? []).some(
        (c2) => c1 !== c2 && (contains.get(r2)?.has(c1) ?? false)
      )
    );
  const covers = (r: string, e: Entry) =>
    e.kind !== "release" &&
    [...madeBy(e)].every((c) => contains.get(r)?.has(c) ?? false);
  const shipped = entries.flatMap((e) =>
    releases
      .filter((r) => covers(r.id, e))
      .filter(
        (r) => !releases.some((r0) => covers(r0.id, e) && before(r0.id, r.id))
      )
      .map((r) => `${e.id} ${r.id}`)
  );
  const changes = entries.filter((e) => e.kind === "change");
  const unreleased = changes
    .filter((e) => !releases.some((r) => covers(r.id, e)))
    .map((e) => e.id);
  const typeOf = (c: Commit) =>
    (
      ((c.message.split("\n")[0] ?? "").split(":")[0] ?? "").split("(")[0] ?? ""
    ).split("!")[0];
  const made = new Set(entries.flatMap((e) => [...madeBy(e)]));
  const unaccounted = all
    .filter(
      (c) => ["feat", "fix"].includes(typeOf(c) ?? "") && !made.has(c.hash)
    )
    .map((c) => c.hash);
  const named = entries.flatMap((e) => namesOf(e).map((r) => ({ e, r })));
  const unresolved = named
    .filter(({ r }) => resolve(r.commit).length === 0)
    .map(({ e, r }) => `${e.id} ${r.commit}`);
  const ambiguous = named
    .filter(({ r }) => resolve(r.commit).length > 1)
    .map(({ e, r }) => `${e.id} ${r.commit}`);
  const misquoted = named.flatMap(({ e, r }) =>
    r.quote === undefined
      ? []
      : resolve(r.commit)
          .filter(
            (h) =>
              !words(byHash.get(h)?.message ?? "").includes(
                words(r.quote as string)
              )
          )
          .map((h) => `${e.id} ${h} ${r.quote}`)
  );
  const decisions = Object.values(w.decisions);
  const decidedIds = new Set(decisions.map((d) => d.id));
  const supersededIds = new Set(decisions.flatMap((d) => d.supersedes ?? []));
  const inForce = decisions
    .map((d) => d.id)
    .filter((id) => !supersededIds.has(id));
  const unknownDecision = [
    ...changes.flatMap((e) =>
      ((e.data as ChangeItem).decisions ?? [])
        .filter((id) => !decidedIds.has(id))
        .map((id) => `${e.id} ${id}`)
    ),
    ...decisions.flatMap((d) =>
      (d.supersedes ?? [])
        .filter((id) => !decidedIds.has(id))
        .map((id) => `history/decisions/${d.id}.json ${id}`)
    ),
  ];
  const ships = releases.flatMap((r) =>
    (r.data as ReleaseFile).ships.map((s) => ({ r: r.id, ...s }))
  );
  const rank = (v: string) =>
    v.split(".").reduce((total, part) => total * 1000 + Number(part), 0);
  const regressed = ships.flatMap((first) =>
    ships
      .filter(
        (second) =>
          first.name === second.name &&
          first.version !== undefined &&
          second.version !== undefined &&
          before(first.r, second.r) &&
          rank(first.version) >= rank(second.version)
      )
      .map((second) => `${first.name} ${first.version} ${second.version}`)
  );
  const tagOf = new Map(w.tags.map((t) => [t.name, t.commit]));
  const versioned = ships.filter((s) => s.version !== undefined);
  const untagged = versioned
    .filter((s) => !tagOf.has(`${s.name}@${s.version}`))
    .map((s) => `${s.r} ${s.name}@${s.version}`);
  const mistagged = versioned.flatMap((s) => {
    const tagged = tagOf.get(`${s.name}@${s.version}`);
    return tagged === undefined
      ? []
      : (at.get(s.r) ?? [])
          .filter((c) => c !== tagged)
          .map(() => `${s.r} ${s.name}@${s.version} ${tagged}`);
  });
  const unjustified = changes
    .filter((e) => {
      const data = e.data as ChangeItem;
      return data.kind === "Breaking" && (data.decisions ?? []).length === 0;
    })
    .map((e) => e.id);
  const repeatedVersion = versioned.flatMap((s) =>
    versioned
      .filter(
        (o) => o.r !== s.r && o.name === s.name && o.version === s.version
      )
      .map((o) => `${s.name} ${s.version} ${s.r} ${o.r}`)
  );
  const sharedCommit = releases.flatMap((r) =>
    releases
      .filter((o) => o.id !== r.id)
      .flatMap((o) =>
        (at.get(r.id) ?? [])
          .filter((c) => (at.get(o.id) ?? []).includes(c))
          .map((c) => `${r.id} ${o.id} ${c}`)
      )
  );
  const firstTime = (e: Entry) =>
    Math.min(
      ...[...madeBy(e)].map(
        (h) => byHash.get(h)?.time ?? Number.POSITIVE_INFINITY
      )
    );
  const decisionEntries = new Map(
    entries
      .filter((e) => e.kind === "decision")
      .map((e) => [(e.data as DecisionFile).id, e])
  );
  const backwards = decisions.flatMap((d) =>
    (d.supersedes ?? []).flatMap((old) => {
      const newer = decisionEntries.get(d.id);
      const older = decisionEntries.get(old);
      return newer !== undefined &&
        older !== undefined &&
        madeBy(newer).size > 0 &&
        madeBy(older).size > 0 &&
        firstTime(newer) < firstTime(older)
        ? [`${d.id} ${old}`]
        : [];
    })
  );
  const inEffectFrom = [...decisionEntries].flatMap(([id, e]) => {
    const first = firstTime(e);
    return [...madeBy(e)]
      .filter((h) => byHash.get(h)?.time === first)
      .flatMap((h) =>
        releases
          .filter((r) => contains.get(r.id)?.has(h) ?? false)
          .filter(
            (r) =>
              !releases.some(
                (r0) =>
                  (contains.get(r0.id)?.has(h) ?? false) && before(r0.id, r.id)
              )
          )
          .map((r) => `${id} ${r.id}`)
      );
  });
  const set = (rows: string[]) => [...new Set(rows)].sort();
  return {
    ambiguous: set(ambiguous),
    inEffectFrom: set(inEffectFrom),
    backwards: set(backwards),
    repeatedVersion: set(repeatedVersion),
    sharedCommit: set(sharedCommit),
    unjustified: set(unjustified),
    inForce: set(inForce),
    misquoted: set(misquoted),
    mistagged: set(mistagged),
    regressed: set(regressed),
    shipped: set(shipped),
    unaccounted: set(unaccounted),
    unknownDecision: set(unknownDecision),
    unreleased: set(unreleased),
    unresolved: set(unresolved),
    untagged: set(untagged),
  };
};

/** The same rows, asked of the record: each query's answers joined into text. */
export const QUESTIONS = {
  ambiguous: [
    "find",
    ["string/concat", "?e", " ", "?p"],
    ["ambiguous_ref", "?e", "?p", "?_"],
  ],
  backwards: [
    "find",
    ["string/concat", "?d", " ", "?old"],
    ["backwards", "?d", "?old"],
  ],
  repeatedVersion: [
    "find",
    ["string/concat", "?n", " ", "?v", " ", "?r", " ", "?o"],
    ["repeated_version", "?n", "?v", "?r", "?o"],
  ],
  sharedCommit: [
    "find",
    ["string/concat", "?r", " ", "?o", " ", "?h"],
    ["shared_commit", "?r", "?o", "?h"],
  ],
  unjustified: ["find", "?e", ["unjustified", "?e", "?_"]],
  inEffectFrom: [
    "find",
    ["string/concat", "?d", " ", "?r"],
    ["in_effect_from", "?d", "?r"],
  ],
  inForce: ["find", "?id", ["standing", "?id"]],
  misquoted: [
    "find",
    ["string/concat", "?e", " ", "?h", " ", "?q"],
    ["misquoted_ref", "?e", "?h", "?q"],
  ],
  mistagged: [
    "find",
    ["string/concat", "?r", " ", "?t", " ", "?h"],
    ["mistagged", "?r", "?t", "?h"],
  ],
  regressed: [
    "find",
    ["string/concat", "?n", " ", "?a", " ", "?b"],
    ["regressed", "?n", "?a", "?b"],
  ],
  shipped: [
    "find",
    ["string/concat", "?e", " ", "?r"],
    ["shipped_in", "?e", "?r"],
  ],
  unaccounted: ["find", "?h", ["unaccounted", "?h", "?_"]],
  unknownDecision: [
    "find",
    ["string/concat", "?e", " ", "?d"],
    ["unknown_decision", "?e", "?d"],
  ],
  unreleased: ["find", "?e", ["unreleased", "?e"]],
  unresolved: [
    "find",
    ["string/concat", "?e", " ", "?p"],
    ["unresolved", "?e", "?p"],
  ],
  untagged: [
    "find",
    ["string/concat", "?r", " ", "?t"],
    ["untagged", "?r", "?t"],
  ],
};
