import { describe, expect, test } from "bun:test";
import {
  TOWER_ABANDON_MS,
  TOWER_GHOST_LINGER_MS,
  TOWER_ROOM_SIZE,
  TowerManager,
} from "../server/tower";
import {
  TOWER_FLOORS,
  TOWER_GOLD_FIRST_FLOOR,
  TOWER_GOLD_LAST_FLOOR,
  TOWER_LUCKY_SHARE,
  towerMultipliers,
  towerPayout,
} from "../src/lib/tower";
import type { Player } from "../server/engine";
import type { TowerClientState, TowerPublicState } from "../src/lib/types";

const LEGACY_BET_LIMITS = { min: 5, max: 500, step: 5 };

const player = (id: string, balance = 10_000): Player => ({
  id,
  token: `00000000-0000-0000-0000-00000000000${id}`,
  name: `Joueur ${id}`,
  balance,
  connected: true,
  ready: false,
  roomId: "MINUIT",
  lastSeen: Date.now(),
});

/**
 * A manager whose randomness is scripted: traps always sit in `trapColumn`,
 * and with `gold` the golden card sits on row 3, right after the trap.
 */
function setup({ gold = false, trapColumn = 0, noTraps = false } = {}) {
  const sent: TowerClientState[] = [];
  const broadcasts: { roomId: string; state: TowerPublicState }[] = [];
  const manager = new TowerManager(
    (_, state) => sent.push(state),
    (roomId, state) => broadcasts.push({ roomId, state }),
    (max) =>
      max === 10_000
        ? gold
          ? 0
          : max - 1
        : max === 4 && gold
          ? 0
          : trapColumn % max,
    noTraps,
    undefined,
    LEGACY_BET_LIMITS,
  );
  /** A player already inside the Tower. */
  const climber = (id: string, balance?: number) => {
    const entry = player(id, balance);
    manager.enter(entry);
    return entry;
  };
  const lastIn = (roomId: string) =>
    broadcasts.findLast((item) => item.roomId === roomId)!.state;
  return { manager, sent, broadcasts, climber, lastIn };
}

let clock = 1_000_000;
const tick = () => (clock += 1_000);

describe("Tower multipliers", () => {
  test("match the values read in MONOPOLY Poker", () => {
    expect(towerMultipliers("impossible").slice(0, 4)).toEqual([
      1.84, 3.67, 7.32, 14.6,
    ]);
    expect(towerMultipliers("hard").slice(0, 4)).toEqual([
      1.37, 2.04, 3.05, 4.57,
    ]);
    expect(towerMultipliers("normal").slice(0, 4)).toEqual([
      1.2, 1.6, 2.12, 2.82,
    ]);
    expect(towerMultipliers("normal").slice(6, 9)).toEqual([6.63, 8.82, 11.7]);
  });

  test("return a bit less the higher the climb", () => {
    for (const [difficulty, cols] of [
      ["easy", 5],
      ["normal", 4],
      ["hard", 3],
      ["impossible", 2],
    ] as const) {
      const returned = towerMultipliers(difficulty).map(
        (multiplier, index) => ((cols - 1) / cols) ** (index + 1) * multiplier,
      );
      expect(returned).toHaveLength(TOWER_FLOORS);
      returned.forEach((share, index) => {
        expect(share).toBeGreaterThan(0.84);
        expect(share + TOWER_LUCKY_SHARE).toBeLessThan(0.96);
        // Cutting to three digits can nudge a floor slightly above the previous one.
        if (index) expect(share).toBeLessThan(returned[index - 1] + 0.005);
      });
    }
  });

  test("payouts round down to half credits", () => {
    expect(towerPayout(5, "easy", 1)).toBe(5.5);
    expect(towerPayout(5, "normal", 2)).toBe(8);
    expect(towerPayout(25, "hard", 0)).toBe(0);
  });
});

