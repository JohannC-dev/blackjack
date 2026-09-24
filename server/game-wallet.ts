export type WalletGame =
  | "blackjack"
  | "poker"
  | "tower"
  | "mines"
  | "roulette"
  | "plinko"
  | (string & {});

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

export type GameResult = {
  readonly userId: string;
  readonly game: WalletGame;
  /** Stable identifier of the completed hand, round, run or poker entry. */
  readonly playId: string;
  /** Final result of that play in credits, including its wagers. */
  readonly net: number;
  /**
   * Nets of the plays this result closes at once, when a game settles several
   * in one go (a Plinko salvo): one ledger row for all of them, while the
   * stats still count, and rank, each play. They add up to `net`.
   */
  readonly plays?: readonly number[];
};

export interface GameWallet {
  balance(account: WalletAccount): number;
  debit(account: WalletAccount, change: WalletChange): void;
  credit(account: WalletAccount, change: WalletChange): void;
  recordGameResult(result: GameResult): void;
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

  recordGameResult(_result: GameResult) {}
}

export const inMemoryGameWallet = new InMemoryGameWallet();

export class RecordingGameWallet extends InMemoryGameWallet {
  private pending: WalletOperation[] | null = null;
  private pendingResults: GameResult[] = [];
  private operationIds = new Set<string>();
  private resultIds = new Set<string>();

  begin() {
    if (this.pending)
      throw new Error("Une opération financière est déjà ouverte.");
    this.pending = [];
    this.pendingResults = [];
    this.operationIds.clear();
    this.resultIds.clear();
  }

  operations() {
    if (!this.pending) throw new Error("Aucune opération financière ouverte.");
    return [...this.pending];
  }

  gameResults() {
    if (!this.pending) throw new Error("Aucune opération financière ouverte.");
    return [...this.pendingResults];
  }

  complete() {
    this.pending = null;
    this.pendingResults = [];
    this.operationIds.clear();
    this.resultIds.clear();
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

  override recordGameResult(result: GameResult) {
    if (!this.pending)
      throw new Error("Le résultat du jeu est hors transaction.");
    if (!result.playId || !Number.isSafeInteger(Math.round(result.net * 100)))
      throw new Error("Résultat de jeu invalide.");
    if (
      result.plays &&
      (!result.plays.length ||
        result.plays.some(
          (net) => !Number.isSafeInteger(Math.round(net * 100)),
        ) ||
        Math.round(
          result.plays.reduce((total, net) => total + net, 0) * 100,
        ) !== Math.round(result.net * 100))
    )
      throw new Error("Résultat de jeu invalide.");
    const key = `${result.userId}\0${result.game}\0${result.playId}`;
    if (this.resultIds.has(key))
      throw new Error("Résultat de jeu dupliqué dans la transaction.");
    this.resultIds.add(key);
    this.pendingResults.push(result);
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
