import { describe, expect, test } from "bun:test";
import {
  WHEEL_SEGMENTS,
  WHEEL_TOTAL_WEIGHT,
  dayKeyAt,
  dayStartsAt,
  milestoneAt,
  nextResetAt,
  upcomingMilestones,
  wheelMultiplierFor,
  wheelSegmentFor,
} from "../src/lib/daily";
import {
  EMPTY_STREAK,
  advanceStreak,
  statusOf,
  type StreakRow,
} from "../server/daily/streak";

const at = (iso: string) => Date.parse(iso);

describe("club day", () => {
  test("starts at 08:00 in Paris, summer and winter", () => {
    // Summer: Paris is UTC+2, so 08:00 is 06:00 UTC.
    expect(dayKeyAt(at("2026-07-10T05:59:59Z"))).toBe("2026-07-09");
    expect(dayKeyAt(at("2026-07-10T06:00:00Z"))).toBe("2026-07-10");
    // Winter: Paris is UTC+1, so 08:00 is 07:00 UTC.
    expect(dayKeyAt(at("2026-01-10T06:59:59Z"))).toBe("2026-01-09");
    expect(dayKeyAt(at("2026-01-10T07:00:00Z"))).toBe("2026-01-10");
  });

  test("crosses midnight and the year within the same day", () => {
    expect(dayKeyAt(at("2026-12-31T23:30:00Z"))).toBe("2026-12-31");
    expect(dayKeyAt(at("2027-01-01T06:30:00Z"))).toBe("2026-12-31");
  });

  test("knows when a day starts and ends across clock changes", () => {
    expect(dayStartsAt("2026-07-10")).toBe(at("2026-07-10T06:00:00Z"));
    expect(dayStartsAt("2026-01-10")).toBe(at("2026-01-10T07:00:00Z"));
    // 29 March 2026: clocks go forward, the day lasts 23 hours.
    expect(nextResetAt(at("2026-03-28T12:00:00Z"))).toBe(
      at("2026-03-29T06:00:00Z"),
    );
    // 25 October 2026: clocks go back, the day lasts 25 hours.
    expect(nextResetAt(at("2026-10-24T12:00:00Z"))).toBe(
      at("2026-10-25T07:00:00Z"),
    );
  });
});

describe("streak", () => {
  const row = (fields: Partial<StreakRow>): StreakRow => ({
    ...EMPTY_STREAK,
    ...fields,
  });

  test("the first day starts a run", () => {
    const next = advanceStreak(EMPTY_STREAK, "2026-09-24");
    expect(next).toEqual({
      row: row({
        current: 1,
        best: 1,
        lastDay: "2026-09-24",
        runStartedDay: "2026-09-24",
      }),
      counted: true,
      lost: 0,
    });
  });

  test("a second connection the same day changes nothing", () => {
    const today = row({ current: 4, best: 4, lastDay: "2026-09-24" });
    expect(advanceStreak(today, "2026-09-24")).toEqual({
      row: today,
      counted: false,
      lost: 0,
    });
  });

  test("the next day extends the run", () => {
    const next = advanceStreak(
      row({
        current: 9,
        best: 9,
        lastDay: "2026-09-23",
        runStartedDay: "2026-09-15",
      }),
      "2026-09-24",
    );
    expect(next.row.current).toBe(10);
    expect(next.row.runStartedDay).toBe("2026-09-15");
    expect(next.lost).toBe(0);
  });

  test("a missed day starts over and keeps the record", () => {
    const next = advanceStreak(
      row({
        current: 14,
        best: 20,
        lastDay: "2026-09-22",
        runStartedDay: "2026-09-09",
      }),
      "2026-09-24",
    );
    expect(next.row).toMatchObject({
      current: 1,
      best: 20,
      runStartedDay: "2026-09-24",
    });
    expect(next.lost).toBe(14);
  });

  test("shows 0 from 08:00 once a day was missed", () => {
    const kept = row({ current: 5, best: 5, lastDay: "2026-09-23" });
    expect(statusOf(kept, at("2026-09-24T12:00:00Z")).streak).toBe(5);
    expect(statusOf(kept, at("2026-09-25T05:59:00Z")).streak).toBe(5);
    expect(statusOf(kept, at("2026-09-25T06:00:00Z")).streak).toBe(0);
  });

  test("offers one spin per club day", () => {
    const spun = row({ lastDay: "2026-09-24", lastSpinDay: "2026-09-24" });
    expect(statusOf(spun, at("2026-09-24T20:00:00Z")).spinAvailable).toBe(
      false,
    );
    expect(statusOf(spun, at("2026-09-25T06:00:00Z")).spinAvailable).toBe(true);
  });
});

describe("milestones", () => {
  test("pay every tenth day only", () => {
    expect(milestoneAt(9)).toBeNull();
    expect(milestoneAt(11)).toBeNull();
    expect(milestoneAt(10)).toMatchObject({ credits: 250_000 });
    expect(milestoneAt(20)).toMatchObject({
      credits: 0,
      cosmeticId: "profile-icon:serie-flamme",
    });
    expect(milestoneAt(30)).toMatchObject({ credits: 500_000 });
    expect(milestoneAt(40)).toMatchObject({
      cosmeticId: "card-back:serie-braise",
    });
    expect(milestoneAt(50)).toMatchObject({
      credits: 1_000_000,
      cosmeticId: "mine-gem:serie-brasier",
    });
    expect(milestoneAt(60)).toMatchObject({
      credits: 1_000_000,
      wheelMultiplier: null,
    });
  });

  test("grow the wheel from day 70 to day 250, then pay 2M", () => {
    expect(milestoneAt(70)).toMatchObject({
      credits: 0,
      wheelMultiplier: 1.16,
    });
    expect(milestoneAt(250)).toMatchObject({ credits: 0, wheelMultiplier: 4 });
    expect(milestoneAt(260)).toMatchObject({
      credits: 2_000_000,
      wheelMultiplier: null,
    });
  });

  test("lists the next three", () => {
    expect(upcomingMilestones(0).map((m) => m.day)).toEqual([10, 20, 30]);
    expect(upcomingMilestones(20).map((m) => m.day)).toEqual([30, 40, 50]);
  });
});

describe("wheel", () => {
  test("multiplier ramps linearly and is capped at ×4", () => {
    expect(wheelMultiplierFor(69)).toBe(1);
    expect(wheelMultiplierFor(70)).toBe(1.16);
    expect(wheelMultiplierFor(100)).toBe(1.63);
    expect(wheelMultiplierFor(249)).toBe(3.84);
    expect(wheelMultiplierFor(250)).toBe(4);
    expect(wheelMultiplierFor(900)).toBe(4);
  });

  test("weights cover exactly one thousand rolls", () => {
    expect(WHEEL_TOTAL_WEIGHT).toBe(1000);
    const hits = WHEEL_SEGMENTS.map(() => 0);
    for (let roll = 0; roll < WHEEL_TOTAL_WEIGHT; roll++)
      hits[wheelSegmentFor(roll)]!++;
    expect(hits).toEqual(WHEEL_SEGMENTS.map((segment) => segment.weight));
  });
});
