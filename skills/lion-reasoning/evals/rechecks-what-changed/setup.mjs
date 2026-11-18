// The case's setup, which `bun run skill-eval` calls: it starts the eval
// service, lays out each run's project, makes the changes between the two
// sessions, and leaves the service's record of each run's evals beside the
// run's transcripts.
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import {
  capsOf,
  changeProject,
  scoreOf,
  WORLD,
  writeProject,
} from "./world.mjs";

/** How long an eval takes, so that re-running every prompt costs time as well as budget. */
const EVAL_MS = 8000;
const CAPS = capsOf(WORLD);

/** Each run's key, with the session it is in and the evals it ran. */
const runs = new Map();
let service;

/** Starts the eval service, shared by every run of one invocation. */
export const start = async () => {
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", async () => {
      const send = (status, value) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(value));
      };
      if (request.url !== "/eval" || request.method !== "POST") {
        return send(404, { error: "not found" });
      }
      const run = runs.get(
        (request.headers.authorization ?? "").replace("Bearer ", "")
      );
      if (run === undefined) {
        return send(401, { error: "unknown key" });
      }
      let asked;
      try {
        asked = JSON.parse(body);
      } catch {
        return send(400, { error: "the body must be JSON" });
      }
      const ran = run.evals.filter(
        (e) => e.session === run.session && !e.refused
      ).length;
      if (ran >= CAPS[run.session]) {
        run.evals.push({
          prompt: asked.prompt,
          refused: true,
          session: run.session,
        });
        return send(429, {
          error: `The eval budget for this session is used up (${CAPS[run.session]} runs).`,
        });
      }
      const score = scoreOf(String(asked.text ?? ""));
      run.evals.push({ prompt: asked.prompt, score, session: run.session });
      await new Promise((resolve) => setTimeout(resolve, EVAL_MS));
      send(200, { cases: 200, score });
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  service = `http://127.0.0.1:${server.address().port}`;
  return { stop: () => server.close() };
};

const runOf = (work) => [...runs.values()].find((run) => run.work === work);

/** Lays out a run's project, with a key of its own for the service. */
export const prepare = (work) => {
  const key = randomUUID();
  runs.set(key, { evals: [], session: 1, work });
  writeProject(WORLD, join(work, "project"), { key, service });
};

/** After the first session: the changes it is not told about. */
export const between = (work, finished) => {
  changeProject(WORLD, join(work, "project"));
  runOf(work).session = finished + 1;
};

/** Leaves the run's evals beside its transcripts, where its agent cannot read them. */
export const finish = (work, logs) => {
  const run = runOf(work);
  writeFileSync(
    join(logs, "evals.json"),
    `${JSON.stringify(run?.evals ?? [], null, 2)}\n`
  );
  for (const [key, each] of runs) {
    if (each === run) {
      runs.delete(key);
    }
  }
};
