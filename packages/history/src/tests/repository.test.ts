/**
 * The repository's own record, checked against git without Lion: for any of
 * its changes, the release the rules say shipped it is the oldest release
 * whose commit reaches every commit that made the change, by `git rev-list`.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { WORKING_TREE } from "../git.ts";
import { ask, REPOSITORY, readSources } from "../record.ts";

const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: REPOSITORY, encoding: "utf8" }).trim();

const sources = readSources(REPOSITORY);

interface Data {
  readonly commit?: string;
  readonly commits?: readonly (string | { readonly commit: string })[];
}

const commitOf = (prefix: string) => git("rev-parse", `${prefix}^{commit}`);

const madeBy = (path: string, data: Data): string[] => {
  const named = [
    ...(data.commit === undefined ? [] : [data.commit]),
    ...(data.commits ?? []).map((ref) =>
      typeof ref === "string" ? ref : ref.commit
    ),
  ];
  return named.length === 0
    ? [sources.history.added.get(path) ?? WORKING_TREE]
    : named.map(commitOf);
};

const changes = sources.entries
  .filter((entry) => entry.path.startsWith("history/changes/"))
  .flatMap((entry) =>
    (entry.data as Data[]).flatMap((item, index) =>
      "kind" in item
        ? [{ commits: madeBy(entry.path, item), id: `${entry.path}#${index}` }]
        : []
    )
  );

const releases = sources.entries
  .filter((entry) => entry.path.startsWith("history/releases/"))
  // A draft is the next release, being written: not a release yet.
  .filter((entry) => (entry.data as { draft?: boolean }).draft !== true)
  .map((entry) => {
    const [at = WORKING_TREE] = madeBy(entry.path, entry.data as Data);
    const reached = new Set(
      at === WORKING_TREE
        ? [WORKING_TREE, ...git("rev-list", "HEAD").split("\n")]
        : git("rev-list", at).split("\n")
    );
    return { at, path: entry.path, reached };
  });

/** What the rules say shipped each change, asked once. */
const shipped = Effect.runPromise(
  ask(sources, [
    "find",
    ["array/make", "?e", "?r"],
    ["and", ["change", "?e", "?_", "?_"], ["shipped_in", "?e", "?r"]],
  ]) as Effect.Effect<[string, string][], unknown>
);

describe("the repository's record", () => {
  it.effect.prop(
    "ships each change in the oldest release that git says reaches its commits",
    {
      at: Arbitrary.schema(
        Schema.Int.check(
          Schema.isBetween({ minimum: 0, maximum: changes.length - 1 })
        )
      ),
    },
    ({ at }) =>
      Effect.gen(function* () {
        const change = changes[at];
        if (change === undefined) {
          return;
        }
        const covering = releases.filter((r) =>
          change.commits.every((c) => r.reached.has(c))
        );
        const oldest = covering.filter(
          (r) =>
            !covering.some(
              (other) => other.at !== r.at && r.reached.has(other.at)
            )
        );
        const rows = yield* Effect.promise(() => shipped);
        expect(
          rows
            .filter(([e]) => e === change.id)
            .map(([, r]) => r)
            .sort()
        ).toEqual(oldest.map((r) => r.path).sort());
      }),
    { arbitrary: { runs: 200 } }
  );
});
