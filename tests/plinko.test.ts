import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  InMemoryGameWallet,
  type GameResult,
  type WalletAccount,
  type WalletChange,
} from "../server/game-wallet";
import { PlinkoGame } from "../server/plinko";
import {
  plinkoMultipliers,
  plinkoReturn,
  plinkoSlotProbabilities,
  PLINKO_RISKS,
  PLINKO_ROW_OPTIONS,
  PLINKO_MAX_RETURN,
} from "../src/lib/plinko";

const plinkoGame = () =>
  new PlinkoGame(undefined, { min: 5, max: 500, step: 5 });

describe("Plinko", () => {
  test("les cases suivent la loi binomiale", () => {
    for (const rows of PLINKO_ROW_OPTIONS) {
      const probabilities = plinkoSlotProbabilities(rows);
      expect(probabilities).toHaveLength(rows + 1);
      const total = probabilities.reduce((sum, value) => sum + value, 0);
      expect(total).toBeCloseTo(1, 12);
      expect(probabilities[0]).toBeCloseTo(Math.pow(0.5, rows), 12);
    }
  });

  test("aucune table ne rend plus que la marge annoncée", () => {
    for (const risk of PLINKO_RISKS)
      for (const rows of PLINKO_ROW_OPTIONS) {
        const actual = plinkoReturn(risk, rows);
        expect(actual).toBeLessThanOrEqual(PLINKO_MAX_RETURN);
        expect(actual).toBeGreaterThan(0.98);
      }
  });

  test("les multiplicateurs tiennent sur un badge", () => {
    for (const risk of PLINKO_RISKS)
      for (const rows of PLINKO_ROW_OPTIONS)
        for (const multiplier of plinkoMultipliers(risk, rows)) {
          // One decimal below ten, an integer above: never more.
          const step = multiplier >= 10 ? 1 : 0.1;
          expect(
            Math.abs(multiplier / step - Math.round(multiplier / step)),
          ).toBeLessThan(1e-9);
          expect(multiplier).toBeGreaterThan(0);
        }
  });

  test("les multiplicateurs sont symétriques et minimaux au centre", () => {
    for (const risk of PLINKO_RISKS)
      for (const rows of PLINKO_ROW_OPTIONS) {
        const multipliers = plinkoMultipliers(risk, rows);
        expect(multipliers).toHaveLength(rows + 1);
        for (let slot = 0; slot < multipliers.length; slot++)
          expect(multipliers[slot]).toBeCloseTo(
            multipliers[multipliers.length - 1 - slot],
            10,
          );
        const centre = multipliers[Math.floor(rows / 2)];
        expect(centre).toBe(Math.min(...multipliers));
        expect(multipliers[0]).toBe(Math.max(...multipliers));
        // Never worth more than the slot just outside it.
        for (let slot = 1; slot <= rows / 2; slot++)
          expect(multipliers[slot]).toBeLessThanOrEqual(multipliers[slot - 1]);
      }
  });

  test("un risque élevé paie plus aux bords qu'un risque faible", () => {
    expect(plinkoMultipliers("high", 16)[0]).toBeGreaterThan(
      plinkoMultipliers("low", 16)[0],
    );
    expect(plinkoMultipliers("high", 16)[8]).toBeLessThan(
      plinkoMultipliers("low", 16)[8],
    );
  });

  test("une bille débite la mise et crédite la case atteinte", () => {
    const game = plinkoGame();
    const player = { id: randomUUID(), balance: 1_000 };
    game.drop(player, 100, "medium", 16);
    const state = game.snapshot();
    const drop = state.drops.at(-1)!;

    expect(state.drops).toHaveLength(1);
    expect(drop.path).toHaveLength(16);
    expect(drop.slot).toBe(drop.path.reduce((sum, step) => sum + step, 0));
    expect(drop.multiplier).toBe(plinkoMultipliers("medium", 16)[drop.slot]);
    expect(drop.payout).toBe(Math.round(100 * drop.multiplier));
    expect(player.balance).toBe(1_000 - 100 + drop.payout);
    expect(drop.net).toBe(drop.payout - 100);
  });

  test("une salve règle chaque bille et garde l'historique borné", () => {
    const results: GameResult[] = [];
    class CountingWallet extends InMemoryGameWallet {
      override recordGameResult(result: GameResult) {
        results.push(result);
      }
    }
    const game = new PlinkoGame(new CountingWallet(), {
      min: 5,
      max: 500,
      step: 5,
    });
    const player = { id: randomUUID(), balance: 100_000 };
    for (let batch = 0; batch < 3; batch++) game.drop(player, 5, "high", 8, 10);
    const state = game.snapshot();

    expect(results.flatMap((result) => result.plays ?? [])).toHaveLength(30);
    expect(state.drops.length).toBeLessThanOrEqual(12);
    expect(new Set(state.drops.map((drop) => drop.id)).size).toBe(
      state.drops.length,
    );
  });

  test("une salve n'écrit qu'une mise, un gain et un résultat", () => {
    const moves: { kind: string; amount: number }[] = [];
    const results: GameResult[] = [];
    class RecordingWallet extends InMemoryGameWallet {
      override debit(account: WalletAccount, change: WalletChange) {
        super.debit(account, change);
        moves.push({ kind: change.kind, amount: change.amount });
      }
      override credit(account: WalletAccount, change: WalletChange) {
        super.credit(account, change);
        moves.push({ kind: change.kind, amount: change.amount });
      }
      override recordGameResult(result: GameResult) {
        results.push(result);
      }
    }
    const game = new PlinkoGame(new RecordingWallet(), {
      min: 5,
      max: 500,
      step: 5,
    });
    const player = { id: randomUUID(), balance: 100_000 };
    game.drop(player, 100, "high", 16, 10);
    const drops = game.snapshot().drops;
    const payout = drops.reduce((total, drop) => total + drop.payout, 0);

    expect(drops).toHaveLength(10);
    expect(moves).toEqual(
      payout > 0
        ? [
            { kind: "wager", amount: 1_000 },
            { kind: "payout", amount: payout },
          ]
        : [{ kind: "wager", amount: 1_000 }],
    );
    expect(results).toHaveLength(1);
    expect(results[0].net).toBe(payout - 1_000);
    expect(results[0].plays).toEqual(drops.map((drop) => drop.net));
    expect(player.balance).toBe(100_000 - 1_000 + payout);
  });

  test("une mise, un risque ou des rangées invalides sont refusés", () => {
    const game = plinkoGame();
    const player = { id: randomUUID(), balance: 1_000 };

    expect(() => game.drop(player, 7, "medium", 16)).toThrow();
    expect(() => game.drop(player, 100, "extreme", 16)).toThrow();
    expect(() => game.drop(player, 100, "medium", 17)).toThrow();
    expect(() => game.drop(player, 100, "medium", 16, 11)).toThrow();
    expect(() => game.drop(player, 500, "medium", 16, 10)).toThrow();
    expect(player.balance).toBe(1_000);
    expect(game.snapshot().drops).toHaveLength(0);
  });

  test("le solde ne peut pas devenir négatif sur une longue série", () => {
    const game = plinkoGame();
    const player = { id: randomUUID(), balance: 500 };
    for (let drop = 0; drop < 200; drop++) {
      if (player.balance < 5) break;
      game.drop(player, 5, "high", 12);
      expect(player.balance).toBeGreaterThanOrEqual(0);
    }
  });
});
