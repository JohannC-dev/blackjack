import { describe, expect, test } from "bun:test";
import { RecordingGameWallet } from "../server/game-wallet";
import { refillWallet } from "../server/refill";

const wager = {
  operationId: "game:round-1:player:wager",
  game: "example",
  kind: "wager" as const,
  reason: "round-start",
  referenceId: "round-1",
  amount: 25,
  metadata: { level: 2 },
};

describe("GameWallet", () => {
  test("journalise uniquement le complément de la recave", () => {
    const wallet = new RecordingGameWallet();
    const player = { id: "player", balance: 4_000 };

    wallet.begin();
    refillWallet(player, wallet);

    expect(player.balance).toBe(10_000);
    expect(wallet.operations()).toMatchObject([
      {
        userId: "player",
        delta: 6_000,
        game: "casino",
        kind: "grant",
        reason: "refill",
      },
    ]);
  });

  test("enregistre les opérations explicites d’un nouveau jeu", () => {
    const wallet = new RecordingGameWallet();
    const player = { id: "player", balance: 100 };

    wallet.begin();
    wallet.debit(player, wager);
    wallet.credit(player, {
      ...wager,
      operationId: "game:round-1:player:payout",
      kind: "payout",
      reason: "round-win",
      amount: 50,
    });

    expect(player.balance).toBe(125);
    expect(wallet.operations()).toEqual([
      {
        operationId: wager.operationId,
        userId: player.id,
        delta: -25,
        game: "example",
        kind: "wager",
        reason: "round-start",
        referenceId: "round-1",
        metadata: { level: 2 },
      },
      {
        operationId: "game:round-1:player:payout",
        userId: player.id,
        delta: 50,
        game: "example",
        kind: "payout",
        reason: "round-win",
        referenceId: "round-1",
        metadata: { level: 2 },
      },
    ]);
  });

  test("annule le solde projeté si la transaction échoue", () => {
    const wallet = new RecordingGameWallet();
    const player = { id: "player", balance: 100 };

    wallet.begin();
    wallet.debit(player, wager);
    wallet.rollback((id) => (id === player.id ? player : undefined));

    expect(player.balance).toBe(100);
    expect(() => wallet.operations()).toThrow("Aucune opération");
  });

  test("refuse une mutation hors transaction sans toucher au solde", () => {
    const wallet = new RecordingGameWallet();
    const player = { id: "player", balance: 100 };

    expect(() => wallet.debit(player, wager)).toThrow("hors transaction");
    expect(player.balance).toBe(100);
  });

  test("refuse deux écritures avec le même identifiant dans un lot", () => {
    const wallet = new RecordingGameWallet();
    const player = { id: "player", balance: 100 };

    wallet.begin();
    wallet.debit(player, wager);
    expect(() => wallet.credit(player, { ...wager, amount: 10 })).toThrow(
      "dupliqué",
    );
    expect(player.balance).toBe(75);
  });
});
