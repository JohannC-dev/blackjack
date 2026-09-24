/**
 * Shared vocabulary of the daily streak and the Lucky Wheel, used by the
 * server and the client. A club day runs from 08:00 to 08:00, Paris time.
 */

import type { CosmeticRarity } from "./cosmetics";

export const DAILY_TIME_ZONE = "Europe/Paris";
export const DAILY_RESET_HOUR = 8;

/** A day key, "YYYY-MM-DD": the Paris date on which the club day started. */
export type DayKey = string;

const parisParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: DAILY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function wallClock(ms: number) {
  const parts: Record<string, number> = {};
  for (const part of parisParts.formatToParts(ms))
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  return parts as {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
}

function keyOf(utcMidnight: number): DayKey {
  return new Date(utcMidnight).toISOString().slice(0, 10);
}

function midnightOf(day: DayKey) {
  return Date.parse(day + "T00:00:00Z");
}

/** The club day a moment belongs to. */
export function dayKeyAt(ms: number): DayKey {
  const clock = wallClock(ms);
  const date = Date.UTC(clock.year, clock.month - 1, clock.day);
  return keyOf(clock.hour < DAILY_RESET_HOUR ? date - 24 * 60 * 60_000 : date);
}

export function addDays(day: DayKey, days: number): DayKey {
  return keyOf(midnightOf(day) + days * 24 * 60 * 60_000);
}

/** Whole days from `from` to `to`. */
export function daysBetween(from: DayKey, to: DayKey) {
  return Math.round((midnightOf(to) - midnightOf(from)) / (24 * 60 * 60_000));
}

/** The moment a club day starts: 08:00 in Paris, whatever the offset. */
export function dayStartsAt(day: DayKey) {
  const [year, month, date] = day.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const wall = Date.UTC(year, month - 1, date, DAILY_RESET_HOUR);
  // Paris is ahead of UTC: the offset read at the guess is the right one, as
  // 08:00 never falls on a clock change.
  const clock = wallClock(wall);
  const offset =
    Date.UTC(
      clock.year,
      clock.month - 1,
      clock.day,
      clock.hour,
      clock.minute,
      clock.second,
    ) - wall;
  return wall - offset;
}

/** When the club day holding `ms` ends. */
export function nextResetAt(ms: number) {
  return dayStartsAt(addDays(dayKeyAt(ms), 1));
}

/** Credits given for a streak skin the player already owns. */
export const SKIN_CONVERSION: Record<CosmeticRarity, number> = {
  common: 100_000,
  rare: 250_000,
  epic: 500_000,
  legendary: 1_000_000,
  exclusive: 300_000,
};

export const STREAK_COSMETICS = {
  20: "profile-icon:serie-flamme",
  40: "card-back:serie-braise",
  50: "mine-gem:serie-brasier",
} as const satisfies Record<number, string>;

/** Milestones from which the wheel grows instead of paying credits. */
const WHEEL_RAMP_FROM = 70;
const WHEEL_RAMP_TO = 250;
export const WHEEL_MAX_MULTIPLIER = 4;

export type StreakMilestone = {
  readonly day: number;
  readonly credits: number;
  readonly cosmeticId: string | null;
  /** Wheel multiplier reached at this milestone, when it raises it. */
  readonly wheelMultiplier: number | null;
};

/** What a streak pays on the given day, or null on an ordinary day. */
export function milestoneAt(day: number): StreakMilestone | null {
  if (day <= 0 || day % 10) return null;
  const cosmeticId =
    STREAK_COSMETICS[day as keyof typeof STREAK_COSMETICS] ?? null;
  const credits =
    day === 10
      ? 250_000
      : day === 30
        ? 500_000
        : day === 50 || day === 60
          ? 1_000_000
          : day > WHEEL_RAMP_TO
            ? 2_000_000
            : 0;
  const ramps = day >= WHEEL_RAMP_FROM && day <= WHEEL_RAMP_TO;
  return {
    day,
    credits,
    cosmeticId,
    wheelMultiplier: ramps ? wheelMultiplierFor(day) : null,
  };
}

/** The next `count` milestones strictly after the given streak. */
export function upcomingMilestones(streak: number, count = 3) {
  const milestones: StreakMilestone[] = [];
  for (
    let day = (Math.floor(streak / 10) + 1) * 10;
    milestones.length < count;
    day += 10
  )
    milestones.push(milestoneAt(day)!);
  return milestones;
}

/**
 * The wheel grows linearly from day 70 to ×4 on day 250, one step per ten
 * days, and keeps ×4 afterwards. A lost streak brings it back to ×1.
 */
export function wheelMultiplierFor(streak: number) {
  const decades = Math.floor(Math.max(0, streak) / 10);
  const first = WHEEL_RAMP_FROM / 10;
  const last = WHEEL_RAMP_TO / 10;
  if (decades < first) return 1;
  if (decades >= last) return WHEEL_MAX_MULTIPLIER;
  const step = (WHEEL_MAX_MULTIPLIER - 1) / (last - first + 1);
  return Math.round((1 + step * (decades - first + 1)) * 100) / 100;
}

export type WheelSegment = {
  readonly amount: number;
  /** Chances out of 1000. */
  readonly weight: number;
};

/** In the order they are drawn around the wheel, clockwise from the top. */
export const WHEEL_SEGMENTS: readonly WheelSegment[] = [
  { amount: 5_000, weight: 300 },
  { amount: 50_000, weight: 80 },
  { amount: 10_000, weight: 250 },
  { amount: 250_000, weight: 15 },
  { amount: 20_000, weight: 180 },
  { amount: 100_000, weight: 50 },
  { amount: 35_000, weight: 120 },
  { amount: 1_000_000, weight: 5 },
];

export const WHEEL_TOTAL_WEIGHT = WHEEL_SEGMENTS.reduce(
  (total, segment) => total + segment.weight,
  0,
);

/** The segment a roll in [0, WHEEL_TOTAL_WEIGHT) lands on. */
export function wheelSegmentFor(roll: number) {
  let left = roll;
  for (const [index, segment] of WHEEL_SEGMENTS.entries()) {
    if (left < segment.weight) return index;
    left -= segment.weight;
  }
  return WHEEL_SEGMENTS.length - 1;
}

/** Time the wheel turns before the prize is shown. */
export const WHEEL_SPIN_MS = 5_500;

export type DailyStatus = {
  /** Consecutive club days, 0 once a day was missed. */
  streak: number;
  best: number;
  /** The current club day. */
  day: DayKey;
  /** Epoch ms of the next 08:00 in Paris. */
  nextResetAt: number;
  spinAvailable: boolean;
  wheelMultiplier: number;
};

export type MilestoneReward = {
  day: number;
  credits: number;
  cosmetic: { id: string; name: string } | null;
  /** Credits paid instead of a skin already owned. */
  converted: number;
  wheelMultiplier: number | null;
};

/** What a check-in changed, for the toasts. */
export type DailyCheckIn = {
  /** True on the first connection of the club day. */
  counted: boolean;
  /** Length of the streak that was just lost, 0 when none was. */
  lost: number;
  milestone: MilestoneReward | null;
};

export type DailyUpdate = { status: DailyStatus; checkIn: DailyCheckIn | null };

export type DailySpin = {
  segment: number;
  multiplier: number;
  amount: number;
  status: DailyStatus;
};
