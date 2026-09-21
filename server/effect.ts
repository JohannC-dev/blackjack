import { Context, Effect, Either, Layer, Schema } from "effect";

export class GameError extends Error {
  readonly _tag: string = "GameError";

  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GameError";
  }
}

export class InputError extends GameError {
  readonly _tag = "InputError" as const;
}

export type Clock = {
  readonly now: () => number;
};

export class ServerClock extends Context.Tag("@minuit/ServerClock")<
  ServerClock,
  Clock
>() {}

export const ServerClockLive = Layer.succeed(ServerClock, {
  now: () => Date.now(),
});

export function toGameError(error: unknown): GameError {
  if (error instanceof GameError) return error;
  if (error instanceof Error) return new GameError(error.message, error);
  return new GameError("Une erreur est survenue.", error);
}

/** Turns synchronous game mutations into typed, dependency-ready effects. */
export function gameEffect<A>(thunk: (clock: Clock) => A) {
  const effect = Effect.gen(function* () {
    const clock = yield* ServerClock;
    return yield* Effect.try({
      try: () => thunk(clock),
      catch: toGameError,
    });
  });

  return Effect.provide(effect, ServerClockLive);
}

/** Decodes untrusted socket payloads before they reach a game engine. */
export function decodeInput<A>(
  schema: Schema.Schema<A>,
  input: unknown,
  message: string,
) {
  return Effect.mapError(
    Schema.decodeUnknown(schema)(input),
    () => new InputError(message),
  );
}

export function runEffect<A, E>(effect: Effect.Effect<A, E, never>) {
  return Effect.runSync(Effect.either(effect));
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Une erreur est survenue.";
}

export function isFailure<A, E>(result: Either.Either<A, E>) {
  return Either.isLeft(result);
}
