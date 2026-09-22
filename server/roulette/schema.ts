import { Effect, Either, Schema } from "effect";
import {
  isValidRouletteBet,
  rouletteBetId,
  ROULETTE_MAX_BETS,
  ROULETTE_MAX_PER_SPOT,
  type RouletteBet,
} from "../../src/lib/roulette";
import type { RouletteCommand } from "../../src/lib/types";
import { InvalidBets, InvalidCommand, UnknownCommand } from "./errors";

const BetKind = Schema.Literal(
  "straight",
  "split",
  "corner",
  "dozen",
  "column",
  "parity",
  "color",
  "half",
);

/**
 * A bet as it may arrive from a client: only the expected fields are kept,
 * and the spot, the chip size and the canonical spelling are all checked.
 */
export const RouletteBetSchema = Schema.Struct({
  kind: BetKind,
  selection: Schema.String,
  amount: Schema.Number,
}).pipe(Schema.filter((bet) => isValidRouletteBet(bet)));

const CommandInput = Schema.Union(
  Schema.Struct({ type: Schema.Literal("bets"), bets: Schema.Unknown }),
  Schema.Struct({ type: Schema.Literal("repeat") }),
  Schema.Struct({ type: Schema.Literal("ready"), ready: Schema.Boolean }),
);
const COMMAND_TYPES = new Set(["bets", "repeat", "ready"]);

const decodeBet = Schema.decodeUnknownEither(RouletteBetSchema);

/** Validates a layout and merges chips laid twice on the same spot. */
export const decodeBets = (input: unknown) =>
  Effect.gen(function* () {
    if (!Array.isArray(input))
      return yield* new InvalidBets({ message: "Les mises sont invalides." });
    const merged = new Map<string, RouletteBet>();
    for (const raw of input) {
      const decoded = decodeBet(raw);
      if (Either.isLeft(decoded))
        return yield* new InvalidBets({
          message: "Une des mises n’est pas valide.",
        });
      const bet = decoded.right;
      const id = rouletteBetId(bet);
      const amount = (merged.get(id)?.amount ?? 0) + bet.amount;
      merged.set(id, { kind: bet.kind, selection: bet.selection, amount });
    }
    const bets = [...merged.values()];
    if (bets.length > ROULETTE_MAX_BETS)
      return yield* new InvalidBets({
        message: "Trop de mises différentes sur le tapis.",
      });
    if (bets.some((bet) => bet.amount > ROULETTE_MAX_PER_SPOT))
      return yield* new InvalidBets({
        message: `La mise est limitée à ${ROULETTE_MAX_PER_SPOT} crédits par case.`,
      });
    return bets;
  });

const decodeInput = Schema.decodeUnknownEither(CommandInput);

/** Turns an untrusted socket payload into a command the table can apply. */
export const decodeCommand = (
  input: unknown,
): Effect.Effect<
  RouletteCommand,
  InvalidCommand | UnknownCommand | InvalidBets
> =>
  Effect.gen(function* () {
    const decoded = decodeInput(input);
    if (Either.isLeft(decoded)) {
      const type =
        typeof input === "object" && input !== null
          ? (input as { type?: unknown }).type
          : undefined;
      return yield* typeof type === "string" && !COMMAND_TYPES.has(type)
        ? new UnknownCommand()
        : new InvalidCommand();
    }
    const command = decoded.right;
    if (command.type === "bets")
      return { type: "bets", bets: yield* decodeBets(command.bets) };
    return command;
  });
