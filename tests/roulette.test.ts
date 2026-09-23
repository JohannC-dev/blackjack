import { describe, expect, test } from "bun:test";
import { Clock, Effect, Option } from "effect";
import {
  BettingClosed,
  CannotBeReady,
  InsufficientCredits,
  InvalidBets,
  InvalidCommand,
  makeRouletteRuntime,
  NotShowingRoulette,
  ReadyLocked,
  TableFull,
  UnknownCommand,
  ROULETTE_SPIN_MS,
} from "../server/roulette";
import {
  targetAt,
  zeroTargetAt,
} from "../src/components/games/roulette/roulette-casino";
import {
  isValidRouletteBet,
  rouletteBetWins,
  rouletteReturn,
  ROULETTE_MAX_PER_SPOT,
  ROULETTE_MIN_CHIP,
} from "../src/lib/roulette";
import type { RouletteTableState } from "../src/lib/types";
import { inMemoryGameWallet } from "../server/game-wallet";

const CHIP = ROULETTE_MIN_CHIP;
const MAX_PER_SPOT = ROULETTE_MAX_PER_SPOT;

type Member = {
  id: string;
  name: string;
  balance: number;
  connected: boolean;
  lastSeen: number;
};

/**
 * A Roulette with an in-memory club, a loaded wheel and a clock moved by
 * hand, so a whole round runs synchronously in a test.
 */
function club(draw: () => number = () => 17, tableId = "MINUIT") {
  let now = 1_000_000;
  const clock: Clock.Clock = {
    [Clock.ClockTypeId]: Clock.ClockTypeId,
    unsafeCurrentTimeMillis: () => now,
    currentTimeMillis: Effect.sync(() => now),
    unsafeCurrentTimeNanos: () => BigInt(now) * 1_000_000n,
    currentTimeNanos: Effect.sync(() => BigInt(now) * 1_000_000n),
    sleep: () => Effect.void,
  };
  const members = new Map<string, Member>();
  const published: RouletteTableState[] = [];
  const roulette = makeRouletteRuntime({
    clock,
    wheel: { spin: Effect.sync(draw) },
    players: {
      get: (id) => Effect.sync(() => Option.fromNullable(members.get(id))),
    },
    wallet: inMemoryGameWallet,
    transport: {
      publish: (state) => Effect.sync(() => void published.push(state)),
      enter: () => Effect.void,
      exit: () => Effect.void,
    },
  });
  const sit = (id: string, balance = 1_000_000, socket = `${id}#1`) => {
    const member = members.get(id) ?? {
      id,
      name: id,
      balance,
      connected: true,
      lastSeen: now,
    };
    members.set(id, member);
    roulette.run((r) => r.join(socket, id, tableId));
    return member;
  };
  const send = (id: string, command: unknown, socket = `${id}#1`) =>
    roulette.run((r) => r.command(socket, id, command));
  const state = () => Option.getOrThrow(roulette.run((r) => r.state(tableId)));
  /** Moves the clock and lets the table react. */
  const wait = (ms: number) => {
    now += ms;
    roulette.run((r) => r.tick);
  };
  return { roulette, members, published, sit, send, state, wait };
}

