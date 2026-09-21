#!/usr/bin/env node

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { program } from "./index.ts";

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
