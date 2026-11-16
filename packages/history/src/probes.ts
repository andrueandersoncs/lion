/**
 * What Lion does now, as evidence for the research model: each probe in
 * `history/research/probes.json` is a Lion program for one behavior case,
 * written so that its value is the word for what Lion does, such as "fit" or
 * "error". Running the probes saves each program and what it gave as a
 * source, and writes the notes that record them as claims of the publisher
 * "Lion at HEAD". A probe that fails is the behavior "error", quoted by its
 * message.
 *
 * A probe's program is also given the functions of `repo.ts`, so it can say
 * what the repository holds and what a declared command gives: a decision
 * that asserts how the project is set up is checked like one that asserts
 * how Lion evaluates.
 *
 * A probe answers one question, as a claim does. A probe of a behavior
 * names its `case` and gives the word for it. A probe of a feature names the
 * `feature` and gives true when it is there and false when it is not; one
 * that fails, or gives anything else, has answered nothing, and the build
 * reports it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "@lionlang/core/evaluation/evaluate";
import { LogicDatabase } from "@lionlang/core/logic/database";
import { stdlib } from "@lionlang/core/modules";
import { over } from "@lionlang/core/modules/lib/shared";
import { SPECIAL_FORM_NAMES } from "@lionlang/core/schemas/evaluation";
import { Cause, Effect, Exit, Schema } from "effect";
import { readCommands, repositoryFunctions } from "./repo.ts";
import { RESEARCH } from "./research.ts";

/** Who stands behind what a probe shows. */
export const RUNNER = "Lion at HEAD";

/** A probe of a behavior: its program's value is the word for the behavior. */
export interface BehaviorProbe {
  readonly area: string;
  /** The behavior case it answers, as the research's claims name it. */
  readonly case: string;
  readonly program: unknown;
}

/** A probe of a feature: its program gives true when the feature is there. */
export interface FeatureProbe {
  /** The feature it answers for, as the research's claims name it. */
  readonly feature: string;
  /** The feature's kind, as the frame lists them. */
  readonly kind: string;
  readonly program: unknown;
}

export type Probe = BehaviorProbe | FeatureProbe;

const isFeature = (probe: Probe): probe is FeatureProbe => "feature" in probe;

/** What a probe says, in the words of a claim. */
export type Said =
  | { readonly area: string; readonly behavior: string; readonly is: string }
  | {
      readonly feature: string;
      readonly kind: string;
      readonly present: boolean;
    };

/** What a probe gave: the word for its value, and the line that shows it. */
export interface Observation {
  /** The word for the value, or "error" when the program failed. */
  readonly is: string;
  readonly line: string;
  readonly probe: Probe;
  /** What it says, or nothing when a feature's probe gave no true or false. */
  readonly says: Said | undefined;
}

const firstLine = (text: string) => text.split("\n", 1)[0] ?? "";

/** The word a value gives: itself when it is a word, else its JSON. */
const wordOf = (value: unknown) =>
  typeof value === "string" ? value : JSON.stringify(value);

/**
 * What a probe's program can call: the library, the repository's functions,
 * and `["lion/special-form?", name]`, which says whether Lion has a special
 * form of that name, since a special form is not a value a program can ask
 * about.
 */
export const probeEnvironment = (
  repository: string,
  folder: string = RESEARCH
) => ({
  ...stdlib,
  ...repositoryFunctions(repository, readCommands(repository, folder)),
  "lion/special-form?": over([Schema.String], (name) =>
    (SPECIAL_FORM_NAMES as readonly string[]).includes(name)
  ),
});

/** What the probe says, given the value of its program, or that it failed. */
const saidBy = (probe: Probe, is: string, value: unknown): Said | undefined => {
  if (!isFeature(probe)) {
    return { area: probe.area, behavior: probe.case, is };
  }
  return typeof value === "boolean"
    ? { feature: probe.feature, kind: probe.kind, present: value }
    : undefined;
};

