import { randomInt, randomUUID } from "node:crypto";
import { gameEffect } from "./effect";
import {
  inMemoryGameWallet,
  type GameWallet,
  type WalletAccount,
} from "./game-wallet";
import {
  isPlinkoRisk,
  isPlinkoRows,
  plinkoMultipliers,
  plinkoPayout,
  plinkoSlot,
  PLINKO_BET_STEP,
  PLINKO_HISTORY_SIZE,
  PLINKO_MAX_BALLS,
  PLINKO_MAX_BET,
  PLINKO_MIN_BET,
  type PlinkoRisk,
} from "../src/lib/plinko";
import type { PlinkoCommand, PlinkoDrop, PlinkoState } from "../src/lib/types";

type PlinkoPlayer = WalletAccount;
type PlinkoBetLimits = { min: number; max: number; step: number };

function validBet(value: number, limits: PlinkoBetLimits) {
  return (
    Number.isSafeInteger(value) &&
    value >= limits.min &&
    value <= limits.max &&
    value % limits.step === 0
  );
}

/**
 * The board is solo and settles instantly: every ball is a fresh draw of one
 * bounce per row, and the wallet moves once per ball. The client only replays
 * the path the server already decided, so no animation can change a payout.
 */
export class PlinkoGame {
  private risk: PlinkoRisk = "medium";
  private rows = 16;
  private bet: number = PLINKO_MIN_BET;
  private drops: PlinkoDrop[] = [];
  private round = 0;
  private sessionNet = 0;
  private message = "Choisissez un risque et lâchez une bille.";

  constructor(
    private readonly publish: () => void = () => {},
    private readonly wallet: GameWallet = inMemoryGameWallet,
    private readonly betLimits: PlinkoBetLimits = {
      min: PLINKO_MIN_BET,
      max: PLINKO_MAX_BET,
      step: PLINKO_BET_STEP,
    },
  ) {}

  snapshot(): PlinkoState {
    return {
      risk: this.risk,
      rows: this.rows,
      bet: this.bet,
      drops: this.drops.map((drop) => ({ ...drop, path: [...drop.path] })),
      round: this.round,
      sessionNet: this.sessionNet,
      message: this.message,
    };
  }

  command(player: PlinkoPlayer, command: PlinkoCommand) {
    switch (command?.type) {
      case "drop":
        this.drop(
          player,
          command.bet,
          command.risk,
          command.rows,
          command.balls,
        );
        return;
      default:
        throw new Error("Action Plinko inconnue.");
    }
  }

  commandEffect(player: PlinkoPlayer, command: PlinkoCommand) {
    return gameEffect(() => this.command(player, command));
  }

  dropEffect(
    player: PlinkoPlayer,
    bet: number,
    risk: unknown,
    rows: unknown,
    balls = 1,
  ) {
    return gameEffect(() => this.drop(player, bet, risk, rows, balls));
  }

  drop(
    player: PlinkoPlayer,
    bet: number,
    risk: unknown,
    rows: unknown,
    balls: number = 1,
  ) {
    if (!validBet(bet, this.betLimits))
      throw new Error(
        `La mise doit être comprise entre ${this.betLimits.min} et ${this.betLimits.max} crédits.`,
      );
    if (!isPlinkoRisk(risk)) throw new Error("Choisissez un risque valide.");
    if (!isPlinkoRows(rows))
      throw new Error("Choisissez un nombre de rangées valide.");
    const count = balls ?? 1;
    if (!Number.isSafeInteger(count) || count < 1 || count > PLINKO_MAX_BALLS)
      throw new Error(
        `Lâchez entre 1 et ${PLINKO_MAX_BALLS} billes à la fois.`,
      );

    const balance = this.wallet.balance(player);
    if (!Number.isFinite(balance) || balance < bet * count)
      throw new Error("Votre solde est insuffisant pour cette mise.");

    this.risk = risk;
    this.rows = rows;
    this.bet = bet;
    const multipliers = plinkoMultipliers(risk, rows);
    for (let ball = 0; ball < count; ball++)
      this.settle(player, bet, multipliers);
    this.message =
      count === 1
        ? "La bille est tombée. Le serveur a tiré son chemin."
        : `${count} billes lâchées.`;
    this.publish();
  }

  private settle(
    player: PlinkoPlayer,
    bet: number,
    multipliers: readonly number[],
  ) {
    const dropId = randomUUID();
    this.wallet.debit(player, {
      operationId: `plinko:${dropId}:wager`,
      game: "plinko",
      kind: "wager",
      reason: "drop",
      referenceId: dropId,
      amount: bet,
      metadata: { risk: this.risk, rows: this.rows },
    });
    this.round += 1;

    const path = Array.from({ length: this.rows }, () => randomInt(2));
    const slot = plinkoSlot(path);
    const multiplier = multipliers[slot];
    const payout = plinkoPayout(bet, multiplier);
    const net = payout - bet;
    if (payout > 0)
      this.wallet.credit(player, {
        operationId: `plinko:${dropId}:payout`,
        game: "plinko",
        kind: "payout",
        reason: "slot",
        referenceId: dropId,
        amount: payout,
        metadata: { slot, multiplier, round: this.round },
      });
    this.wallet.recordGameResult({
      userId: player.id,
      game: "plinko",
      playId: dropId,
      net,
    });

    this.sessionNet += net;
    this.drops.push({
      id: dropId,
      risk: this.risk,
      rows: this.rows,
      bet,
      path,
      slot,
      multiplier,
      payout,
      net,
    });
    if (this.drops.length > PLINKO_HISTORY_SIZE)
      this.drops.splice(0, this.drops.length - PLINKO_HISTORY_SIZE);
  }
}
