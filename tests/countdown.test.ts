import { describe, expect, test } from "bun:test";
import { remainingSeconds } from "../src/components/ui/countdown";

describe("server-synchronized countdown", () => {
  test("compares the deadline with server time instead of the local clock", () => {
    expect(remainingSeconds(125_000, 90_000, 10_000)).toBe(25);
    expect(remainingSeconds(125_000, 114_501, 10_000)).toBe(1);
    expect(remainingSeconds(125_000, 115_001, 10_000)).toBe(0);
  });

  test("keeps the local-clock behavior when no offset is supplied", () => {
    expect(remainingSeconds(125_000, 100_001)).toBe(25);
    expect(remainingSeconds(125_000, 125_001)).toBe(0);
  });
});