describe("Tower climb", () => {
  test("debits the wager and hides the traps", () => {
    const { manager, sent, climber } = setup({ trapColumn: 2 });
    const me = climber("1");
    manager.command(
      me,
      { type: "start", difficulty: "hard", bet: 100 },
      tick(),
    );
    expect(me.balance).toBe(9_900);
    const state = sent.at(-1)!;
    expect(state.run?.cols).toBe(3);
    expect(state.run?.rows.every((row) => row.cells === null)).toBe(true);
    expect(JSON.stringify(state)).not.toContain("traps");
    expect(manager.trapsOf(me.id)).toEqual(Array(TOWER_FLOORS).fill(2));
  });

  test("places exactly one trap per floor", () => {
    const manager = new TowerManager(
      () => {},
      () => {},
      undefined,
      false,
      undefined,
      LEGACY_BET_LIMITS,
    );
    const me = player("1");
    manager.enter(me);
    manager.command(me, { type: "start", difficulty: "easy", bet: 5 }, tick());
    const traps = manager.trapsOf(me.id)!;
    expect(traps).toHaveLength(TOWER_FLOORS);
    for (const trap of traps) {
      expect(Number.isInteger(trap)).toBe(true);
      expect(trap).toBeGreaterThanOrEqual(0);
      expect(trap).toBeLessThan(5);
    }
  });

  test("safe picks climb and cashing out pays the floor multiplier", () => {
    const { manager, sent, climber } = setup({ trapColumn: 0 });
    const me = climber("1");
    manager.command(
      me,
      { type: "start", difficulty: "normal", bet: 50 },
      tick(),
    );
    manager.command(me, { type: "pick", column: 1 }, tick());
    manager.command(me, { type: "pick", column: 3 }, tick());
    const climbing = sent.at(-1)!.run!;
    expect(climbing.floor).toBe(2);
    expect(climbing.rows[0].cells).toEqual(["trap", "safe", "safe", "safe"]);
    expect(climbing.rows[2].cells).toBeNull();
    manager.command(me, { type: "cashout" }, tick());
    const run = sent.at(-1)!.run!;
    expect(run.status).toBe("cashed");
    expect(run.payout).toBe(80);
    expect(me.balance).toBe(10_000 - 50 + 80);
    expect(run.rows.every((row) => row.cells !== null)).toBe(true);
  });

  test("a trap loses the wager and reveals the whole tower", () => {
    const { manager, sent, climber, lastIn } = setup({ trapColumn: 1 });
    const me = climber("1");
    manager.command(
      me,
      { type: "start", difficulty: "impossible", bet: 20 },
      tick(),
    );
    manager.command(me, { type: "pick", column: 0 }, tick());
    manager.command(me, { type: "pick", column: 1 }, tick());
    const run = sent.at(-1)!.run!;
    expect(run.status).toBe("lost");
    expect(run.floor).toBe(1);
    expect(run.payout).toBe(0);
    expect(me.balance).toBe(9_980);
    expect(run.rows.every((row) => row.cells !== null)).toBe(true);
    expect(lastIn(manager.roomIdOf(me.id)!).feed[0]).toMatchObject({
      status: "lost",
      floor: 1,
      name: "Joueur 1",
    });
  });

  test("the tenth floor is cashed automatically", () => {
    const { manager, sent, climber } = setup({ trapColumn: 0 });
    const me = climber("1");
    manager.command(me, { type: "start", difficulty: "easy", bet: 10 }, tick());
    for (let floor = 0; floor < TOWER_FLOORS; floor++)
      manager.command(me, { type: "pick", column: 4 }, tick());
    const run = sent.at(-1)!.run!;
    expect(run.status).toBe("topped");
    expect(run.payout).toBe(78.5);
    expect(me.balance).toBe(10_000 - 10 + 78.5);
  });

  test("rejects invalid commands", () => {
    const { manager, climber } = setup();
    const outside = player("9");
    expect(() =>
      manager.command(
        outside,
        { type: "start", difficulty: "easy", bet: 5 },
        tick(),
      ),
    ).toThrow("Ouvrez la Tower");
    const me = climber("1", 30);
    const start = (bet: number, difficulty = "normal") =>
      manager.command(
        me,
        { type: "start", difficulty: difficulty as "normal", bet },
        tick(),
      );
    expect(() => start(3)).toThrow("La mise");
    expect(() => start(12)).toThrow("La mise");
    expect(() => start(505)).toThrow("La mise");
    expect(() => start(25, "legendary")).toThrow("difficulté");
    expect(() => start(35)).toThrow("insuffisant");
    expect(() =>
      manager.command(me, { type: "pick", column: 0 }, tick()),
    ).toThrow("Aucune ascension");
    start(10);
    expect(() => start(10)).toThrow("en cours");
    expect(() => manager.command(me, { type: "cashout" }, tick())).toThrow(
      "au moins un étage",
    );
    expect(() =>
      manager.command(me, { type: "pick", column: 4 }, tick()),
    ).toThrow("n’existe pas");
    manager.command(me, { type: "pick", column: 1 }, clock);
    expect(() =>
      manager.command(me, { type: "pick", column: 1 }, clock + 10),
    ).toThrow("Un instant");
    expect(me.balance).toBe(20);
  });
});

