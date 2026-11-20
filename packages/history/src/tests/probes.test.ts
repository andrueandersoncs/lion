/**
 * What a probe sees of the repository, checked in real folders built from
 * generated files and commands, against a model that never asks the file
 * system where a path leads: a table says, for each path a probe can ask
 * for, which file of the repository it is, if any.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { stdlib } from "@lionlang/core/modules";
import { Arbitrary, Effect, Schema } from "effect";
import {
  observe,
  type Probe,
  probeEnvironment,
  runId,
  writeObservations,
} from "../probes.ts";
import { type Command, repositoryFunctions } from "../repo.ts";

const int = (minimum: number, maximum: number) =>
  Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum, maximum })));

const pick = <A>(items: readonly A[]) =>
  Arbitrary.map(int(0, items.length - 1), (at) => items[at] as A);

const flag = Arbitrary.map(int(0, 1), (bit) => bit === 1);

/** The files a repository may hold. */
const FILES = ["a.txt", "b.txt", "dir/c.txt", "dir/d.json"] as const;

/** A file beside the repository, which no probe may read. */
const OUTSIDE = "outside.txt";

/**
 * Every path a probe asks for, and the file of the repository it names:
 * nothing for a folder, a path that leads out, and a file never written.
 */
const ASKED: readonly (readonly [path: string, file: string | undefined])[] = [
  ...FILES.map((file) => [file, file] as const),
  ["./a.txt", "a.txt"],
  ["dir/../b.txt", "b.txt"],
  ["dir/./c.txt", "dir/c.txt"],
  ["missing.txt", undefined],
  ["dir", undefined],
  [`../${OUTSIDE}`, undefined],
  [`dir/../../${OUTSIDE}`, undefined],
  ["<absolute>", undefined],
];

/** Text short enough, over few enough letters, that one often holds another. */
const text = (maxLength: number) =>
  Arbitrary.map(
    Arbitrary.array(pick(["a", "b", " ", "\n", '"']), { maxLength }),
    (letters) => letters.join("")
  );

const leaf = Arbitrary.flatMap(int(0, 3), (kind) => {
  if (kind === 0) {
    return int(-9, 9) as Arbitrary.Arbitrary<unknown>;
  }
  if (kind === 1) {
    return text(3) as Arbitrary.Arbitrary<unknown>;
  }
  return pick<unknown>([true, false, null]);
});

/** A JSON value: a leaf, a list of leaves, or a record of either. */
const json: Arbitrary.Arbitrary<unknown> = Arbitrary.flatMap(
  int(0, 2),
  (kind) => {
    if (kind === 0) {
      return leaf;
    }
    const list = Arbitrary.array(leaf, { maxLength: 3 });
    if (kind === 1) {
      return list as Arbitrary.Arbitrary<unknown>;
    }
    return Arbitrary.map(
      Arbitrary.all([leaf, list]),
      ([one, many]): unknown => ({ many, one })
    );
  }
);

/** What a file holds: often JSON, often not. */
const content = Arbitrary.flatMap(flag, (isJson) =>
  isJson
    ? Arbitrary.map(json, (value) => JSON.stringify(value))
    : Arbitrary.map(
        Arbitrary.all([pick(["{", "[1", "a", ""]), text(5)]),
        (parts) => parts.join("")
      )
);

/** The files of a repository: each of `FILES`, written or not. */
const files = Arbitrary.map(
  Arbitrary.all(FILES.map(() => Arbitrary.all([flag, content]))),
  (written) =>
    new Map<string, string>(
      FILES.flatMap((file, at) => {
        const [present, holds] = written[at] as [boolean, string];
        return present ? [[file, holds] as const] : [];
      })
    )
);

const asked = pick(ASKED);

/** A folder with a repository in it, and a file beside the repository. */
const makeRepository = (held: ReadonlyMap<string, string>) => {
  const root = mkdtempSync(join(tmpdir(), "lion-probes-"));
  const repository = join(root, "repo");
  mkdirSync(join(repository, "dir"), { recursive: true });
  writeFileSync(join(root, OUTSIDE), "outside");
  // What no probe lists: git's own files, and installed packages.
  for (const hidden of [".git/HEAD", "dir/node_modules/pkg/index.js"]) {
    mkdirSync(dirname(join(repository, hidden)), { recursive: true });
    writeFileSync(join(repository, hidden), "hidden");
  }
  for (const [file, holds] of held) {
    mkdirSync(dirname(join(repository, file)), { recursive: true });
    writeFileSync(join(repository, file), holds);
  }
  return { repository, root };
};

