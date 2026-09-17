import { Context } from "effect";
import type { Environment } from "@/schemas/environment";

export class LionEnvironmentService extends Context.Service<
  LionEnvironmentService,
  Environment
>()("LionEnvironmentService") {}
