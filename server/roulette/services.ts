import { randomInt } from "node:crypto";
import { Context, Effect, Layer, type Option } from "effect";
import type { RouletteTableState } from "../../src/lib/types";
import type { InsufficientCredits } from "./errors";

/** What the Roulette needs to know about a club member. */
export type RoulettePlayer = {
  readonly id: string;
  readonly name: string;
  readonly balance: number;
  readonly connected: boolean;
  readonly lastSeen: number;
};

/**
 * The club members and their wallet, shared with the other games. A debit
 * checks the balance and takes the credits in one step, so a wallet spent
 * elsewhere in the meantime can never go negative.
 */
export class Players extends Context.Tag("roulette/Players")<
  Players,
  {
    readonly get: (
      playerId: string,
    ) => Effect.Effect<Option.Option<RoulettePlayer>>;
    readonly debit: (
      playerId: string,
      amount: number,
    ) => Effect.Effect<void, InsufficientCredits>;
    readonly credit: (playerId: string, amount: number) => Effect.Effect<void>;
  }
>() {}

/** Source of the winning number. */
export class Wheel extends Context.Tag("roulette/Wheel")<
  Wheel,
  { readonly spin: Effect.Effect<number> }
>() {
  /** A fair European wheel: 37 pockets drawn with the system CSPRNG. */
  static readonly Live = Layer.succeed(Wheel, {
    spin: Effect.sync(() => randomInt(37)),
  });
}

/** Delivery of the table to the connections showing it. */
export class Transport extends Context.Tag("roulette/Transport")<
  Transport,
  {
    /** Sends the table to every connection sitting at it. */
    readonly publish: (state: RouletteTableState) => Effect.Effect<void>;
    readonly enter: (
      socketIds: Iterable<string>,
      tableId: string,
    ) => Effect.Effect<void>;
    readonly exit: (
      socketIds: Iterable<string>,
      tableId: string,
    ) => Effect.Effect<void>;
  }
>() {}