/** The path as a probe writes it: the table's, or the outside file's own. */
const written = (root: string, path: string) =>
  path === "<absolute>" ? join(root, OUTSIDE) : path;

const within = <A, E>(
  held: ReadonlyMap<string, string>,
  use: (made: { repository: string; root: string }) => Effect.Effect<A, E>
) =>
  Effect.suspend(() => {
    const made = makeRepository(held);
    return use(made).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(made.root, { force: true, recursive: true }))
      )
    );
  });

const probe = (program: unknown): Probe => ({ area: "x", case: "x", program });

/**
 * Every path a probe lists the files at, and the files of `FILES` it names:
 * all under a folder, the file itself, none where nothing is, and no answer
 * for a path that leads out.
 */
const LISTED: readonly (readonly [
  path: string,
  names: ((file: string) => boolean) | undefined,
])[] = [
  [".", () => true],
  ["dir", (file) => file.startsWith("dir/")],
  ["dir/", (file) => file.startsWith("dir/")],
  ["a.txt", (file) => file === "a.txt"],
  ["dir/../b.txt", (file) => file === "b.txt"],
  ["dir/c.txt", (file) => file === "dir/c.txt"],
  ["missing", () => false],
  ["..", undefined],
  ["dir/../..", undefined],
  ["<absolute>", undefined],
];

const wordOf = (value: unknown) =>
  typeof value === "string" ? value : JSON.stringify(value);

/** Says in a word whether the text holds the other, as a probe of a file does. */
const holds = (subject: unknown, needle: string) => [
  "cond",
  [
    ["string/includes", subject, ["quote", needle]],
    ["quote", "yes"],
  ],
  ["else", ["quote", "no"]],
];

describe("a probe of the repository", () => {
  it.effect.prop(
    "reads a file as the same program with the file's text in its place, and fails on a path that names no file of the repository",
    { asked, files, needle: text(2) },
    ({ asked: [path, file], files: held, needle }) =>
      within(held, ({ repository, root }) =>
        Effect.gen(function* () {
          const environment = {
            ...stdlib,
            ...repositoryFunctions(repository),
          };
          const read = ["repo/read", written(root, path)];
          const whole = yield* observe(probe(read), environment);
          const searched = yield* observe(
            probe(holds(read, needle)),
            environment
          );
          const text = file === undefined ? undefined : held.get(file);
          if (text === undefined) {
            expect([whole.is, searched.is]).toEqual(["error", "error"]);
            return;
          }
          const inPlace = yield* observe(probe(holds(["quote", text], needle)));
          expect(whole.is).toBe(text);
          expect(searched.is).toBe(inPlace.is);
          expect(searched.is).toBe(text.includes(needle) ? "yes" : "no");
        })
      ),
    { arbitrary: { runs: 200 } }
  );

  it.effect.prop(
    "reads a JSON file as the value it writes, and fails on a file that is not JSON",
    { asked, files },
    ({ asked: [path, file], files: held }) =>
      within(held, ({ repository, root }) =>
        Effect.gen(function* () {
          const environment = {
            ...stdlib,
            ...repositoryFunctions(repository),
          };
          const found = yield* observe(
            probe(["repo/json", written(root, path)]),
            environment
          );
          const text = file === undefined ? undefined : held.get(file);
          let expected = "error";
          try {
            expected = text === undefined ? "error" : wordOf(JSON.parse(text));
          } catch {
            // Not JSON: the probe fails.
          }
          expect(found.is).toBe(expected);
        })
      ),
    { arbitrary: { runs: 200 } }
  );
});

/** The commands a repository may declare. */
const NAMES = ["say", "fail", "deep"] as const;

interface Declared {
  readonly code: number;
  readonly cwd: string | undefined;
  readonly word: string;
}

