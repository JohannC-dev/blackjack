import {
  Cause,
  Clock,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Option,
} from "effect";
import type { GameWallet } from "../game-wallet";
import type { RouletteError } from "./errors";
import { Roulette } from "./service";
import { Players, Transport, Wallet, Wheel } from "./services";

export * from "./errors";
export { decodeBets, decodeCommand } from "./schema";
export { Roulette } from "./service";
export {
  Players,
  Transport,
  Wallet,
  Wheel,
  type RoulettePlayer,
} from "./services";
export { ROULETTE_SPIN_MS } from "./table";

export type RouletteRuntimeOptions = {
  players: Players["Type"];
  wallet: GameWallet;
  transport: Transport["Type"];
  /** Defaults to the fair wheel. */
  wheel?: Wheel["Type"];
  /** Defaults to the system clock. */
  clock?: Clock.Clock;
};

/**
 * Builds the Roulette for the Socket.IO server. Every operation runs
 * synchronously, like the other games, so the shared wallet is never touched
 * by two games at once. A refusal is thrown as the typed error, whose message
 * is shown to the player; an unexpected defect is logged and reported as a
 * generic error instead of taking the server down.
 */
export function makeRouletteRuntime(options: RouletteRuntimeOptions) {
  const services = Layer.mergeAll(
    Layer.succeed(Players, options.players),
    Layer.succeed(Wallet, options.wallet),
    Layer.succeed(Transport, options.transport),
    options.wheel ? Layer.succeed(Wheel, options.wheel) : Wheel.Live,
  );
  const layer = Roulette.Default.pipe(
    Layer.provide(services),
    Layer.provideMerge(
      options.clock ? Layer.setClock(options.clock) : Layer.empty,
    ),
  );
  const runtime = ManagedRuntime.make(layer);

  function run<A>(
    operation: (roulette: Roulette) => Effect.Effect<A, RouletteError>,
  ): A {
    const exit = runtime.runSyncExit(Effect.flatMap(Roulette, operation));
    if (Exit.isSuccess(exit)) return exit.value;
    const failure = Cause.failureOption(exit.cause);
    if (Option.isSome(failure)) throw failure.value;
    console.error("Roulette ·", Cause.pretty(exit.cause));
    throw new Error("La roulette a rencontré un problème.");
  }

  return { run, dispose: () => runtime.dispose() };
}
export type RouletteRuntime = ReturnType<typeof makeRouletteRuntime>;
