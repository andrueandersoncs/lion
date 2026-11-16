/**
 * Generated histories for the record's properties, and a plain TypeScript
 * model of what the rules derive from them.
 *
 * A world is a graph of commits, merges among them, releases at commits, and
 * notes files of claims: some said by their own file, some quoting a commit,
 * some naming the commits that made them, and some in a decision record. The
 * model reads the same world with sets and loops.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Arbitrary, Schema } from "effect";
import { type Commit, publishedOf, WORKING_TREE } from "../git.ts";
import {
  claimsOf,
  formsOf,
  type Notes,
  programOf,
  REPOSITORY,
  type Sources,
} from "../record.ts";

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
/** Headings a release's notes go under: some are sections, one is not. */
export const NOTE_KINDS = ["Breaking", "Added", "Fixed", "Trial notes"];
const NAMES = ["@lionlang/core", "@lionlang/cli", "a skill"];
const VERSIONS = ["0.1.0", "0.2.0", "0.10.0"];

const sentence = Arbitrary.map(
  Arbitrary.array(pick(WORDS), { maxLength: 6, minLength: 1 }),
  (words) => words.join(" ")
);

/**
 * Words a claim says. There are few, so one file often says several things
 * in the same words, and they hold what HTML gives a meaning to.
 */
const SAID_WORDS = [
  "adds lists",
  "drops <old> & keeps <new>",
  "it does what Scheme does",
  'a "quoted" rule',
];

export interface Ref {
  readonly commit: string;
  readonly quote?: string;
}

export interface NoteClaim {
  readonly commits?: readonly Ref[];
  readonly decisions?: readonly string[];
  readonly quote: string;
  readonly says: Readonly<Record<string, unknown>>;
  /** A commit's hash, when the claim quotes the commit. */
  readonly source?: string;
}

export interface NotesFile {
  readonly claims: readonly NoteClaim[];
  /** A decision record has a title and its prose. */
  readonly title?: string;
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
  readonly commits: readonly Commit[];
  readonly notes: Readonly<Record<string, NotesFile>>;
  readonly releases: Readonly<Record<string, ReleaseFile>>;
  readonly tags: readonly { readonly commit: string; readonly name: string }[];
}

