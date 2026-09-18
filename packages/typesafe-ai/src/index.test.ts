import { run } from "@lionlang/core/evaluation/evaluate";
import { stdlib } from "@lionlang/core/modules";
import type { Fetch } from "@typesafe-ai/sdk";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { makeTypeSafeBindings } from "./index.ts";

const response = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });

describe("TypeSafe AI Lion bindings", () => {
  it("builds every question type and evaluates them with Jev", async () => {
    const requests: Array<{ body: unknown; method: string; url: string }> = [];
    const fetch: Fetch = (url, init) => {
      requests.push({
        body: init?.body ? JSON.parse(String(init.body)) : null,
        method: init?.method ?? "GET",
        url,
      });

      return Promise.resolve(
        response({
          model: "jev-1.13.0",
          answers: {
            urgent: { type: "noul", noul: 0.92 },
            department: {
              type: "choice",
              choice: "billing",
              probabilities: { billing: 0.85, technical: 0.15 },
              confidence: 0.7,
            },
            frustration: {
              type: "score",
              score: 1.6,
              legend: { "0": "Calm", "1": "Frustrated", "2": "Angry" },
              probabilities: { "0": 0.05, "1": 0.3, "2": 0.65 },
              confidence: 0.78,
            },
          },
          usage: { input_tokens: 312, output_tokens: 48 },
        })
      );
    };
    const environment = {
      ...stdlib,
      ...makeTypeSafeBindings({ apiKey: "test", fetch }),
    };

    const result = await Effect.runPromise(
      run(
        [
          "typesafe/system-one",
          {
            state: "Help! My payouts have been failing for 3 days.",
            questions: {
              urgent: [
                "typesafe/noul",
                "Does this convey urgency?",
                {
                  true: "Explicitly time-sensitive",
                  false: "No urgency expressed",
                },
              ],
              department: [
                "typesafe/choice",
                "Which team should handle this?",
                { billing: "Payments", technical: "Bugs" },
              ],
              frustration: [
                "typesafe/score",
                "How frustrated is the customer?",
                ["quote", ["Calm", "Frustrated", "Angry"]],
              ],
            },
          },
        ],
        environment
      )
    );

    expect(result).toEqual({
      model: "jev-1.13.0",
      answers: {
        urgent: { type: "noul", noul: 0.92 },
        department: {
          type: "choice",
          choice: "billing",
          probabilities: { billing: 0.85, technical: 0.15 },
          confidence: 0.7,
        },
        frustration: {
          type: "score",
          score: 1.6,
          legend: { "0": "Calm", "1": "Frustrated", "2": "Angry" },
          probabilities: { "0": 0.05, "1": 0.3, "2": 0.65 },
          confidence: 0.78,
        },
      },
      usage: { input_tokens: 312, output_tokens: 48 },
    });
    expect(requests).toEqual([
      {
        body: {
          state: "Help! My payouts have been failing for 3 days.",
          questions: {
            urgent: {
              type: "noul",
              instructions: "Does this convey urgency?",
              criteria: {
                true: "Explicitly time-sensitive",
                false: "No urgency expressed",
              },
            },
            department: {
              type: "choice",
              instructions: "Which team should handle this?",
              criteria: { billing: "Payments", technical: "Bugs" },
            },
            frustration: {
              type: "score",
              instructions: "How frustrated is the customer?",
              criteria: ["Calm", "Frustrated", "Angry"],
            },
          },
          model: "jev-latest",
        },
        method: "POST",
        url: "https://api.typesafe.ai/v1/systemone",
      },
    ]);
  });

  it("lists every Jev model available to the account", async () => {
    const fetch: Fetch = () =>
      Promise.resolve(
        response({
          models: [
            {
              name: "jev-latest",
              description: "Latest stable Jev model",
              release_date: "2026-09-15",
            },
          ],
        })
      );
    const environment = makeTypeSafeBindings({ apiKey: "test", fetch });

    const result = await Effect.runPromise(
      run(["typesafe/models"], environment)
    );

    expect(result).toEqual([
      {
        name: "jev-latest",
        description: "Latest stable Jev model",
        release_date: "2026-09-15",
      },
    ]);
  });
});
