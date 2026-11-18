import { Context } from "effect";
import type { Environment } from "@/evaluation/environment";

export class LionEnvironmentService extends Context.Service<
  LionEnvironmentService,
  Environment
>()("LionEnvironmentService") {}