const declared: Arbitrary.Arbitrary<Declared> = Arbitrary.map(
  Arbitrary.all([
    int(0, 3),
    pick([undefined, "dir", ".", ".."]),
    pick(["one", "two", ""]),
  ]),
  ([code, cwd, word]) => ({ code, cwd, word })
);

/** Each of `NAMES`, declared or not. */
const commands = Arbitrary.map(
  Arbitrary.all(NAMES.map(() => Arbitrary.all([flag, declared]))),
  (each) =>
    new Map(
      NAMES.flatMap((name, at) => {
        const [present, command] = each[at] as [boolean, Declared];
        return present ? [[name, command] as const] : [];
      })
    )
);

/**
 * The command line of a declared command: it marks that it ran, writes its
 * word and the folder it runs in, and ends with its code.
 */
const commandOf = (root: string, name: string, command: Declared): Command => ({
  command: [
    process.execPath,
    "-e",
    [
      `require("node:fs").appendFileSync(${JSON.stringify(join(root, `ran-${name}`))}, "x");`,
      `process.stdout.write(${JSON.stringify(command.word)} + ":" + require("node:path").basename(process.cwd()));`,
      `process.exit(${command.code});`,
    ].join(""),
  ],
  ...(command.cwd === undefined ? {} : { cwd: command.cwd }),
});

/** What the command gives, by the model: nothing when it may not run. */
const gives = (command: Declared | undefined) => {
  if (command === undefined || command.cwd === "..") {
    return;
  }
  const folder = command.cwd === "dir" ? "dir" : "repo";
  return { exit: command.code, output: `${command.word}:${folder}` };
};

describe("a probe that lists files", () => {
  it.effect.prop(
    "is given every file under the path, in order, none where nothing is, and fails on a path that leads out of the repository",
    { files, listed: pick(LISTED) },
    ({ files: held, listed: [path, names] }) =>
      within(held, ({ repository, root }) =>
        Effect.gen(function* () {
          const found = yield* observe(
            probe(["repo/files", written(root, path)]),
            { ...stdlib, ...repositoryFunctions(repository) }
          );
          expect(found.is).toBe(
            names === undefined
              ? "error"
              : JSON.stringify([...held.keys()].filter(names).sort())
          );
        })
      ),
    { arbitrary: { runs: 200 } }
  );
});

/** Names of special forms Lion has had from the start, and of none. */
const FORMS = ["quote", "lambda", "define", "cond", "rule", "query"];
const NOT_FORMS = ["string/join", "number/add", "zz-none", "Quote", ""];

describe("a probe that asks about a special form", () => {
  it.effect.prop(
    "is told yes for a special form's name, and no for a library function's and for a name of nothing",
    { isForm: flag, at: int(0, 4) },
    ({ at, isForm }) =>
      Effect.gen(function* () {
        const name = (isForm ? FORMS : NOT_FORMS)[at] as string;
        const found = yield* observe(
          probe(["lion/special-form?", ["quote", name]]),
          probeEnvironment(tmpdir())
        );
        expect(found.is).toBe(String(isForm));
      })
  );
});

describe("a probe that runs a command", () => {
  it.effect.prop(
    "is given the exit code and output of a declared command, which runs once, and fails on any other",
    { commands, name: pick(NAMES), times: int(1, 3) },
    ({ commands: named, name, times }) =>
      within(new Map(), ({ repository, root }) =>
        Effect.gen(function* () {
          const environment = {
            ...stdlib,
            ...repositoryFunctions(
              repository,
              Object.fromEntries(
                [...named].map(([each, command]) => [
                  each,
                  commandOf(root, each, command),
                ])
              )
            ),
          };
          const expected = gives(named.get(name));
          for (let time = 0; time < times; time += 1) {
            const found = yield* observe(
              probe(["repo/run", name]),
              environment
            );
            expect(found.is).toBe(
              expected === undefined ? "error" : JSON.stringify(expected)
            );
          }
          const ran = join(root, `ran-${name}`);
          expect(existsSync(ran) ? readFileSync(ran, "utf8") : "").toBe(
            expected === undefined ? "" : "x"
          );
        })
      ),
    { arbitrary: { runs: 60 }, timeout: 300_000 }
  );
});