describe("Lucky Tower", () => {
  test("a hidden golden card sits on rows 3 to 6, never on the trap", () => {
    const { manager, sent, climber } = setup({ gold: true, trapColumn: 0 });
    const me = climber("1");
    manager.command(me, { type: "start", difficulty: "easy", bet: 10 }, tick());
    expect(manager.goldOf(me.id)).toEqual({ floor: 2, column: 1 });
    expect(JSON.stringify(sent.at(-1))).not.toContain("gold");
    for (let draw = 0; draw < 200; draw++) {
      const manager = new TowerManager(
        () => {},
        () => {},
        (max) => (max === 10_000 ? 0 : Math.floor(Math.random() * max)),
        false,
        undefined,
        LEGACY_BET_LIMITS,
      );
      const other = player("2");
      manager.enter(other);
      manager.command(
        other,
        { type: "start", difficulty: "hard", bet: 5 },
        tick(),
      );
      const gold = manager.goldOf(other.id)!;
      expect(gold.floor).toBeGreaterThanOrEqual(TOWER_GOLD_FIRST_FLOOR - 1);
      expect(gold.floor).toBeLessThanOrEqual(TOWER_GOLD_LAST_FLOOR - 1);
      expect(gold.column).not.toBe(manager.trapsOf(other.id)![gold.floor]);
      expect(gold.column).toBeLessThan(3);
    }
  });

  test("the pot grows by 3 % of each of the player's own wagers", () => {
    const { manager, sent, climber } = setup({ trapColumn: 0 });
    const me = climber("1");
    const other = climber("2");
    manager.command(
      me,
      { type: "start", difficulty: "easy", bet: 100 },
      tick(),
    );
    manager.command(me, { type: "pick", column: 0 }, tick());
    manager.command(me, { type: "start", difficulty: "easy", bet: 50 }, tick());
    expect(sent.at(-1)!.luckyPot).toBe(4.5);
    manager.command(
      other,
      { type: "start", difficulty: "easy", bet: 500 },
      tick(),
    );
    expect(manager.state(me).luckyPot).toBe(4.5);
    expect(manager.state(other).luckyPot).toBe(15);
  });

  test("the golden card cashes the floor and pays the pot, the rest is only a show", () => {
    const { manager, sent, climber, lastIn } = setup({
      gold: true,
      trapColumn: 0,
    });
    const me = climber("1", 20_000);
    // Charge the pot: 20 climbs of 500 lost on the first card = 300 credits.
    for (let climb = 0; climb < 20; climb++) {
      manager.command(
        me,
        { type: "start", difficulty: "easy", bet: 500 },
        tick(),
      );
      manager.command(me, { type: "pick", column: 0 }, tick());
    }
    manager.command(me, { type: "start", difficulty: "easy", bet: 10 }, tick());
    expect(sent.at(-1)!.luckyPot).toBe(300);
    const before = me.balance;
    manager.command(me, { type: "pick", column: 1 }, tick());
    manager.command(me, { type: "pick", column: 1 }, tick());
    expect(sent.at(-1)!.run!.lucky).toBe(false);
    manager.command(me, { type: "pick", column: 1 }, tick());
    const run = sent.at(-1)!.run!;
    expect(run.lucky).toBe(true);
    expect(run.status).toBe("cashed");
    expect(run.floor).toBe(3);
    expect(run.payout).toBe(towerPayout(10, "easy", 3) + 300);
    expect(me.balance).toBe(before + 17 + 300);
    expect(sent.at(-1)!.luckyPot).toBe(0);
    expect(run.rows[2].cells).toEqual(["trap", "gold", "safe", "safe", "safe"]);
    expect(run.rows[5].cells).toEqual(Array(5).fill("gold"));
    expect(lastIn(manager.roomIdOf(me.id)!).ghosts[0].lucky).toBe(true);
  });

  test("a golden card left behind is revealed with its row", () => {
    const { manager, sent, climber } = setup({ gold: true, trapColumn: 0 });
    const me = climber("1");
    manager.command(me, { type: "start", difficulty: "easy", bet: 10 }, tick());
    for (let floor = 0; floor < 3; floor++)
      manager.command(me, { type: "pick", column: 2 }, tick());
    const run = sent.at(-1)!.run!;
    expect(run.lucky).toBe(false);
    expect(run.status).toBe("playing");
    expect(run.rows[2].cells![1]).toBe("gold");
    expect(run.rows[3].cells).toBeNull();
  });

  test("about one climb in 500 triggers it when picking at random", () => {
    for (const [difficulty, cols] of [
      ["easy", 5],
      ["normal", 4],
      ["hard", 3],
      ["impossible", 2],
    ] as const) {
      const manager = new TowerManager(
        () => {},
        () => {},
        undefined,
        false,
        undefined,
        LEGACY_BET_LIMITS,
      );
      const me = player("1", 1_000_000);
      manager.enter(me);
      const starts = 40_000;
      const floors = new Map<number, number>();
      for (let start = 0; start < starts; start++) {
        manager.command(me, { type: "start", difficulty, bet: 5 }, 0);
        const gold = manager.goldOf(me.id);
        if (gold) floors.set(gold.floor, (floors.get(gold.floor) ?? 0) + 1);
        manager.leave(me, 0);
        manager.enter(me);
      }
      // Reaching row f takes f safe cards, then the golden one is 1 card in cols.
      let triggered = 0;
      for (const [floor, count] of floors)
        triggered += ((count / starts) * ((cols - 1) / cols) ** floor) / cols;
      expect(triggered).toBeGreaterThan(1 / 650);
      expect(triggered).toBeLessThan(1 / 380);
    }
  });
});

