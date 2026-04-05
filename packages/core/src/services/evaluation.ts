import { Context, Effect, pipe } from "effect";
import type { Environment } from "@/schemas/environment";

export class LionEnvironmentService extends Context.Tag(
  "LionEnvironmentService"
)<LionEnvironmentService, Environment>() {}

export const getService = <T, U>(context: Context.Tag<T, U>) =>
  pipe(Effect.context<T>(), Effect.map(Context.get(context)));
