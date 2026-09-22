export type WalletGame =
  "blackjack" | "poker" | "tower" | "mines" | "roulette" | (string & {});

export type WalletOperationKind =
  | "wager"
  | "additional-wager"
  | "payout"
  | "refund"
  | "buy-in"
  | "cashout"
  | "prize"
  | "grant";

export type WalletAccount = {
  readonly id: string;
  balance: number;
};

export type WalletChange = {
  readonly operationId: string;
  readonly game: WalletGame;
  readonly kind: WalletOperationKind;
  readonly reason: string;
  readonly referenceId: string;
  readonly amount: number;
  readonly metadata?: Record<string, unknown>;
};

export type WalletOperation = Omit<WalletChange, "amount"> & {
  readonly userId: string;
  readonly delta: number;
};

export interface GameWallet {
  balance(account: WalletAccount): number;
  debit(account: WalletAccount, change: WalletChange): void;
  credit(account: WalletAccount, change: WalletChange): void;
}

function validateAmount(amount: number) {
  if (!Number.isSafeInteger(amount * 100) || amount <= 0)
    throw new Error("Montant de portefeuille invalide.");
}

export class InMemoryGameWallet implements GameWallet {
  balance(account: WalletAccount) {
    return account.balance;
  }

  debit(account: WalletAccount, change: WalletChange) {
    validateAmount(change.amount);
    if (account.balance < change.amount)
      throw new Error("Votre solde est insuffisant.");
    account.balance -= change.amount;
  }

  credit(account: WalletAccount, change: WalletChange) {
    validateAmount(change.amount);
    account.balance += change.amount;
  }
}

export const inMemoryGameWallet = new InMemoryGameWallet();

export class RecordingGameWallet extends InMemoryGameWallet {
  private pending: WalletOperation[] | null = null;
  private operationIds = new Set<string>();

  begin() {
    if (this.pending)
      throw new Error("Une opération financière est déjà ouverte.");
    this.pending = [];
    this.operationIds.clear();
  }

  operations() {
    if (!this.pending) throw new Error("Aucune opération financière ouverte.");
    return [...this.pending];
  }

  complete() {
    this.pending = null;
    this.operationIds.clear();
  }

  rollback(resolve: (userId: string) => WalletAccount | undefined) {
    if (!this.pending) return;
    for (const operation of this.pending.toReversed()) {
      const account = resolve(operation.userId);
      if (account) account.balance -= operation.delta;
    }
    this.complete();
  }

  override debit(account: WalletAccount, change: WalletChange) {
    this.assertCanRecord(change.operationId);
    super.debit(account, change);
    this.record(account, change, -change.amount);
  }

  override credit(account: WalletAccount, change: WalletChange) {
    this.assertCanRecord(change.operationId);
    super.credit(account, change);
    this.record(account, change, change.amount);
  }

  private assertCanRecord(operationId: string) {
    if (!this.pending)
      throw new Error("La mutation du portefeuille est hors transaction.");
    if (this.operationIds.has(operationId))
      throw new Error("Identifiant d’opération de portefeuille dupliqué.");
  }

  private record(account: WalletAccount, change: WalletChange, delta: number) {
    this.operationIds.add(change.operationId);
    this.pending!.push({
      operationId: change.operationId,
      userId: account.id,
      delta,
      game: change.game,
      kind: change.kind,
      reason: change.reason,
      referenceId: change.referenceId,
      metadata: change.metadata,
    });
  }
}
