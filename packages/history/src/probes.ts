/**
 * What Lion does now, as evidence for the research model: each probe in
 * `history/research/probes.json` is a Lion program for one behavior case,
 * written so that its value is the word for what Lion does, such as "fit" or
 * "error". Running the probes saves each program and what it gave as a
 * source, and writes the notes that record them as claims of the publisher
 * "Lion at HEAD". A probe that fails is the behavior "error", quoted by its
 * message.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "@lionlang/core/evaluation/evaluate";
import { LogicDatabase } from "@lionlang/core/logic/database";
import { stdlib } from "@lionlang/core/modules";
import { Cause, Effect, Exit } from "effect";
import { RESEARCH } from "./research.ts";

/** Who stands behind what a probe shows. */
export const RUNNER = "Lion at HEAD";

export interface Probe {
  readonly area: string;
  /** The behavior case it answers, as the research's claims name it. */
  readonly case: string;
  /** A Lion program whose value is the word for the behavior. */
  readonly program: unknown;
}

/** What a probe gave: the word for the behavior, and the line that shows it. */
export interface Observation {
  readonly is: string;
  readonly line: string;
  readonly probe: Probe;
}

const firstLine = (text: string) => text.split("\n", 1)[0] ?? "";

/** The word a value gives: itself when it is a word, else its JSON. */
const wordOf = (value: unknown) =>
  typeof value === "string" ? value : JSON.stringify(value);

/** Runs one probe in a fresh environment and database. */
export const observe = (probe: Probe): Effect.Effect<Observation> =>
  Effect.suspend(() =>
    run(probe.program as never, stdlib, { database: new LogicDatabase() })
  ).pipe(
    Effect.exit,
    Effect.map((exit) => {
      if (Exit.isSuccess(exit)) {
        const is = wordOf(exit.value);
        return { is, line: `result: ${JSON.stringify(exit.value)}`, probe };
      }
      const error = Cause.squash(exit.cause);
      const message = firstLine(
        error instanceof Error ? error.message : String(error)
      );
      return { is: "error", line: `error: ${message}`, probe };
    })
  );

/** A probe's source id: "run-" and its case. */
export const runId = (probe: Probe) => `run-${probe.case}`;

/**
 * Runs every probe, writes `sources/run-<case>.txt` for each, and writes
 * `notes/20-runs.json`. `published` dates the observations, as the research
 * sources date by.
 */
export const writeObservations = (
  repository: string,
  published: number,
  folder: string = RESEARCH
) =>
  Effect.gen(function* () {
    const probes = JSON.parse(
      readFileSync(join(repository, folder, "probes.json"), "utf8")
    ) as Probe[];
    const observations = yield* Effect.forEach(probes, observe);
    for (const { line, probe } of observations) {
      writeFileSync(
        join(repository, folder, "sources", `${runId(probe)}.txt`),
        `A probe of ${probe.case}, run on Lion at HEAD.\nprogram: ${JSON.stringify(probe.program)}\n${line}\n`
      );
    }
    const notes = {
      claims: observations.map(({ is, line, probe }) => ({
        id: `${runId(probe)}-1`,
        quote: line,
        says: { area: probe.area, behavior: probe.case, is },
        source: runId(probe),
      })),
      sources: observations.map(({ probe }) => ({
        id: runId(probe),
        kind: "primary",
        published,
        publisher: RUNNER,
        title: `What Lion does now: ${probe.case}`,
        url: "",
      })),
    };
    writeFileSync(
      join(repository, folder, "notes", "20-runs.json"),
      `${JSON.stringify(notes, null, 2)}\n`
    );
    return observations;
  });
