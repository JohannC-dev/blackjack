import { describe, expect, test } from "bun:test";
import { RouletteTable, ROULETTE_SPIN_MS } from "../server/roulette";
import { targetAt } from "../src/components/roulette-casino";
import {
  isValidRouletteBet,
  rouletteBetWins,
  rouletteReturn,
} from "../src/lib/roulette";

const player = (id: string, balance = 1_000) => ({
  id,
  name: id,
  balance,
  connected: true,
  lastSeen: Date.now(),
});

describe("Roulette européenne", () => {
  test("les chevaux et carrés ne relient que des cases voisines", () => {
    const bet = (kind: "split" | "corner", selection: string) =>
      isValidRouletteBet({ kind, selection, amount: 5 });
    expect(bet("split", "1-2")).toBe(true);
    expect(bet("split", "2-3")).toBe(true);
    expect(bet("split", "3-4")).toBe(false);
    expect(bet("split", "33-36")).toBe(true);
    expect(bet("corner", "1-2-4-5")).toBe(true);
    expect(bet("corner", "3-4-6-7")).toBe(false);
    expect(bet("corner", "32-33-35-36")).toBe(true);
  });

  test("viser le bord ou le coin d’un numéro joue cheval ou carré", () => {
    // 17 sits in column 6, middle row: 16 below, 18 above, 14 and 20 aside.
    expect(targetAt(17, 0.5, 0.5)).toEqual({
      kind: "straight",
      selection: "17",
    });
    expect(targetAt(17, 0.95, 0.5).selection).toBe("17-20");
    expect(targetAt(17, 0.05, 0.5).selection).toBe("14-17");
    expect(targetAt(17, 0.5, 0.05).selection).toBe("17-18");
    expect(targetAt(17, 0.5, 0.95).selection).toBe("16-17");
    expect(targetAt(17, 0.95, 0.05)).toEqual({
      kind: "corner",
      selection: "17-18-20-21",
    });
    // Outer edges fall back to the plain number or a single split.
    expect(targetAt(3, 0.5, 0.05).selection).toBe("3");
    expect(targetAt(36, 0.95, 0.05).selection).toBe("36");
    for (const number of [1, 2, 3, 17, 34, 35, 36])
      for (const x of [0.05, 0.5, 0.95])
        for (const y of [0.05, 0.5, 0.95])
          expect(
            isValidRouletteBet({ ...targetAt(number, x, y), amount: 5 }),
          ).toBe(true);
  });

  test("le zéro fait perdre toutes les chances simples", () => {
    for (const [kind, selection] of [
      ["color", "red"],
      ["color", "black"],
      ["parity", "even"],
      ["half", "low"],
      ["dozen", "1"],
      ["column", "3"],
    ] as const)
      expect(rouletteBetWins({ kind, selection }, 0)).toBe(false);
  });

  test("un plein gagnant rend 36 fois la mise", () => {
    expect(
      rouletteReturn(
        [
          { kind: "straight", selection: "17", amount: 10 },
          { kind: "color", selection: "red", amount: 25 },
          { kind: "column", selection: "2", amount: 5 },
        ],
        17,
      ),
    ).toBe(360 + 0 + 15);
  });

  test("la table partagée tire un seul numéro pour tous les joueurs", () => {
    const table = new RouletteTable("MINUIT", undefined, () => 17);
    const alice = player("alice");
    const bob = player("bob");
    table.join(alice);
    table.join(bob);
    table.command("alice", {
      type: "bets",
      bets: [
        { kind: "straight", selection: "17", amount: 10 },
        { kind: "straight", selection: "17", amount: 5 },
      ],
    });
    table.command("bob", {
      type: "bets",
      // 17 is black.
      bets: [{ kind: "color", selection: "red", amount: 50 }],
    });
    // Bob sees Alice's chips before the spin.
    expect(table.snapshot().players[0].bets).toEqual([
      { kind: "straight", selection: "17", amount: 15 },
    ]);
    table.command("alice", { type: "ready", ready: true });
    const now = Date.now();
    table.tick(now);
    expect(table.snapshot().deadline).toBeGreaterThan(now);
    table.command("bob", { type: "ready", ready: true });

    table.tick(now + 3_100);
    expect(table.snapshot().phase).toBe("spinning");
    // Stakes leave the wallets when the ball is launched…
    expect(alice.balance).toBe(985);
    expect(bob.balance).toBe(950);
    expect(() => table.command("alice", { type: "bets", bets: [] })).toThrow();

    // …and winnings arrive when it lands.
    table.tick(now + 3_100 + ROULETTE_SPIN_MS + 10);
    const state = table.snapshot();
    expect(state.phase).toBe("settled");
    expect(state.number).toBe(17);
    expect(alice.balance).toBe(985 + 15 * 36);
    expect(bob.balance).toBe(950);
    expect(state.results.map((entry) => entry.net)).toEqual([525, -50]);
  });

  test("un joueur non prêt ne joue pas et garde ses crédits", () => {
    const table = new RouletteTable("LUNA", undefined, () => 0);
    const alice = player("alice");
    const bob = player("bob");
    table.join(alice);
    table.join(bob);
    table.command("alice", {
      type: "bets",
      bets: [{ kind: "color", selection: "red", amount: 25 }],
    });
    table.command("bob", {
      type: "bets",
      bets: [{ kind: "color", selection: "red", amount: 25 }],
    });
    table.command("alice", { type: "ready", ready: true });
    const now = Date.now();
    // Bob still gets ten seconds to finish his layout.
    table.tick(now + 9_000);
    expect(table.snapshot().phase).toBe("betting");
    table.tick(now + 10_100);
    expect(table.snapshot().phase).toBe("spinning");
    expect(alice.balance).toBe(975);
    expect(bob.balance).toBe(1_000);
    expect(table.snapshot().players[1].bets).toEqual([]);
  });

  test("les mises invalides ou trop élevées sont refusées", () => {
    const table = new RouletteTable("NOVA");
    table.join(player("alice", 100));
    const bets = (value: unknown) =>
      table.command("alice", { type: "bets", bets: value as never });
    expect(() =>
      bets([{ kind: "straight", selection: "37", amount: 5 }]),
    ).toThrow();
    expect(() =>
      bets([{ kind: "color", selection: "red", amount: 7 }]),
    ).toThrow();
    expect(() =>
      bets([{ kind: "color", selection: "red", amount: 200 }]),
    ).toThrow("crédits");
    expect(() =>
      table.command("alice", { type: "ready", ready: true }),
    ).toThrow();
  });
});
