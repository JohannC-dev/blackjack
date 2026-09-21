import { randomInt } from "node:crypto";
import {
  isMinesTarget,
  minesForTarget,
  minesMultiplier,
  minesPayout,
  MINES_GRID_SIZE,
  MINES_MAX_BET,
  MINES_MIN_BET,
  type MinesTarget,
} from "../src/lib/mines";
import type { MinesCommand, MinesState } from "../src/lib/types";

type MinesCellValue = "diamond" | "mine";
type MinesPlayer = { balance: number };

function emptyCells() {
  return Array.from({ length: MINES_GRID_SIZE }, (_, index) => ({
    index,
    status: "hidden" as const,
  }));
}

function validBet(value: number) {
  return (
    Number.isSafeInteger(value) &&
    value >= MINES_MIN_BET &&
    value <= MINES_MAX_BET &&
    value % 5 === 0
  );
}

export class MinesGame {
  private phase: MinesState["phase"] = "idle";
  private round = 0;
  private bet = 0;
  private target: MinesTarget = 200;
  private mineCount = minesForTarget(this.target);
  private grid: MinesCellValue[] = [];
  private revealed = new Set<number>();
  private multiplier = 1;
  private payout = 0;
  private net: number | null = null;
  private message = "La grille attend votre mise.";

  constructor(private readonly publish: () => void = () => {}) {}

  snapshot(): MinesState {
    const finished =
      this.phase === "lost" || this.phase === "won" || this.phase === "cashed";
    return {
      phase: this.phase,
      round: this.round,
      bet: this.bet,
      target: this.target,
      mineCount: this.mineCount,
      cells: Array.from({ length: MINES_GRID_SIZE }, (_, index) => ({
        index,
        status:
          finished && this.grid[index]
            ? this.grid[index]
            : this.revealed.has(index)
              ? this.grid[index]
              : "hidden",
      })),
      revealedCount: this.revealed.size,
      multiplier: this.multiplier,
      payout: this.payout,
      nextMultiplier:
        this.phase === "playing" &&
        this.revealed.size < MINES_GRID_SIZE - this.mineCount
          ? minesMultiplier(this.mineCount, this.revealed.size + 1)
          : null,
      nextPayout:
        this.phase === "playing" &&
        this.revealed.size < MINES_GRID_SIZE - this.mineCount
          ? minesPayout(
              this.bet,
              minesMultiplier(this.mineCount, this.revealed.size + 1),
            )
          : null,
      net: this.net,
      message: this.message,
    };
  }

  command(player: MinesPlayer, command: MinesCommand) {
    switch (command?.type) {
      case "start":
        this.start(player, command.bet, command.target);
        return;
      case "reveal":
        this.reveal(player, command.index);
        return;
      case "cashout":
        this.cashout(player);
        return;
      default:
        throw new Error("Action Mines inconnue.");
    }
  }

  start(player: MinesPlayer, bet: number, target: number) {
    if (this.phase === "playing")
      throw new Error("Terminez la partie en cours avant de rejouer.");
    if (!validBet(bet))
      throw new Error(
        `La mise doit être comprise entre ${MINES_MIN_BET} et ${MINES_MAX_BET} crédits.`,
      );
    if (!isMinesTarget(target))
      throw new Error("Choisissez un objectif de gain valide.");
    if (!Number.isFinite(player.balance) || player.balance < bet)
      throw new Error("Votre solde est insuffisant pour cette mise.");

    player.balance -= bet;
    this.round += 1;
    this.bet = bet;
    this.target = target;
    this.mineCount = minesForTarget(target);
    this.grid = Array.from({ length: MINES_GRID_SIZE }, () => "diamond");
    let placed = 0;
    while (placed < this.mineCount) {
      const index = randomInt(MINES_GRID_SIZE);
      if (this.grid[index] === "mine") continue;
      this.grid[index] = "mine";
      placed += 1;
    }
    this.revealed = new Set();
    this.phase = "playing";
    this.multiplier = 1;
    this.payout = 0;
    this.net = null;
    this.message = "La grille est prête. Choisissez une case.";
    this.publish();
  }

  reveal(player: MinesPlayer, index: number) {
    if (this.phase !== "playing")
      throw new Error("Aucune extraction n'est en cours.");
    if (!Number.isSafeInteger(index) || index < 0 || index >= MINES_GRID_SIZE)
      throw new Error("Cette case n'existe pas.");
    if (this.revealed.has(index))
      throw new Error("Cette case est déjà ouverte.");

    this.revealed.add(index);
    if (this.grid[index] === "mine") {
      this.phase = "lost";
      this.payout = 0;
      this.net = -this.bet;
      this.message = "La mine a explosé. La mise est perdue.";
      this.publish();
      return;
    }

    this.multiplier = minesMultiplier(this.mineCount, this.revealed.size);
    if (this.revealed.size === MINES_GRID_SIZE - this.mineCount) {
      this.phase = "won";
      this.payout = minesPayout(this.bet, this.multiplier);
      this.net = this.payout - this.bet;
      player.balance += this.payout;
      this.message = "Toutes les cases sûres sont ouvertes. Gain sécurisé.";
      this.publish();
      return;
    }
    this.message =
      this.multiplier >= this.target / 100
        ? "Objectif atteint. Vous pouvez encaisser ou continuer."
        : "Diamant trouvé. À vous de choisir la prochaine case.";
    this.publish();
  }

  cashout(player: MinesPlayer) {
    if (this.phase !== "playing")
      throw new Error("La partie ne peut pas être encaissée maintenant.");
    if (!this.revealed.size)
      throw new Error("Ouvrez au moins un diamant avant d'encaisser.");

    this.payout = minesPayout(this.bet, this.multiplier);
    this.net = this.payout - this.bet;
    player.balance += this.payout;
    this.phase = "cashed";
    this.message = "Gain encaissé. La grille est révélée.";
    this.publish();
  }
}
