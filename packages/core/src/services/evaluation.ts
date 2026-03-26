import { Context, Ref } from "effect";

export class LionEnvironmentService extends Context.Tag(
  "LionEnvironmentService"
)<LionEnvironmentService, Ref.Ref<Record<string, unknown>>>() {}

export const makeEnvironmentRef = (env: Record<string, unknown>) =>
  Ref.make<Record<string, unknown>>(env);
