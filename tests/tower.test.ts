import { describe, expect, test } from "bun:test";
import {
  TOWER_ABANDON_MS,
  TOWER_GHOST_LINGER_MS,
  TowerManager,
} from "../server/tower";
import {
  TOWER_FLOORS,
  TOWER_JACKPOT_SEED,
  towerLuckyPayout,
  towerMultipliers,
  towerPayout,
} from "../src/lib/tower";
import type { Player } from "../server/engine";
import type { TowerClientState, TowerPublicState } from "../src/lib/types";

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

/** A manager whose randomness is scripted: `lucky` decides the Lucky roll, traps always sit in `trapColumn`. */
function setup({ lucky = false, trapColumn = 0 } = {}) {
  const sent: TowerClientState[] = [];
  const broadcasts: TowerPublicState[] = [];
  const manager = new TowerManager(
    (_, state) => sent.push(state),
    (state) => broadcasts.push(state),
    (max) => (max === 500 ? (lucky ? 0 : 1) : trapColumn % max),
  );
  return { manager, sent, broadcasts };
}

let clock = 1_000_000;
const tick = () => (clock += 1_000);

describe("Tower multipliers", () => {
  test("match the published table", () => {
    expect(towerMultipliers("easy")).toEqual([
      1.2, 1.5, 1.88, 2.34, 2.93, 3.66, 4.58, 5.72, 7.15, 8.94,
    ]);
    expect(towerMultipliers("normal")).toEqual([
      1.28, 1.71, 2.28, 3.03, 4.05, 5.39, 7.19, 9.59, 12.79, 17.05,
    ]);
    expect(towerMultipliers("hard")).toEqual([
      1.44, 2.16, 3.24, 4.86, 7.29, 10.94, 16.4, 24.6, 36.91, 55.36,
    ]);
    expect(towerMultipliers("impossible")).toEqual([
      1.92, 3.84, 7.68, 15.36, 30.72, 61.44, 122.88, 245.76, 491.52, 983.04,
    ]);
  });

  test("payouts round down to half credits", () => {
    expect(towerPayout(5, "easy", 1)).toBe(6);
    expect(towerPayout(5, "normal", 2)).toBe(8.5);
    expect(towerPayout(25, "hard", 0)).toBe(0);
  });
});

