import { Data } from "effect";

/**
 * Every refusal of the Roulette is a typed error: the compiler lists what each
 * operation can fail with, and the message is the one shown to the player.
 */
export class InvalidCommand extends Data.TaggedError("InvalidCommand") {
  override readonly message = "Action invalide.";
}
export class UnknownCommand extends Data.TaggedError("UnknownCommand") {
  override readonly message = "Action Roulette inconnue.";
}
export class InvalidBets extends Data.TaggedError("InvalidBets")<{
  readonly message: string;
}> {}
export class NotShowingRoulette extends Data.TaggedError("NotShowingRoulette") {
  override readonly message = "Ouvrez la roulette pour jouer.";
}
export class NotAtTable extends Data.TaggedError("NotAtTable") {
  override readonly message = "Rejoignez la table de roulette.";
}
export class NotSeated extends Data.TaggedError("NotSeated") {
  override readonly message = "Rejoignez la table de roulette pour jouer.";
}
export class TableFull extends Data.TaggedError("TableFull") {
  override readonly message = "La table de roulette est complète.";
}
export class TablesExhausted extends Data.TaggedError("TablesExhausted") {
  override readonly message =
    "Toutes les tables sont occupées. Réessayez plus tard.";
}
export class BettingClosed extends Data.TaggedError("BettingClosed") {
  override readonly message = "Rien ne va plus : attendez la prochaine manche.";
}
export class ReadyLocked extends Data.TaggedError("ReadyLocked") {
  override readonly message =
    "Annulez « Je suis prêt » pour modifier vos mises.";
}
export class NothingToRepeat extends Data.TaggedError("NothingToRepeat") {
  override readonly message = "Aucune mise précédente à répéter.";
}
export class CannotBeReady extends Data.TaggedError("CannotBeReady") {
  override readonly message = "Vérifiez vos mises et votre solde.";
}
export class InsufficientCredits extends Data.TaggedError(
  "InsufficientCredits",
) {
  override readonly message = "Vous n’avez pas assez de crédits.";
}

export type CommandError = InvalidCommand | UnknownCommand | InvalidBets;
export type TableError =
  | NotSeated
  | BettingClosed
  | ReadyLocked
  | NothingToRepeat
  | CannotBeReady
  | InsufficientCredits;
export type RouletteError =
  | CommandError
  | TableError
  | NotShowingRoulette
  | NotAtTable
  | TableFull
  | TablesExhausted;
