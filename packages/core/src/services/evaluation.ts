import { Context, Effect, pipe, Ref } from "effect";

export class LionEnvironmentService extends Context.Tag(
  "LionEnvironmentService"
)<LionEnvironmentService, Ref.Ref<Record<string, unknown>>>() {}

export const makeEnvironmentRef = (env: Record<string, unknown>) =>
  Ref.make<Record<string, unknown>>(env);

export const getService = <T, U>(context: Context.Tag<T, U>) =>
  pipe(Effect.context<T>(), Effect.map(Context.get(context)));
