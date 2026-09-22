import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { Table, type Player } from "../server/engine";
import { MinesGame } from "../server/mines";
import { CASH_LIMITS, SPIN_BUY_INS } from "../server/poker";
import {
  BLACKJACK_CHIP_DENOMINATIONS,
  BLACKJACK_MAX_BET,
  BLACKJACK_CHIP_PRESETS,
  CASINO_CHIP_DENOMINATIONS,
  INITIAL_CREDIT_BALANCE,
  chipLabel,
  chipColors,
  chipStackForComposition,
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

  test("keeps chip colours fixed between casino denominations", () => {
    expect(chipColors(15_000)).toEqual(chipColors(5_000));
    expect(chipColors(30_000)).toEqual(chipColors(20_000));
    expect(chipColors(60_000)).toEqual(chipColors(20_000));
    expect(chipColors(100_000)).not.toEqual(chipColors(20_000));
    expect(chipColors(1_600_000)).toEqual(chipColors(500_000));
    expect(chipColors(10_000_000)).toEqual(chipColors(16_000_000));
    expect(chipColors(200_000)).toEqual(chipColors(400_000));
    expect(chipColors(200_000)).not.toEqual(chipColors(100_000));
    expect(chipColors(200_000)["--chip-base"]).toBe("#d45f27");
    expect(chipColors(1_000_000_000)["--chip-base"]).toBe("#17191d");
    expect(chipColors(1_000_000_000)).not.toEqual(chipColors(500_000));
  });

  test("keeps selected blackjack chips on the table and for repeat", () => {
    const member = player();
    const table = new Table("CHIPS");
    table.add(member);
    const seat = table.state.seats.find(
      (entry) => entry.playerId === member.id,
    )!;
    const chips = {
      main: [
        { denomination: 15_000, count: 1 },
        { denomination: 30_000, count: 1 },
      ],
      three: [{ denomination: 15_000, count: 1 }],
      pairs: [],
    };
    table.command(member.id, {
      type: "bet",
      seat: seat.index,
      bet: { main: 45_000, three: 15_000, pairs: 0 },
      chips,
    });
    expect(table.snapshot().seats[seat.index].chips).toEqual(chips);
    expect(
      chipStackForComposition(seat.chips.main, seat.bet.main, BLACKJACK_MAX_BET)
        .columns,
    ).toEqual([
      { denomination: 15_000, layers: 1 },
      { denomination: 30_000, layers: 1 },
    ]);
    expect(() =>
      table.command(member.id, {
        type: "bet",
        seat: seat.index,
        bet: { main: 45_000, three: 15_000, pairs: 0 },
        chips: { ...chips, main: [{ denomination: 15_000, count: 1 }] },
      }),
    ).toThrow();

    table.command(member.id, { type: "ready", ready: true });
    table.startRound();
    expect(seat.previousChips).toEqual(chips);
    table.state.phase = "betting";
    seat.bet = { main: 0, three: 0, pairs: 0 };
    seat.chips = { main: [], three: [], pairs: [] };
    table.command(member.id, { type: "repeat" });
    expect(seat.chips).toEqual(chips);
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