describe("Roulette européenne", () => {
  test("les chevaux et carrés ne relient que des cases voisines", () => {
    const bet = (kind: "split" | "corner", selection: string) =>
      isValidRouletteBet({ kind, selection, amount: CHIP });
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
            isValidRouletteBet({ ...targetAt(number, x, y), amount: CHIP }),
          ).toBe(true);
  });

  test("une case n’a qu’une seule écriture", () => {
    const valid = (kind: "straight" | "split" | "corner", selection: string) =>
      isValidRouletteBet({ kind, selection, amount: CHIP });
    expect(valid("straight", "1")).toBe(true);
    expect(valid("straight", "0")).toBe(true);
    for (const selection of ["01", "00", "1.0", " 1", "+1", "", "1e1", "37"])
      expect(valid("straight", selection)).toBe(false);
    expect(valid("split", "01-02")).toBe(false);
    expect(valid("corner", "01-2-4-5")).toBe(false);
  });

  test("le zéro se joue à cheval avec 1, 2 et 3", () => {
    for (const selection of ["0-1", "0-2", "0-3"]) {
      expect(
        isValidRouletteBet({ kind: "split", selection, amount: CHIP }),
      ).toBe(true);
      expect(rouletteBetWins({ kind: "split", selection }, 0)).toBe(true);
    }
    for (const selection of ["0-4", "1-0", "0-0"])
      expect(
        isValidRouletteBet({ kind: "split", selection, amount: CHIP }),
      ).toBe(false);
    expect(
      rouletteReturn([{ kind: "split", selection: "0-2", amount: 10 }], 2),
    ).toBe(180);
    // Aiming at the line between the zero and the first column.
    expect(targetAt(1, 0.05, 0.5).selection).toBe("0-1");
    expect(targetAt(3, 0.05, 0.05).selection).toBe("0-3");
    expect(zeroTargetAt(0.95, 0.1).selection).toBe("0-3");
    expect(zeroTargetAt(0.95, 0.5).selection).toBe("0-2");
    expect(zeroTargetAt(0.95, 0.9).selection).toBe("0-1");
    expect(zeroTargetAt(0.5, 0.5)).toEqual({
      kind: "straight",
      selection: "0",
    });
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
    const table = club(() => 17);
    const alice = table.sit("alice");
    const bob = table.sit("bob");
    table.send("alice", {
      type: "bets",
      bets: [
        { kind: "straight", selection: "17", amount: CHIP * 2 },
        { kind: "straight", selection: "17", amount: CHIP },
      ],
    });
    table.send("bob", {
      type: "bets",
      // 17 is black.
      bets: [{ kind: "color", selection: "red", amount: CHIP * 10 }],
    });
    // Bob sees Alice's chips before the spin.
    expect(table.state().players[0].bets).toEqual([
      { kind: "straight", selection: "17", amount: CHIP * 3 },
    ]);
    table.send("alice", { type: "ready", ready: true });
    expect(table.state().deadline).not.toBeNull();
    table.send("bob", { type: "ready", ready: true });

    table.wait(3_100);
    expect(table.state().phase).toBe("spinning");
    expect(table.state().number).toBe(17);
    // Stakes leave the wallets when the ball is launched…
    expect(alice.balance).toBe(1_000_000 - CHIP * 3);
    expect(bob.balance).toBe(1_000_000 - CHIP * 10);
    expect(() => table.send("alice", { type: "bets", bets: [] })).toThrow(
      BettingClosed,
    );

    // …and winnings arrive when it lands.
    table.wait(ROULETTE_SPIN_MS + 10);
    const state = table.state();
    expect(state.phase).toBe("settled");
    expect(alice.balance).toBe(1_000_000 - CHIP * 3 + CHIP * 3 * 36);
    expect(bob.balance).toBe(1_000_000 - CHIP * 10);
    expect(state.results.map((entry) => entry.net)).toEqual([
      CHIP * 3 * 35,
      -CHIP * 10,
    ]);
    expect(state.history).toEqual([17]);

    // A single payout, however many ticks follow.
    table.wait(100);
    table.wait(100);
    expect(alice.balance).toBe(1_000_000 - CHIP * 3 + CHIP * 3 * 36);
    table.wait(6_000);
    expect(table.state().phase).toBe("betting");
    expect(table.state().players.every((p) => !p.ready)).toBe(true);
  });

  test("un joueur non prêt ne joue pas et garde ses crédits", () => {
    const table = club(() => 0);
    const alice = table.sit("alice");
    const bob = table.sit("bob");
    table.send("alice", {
      type: "bets",
      bets: [{ kind: "color", selection: "red", amount: CHIP * 5 }],
    });
    table.send("bob", {
      type: "bets",
      bets: [{ kind: "color", selection: "red", amount: CHIP * 5 }],
    });
    table.send("alice", { type: "ready", ready: true });
    // Bob still gets ten seconds to finish his layout.
    table.wait(9_000);
    expect(table.state().phase).toBe("betting");
    table.wait(1_100);
    expect(table.state().phase).toBe("spinning");
    expect(alice.balance).toBe(1_000_000 - CHIP * 5);
    expect(bob.balance).toBe(1_000_000);
    expect(table.state().players[1].bets).toEqual([]);
  });

  test("les mises invalides ou trop élevées sont refusées", () => {
    const table = club();
    table.sit("alice", 100_000);
    const bets = (value: unknown) =>
      table.send("alice", { type: "bets", bets: value });
    expect(() =>
      bets([{ kind: "straight", selection: "37", amount: CHIP }]),
    ).toThrow(InvalidBets);
    expect(() =>
      bets([{ kind: "color", selection: "red", amount: 7 }]),
    ).toThrow(InvalidBets);
    expect(() =>
      bets([{ kind: "color", selection: "red", amount: CHIP * 40 }]),
    ).toThrow("crédits");
    expect(() => bets("rouge")).toThrow("Les mises sont invalides.");
    expect(() =>
      bets([
        {
          kind: "color",
          selection: "red",
          amount: MAX_PER_SPOT + CHIP,
        },
      ]),
    ).toThrow(`limitée à ${MAX_PER_SPOT}`);
    expect(() => table.send("alice", { type: "ready", ready: true })).toThrow(
      CannotBeReady,
    );
    expect(() => table.send("alice", null)).toThrow(InvalidCommand);
    expect(() => table.send("alice", { type: "ready", ready: "oui" })).toThrow(
      InvalidCommand,
    );
    expect(() => table.send("alice", { type: "tricher" })).toThrow(
      UnknownCommand,
    );
    // A refused command leaves the felt untouched.
    expect(table.state().players[0].bets).toEqual([]);
  });

  test("preserves the chips placed on a spot and repeats them", () => {
    const table = club(() => 1);
    table.sit("alice");
    const bet = {
      kind: "dozen" as const,
      selection: "3",
      amount: CHIP * 5,
      chips: [
        { denomination: CHIP, count: 1 },
        { denomination: CHIP * 4, count: 1 },
      ],
    };
    table.send("alice", { type: "bets", bets: [bet] });
    expect(table.state().players[0].bets).toEqual([bet]);
    expect(() =>
      table.send("alice", {
        type: "bets",
        bets: [{ ...bet, chips: [{ denomination: CHIP, count: 1 }] }],
      }),
    ).toThrow(InvalidBets);
    table.send("alice", { type: "ready", ready: true });
    table.wait(3_100);
    table.wait(ROULETTE_SPIN_MS);
    table.wait(6_000);
    table.send("alice", { type: "repeat" });
    expect(table.state().players[0].bets).toEqual([bet]);
  });

  test("le plafond s’applique par case, pas au total", () => {
    const table = club();
    table.sit("alice", MAX_PER_SPOT * 3);
    const layout = [
      { kind: "straight" as const, selection: "17", amount: MAX_PER_SPOT },
      { kind: "color" as const, selection: "red", amount: MAX_PER_SPOT },
      { kind: "dozen" as const, selection: "2", amount: MAX_PER_SPOT },
    ];
    table.send("alice", { type: "bets", bets: layout });
    expect(table.state().players[0].bets).toEqual(layout);
    expect(() =>
      table.send("alice", {
        type: "bets",
        bets: [...layout, { kind: "straight", selection: "17", amount: CHIP }],
      }),
    ).toThrow(`${MAX_PER_SPOT} crédits par case`);
    expect(table.state().players[0].bets).toEqual(layout);
  });

  test("seuls les champs attendus d’une mise sont gardés", () => {
    const table = club();
    table.sit("alice");
    table.send("alice", {
      type: "bets",
      bets: [
        { kind: "split", selection: "0-2", amount: CHIP, payout: 1_000 },
        { kind: "split", selection: "0-2", amount: CHIP * 2 },
      ],
    });
    expect(table.state().players[0].bets).toEqual([
      { kind: "split", selection: "0-2", amount: CHIP * 3 },
    ]);
  });

  test("être prêt fige les mises jusqu’à l’annulation", () => {
    const table = club();
    table.sit("alice");
    const bets = [
      { kind: "color" as const, selection: "red", amount: CHIP * 2 },
    ];
    table.send("alice", { type: "bets", bets });
    table.send("alice", { type: "ready", ready: true });
    expect(() => table.send("alice", { type: "bets", bets })).toThrow(
      ReadyLocked,
    );
    table.send("alice", { type: "ready", ready: false });
    expect(table.state().deadline).toBeNull();
    table.send("alice", { type: "bets", bets: [] });
    expect(table.state().players[0].bets).toEqual([]);
  });

  test("un portefeuille dépensé ailleurs fait sauter le tour", () => {
    const table = club();
    const alice = table.sit("alice", 100_000);
    table.send("alice", {
      type: "bets",
      bets: [{ kind: "color", selection: "red", amount: CHIP * 16 }],
    });
    table.send("alice", { type: "ready", ready: true });
    // Another game spends the credits before the ball leaves.
    alice.balance = 30_000;
    table.wait(3_100);
    expect(table.state().phase).toBe("betting");
    expect(table.state().deadline).toBeNull();
    expect(alice.balance).toBe(30_000);
    expect(table.state().players[0]).toMatchObject({ ready: false, bets: [] });
  });

  test("répéter rejoue la dernière mise jouée", () => {
    const table = club(() => 1);
    const alice = table.sit("alice");
    expect(() => table.send("alice", { type: "repeat" })).toThrow(
      "Aucune mise précédente",
    );
    const bets = [{ kind: "dozen" as const, selection: "3", amount: CHIP * 4 }];
    table.send("alice", { type: "bets", bets });
    table.send("alice", { type: "ready", ready: true });
    table.wait(3_100);
    table.wait(ROULETTE_SPIN_MS);
    table.wait(6_000);
    expect(alice.balance).toBe(1_000_000 - CHIP * 4);
    expect(table.state().players[0].previousTotal).toBe(CHIP * 4);
    table.send("alice", { type: "repeat" });
    expect(table.state().players[0].bets).toEqual(bets);
  });

  test("quitter pendant le tirage est tout de même payé", () => {
    const table = club(() => 17);
    const alice = table.sit("alice");
    table.send("alice", {
      type: "bets",
      bets: [{ kind: "straight", selection: "17", amount: CHIP }],
    });
    table.send("alice", { type: "ready", ready: true });
    table.wait(3_100);
    table.roulette.run((r) => r.leave("alice#1", "alice"));
    expect(table.state().players).toHaveLength(1);
    table.wait(ROULETTE_SPIN_MS);
    expect(alice.balance).toBe(1_000_000 - CHIP + CHIP * 36);
    table.wait(6_000);
    expect(table.state().players).toHaveLength(0);
  });

  test("seule une connexion assise à la roulette peut miser", () => {
    const table = club();
    table.sit("alice");
    table.sit("alice", 1_000_000, "alice#2");
    const bets = [
      { kind: "color" as const, selection: "red", amount: CHIP * 2 },
    ];
    expect(() =>
      table.send("alice", { type: "bets", bets }, "alice#3"),
    ).toThrow(NotShowingRoulette);
    table.send("alice", { type: "bets", bets }, "alice#2");
    // Closing one tab keeps the seat for the other one.
    table.roulette.run((r) => r.leave("alice#2", "alice"));
    expect(table.state().players[0].bets).toEqual(bets);
    table.roulette.run((r) => r.leave("alice#1", "alice"));
    expect(table.state().players).toHaveLength(0);
  });

  test("un joueur déconnecté libère sa place après une minute", () => {
    const table = club();
    const alice = table.sit("alice");
    table.sit("bob");
    table.roulette.run((r) => r.disconnect("alice#1", "alice"));
    alice.connected = false;
    table.wait(30_000);
    expect(table.state().players).toHaveLength(2);
    table.wait(31_000);
    expect(table.state().players.map((p) => p.id)).toEqual(["bob"]);
  });

  test("la table accueille huit joueurs au plus", () => {
    const table = club();
    for (let i = 0; i < 8; i++) table.sit(`p${i}`);
    expect(() => table.sit("p8")).toThrow(TableFull);
    expect(table.state().players).toHaveLength(8);
  });

  test("une roue en panne n’arrête ni le serveur ni les portefeuilles", () => {
    let broken = true;
    const table = club(() => {
      if (broken) throw new Error("roue bloquée");
      return 3;
    });
    const alice = table.sit("alice");
    table.send("alice", {
      type: "bets",
      bets: [{ kind: "color", selection: "red", amount: CHIP * 2 }],
    });
    table.send("alice", { type: "ready", ready: true });
    expect(() => table.wait(3_100)).not.toThrow();
    // Nothing was debited for a spin that never started.
    expect(table.state().phase).toBe("betting");
    expect(alice.balance).toBe(1_000_000);
    broken = false;
    table.wait(100);
    expect(table.state().phase).toBe("spinning");
    expect(alice.balance).toBe(1_000_000 - CHIP * 2);
  });
});
