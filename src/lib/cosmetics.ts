/**
 * Catalogue of the cosmetic items a player can unlock. The parrainage items
 * have no artwork yet: the catalogue records them, the game unlocks them, and
 * the profile shows them as "à venir" until the assets land.
 */

export type CosmeticKind = "card-skin" | "profile-icon";

export type CosmeticId = "card-skin:parrainage" | "profile-icon:parrainage";

export type Cosmetic = {
  readonly id: CosmeticId;
  readonly kind: CosmeticKind;
  readonly name: string;
  readonly description: string;
  /** False while the item is unlockable but not drawn yet. */
  readonly wearable: boolean;
};

export const COSMETIC_KIND_LABELS: Record<CosmeticKind, string> = {
  "card-skin": "Dos de carte",
  "profile-icon": "Icône de profil",
};

export const COSMETICS: Record<CosmeticId, Cosmetic> = {
  "card-skin:parrainage": {
    id: "card-skin:parrainage",
    kind: "card-skin",
    name: "Dos Parrainage",
    description: "Le dos de carte réservé aux joueurs venus par un parrain.",
    wearable: false,
  },
  "profile-icon:parrainage": {
    id: "profile-icon:parrainage",
    kind: "profile-icon",
    name: "Icône Parrainage",
    description: "L’insigne qui marque les membres du cercle de parrainage.",
    wearable: false,
  },
};

/** Unlocked by the filleul on sign-up, and by the parrain at the first tier. */
export const PARRAINAGE_COSMETICS: readonly CosmeticId[] = [
  "card-skin:parrainage",
  "profile-icon:parrainage",
];

export function isCosmeticId(value: string): value is CosmeticId {
  return value in COSMETICS;
}

/** How a player came to own an item, kept for the profile wording. */
export type CosmeticSource = "parrainage-filleul" | "parrainage-parrain";

export type OwnedCosmetic = {
  id: CosmeticId;
  source: CosmeticSource;
  /** ISO date. */
  unlockedAt: string;
};
