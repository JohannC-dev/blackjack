import { describe, expect, test } from "bun:test";
import { refillBalance } from "../src/lib/wallet";

describe("recave du portefeuille commun", () => {
  test("remplace le solde sous 5 000 par 10 000", () => {
    expect(refillBalance(0)).toBe(10_000);
    expect(refillBalance(4_999.5)).toBe(10_000);
  });

  test("refuse la recave à partir de 5 000", () => {
    expect(() => refillBalance(5_000)).toThrow("sous 5 000");
    expect(() => refillBalance(10_000)).toThrow("sous 5 000");
  });
});