describe("Tower climb", () => {
  test("debits the wager, feeds the jackpot and hides the traps", () => {
    const { manager, sent } = setup({ trapColumn: 2 });
    const me = player("1");
    manager.command(
      me,
      { type: "start", difficulty: "hard", bet: 100 },
      tick(),
    );
    expect(me.balance).toBe(9_900);
    expect(manager.jackpot).toBe(TOWER_JACKPOT_SEED + 1);
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
    );
    const me = player("1");
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
    const { manager, sent } = setup({ trapColumn: 0 });
    const me = player("1");
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
    expect(run.payout).toBe(85.5);
    expect(me.balance).toBe(10_000 - 50 + 85.5);
    expect(run.rows.every((row) => row.cells !== null)).toBe(true);
    expect(sent.at(-1)!.history[0]).toMatchObject({ floor: 2, payout: 85.5 });
  });

  test("a trap loses the wager and reveals the whole tower", () => {
    const { manager, sent, broadcasts } = setup({ trapColumn: 1 });
    const me = player("1");
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
    expect(broadcasts.at(-1)!.feed[0]).toMatchObject({
      status: "lost",
      floor: 1,
      name: "Joueur 1",
    });
  });

  test("the tenth floor is cashed automatically", () => {
    const { manager, sent } = setup({ trapColumn: 0 });
    const me = player("1");
    manager.command(me, { type: "start", difficulty: "easy", bet: 10 }, tick());
    for (let floor = 0; floor < TOWER_FLOORS; floor++)
      manager.command(me, { type: "pick", column: 4 }, tick());
    const run = sent.at(-1)!.run!;
    expect(run.status).toBe("topped");
    expect(run.payout).toBe(89);
    expect(me.balance).toBe(10_000 - 10 + 89);
  });

  test("rejects invalid commands", () => {
    const { manager } = setup();
    const me = player("1", 30);
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
  test("has no traps and pays the jackpot share at the top", () => {
    const { manager, sent } = setup({ lucky: true });
    const me = player("1");
    manager.jackpot = 40_000;
    manager.command(
      me,
      { type: "start", difficulty: "impossible", bet: 250 },
      tick(),
    );
    const jackpot = manager.jackpot;
    expect(sent.at(-1)!.run!.lucky).toBe(true);
    expect(() => manager.command(me, { type: "cashout" }, tick())).toThrow(
      "Lucky",
    );
    for (let floor = 0; floor < TOWER_FLOORS; floor++)
      manager.command(me, { type: "pick", column: floor % 2 }, tick());
    const run = sent.at(-1)!.run!;
    expect(run.status).toBe("topped");
    expect(run.rows.flatMap((row) => row.cells)).not.toContain("trap");
    expect(run.rows[0].cells).toEqual(["gold", "gold"]);
    expect(run.payout).toBe(towerLuckyPayout(250, jackpot));
    expect(run.payout).toBe(Math.floor((jackpot / 2) * 2) / 2);
    expect(manager.jackpot).toBe(jackpot - run.payout);
  });

  test("never drains the jackpot below its seed and pays at least 50×", () => {
    const { manager } = setup({ lucky: true });
    const me = player("1");
    manager.command(
      me,
      { type: "start", difficulty: "easy", bet: 500 },
      tick(),
    );
    for (let floor = 0; floor < TOWER_FLOORS; floor++)
      manager.command(me, { type: "pick", column: 0 }, tick());
    expect(manager.jackpot).toBe(TOWER_JACKPOT_SEED);
    expect(towerLuckyPayout(5, TOWER_JACKPOT_SEED)).toBe(250);
  });
});

describe("Tower test mode", () => {
  test("without traps, an ordinary climb always reaches the top", () => {
    const sent: TowerClientState[] = [];
    const manager = new TowerManager(
      (_, state) => sent.push(state),
      () => {},
      (max) => (max === 500 ? 1 : 0),
      500,
      true,
    );
    const me = player("1");
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
    expect(run.payout).toBe(9_830);
  });
});

describe("Tower ghosts and upkeep", () => {
  test("other players see floors and status, never trap positions", () => {
    const { manager, broadcasts } = setup({ trapColumn: 2 });
    const me = player("1");
    manager.command(me, { type: "start", difficulty: "hard", bet: 5 }, tick());
    manager.command(me, { type: "pick", column: 0 }, tick());
    const ghost = broadcasts.at(-1)!.ghosts[0];
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

  test("finished climbs linger briefly as ghosts", () => {
    const { manager, broadcasts } = setup({ trapColumn: 0 });
    const me = player("1");
    manager.command(me, { type: "start", difficulty: "hard", bet: 5 }, tick());
    manager.command(me, { type: "pick", column: 0 }, tick());
    expect(broadcasts.at(-1)!.ghosts[0].status).toBe("lost");
    manager.tick(clock + TOWER_GHOST_LINGER_MS + 1);
    expect(broadcasts.at(-1)!.ghosts).toHaveLength(0);
  });

  test("an abandoned climb is cashed out, or refunded before the first floor", () => {
    const { manager } = setup({ trapColumn: 0 });
    const climber = player("1");
    const idle = player("2");
    manager.command(
      climber,
      { type: "start", difficulty: "normal", bet: 100 },
      tick(),
    );
    manager.command(climber, { type: "pick", column: 1 }, tick());
    manager.command(
      idle,
      { type: "start", difficulty: "normal", bet: 100 },
      tick(),
    );
    for (const entry of [climber, idle]) {
      entry.connected = false;
      entry.lastSeen = clock;
    }
    manager.tick(clock + TOWER_ABANDON_MS + 1);
    expect(climber.balance).toBe(10_000 - 100 + 128);
    expect(idle.balance).toBe(10_000);
  });
});
