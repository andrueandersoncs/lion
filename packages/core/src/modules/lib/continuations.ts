/**
 * Delimited continuations, as Racket's `reset` and `shift` make them, but
 * resumed once each. `func/reset` runs a thunk in a fiber of its own: the
 * delimited part. `func/shift`, inside it, stops that fiber where it stands
 * and gives the reset what its handler gives, the handler called with the
 * continuation `k`: the rest of the thunk from the shift up to the reset.
 * Calling `k` with a value resumes the fiber there, as the value of the
 * shift, and gives what the rest gives, up to the reset or to the next
 * shift, whose handler `k`'s call then runs, as a reset around `k` would.
 * The fiber can only go on once, so a second call of one `k` fails.
 * Generators, coroutines, and early exits are each one use of the two.
 */
import { Context, Deferred, Effect, type Exit, Option } from "effect";
import { counted, LogicError } from "@/errors/evaluation";
import { call } from "@/evaluation/special-forms/function";

/** What the delimited part gave its reset: a value, a failure, or a shift. */
type Outcome =
  | { readonly exit: Exit.Exit<unknown, unknown> }
  | { readonly handler: unknown; readonly k: unknown };

/** Where the delimited part tells what it gave: the reset, or `k`'s caller. */
interface Prompt {
  target: Deferred.Deferred<Outcome>;
}

/** The prompt of the reset around the code that runs. */
export class LionPromptService extends Context.Service<
  LionPromptService,
  Prompt
>()("LionPromptService") {}

/**
 * Waits for what the delimited part gives: its value, its failure, or a
 * shift's handler, which runs here, outside the delimited part, with `k`.
 */
const drive = (
  target: Deferred.Deferred<Outcome>
): Effect.Effect<unknown, unknown> =>
  Effect.flatMap(Deferred.await(target), (outcome) =>
    "exit" in outcome ? outcome.exit : call(outcome.handler, outcome.k)
  );

/** Runs a thunk as the delimited part of a reset, and gives what it gives. */
export const reset = (thunk: unknown) =>
  Effect.gen(function* () {
    const prompt: Prompt = { target: yield* Deferred.make<Outcome>() };
    yield* Effect.forkDetach(
      call(thunk).pipe(
        Effect.exit,
        Effect.flatMap((exit) => Deferred.succeed(prompt.target, { exit })),
        Effect.provideService(LionPromptService, prompt)
      )
    );
    return yield* drive(prompt.target);
  });

/**
 * Stops the delimited part where it stands, and has its reset give what
 * `handler` gives for `k`, the rest of the delimited part.
 */
export const shift = (handler: unknown) =>
  Effect.gen(function* () {
    const found = yield* Effect.serviceOption(LionPromptService);
    if (Option.isNone(found)) {
      return yield* new LogicError({
        message:
          "func/shift needs a func/reset around it: the continuation it gives runs up to that reset.",
      });
    }
    const prompt = found.value;
    const resume = yield* Deferred.make<unknown>();
    let resumed = false;
    const k = counted(
      (value: unknown) =>
        Effect.gen(function* () {
          if (resumed) {
            return yield* new LogicError({
              message:
                "A continuation was resumed a second time: the one func/shift gives goes on once.",
            });
          }
          resumed = true;
          const next = yield* Deferred.make<Outcome>();
          prompt.target = next;
          yield* Deferred.succeed(resume, value);
          return yield* drive(next);
        }),
      1
    );
    yield* Deferred.succeed(prompt.target, { handler, k });
    return yield* Deferred.await(resume);
  });