const FOLDER = "research";

/** The features probes answer for: few, so two probes often share one. */
const FEATURES = ["f/a", "f b", "@s/c"];

/**
 * A feature's probe, and what its program gives by the model: true or
 * false, or nothing when it fails or gives another value.
 */
const featureProbe = Arbitrary.map(
  Arbitrary.all([pick(FEATURES), int(0, 4), pick(FILES)]),
  ([feature, kind, file]) => {
    const programs: readonly (readonly [
      unknown,
      (held: ReadonlyMap<string, string>) => boolean | undefined,
    ])[] = [
      [true, () => true],
      [false, () => false],
      [["quote", "yes"], () => undefined],
      [["repo/read", "missing.txt"], () => undefined],
      [
        ["number/equals?", ["array/length", ["repo/files", file]], 1],
        (held) => held.has(file),
      ],
    ];
    const [program, gives] = programs[kind] as (typeof programs)[number];
    return { feature, gives, program };
  }
);

describe("the observations of a build", () => {
  it.effect.prop(
    "say for each probe what the repository's files and declared commands give",
    {
      command: declared,
      declares: flag,
      features: Arbitrary.array(featureProbe, { maxLength: 5 }),
      files,
      paths: Arbitrary.array(asked, { maxLength: 4 }),
    },
    ({ command, declares, features, files: held, paths }) =>
      within(held, ({ repository, root }) =>
        Effect.gen(function* () {
          const folder = join(repository, FOLDER);
          mkdirSync(join(folder, "sources"), { recursive: true });
          mkdirSync(join(folder, "notes"), { recursive: true });
          if (declares) {
            writeFileSync(
              join(folder, "commands.json"),
              JSON.stringify({ say: commandOf(root, "say", command) })
            );
          }
          const probes: Probe[] = [
            ...paths.map(([path], at) => ({
              area: "x",
              case: `read-${at}`,
              program: ["repo/read", written(root, path)],
            })),
            {
              area: "x",
              case: "said",
              program: ["object/get", ["repo/run", "say"], "output", null],
            },
            ...features.map(({ feature, program }) => ({
              feature,
              kind: "file",
              program,
            })),
          ];
          writeFileSync(join(folder, "probes.json"), JSON.stringify(probes));
          const { problems } = yield* writeObservations(repository, 1, FOLDER);
          const notes = JSON.parse(
            readFileSync(join(folder, "notes", "20-runs.json"), "utf8")
          ) as {
            claims: { says: Record<string, unknown>; source: string }[];
            sources: { id: string }[];
          };
          const ran = declares ? gives(command) : undefined;
          // The first probe of a feature answers for it; a later one is a
          // problem, and so is a first one that gives no true or false.
          const first = features.filter(
            ({ feature }, at) =>
              features.findIndex((other) => other.feature === feature) === at
          );
          const answered = first.flatMap(({ feature, gives: model }) => {
            const present = model(held);
            return present === undefined ? [] : [{ feature, present }];
          });
          expect(notes.claims.map(({ says }) => says)).toEqual([
            ...paths.map(([, file], at) => ({
              area: "x",
              behavior: `read-${at}`,
              is: (file === undefined ? undefined : held.get(file)) ?? "error",
            })),
            {
              area: "x",
              behavior: "said",
              is: ran === undefined ? "error" : ran.output,
            },
            ...answered.map(({ feature, present }) => ({
              feature,
              kind: "file",
              present,
            })),
          ]);
          expect(problems.length).toBe(features.length - answered.length);
          // Each claim has a source of its own, with a text the quote is in.
          const ids = notes.claims.map(({ source }) => source);
          expect(new Set(ids).size).toBe(ids.length);
          expect(notes.sources.map(({ id }) => id)).toEqual(ids);
          for (const { feature } of first) {
            expect(
              existsSync(
                join(
                  folder,
                  "sources",
                  `${runId({ feature, kind: "file", program: true })}.txt`
                )
              )
            ).toBe(true);
          }
        })
      ),
    { arbitrary: { runs: 60 }, timeout: 300_000 }
  );
});
