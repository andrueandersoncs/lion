/**
 * The repository's own record, checked against git without Lion: for any
 * claim people wrote that names the commits that made it, the release the
 * rules say shipped it is the oldest release whose commit reaches every one
 * of those commits, by `git rev-list`.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Effect, Schema } from "effect";
import { WORKING_TREE } from "../git.ts";
import {
  ask,
  claimsOf,
  type Notes,
  REPOSITORY,
  readSources,
} from "../record.ts";

const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: REPOSITORY, encoding: "utf8" }).trim();

const sources = readSources(REPOSITORY);

const commitOf = (prefix: string) => git("rev-parse", `${prefix}^{commit}`);

/** Every claim people wrote that names the commits that made it. */
const claims = sources.entries
  .filter((entry) => entry.path.startsWith("history/notes/"))
  .flatMap((entry) =>
    claimsOf(entry.path, entry.data as Notes).flatMap((claim) =>
      claim.commits === undefined || claim.commits.length === 0
        ? []
        : [
            {
              commits: claim.commits.map((ref) =>
                commitOf(typeof ref === "string" ? ref : ref.commit)
              ),
              id: claim.id,
            },
          ]
    )
  );

const releases = sources.entries
  .filter((entry) => entry.path.startsWith("history/releases/"))
  // A draft is the next release, being written: not a release yet.
  .filter((entry) => (entry.data as { draft?: boolean }).draft !== true)
  .map((entry) => {
    const named = (entry.data as { commit?: string }).commit;
    const at =
      named === undefined
        ? (sources.history.added.get(entry.path) ?? WORKING_TREE)
        : commitOf(named);
    const reached = new Set(
      at === WORKING_TREE
        ? [WORKING_TREE, ...git("rev-list", "HEAD").split("\n")]
        : git("rev-list", at).split("\n")
    );
    return { at, path: entry.path, reached };
  });

/** What the rules say shipped each claim, asked once. */
const shipped = Effect.runPromise(
  ask(sources, [
    "find",
    ["array/make", "?c", "?r"],
    ["and", ["names", "?c", "?_"], ["shipped_in", "?c", "?r"]],
  ]) as Effect.Effect<[string, string][], unknown>
);

describe("the repository's record", () => {
  it.effect.prop(
    "ships each claim in the oldest release that git says reaches its commits",
    {
      at: Arbitrary.schema(
        Schema.Int.check(
          Schema.isBetween({ minimum: 0, maximum: claims.length - 1 })
        )
      ),
    },
    ({ at }) =>
      Effect.gen(function* () {
        const claim = claims[at];
        if (claim === undefined) {
          return;
        }
        const covering = releases.filter((r) =>
          claim.commits.every((c) => r.reached.has(c))
        );
        const oldest = covering.filter(
          (r) =>
            !covering.some(
              (other) => other.at !== r.at && r.reached.has(other.at)
            )
        );
        const rows = yield* Effect.promise(() => shipped);
        // A claim that names several commits answers the query once for each.
        expect(
          [
            ...new Set(rows.filter(([c]) => c === claim.id).map(([, r]) => r)),
          ].sort()
        ).toEqual(oldest.map((r) => r.path).sort());
      }),
    { arbitrary: { runs: 200 } }
  );
});