interface Options {
  /** Only references that name one commit, and records that exist. */
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
  Arbitrary.array(ref(commits, options), { maxLength: 2, minLength: 1 });

/** A statement of one of the five kinds, with values that make one question meet another. */
const says: Arbitrary.Arbitrary<Record<string, unknown>> = Arbitrary.flatMap(
  int(0, 4),
  (kind): Arbitrary.Arbitrary<Record<string, unknown>> => {
    if (kind === 0) {
      return Arbitrary.map(
        Arbitrary.all([pick(["f0", "f1"]), boolean, boolean]),
        ([feature, present, page]) => ({
          feature,
          kind: page ? "page" : "function",
          present,
        })
      );
    }
    if (kind === 1) {
      return Arbitrary.map(
        Arbitrary.all([
          pick(["c0", "c1"]),
          pick(["v0", "v1"]),
          int(0, 3),
          pick(["library", "docs"]),
        ]),
        ([behavior, is, flag, area]) => ({
          area,
          behavior,
          is,
          ...(flag === 0 ? { breaking: true, was: "v2" } : {}),
          ...(flag === 1 ? { fixes: true } : {}),
        })
      );
    }
    if (kind === 2) {
      return Arbitrary.map(
        Arbitrary.all([pick(["r0", "r1"]), boolean, sentence]),
        ([rule, holds, statement]) => ({
          area: "logic",
          holds,
          rule,
          statement,
        })
      );
    }
    if (kind === 3) {
      return Arbitrary.map(
        Arbitrary.all([pick(["t0", "t1", "t2"]), pick(["a", "b"])]),
        ([decision, chose]) => ({
          area: "logic",
          chose,
          decision,
          over: [chose === "a" ? "b" : "a"],
        })
      );
    }
    return Arbitrary.map(int(0, 9), (after) => ({
      after,
      area: "metrics",
      measured: "m0",
    }));
  }
);

const RECORD_IDS = ["d0", "d1", "d2"];

export const world = (options: Options = { clean: false }) =>
  Arbitrary.flatMap(graph, (commits) => {
    const files = int(-1, commits.length - 1);
    const recordIds = options.clean ? RECORD_IDS : [...RECORD_IDS, "gone"];
    const claim = Arbitrary.map(
      Arbitrary.all([
        pick(SAID_WORDS),
        says,
        option(pick(commits)),
        option(refs(commits, options)),
        option(someOf(recordIds)),
      ]),
      ([quote, statement, quoted, named, follows]): NoteClaim => ({
        quote,
        says: statement,
        ...(quoted === undefined ? {} : { source: quoted.hash }),
        ...(named === undefined ? {} : { commits: named }),
        ...(follows === undefined || follows.length === 0
          ? {}
          : { decisions: follows }),
      })
    );
    const notesFile = Arbitrary.map(
      Arbitrary.array(claim, { maxLength: 4, minLength: 1 }),
      (claims): NotesFile => ({ claims })
    );
    const record = (id: string) =>
      Arbitrary.map(
        Arbitrary.all([
          Arbitrary.array(claim, { maxLength: 3, minLength: 1 }),
          options.clean ? Arbitrary.Constant(true) : boolean,
          pick(["t0", "t1", "t2"]),
          pick(["a", "b"]),
        ]),
        ([claims, decides, topic, chose]): NotesFile => ({
          claims: decides
            ? [
                {
                  quote: `Decision ${id}`,
                  says: {
                    area: "logic",
                    chose,
                    decision: topic,
                    over: [chose === "a" ? "b" : "a"],
                  },
                },
                ...claims,
              ]
            : claims,
          title: `Decision ${id}`,
        })
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
          Arbitrary.array(Arbitrary.all([pick(NOTE_KINDS), sentence]), {
            maxLength: 2,
          })
        ),
        int(0, 4),
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
    return Arbitrary.map(
      Arbitrary.all([
        Arbitrary.array(notesFile, { maxLength: 3 }),
        Arbitrary.all(RECORD_IDS.map((id) => option(record(id)))),
        Arbitrary.array(release, { maxLength: 3 }),
        Arbitrary.array(files, { maxLength: 12, minLength: 12 }),
        Arbitrary.array(
          Arbitrary.all([pick(NAMES), pick(VERSIONS), pick(commits)]),
          { maxLength: 3 }
        ),
      ]),
      ([plain, records, releaseList, addedAt, tagList]): World => {
        const notes: Record<string, NotesFile> = Object.fromEntries([
          ...plain.map((file, at) => [`history/notes/n${at}.json`, file]),
          ...records.flatMap((file, at) =>
            file === undefined
              ? []
              : [[`history/notes/${RECORD_IDS[at]}.json`, file]]
          ),
        ]);
        const releases = Object.fromEntries(
          releaseList.map((data, at) => [`history/releases/r${at}.json`, data])
        );
        const paths = [...Object.keys(notes), ...Object.keys(releases)];
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
        return { added, commits, notes, releases, tags };
      }
    );
  });

const day = "2026-02-01";

const refData = (r: Ref) =>
  r.quote === undefined ? r.commit : { commit: r.commit, quote: r.quote };

/** A notes file as its JSON holds it. */
export const notesData = (file: NotesFile): Notes => ({
  ...(file.title === undefined
    ? {}
    : {
        consequences: "What follows.",
        context: "Why it came up.",
        decision: "What it decides.",
        title: file.title,
      }),
  claims: file.claims.map((c) => ({
    quote: c.quote,
    says: c.says,
    ...(c.source === undefined ? {} : { source: c.source }),
    ...(c.commits === undefined ? {} : { commits: c.commits.map(refData) }),
    ...(c.decisions === undefined ? {} : { decisions: c.decisions }),
  })),
});

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
  return {
    entries: [
      ...Object.entries(w.notes).map(([path, file]) => ({
        data: notesData(file),
        path,
      })),
      ...Object.entries(w.releases).map(([path, data]) => ({ data, path })),
    ].sort((a, b) => (a.path < b.path ? -1 : 1)),
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

const stepForms = (path: string) =>
  formsOf(JSON.parse(readFileSync(join(REPOSITORY, path), "utf8")) as unknown);

/** The research's rules: the skill's core, the frame, its links, and its findings. */
const RESEARCH_RULES = {
  core: stepForms("skills/lion-research/assets/core.json"),
  findings: stepForms("history/research/steps/06-findings.src.json"),
  frame: stepForms("history/research/steps/01-frame.src.json"),
  links: stepForms("history/research/steps/05-links.src.json"),
};

/**
 * The model of a world's development, as `bun run history write` builds it
 * from the steps in order: the research's core and frame, every commit as a
 * source, the record with every claim, the links and findings, and then
 * `expression`.
 */
export const modelProgramOf = (w: World, expression: unknown): unknown => {
  const record = (programOf(sourcesOf(w), null) as unknown[]).slice(1, -1);
  const quoted = (value: unknown) => ["quote", value];
  const sources = w.commits.map((c) => [
    "source",
    ...[
      c.hash,
      `https://example.com/commit/${c.hash}`,
      c.message.split("\n")[0] ?? "",
      "Lion repository",
      "primary",
      publishedOf(c),
    ].map(quoted),
  ]);
  return [
    "begin",
    ...RESEARCH_RULES.core,
    ...RESEARCH_RULES.frame,
    ...(sources.length === 0 ? [] : [["fact", ...sources]]),
    ...record,
    ...RESEARCH_RULES.links,
    ...RESEARCH_RULES.findings,
    expression,
  ];
};

// ------------------------------------------------------------------ the model

const SPACE = /\s+/;

const words = (text: string) =>
  text
    .split(SPACE)
    .filter((word) => word !== "")
    .join(" ");

/** A claim of the world, as the record holds it. */
export interface Claimed {
  readonly follows: readonly string[];
  readonly id: string;
  readonly named: readonly Ref[];
  readonly path: string;
  readonly quote: string;
  readonly says: Readonly<Record<string, unknown>>;
  readonly source: string;
}

/** Every claim of the world, with its id and source filled in as the record fills them. */
export const claimsOfWorld = (w: World): Claimed[] =>
  Object.entries(w.notes).flatMap(([path, file]) =>
    claimsOf(path, notesData(file)).map((c, at) => ({
      follows: c.decisions ?? [],
      id: c.id,
      named: file.claims[at]?.commits ?? [],
      path,
      quote: c.quote,
      says: c.says as Record<string, unknown>,
      source: c.source,
    }))
  );

/**
 * The commit graph of a world as the model reads it: what made each claim,
 * what each release contains, and which release comes before which.
 */
export const graphOf = (w: World) => {
  const all = [...sourcesOf(w).history.commits];
  const byHash = new Map(all.map((c) => [c.hash, c]));
  const resolve = (prefix: string) =>
    all
      .filter((c) => c.hash !== WORKING_TREE && c.hash.startsWith(prefix))
      .map((c) => c.hash);
  const addedCommit = (path: string) => {
    const at = w.added[path] ?? -1;
    return at < 0 ? WORKING_TREE : (w.commits[at]?.hash ?? WORKING_TREE);
  };
  const claims = claimsOfWorld(w);
  const commitHashes = new Set(w.commits.map((c) => c.hash));
  /** What made a claim: the commits it names; else the commit it quotes; else the commit that added its file. */
  const madeBy = (c: Claimed) => {
    if (c.named.length > 0) {
      return new Set(c.named.flatMap((r) => resolve(r.commit)));
    }
    if (commitHashes.has(c.source)) {
      return new Set([c.source]);
    }
    return new Set([addedCommit(c.path)]);
  };
  const releaseNames = (data: ReleaseFile) =>
    data.commit === undefined ? [] : [data.commit];
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
  const releases = Object.entries(w.releases)
    .filter(([, data]) => data.draft !== true)
    .map(([path, data]) => ({ data, path }));
  const at = new Map(
    releases.map((r) => {
      const names = releaseNames(r.data);
      return [
        r.path,
        names.length === 0
          ? [addedCommit(r.path)]
          : names.flatMap((prefix) => resolve(prefix)),
      ];
    })
  );
  const contains = new Map(
    releases.map((r) => [
      r.path,
      new Set((at.get(r.path) ?? []).flatMap((c) => [...ancestors(c)])),
    ])
  );
  const before = (r1: string, r2: string) =>
    (at.get(r1) ?? []).some((c1) =>
      (at.get(r2) ?? []).some(
        (c2) => c1 !== c2 && (contains.get(r2)?.has(c1) ?? false)
      )
    );
  const covers = (r: string, c: Claimed) => {
    const made = [...madeBy(c)];
    return (
      made.length > 0 && made.every((h) => contains.get(r)?.has(h) ?? false)
    );
  };
  const shipped = (c: Claimed) =>
    releases
      .filter((r) => covers(r.path, c))
      .filter(
        (r) =>
          !releases.some((r0) => covers(r0.path, c) && before(r0.path, r.path))
      )
      .map((r) => r.path);
  const head = [...w.commits].sort((a, b) => b.time - a.time)[0];
  /**
   * When a claim was said: when its source commit was made; else, for a
   * claim its file says, when the last commit it names was made, or the
   * commit that added its file, just after the head for the working tree.
   */
  const published = (c: Claimed) => {
    if (commitHashes.has(c.source)) {
      const commit = byHash.get(c.source);
      return commit === undefined ? 0 : publishedOf(commit);
    }
    const named = c.named.flatMap((r) => resolve(r.commit));
    const made = named.length > 0 ? named : [addedCommit(c.path)];
    return Math.max(
      ...made.map((hash) => {
        const commit = byHash.get(hash);
        return hash === WORKING_TREE || commit === undefined
          ? (head === undefined ? 0 : publishedOf(head)) + 1
          : publishedOf(commit);
      })
    );
  };
  const firstTime = (c: Claimed) =>
    Math.min(
      ...[...madeBy(c)].map(
        (h) => byHash.get(h)?.time ?? Number.POSITIVE_INFINITY
      )
    );
  return {
    all,
    at,
    before,
    byHash,
    claims,
    contains,
    covers,
    firstTime,
    madeBy,
    published,
    releases,
    resolve,
    shipped,
  };
};

/** The question a claim answers, and its answer, as the frame's `answer` rules give them. */
export const answerOf = (c: Claimed): [Record<string, unknown>, unknown] => {
  const s = c.says;
  if (typeof s.decision === "string") {
    return [{ decision: s.decision }, s.chose];
  }
  if (typeof s.feature === "string") {
    return [{ feature: s.feature }, s.present];
  }
  if (typeof s.behavior === "string") {
    return [{ behavior: s.behavior }, s.is];
  }
  if (typeof s.rule === "string") {
    return [{ rule: s.rule }, s.holds];
  }
  return [{ measured: s.measured, at: c.source }, s.after];
};

export const keyOf = (c: Claimed) => JSON.stringify(answerOf(c));

/** Text in the order Lion sorts it. */
export const textOrder = (a: string, b: string) =>
  Number(a > b) - Number(a < b);

/** The section an item goes under, as the pages give it. */
export const sectionOf = (
  question: Record<string, unknown>,
  answer: unknown,
  claims: readonly Claimed[]
) => {
  const any = (test: (s: Readonly<Record<string, unknown>>) => boolean) =>
    claims.some((c) => test(c.says));
  const docs = any(
    (s) => s.area === "docs" || s.area === "site" || s.kind === "page"
  );
  if (typeof question.decision === "string") {
    return "Decided";
  }
  if (typeof question.rule === "string") {
    return "Rules";
  }
  if (typeof question.measured === "string") {
    return "Figures";
  }
  if (typeof question.feature === "string") {
    if (docs) {
      return "Documentation";
    }
    return answer === true ? "Added" : "Removed";
  }
  if (any((s) => s.breaking === true)) {
    return "Breaking";
  }
  if (any((s) => s.fixes === true)) {
    return "Fixed";
  }
  return docs ? "Documentation" : "Changed";
};

export const SECTIONS = [
  "Breaking",
  "Added",
  "Removed",
  "Changed",
  "Fixed",
  "Documentation",
  "Decided",
  "Rules",
  "Figures",
];

/** An item: a question with an answer, where it first shipped, and what the pages show of it. */
export interface Item {
  readonly key: string;
  readonly releases: readonly string[];
  readonly section: string;
  readonly time: number;
  readonly words: string;
}

/**
 * Every item of a world: placed under the releases that first shipped a
 * claim giving it, or under "next" when a commit or file made a claim of it
 * that no release has shipped. Its words are those of the latest claim a note says itself, or else the latest claim made
 * by a commit or file.
 */
export const itemsOf = (w: World): Item[] => {
  const g = graphOf(w);
  const groups = new Map<string, Claimed[]>();
  for (const c of g.claims) {
    groups.set(keyOf(c), [...(groups.get(keyOf(c)) ?? []), c]);
  }
  return [...groups].flatMap(([key, claims]) => {
    const made = claims.filter((c) => g.madeBy(c).size > 0);
    if (made.length === 0) {
      return [];
    }
    const shippedIn = made.flatMap((c) => g.shipped(c));
    const first = [...new Set(shippedIn)].filter(
      (r) => !shippedIn.some((r0) => g.before(r0, r))
    );
    const own = made.filter((c) => c.source.startsWith("notes/"));
    const latest = [...(own.length > 0 ? own : made)].sort(
      (a, b) => g.published(a) - g.published(b) || textOrder(a.id, b.id)
    );
    const [question, answer] = answerOf(claims[0] as Claimed);
    return [
      {
        key,
        releases: first.length === 0 ? ["next"] : first,
        section: sectionOf(question, answer, claims),
        time: Math.min(...made.map(g.firstTime)),
        words: (latest.at(-1) as Claimed).quote,
      },
    ];
  });
};

/** The items under one release, as the pages order them in a section. */
export const itemsUnder = (items: readonly Item[], release: string) =>
  items
    .filter((item) => item.releases.includes(release))
    .sort((a, b) => a.time - b.time || textOrder(a.key, b.key));

export interface Derived {
  ambiguous: string[];
  checked: string[];
  misquoted: string[];
  mistagged: string[];
  regressed: string[];
  repeatedVersion: string[];
  sharedCommit: string[];
  shipped: string[];
  silent: string[];
  unaccounted: string[];
  undecidedRecord: string[];
  unknownDecision: string[];
  unreleased: string[];
  unresolved: string[];
  untagged: string[];
}

/**
 * How a decision record's assertion stands. A world runs no probes of Lion,
 * so an assertion is never checked by running it: it is stated while the
 * repository's latest word on its question gives its answer, and replaced
 * once a later word gives another.
 */
export const verdictOf = (g: ReturnType<typeof graphOf>, c: Claimed) => {
  const question = JSON.stringify(answerOf(c)[0]);
  const same = g.claims.filter(
    (d) => JSON.stringify(answerOf(d)[0]) === question
  );
  const last = Math.max(...same.map(g.published));
  return same.some((d) => g.published(d) === last && keyOf(d) === keyOf(c))
    ? "stated"
    : "replaced";
};

/** What the rules derive, each row written as text so rows compare as sets. */
export const model = (w: World): Derived => {
  const g = graphOf(w);
  const records = Object.entries(w.notes)
    .filter(([, file]) => file.title !== undefined)
    .map(([path]) => path.slice("history/notes/".length, -".json".length));
  const shipped = g.claims.flatMap((c) =>
    g.shipped(c).map((r) => `${c.id} ${r}`)
  );
  const unreleased = g.claims
    .filter((c) => g.madeBy(c).size > 0)
    .filter((c) => !g.releases.some((r) => g.covers(r.path, c)))
    .map((c) => c.id);
  const typeOf = (c: Commit) =>
    (
      ((c.message.split("\n")[0] ?? "").split(":")[0] ?? "").split("(")[0] ?? ""
    ).split("!")[0];
  const made = new Set([
    ...g.claims.flatMap((c) => [...g.madeBy(c)]),
    ...[...g.at.values()].flat(),
    ...Object.entries(w.releases)
      .filter(([, data]) => data.draft === true)
      .flatMap(([path, data]) =>
        data.commit === undefined
          ? [
              w.added[path] === undefined || (w.added[path] ?? -1) < 0
                ? WORKING_TREE
                : (w.commits[w.added[path] ?? -1]?.hash ?? WORKING_TREE),
            ]
          : g.resolve(data.commit)
      ),
  ]);
  const unaccounted = g.all
    .filter(
      (c) => ["feat", "fix"].includes(typeOf(c) ?? "") && !made.has(c.hash)
    )
    .map((c) => c.hash);
  const named = [
    ...g.claims.flatMap((c) => c.named.map((r) => ({ id: c.id, r }))),
    ...Object.entries(w.releases).flatMap(([path, data]) =>
      data.commit === undefined
        ? []
        : [{ id: path, r: { commit: data.commit } as Ref }]
    ),
  ];
  const unresolved = named
    .filter(({ r }) => g.resolve(r.commit).length === 0)
    .map(({ id, r }) => `${id} ${r.commit}`);
  const ambiguous = named
    .filter(({ r }) => g.resolve(r.commit).length > 1)
    .map(({ id, r }) => `${id} ${r.commit}`);
  const misquoted = named.flatMap(({ id, r }) =>
    r.quote === undefined
      ? []
      : g
          .resolve(r.commit)
          .filter(
            (h) =>
              !words(g.byHash.get(h)?.message ?? "").includes(
                words(r.quote as string)
              )
          )
          .map((h) => `${id} ${h} ${r.quote}`)
  );
  const unknownDecision = g.claims.flatMap((c) =>
    c.follows.filter((id) => !records.includes(id)).map((id) => `${c.id} ${id}`)
  );
  const undecidedRecord = records.filter(
    (id) =>
      !g.claims.some(
        (c) =>
          c.path === `history/notes/${id}.json` &&
          typeof c.says.decision === "string"
      )
  );
  const ships = g.releases.flatMap((r) =>
    r.data.ships.map((s) => ({ r: r.path, ...s }))
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
          g.before(first.r, second.r) &&
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
      : (g.at.get(s.r) ?? [])
          .filter((c) => c !== tagged)
          .map(() => `${s.r} ${s.name}@${s.version} ${tagged}`);
  });
  const repeatedVersion = versioned.flatMap((s) =>
    versioned
      .filter(
        (o) => o.r !== s.r && o.name === s.name && o.version === s.version
      )
      .map((o) => `${s.name} ${s.version} ${s.r} ${o.r}`)
  );
  const sharedCommit = g.releases.flatMap((r) =>
    g.releases
      .filter((o) => o.path !== r.path)
      .flatMap((o) =>
        (g.at.get(r.path) ?? [])
          .filter((c) => (g.at.get(o.path) ?? []).includes(c))
          .map((c) => `${r.path} ${o.path} ${c}`)
      )
  );
  // A commit says nothing the model records when no claim quotes it and no
  // claim or release was made by it. Each commit is a source under its full
  // hash and its short one, and the short one may stand for several.
  const silent = [
    ...new Set(w.commits.flatMap((c) => [c.hash, c.hash.slice(0, 7)])),
  ].filter(
    (s) =>
      !(
        g.claims.some((c) => c.source === s) ||
        g.all.some((c) => c.hash.startsWith(s) && made.has(c.hash))
      )
  );
  const checked = g.claims
    .filter((c) => w.notes[c.path]?.title !== undefined)
    .map((c) => `${c.id} ${verdictOf(g, c)}`);
  const set = (rows: string[]) => [...new Set(rows)].sort();
  return {
    ambiguous: set(ambiguous),
    checked: set(checked),
    misquoted: set(misquoted),
    mistagged: set(mistagged),
    regressed: set(regressed),
    repeatedVersion: set(repeatedVersion),
    sharedCommit: set(sharedCommit),
    shipped: set(shipped),
    silent: set(silent),
    unaccounted: set(unaccounted),
    undecidedRecord: set(undecidedRecord),
    unknownDecision: set(unknownDecision),
    unreleased: set(unreleased),
    unresolved: set(unresolved),
    untagged: set(untagged),
  };
};

/** The same rows, asked of the model: each query's answers joined into text. */
export const QUESTIONS = {
  checked: [
    "find",
    ["string/concat", "?c", " ", "?v"],
    ["checked", "?c", "?v"],
  ],
  ambiguous: [
    "find",
    ["string/concat", "?e", " ", "?p"],
    ["ambiguous_ref", "?e", "?p", "?_"],
  ],
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
  shipped: [
    "find",
    ["string/concat", "?c", " ", "?r"],
    ["shipped_in", "?c", "?r"],
  ],
  silent: ["find", "?s", ["silent", "?s"]],
  unaccounted: ["find", "?h", ["unaccounted", "?h", "?_"]],
  undecidedRecord: ["find", "?id", ["undecided_record", "?id"]],
  unknownDecision: [
    "find",
    ["string/concat", "?c", " ", "?d"],
    ["unknown_decision", "?c", "?d"],
  ],
  unreleased: ["find", "?c", ["unreleased", "?c"]],
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