/**
 * Runs one probe in a fresh database, with the library alone unless it is
 * given the environment of a repository.
 */
export const observe = (
  probe: Probe,
  environment: Record<string, unknown> = stdlib
): Effect.Effect<Observation> =>
  Effect.suspend(() =>
    run(probe.program as never, environment as never, {
      database: new LogicDatabase(),
    })
  ).pipe(
    Effect.exit,
    Effect.map((exit) => {
      if (Exit.isSuccess(exit)) {
        const is = wordOf(exit.value);
        return {
          is,
          line: `result: ${JSON.stringify(exit.value)}`,
          probe,
          says: saidBy(probe, is, exit.value),
        };
      }
      const error = Cause.squash(exit.cause);
      const message = firstLine(
        error instanceof Error ? error.message : String(error)
      );
      return {
        is: "error",
        line: `error: ${message}`,
        probe,
        says: saidBy(probe, "error", undefined),
      };
    })
  );

/** What a probe answers for, as its source says it. */
const subjectOf = (probe: Probe) =>
  isFeature(probe) ? `the feature ${probe.feature}` : probe.case;

/**
 * A probe's source id: "run-" and its case, or "run-feature-" and its
 * feature, with every character a file name cannot hold written as its code.
 */
export const runId = (probe: Probe) =>
  isFeature(probe)
    ? `run-feature-${probe.feature.replace(
        /[^A-Za-z0-9.-]/g,
        (character) => `_${character.charCodeAt(0).toString(16)}`
      )}`
    : `run-${probe.case}`;

/**
 * Runs every probe, writes `sources/run-<case>.txt` for each, and writes
 * `notes/20-runs.json`. `published` dates the observations, as the research
 * sources date by. Gives the observations, and what is wrong with the
 * probes: a question two probes answer, and a feature's probe that gave no
 * true or false. Such a probe says nothing in the notes.
 */
export const writeObservations = (
  repository: string,
  published: number,
  folder: string = RESEARCH
) =>
  Effect.gen(function* () {
    const listed = JSON.parse(
      readFileSync(join(repository, folder, "probes.json"), "utf8")
    ) as Probe[];
    const problems: string[] = [];
    const ids = new Set<string>();
    const probes = listed.filter((probe) => {
      const fresh = !ids.has(runId(probe));
      if (!fresh) {
        problems.push(
          `probes.json: more than one probe answers for ${subjectOf(probe)}.`
        );
      }
      ids.add(runId(probe));
      return fresh;
    });
    const environment = probeEnvironment(repository, folder);
    const observations = yield* Effect.forEach(probes, (probe) =>
      observe(probe, environment)
    );
    for (const { line, probe, says } of observations) {
      writeFileSync(
        join(repository, folder, "sources", `${runId(probe)}.txt`),
        `A probe of ${subjectOf(probe)}, run on Lion at HEAD.\nprogram: ${JSON.stringify(probe.program)}\n${line}\n`
      );
      if (says === undefined) {
        problems.push(
          `probes.json: the probe of ${subjectOf(probe)} gave neither true nor false (${line}).`
        );
      }
    }
    const said = observations.flatMap(({ line, probe, says }) =>
      says === undefined ? [] : [{ line, probe, says }]
    );
    const notes = {
      claims: said.map(({ line, probe, says }) => ({
        id: `${runId(probe)}-1`,
        quote: line,
        says,
        source: runId(probe),
      })),
      sources: said.map(({ probe }) => ({
        id: runId(probe),
        kind: "primary",
        published,
        publisher: RUNNER,
        title: isFeature(probe)
          ? `What the repository holds now: ${probe.feature}`
          : `What Lion does now: ${probe.case}`,
        url: "",
      })),
    };
    writeFileSync(
      join(repository, folder, "notes", "20-runs.json"),
      `${JSON.stringify(notes, null, 2)}\n`
    );
    return { observations, problems };
  });
