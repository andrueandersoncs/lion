import fs from "node:fs";
import { createFireworks } from "@ai-sdk/fireworks";
import { run } from "@lion/core/evaluation/evaluate";
import { stdlib } from "@lion/core/modules";
// biome-ignore lint/performance/noNamespaceImport: Intentionally importing everything to passthrough to Lion
import * as OpenTUI from "@opentui/core";
// biome-ignore lint/performance/noNamespaceImport: Pass through to Lion
import * as AI from "ai";
import { Effect } from "effect";
import { z } from "zod";
import agent from "./agent.json";

const fireworks = createFireworks({
  apiKey: process.env.FIREWORKS_API_KEY,
});

const model = fireworks("accounts/fireworks/routers/kimi-k2p5-turbo");

const renderer = await OpenTUI.createCliRenderer({ exitOnCtrlC: true });

const node = Effect.runSync(
  run(agent, {
    ...stdlib,
    renderer,
    OpenTUI,
    model,
    AI,
    Zod: z,
    fs,
  })
);

renderer.root.add(node);

renderer.console.toggle();
