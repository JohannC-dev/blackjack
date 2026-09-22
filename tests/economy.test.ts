import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { Table, type Player } from "../server/engine";
import { MinesGame } from "../server/mines";
import { CASH_LIMITS, SPIN_BUY_INS } from "../server/poker";
import {
  BLACKJACK_CHIP_DENOMINATIONS,
  BLACKJACK_CHIP_PRESETS,
  CASINO_CHIP_DENOMINATIONS,
  INITIAL_CREDIT_BALANCE,
  chipLabel,
} from "../src/lib/chips";
import { isValidRouletteBet, ROULETTE_MAX_PER_SPOT } from "../src/lib/roulette";

const player = (balance = 50_000_000_000): Player => ({
  id: randomUUID(),
  token: randomUUID(),
  name: "Économie",
  balance,
  ready: false,
  connected: true,
  roomId: "MINUIT",
  lastSeen: Date.now(),
});

describe("Nouvelle économie", () => {
  test("expose les neuf jetons communs sans doublon", () => {
    expect(CASINO_CHIP_DENOMINATIONS).toEqual([
      5_000, 20_000, 100_000, 500_000, 2_000_000, 10_000_000, 50_000_000,
      200_000_000, 1_000_000_000,
    ]);
    expect(new Set(CASINO_CHIP_DENOMINATIONS).size).toBe(9);
    expect(chipLabel(5_000)).toBe("5K");
    expect(chipLabel(1_600_000)).toBe("1,6M");
    expect(chipLabel(1_000_000_000)).toBe("1B");
  });

  test("garde les propositions blackjack indépendantes des tables", () => {
    expect(BLACKJACK_CHIP_PRESETS).toHaveLength(4);
    expect(BLACKJACK_CHIP_PRESETS[0]).toEqual([
      15_000, 30_000, 60_000, 150_000,
    ]);
    expect(BLACKJACK_CHIP_PRESETS[1]).toEqual([
      200_000, 400_000, 800_000, 1_600_000,
    ]);

    const member = player();
    const table = new Table("MINUIT");
    table.add(member);
    const seat = table.state.seats.find(
      (entry) => entry.playerId === member.id,
    )!;
    for (const amount of BLACKJACK_CHIP_DENOMINATIONS)
      expect(() =>
        table.command(member.id, {
          type: "bet",
          seat: seat.index,
          bet: { main: amount, three: 0, pairs: 0 },
        }),
      ).not.toThrow();
    expect(() =>
      table.command(member.id, {
        type: "bet",
        seat: seat.index,
        bet: { main: 5_000, three: 0, pairs: 0 },
      }),
    ).toThrow("combinaison");
  });

  test("recharge et crée les parties sur la nouvelle base", () => {
    const member = player(0);
    const table = new Table("MINUIT");
    table.add(member);
    table.command(member.id, { type: "refill" });
    expect(member.balance).toBe(INITIAL_CREDIT_BALANCE);

    const mines = new MinesGame();
    mines.start(member, CASINO_CHIP_DENOMINATIONS[0], 200);
    expect(member.balance).toBe(
      INITIAL_CREDIT_BALANCE - CASINO_CHIP_DENOMINATIONS[0],
    );
  });

  test("aligne roulette et poker sur les nouveaux montants", () => {
    expect(
      isValidRouletteBet({
        kind: "color",
        selection: "red",
        amount: CASINO_CHIP_DENOMINATIONS[0],
      }),
    ).toBe(true);
    expect(
      isValidRouletteBet({ kind: "color", selection: "red", amount: 5 }),
    ).toBe(false);
    expect(ROULETTE_MAX_PER_SPOT).toBe(20_000_000_000);
    expect([...CASH_LIMITS.keys()]).toEqual([5_000, 20_000, 100_000]);
    expect(SPIN_BUY_INS).toEqual([5_000, 20_000, 100_000, 500_000, 2_000_000]);
  });
});
