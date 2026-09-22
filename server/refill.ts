import { randomUUID } from "node:crypto";
import { REFILL_BALANCE, REFILL_THRESHOLD } from "../src/lib/chips";
import type { GameWallet, WalletAccount } from "./game-wallet";

export function refillWallet(account: WalletAccount, wallet: GameWallet) {
  const balance = wallet.balance(account);
  if (balance >= REFILL_THRESHOLD)
    throw new Error(
      `La recave est disponible sous ${REFILL_THRESHOLD} crédits.`,
    );
  wallet.credit(account, {
    operationId: `casino:${account.id}:refill:${randomUUID()}`,
    game: "casino",
    kind: "grant",
    reason: "refill",
    referenceId: account.id,
    amount: REFILL_BALANCE - balance,
  });
}
