import { describe, expect, it } from "@effect/vitest";
import { Arbitrary, Schema } from "effect";
import {
  agentsCauseQuestion,
  agentsQuestion,
  capabilityQuestion,
  fasterIn,
  line,
  mutationQuestion,
  mutationRunsQuestion,
  observationsOf,
  QUESTIONS,
  readAgents,
  readBench,
  readCapability,
  readMeasure,
  readMutate,
  readPairs,
  readRemoved,
  readScale,
  readTurbo,
} from "../loop.ts";
import { between, element, word } from "./generators.ts";

const boolean = Arbitrary.schema(Schema.Boolean);

/** A number as the measuring tools write it, in groups of three digits. */
const grouped = (n: number) => n.toLocaleString("en-US");

describe("the loop's scoreboard", () => {
  it.prop(
    "reads the numbers bun run measure prints, and counts the exceptions it does not document",
    {
      code: between(0, 2_000_000),
      exceptions: between(0, 400),
      messages: between(0, 5000),
      undocumented: between(0, 5),
    },
    ({ code, exceptions, messages, undocumented }) => {
      const text = [
        "Code: packages/core/src, without tests",
        "                                 now",
        `  code lines                  ${grouped(code)}`,
        "  functions                    2,582",
        "Semantics",
        `  messages                       ${grouped(messages)}`,
        `  grid: cells like plain code  ${grouped(code + 1)}`,
        `  grid: exceptions                 ${grouped(exceptions)}`,
        ...Array.from(
          { length: undocumented },
          (_, at) => `  x${at} × y: different, NOT DOCUMENTED: it differs`
        ),
      ].join("\n");
      expect(readMeasure(text)).toEqual({
        codeLines: code,
        gridExceptions: exceptions,
        messages,
        undocumented,
      });
    }
  );

  it.prop(
    "counts the workloads of bun run scale that grow past the limit or were stopped",
    {
      rows: Arbitrary.array(
        Arbitrary.all({
          name: word,
          power: between(0, 25),
          stopped: Arbitrary.map(between(0, 9), (n) => n === 0),
        }),
        { maxLength: 8 }
      ),
    },
    ({ rows }) => {
      const text = [
        "workload   n = 1,000  n = 10,000  n = 100,000  grows    peak    kept",
        ...rows.map(({ name, power, stopped }) =>
          stopped
            ? `${name}: n facts   10 ms   over 60 s   stops   0 MB   1 MB`
            : `${name}: n facts   10 ms   38 ms   1.6 s  n^${(power / 10).toFixed(1)}  161 MB   18 MB`
        ),
        "grows: the power of n the time follows. n^1.0 grows as the facts do, and n^2.0 as their square.",
      ].join("\n");
      expect(readScale(text)).toBe(
        rows.filter(({ power, stopped }) => stopped || power / 10 > 1.15).length
      );
    }
  );

  it.prop(
    "adds up the times bun run bench prints, in milliseconds",
    {
      times: Arbitrary.array(
        Arbitrary.all({ seconds: boolean, tenths: between(1, 50_000) }),
        { maxLength: 8 }
      ),
    },
    ({ times }) => {
      const text = [
        "benchmark   now",
        ...times.map(({ seconds, tenths }, at) =>
          seconds
            ? `program ${at}   ${(tenths / 10).toFixed(1)} s`
            : `program ${at}   ${(tenths / 10).toFixed(1)} ms`
        ),
      ].join("\n");
      const total = times.reduce(
        (sum, { seconds, tenths }) =>
          sum + (tenths / 10) * (seconds ? 1000 : 1),
        0
      );
      expect(readBench(text)).toBeCloseTo(total, 1);
    }
  );

  it.prop(
    "reads the failed tasks of a turbo run, colored or not",
    { colored: boolean, failed: between(0, 9), more: between(0, 9) },
    ({ colored, failed, more }) => {
      const total = failed + more;
      const esc = String.fromCharCode(27);
      const paint = (text: string) =>
        colored ? `${esc}[1m${text}${esc}[0m` : text;
      const text = ` ${paint("Tasks:")}    ${more} successful, ${total} total`;
      expect(readTurbo(text)).toBe(failed);
    }
  );

  it.prop(
    "adds up the lines git diff --numstat says were removed",
    {
      files: Arbitrary.array(
        Arbitrary.all({ added: between(0, 999), removed: between(0, 999) }),
        { maxLength: 6 }
      ),
    },
    ({ files }) => {
      const text = files
        .map(({ added, removed }, at) => `${added}\t${removed}\tfile${at}.ts`)
        .join("\n");
      expect(readRemoved(text)).toBe(
        files.reduce((sum, { removed }) => sum + removed, 0)
      );
    }
  );

  it.prop(
    "reads each suite's passed tasks by pillar and in all, whatever bun prints around the JSON",
    {
      passed: Arbitrary.array(between(0, 40), { maxLength: 3, minLength: 3 }),
    },
    ({ passed }) => {
      const pillars = ["computation", "logic", "proofs"];
      const json = JSON.stringify({
        public: {
          gaps: {},
          scores: pillars.map((pillar, at) => ({
            passed: passed[at],
            pillar,
            total: 50,
          })),
          verdicts: {},
        },
      });
      const [computation, logic, proofs] = passed as [number, number, number];
      const printed = `$ bun run capability --json\n${json}\n$ bun run --cwd packages/metrics capability --json\n`;
      expect(readCapability(printed)).toEqual({
        public: {
          all: computation + logic + proofs,
          computation,
          logic,
          proofs,
        },
      });
    }
  );

  it.prop(
    "reads each mutation's verdict",
    {
      verdicts: Arbitrary.array(
        Arbitrary.all({
          name: word,
          verdict: element(["CAUGHT", "MISSED", "STALE"]),
        }),
        { maxLength: 5 }
      ),
    },
    ({ verdicts }) => {
      const text = verdicts
        .map(({ name, verdict }, at) => `${verdict.padEnd(6)}  ${name} ${at}`)
        .join("\n");
      expect([...readMutate(text).entries()]).toEqual(
        verdicts.map(({ name, verdict }, at) => [
          `${name} ${at}`,
          verdict.toLowerCase(),
        ])
      );
    }
  );

  it.prop(
    "names the scale workloads past the limit, or stopped, as many as it counts, and no other",
    {
      rows: Arbitrary.array(
        Arbitrary.all({
          name: word,
          power: between(0, 30),
          stops: Arbitrary.schema(Schema.Boolean),
        }),
        { maxLength: 6 }
      ),
    },
    ({ rows }) => {
      const text = rows
        .map(({ name, power, stops }, at) =>
          stops
            ? `load: ${name} ${at}    12 ms    stops at 1.2 s`
            : `load: ${name} ${at}    12 ms    40 ms    n^${(power / 10).toFixed(1)}   9 MB`
        )
        .join("\n");
      const named = fasterIn(text);
      expect(named.length).toBe(readScale(text));
      expect(named).toStrictEqual(
        rows.flatMap(({ name, power, stops }, at) =>
          stops || power / 10 > 1.15 ? [`load: ${name} ${at}`] : []
        )
      );
    }
  );

  it.prop(
    "reads how many pair cells surprise from what bun run pairs printed, and nothing when it printed no count",
    {
      count: between(-1, 120_000),
      lines: Arbitrary.array(word, { maxLength: 4 }),
    },
    ({ count, lines }) => {
      const printed = [
        "Pairs of the grid's rows: 6561, in 118098 cells",
        ...lines,
        ...(count < 0 ? [] : [`surprising pairs, grid: ${count}`]),
        ...lines,
      ].join("\n");
      expect(readPairs(printed)).toBe(count < 0 ? undefined : count);
    }
  );

  it.prop(
    "reads what each agents' run spent and how its tries went, whatever bun prints around the JSON, and nothing of a suite no agents ran",
    {
      runs: Arbitrary.array(
        Arbitrary.all({
          causes: Arbitrary.array(
            Arbitrary.all({ cause: word, tries: between(1, 40) }),
            { maxLength: 3 }
          ),
          cents: between(0, 2500),
          firstRan: between(0, 55),
          suite: word,
        }),
        { maxLength: 3 }
      ),
    },
    ({ runs }) => {
      const suites = Object.fromEntries([
        ["public", { scores: [] }],
        ...runs.map((run) => [
          `${run.suite} by sonnet agents`,
          {
            agents: {
              causes: run.causes.map((c) => ({ ...c, tasks: 1 })),
              costUsd: run.cents / 100,
              firstRan: run.firstRan,
              folder: "out",
            },
            scores: [],
          },
        ]),
      ]);
      const printed = `$ bun run capability --agents --json\nt1: first try ran\n${JSON.stringify(suites, null, 2)}\n$ done`;
      expect(readAgents(printed)).toStrictEqual(
        Object.fromEntries(
          runs.map((run) => [
            `${run.suite} by sonnet agents`,
            {
              causes: run.causes.map(({ cause, tries }) => ({ cause, tries })),
              costUsd: run.cents / 100,
              firstRan: run.firstRan,
            },
          ])
        )
      );
    }
  );

  it.prop(
    "records every line it printed as an observation that quotes it, and only scores try the direction",
    {
      tries: boolean,
      values: Arbitrary.array(
        Arbitrary.all({
          at: between(0, Object.keys(QUESTIONS).length + 5),
          value: Arbitrary.map(between(0, 9999), (n) => n / 10),
        }),
        { maxLength: 6 }
      ),
    },
    ({ tries, values }) => {
      const questions = [
        ...Object.values(QUESTIONS),
        capabilityQuestion("public", "logic"),
        mutationQuestion("a rule breaks"),
        mutationRunsQuestion("a rule breaks", 6),
        agentsQuestion("public by sonnet agents", "cost usd"),
        agentsQuestion("public by sonnet agents", "first tries that ran"),
        agentsCauseQuestion("public by sonnet agents", "unbound-name"),
      ];
      const printed = values.map(({ at, value }) => ({
        measured: questions[at] as (typeof questions)[number],
        value,
      }));
      const text = [
        `ran measure: bun run measure, exit 0, ${values.length} s`,
        ...printed.map(({ measured, value }) => line(measured, value)),
      ].join("\n");
      const observations = observationsOf(text, "v1", tries ? "d" : undefined);
      expect(observations.map((o) => [o.question, o.value])).toEqual([
        [{ observation: "v1", "seconds of check": "measure" }, values.length],
        ...printed.map(({ measured, value }) => [measured.question, value]),
      ]);
      for (const o of observations) {
        expect(text.includes(o.quote)).toBe(true);
        const score =
          "capability passed" in o.question ||
          "agents' first tries that ran" in o.question ||
          [
            QUESTIONS.codePerTask,
            QUESTIONS.messagesPerTask,
            QUESTIONS.grid,
            QUESTIONS.untested,
            QUESTIONS.missed,
            QUESTIONS.picked,
            QUESTIONS.benchTotal,
            QUESTIONS.surprising,
            QUESTIONS.flaky,
          ].some((q) => q.question === o.question);
        expect(o.tries).toBe(tries && score ? "d" : undefined);
      }
    }
  );
});