describe("Tower test mode", () => {
  test("without traps, an ordinary climb always reaches the top", () => {
    const { manager, sent, climber } = setup({ noTraps: true });
    const me = climber("1");
    manager.command(
      me,
      { type: "start", difficulty: "impossible", bet: 10 },
      tick(),
    );
    for (let floor = 0; floor < TOWER_FLOORS; floor++)
      manager.command(me, { type: "pick", column: 0 }, tick());
    const run = sent.at(-1)!.run!;
    expect(run.lucky).toBe(false);
    expect(run.status).toBe("topped");
    expect(run.payout).toBe(9_190);
  });
});

describe("Tower rooms", () => {
  test("other players see floors and status, never trap positions", () => {
    const { manager, climber, lastIn } = setup({ trapColumn: 2 });
    const me = climber("1");
    manager.command(me, { type: "start", difficulty: "hard", bet: 5 }, tick());
    manager.command(me, { type: "pick", column: 0 }, tick());
    const ghost = lastIn(manager.roomIdOf(me.id)!).ghosts[0];
    expect(ghost).toEqual({
      id: ghost.id,
      playerId: "1",
      name: "Joueur 1",
      difficulty: "hard",
      cols: 3,
      floor: 1,
      status: "playing",
      lucky: false,
      payout: 0,
    });
  });

  test("public updates stay inside a room", () => {
    const { manager, climber, broadcasts } = setup({ trapColumn: 0 });
    const first = Array.from({ length: TOWER_ROOM_SIZE }, (_, index) =>
      climber(`a${index}`),
    );
    const late = climber("b");
    const roomA = manager.roomIdOf(first[0].id)!;
    const roomB = manager.roomIdOf(late.id)!;
    expect(first.every((entry) => manager.roomIdOf(entry.id) === roomA)).toBe(
      true,
    );
    expect(roomB).not.toBe(roomA);
    broadcasts.length = 0;
    manager.command(
      first[0],
      { type: "start", difficulty: "easy", bet: 5 },
      tick(),
    );
    expect(broadcasts.map((item) => item.roomId)).toEqual([roomA]);
    expect(manager.state(late).ghosts).toEqual([]);
  });

  test("finished climbs linger briefly as ghosts", () => {
    const { manager, climber, lastIn } = setup({ trapColumn: 0 });
    const me = climber("1");
    const roomId = manager.roomIdOf(me.id)!;
    manager.command(me, { type: "start", difficulty: "hard", bet: 5 }, tick());
    manager.command(me, { type: "pick", column: 0 }, tick());
    expect(lastIn(roomId).ghosts[0].status).toBe("lost");
    manager.tick(clock + TOWER_GHOST_LINGER_MS + 1);
    expect(lastIn(roomId).ghosts).toHaveLength(0);
  });

  test("leaving the Tower cashes out, or refunds before the first floor", () => {
    const { manager, sent, climber } = setup({ trapColumn: 0 });
    const cashed = climber("1");
    const refunded = climber("2");
    manager.command(
      cashed,
      { type: "start", difficulty: "normal", bet: 100 },
      tick(),
    );
    manager.command(cashed, { type: "pick", column: 1 }, tick());
    manager.command(
      refunded,
      { type: "start", difficulty: "normal", bet: 100 },
      tick(),
    );
    manager.leave(cashed, tick());
    manager.leave(refunded, tick());
    expect(cashed.balance).toBe(10_000 - 100 + 120);
    expect(refunded.balance).toBe(10_000);
    // A refunded wager feeds nothing: the pot cannot be farmed for free.
    expect(manager.state(cashed).luckyPot).toBe(3);
    expect(manager.state(refunded).luckyPot).toBe(0);
    expect(manager.roomIdOf(cashed.id)).toBeUndefined();
    // Nothing of the settled climb comes back with the player.
    manager.enter(cashed);
    expect(sent.at(-1)!.run).toBeNull();
  });

  test("a lost connection keeps the climb until the abandon delay", () => {
    const { manager, sent, climber } = setup({ trapColumn: 0 });
    const me = climber("1");
    manager.command(
      me,
      { type: "start", difficulty: "normal", bet: 100 },
      tick(),
    );
    manager.command(me, { type: "pick", column: 1 }, tick());
    manager.leave(me, clock, { abandon: false });
    manager.tick(clock + TOWER_ABANDON_MS - 1);
    expect(me.balance).toBe(9_900);
    manager.enter(me);
    expect(sent.at(-1)!.run?.status).toBe("playing");
    manager.leave(me, clock, { abandon: false });
    manager.tick(clock + TOWER_ABANDON_MS + 1);
    expect(me.balance).toBe(10_000 - 100 + 120);
  });
});
