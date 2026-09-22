import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { MinesGame } from "../server/mines";
import { minesForTarget, minesMultiplier, minesPayout } from "../src/lib/mines";

describe("Jeu de la mine", () => {
  test("le multiplicateur augmente avec chaque diamant et garde la marge maison", () => {
    expect(minesMultiplier(9, 1)).toBe(1.5);
    expect(minesMultiplier(9, 2)).toBe(2.4);
    expect(minesPayout(100, 2.4)).toBe(240);
  });

  test("les positions restent masquées pendant une manche active", () => {
    const game = new MinesGame();
    const player = { id: randomUUID(), balance: 1_000 };
    game.start(player, 100, 200);
    const state = game.snapshot();

    expect(player.balance).toBe(900);
    expect(state.phase).toBe("playing");
    expect(state.mineCount).toBe(minesForTarget(200));
    expect(state.cells.every((cell) => cell.status === "hidden")).toBe(true);
  });

  test("un encaissement recrédite le joueur sans exposer les positions avant", () => {
    let game = new MinesGame();
    const player = { id: randomUUID(), balance: 1_000 };

    // Keep the test deterministic at the behavior level while allowing the
    // cryptographic draw to choose the actual first safe tile.
    for (let attempt = 0; attempt < 20; attempt++) {
      game = new MinesGame();
      game.start(player, 100, 110);
      game.reveal(player, 0);
      if (game.snapshot().phase === "playing") break;
    }

    expect(game.snapshot().phase).toBe("playing");
    const beforeCashout = player.balance;
    game.cashout(player);
    const state = game.snapshot();
    expect(state.phase).toBe("cashed");
    expect(state.payout).toBeGreaterThan(0);
    expect(player.balance).toBe(beforeCashout + state.payout);
    expect(state.cells.some((cell) => cell.status === "mine")).toBe(true);
  });

  test("une mine clôt la manche et perd la mise", () => {
    const player = { id: randomUUID(), balance: 1_000 };
    let game = new MinesGame();
    let state = game.snapshot();

    for (let attempt = 0; attempt < 20; attempt++) {
      game = new MinesGame();
      game.start(player, 100, 1000);
      for (let index = 0; index < 25; index++) {
        game.reveal(player, index);
        state = game.snapshot();
        if (state.phase !== "playing") break;
      }
      if (state.phase === "lost") break;
    }

    expect(state.phase).toBe("lost");
    expect(state.payout).toBe(0);
    expect(state.net).toBe(-100);
  });

  test("un pattern révèle toutes ses cases en une commande et encaisse", () => {
    const player = { id: randomUUID(), balance: 100_000 };
    let game = new MinesGame();
    let state = game.snapshot();
    let publishes = 0;

    for (let attempt = 0; attempt < 20; attempt++) {
      publishes = 0;
      game = new MinesGame(() => publishes++);
      game.playPattern(player, 100, 110, [0]);
      state = game.snapshot();
      if (state.phase === "cashed") {
        expect(publishes).toBe(1);
        break;
      }
    }

    expect(state.phase).toBe("cashed");
    expect(state.revealedCount).toBe(1);
    expect(state.cells[0]?.status).toBe("diamond");
    expect(state.payout).toBeGreaterThan(0);
  });
});
