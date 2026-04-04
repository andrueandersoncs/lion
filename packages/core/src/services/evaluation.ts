import { Context, Effect, pipe, Ref } from "effect";
import type { Environment } from "@/schemas/environment";

type EnvironmentRef = Ref.Ref<Environment>;

export class LionEnvironmentService extends Context.Tag(
  "LionEnvironmentService"
)<LionEnvironmentService, EnvironmentRef>() {}

export const makeEnvironmentRef = (
  environment: Environment
): Effect.Effect<EnvironmentRef> => Ref.make<Environment>(environment);

export const getService = <T, U>(context: Context.Tag<T, U>) =>
  pipe(Effect.context<T>(), Effect.map(Context.get(context)));
