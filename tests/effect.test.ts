import { describe, expect, it } from "bun:test";
import { Either } from "effect";
import { decodeInput, gameEffect, runEffect } from "../server/effect";
import {
  BlackjackCommandSchema,
  JoinSchema,
  MinesCommandSchema,
  TowerCommandSchema,
} from "../server/protocol";

describe("Effect server boundary", () => {
  it("accepts valid command payloads", () => {
    const result = runEffect(
      decodeInput(
        BlackjackCommandSchema,
        { type: "bet", seat: 2, bet: { main: 25, three: 0, pairs: 0 } },
        "Action invalide.",
      ),
    );

    expect(Either.isRight(result)).toBe(true);
  });

  it("keeps Tower and Mines command ranges aligned with the UI", () => {
    const tower = runEffect(
      decodeInput(
        TowerCommandSchema,
        { type: "pick", column: 4 },
        "Action Tower invalide.",
      ),
    );
    const mines = runEffect(
      decodeInput(
        MinesCommandSchema,
        { type: "start", bet: 25, target: 200 },
        "Action Mines invalide.",
      ),
    );

    expect(Either.isRight(tower)).toBe(true);
    expect(Either.isRight(mines)).toBe(true);
    expect(
      Either.isLeft(
        runEffect(
          decodeInput(
            MinesCommandSchema,
            { type: "start", bet: 25, target: 24 },
            "Action Mines invalide.",
          ),
        ),
      ),
    ).toBe(true);
  });

  it("rejects malformed input before it reaches an engine", () => {
    const result = runEffect(
      decodeInput(
        JoinSchema,
        { profile: {}, tableId: "bad" },
        "Profil invalide.",
      ),
    );

    expect(Either.isLeft(result)).toBe(true);
  });

  it("turns synchronous engine failures into typed failures", () => {
    const result = runEffect(
      gameEffect(() => {
        throw new Error("Échec simulé");
      }),
    );

    if (Either.isRight(result)) throw new Error("Expected an Effect failure");
    expect(result.left.message).toBe("Échec simulé");
  });
});
