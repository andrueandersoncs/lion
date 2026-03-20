import { Context, type Ref } from "effect";

export class LionEnvironmentService extends Context.Tag(
  "LionEnvironmentService"
)<LionEnvironmentService, Ref.Ref<Record<string, unknown>>>() {}
