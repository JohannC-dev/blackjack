/**
 * Shared vocabulary of the skins (docs/adr/0003-skins.md). The catalogue and
 * the pictures live in the database; the code only knows the kinds, because
 * it draws each of them, and the Classique every kind falls back to.
 */

export const COSMETIC_KINDS = [
  "card-back",
  "profile-icon",
  "chicken",
  "mine-gem",
] as const;

export type CosmeticKind = (typeof COSMETIC_KINDS)[number];

export const COSMETIC_KIND_LABELS: Record<CosmeticKind, string> = {
  "card-back": "Dos de carte",
  "profile-icon": "Icône de profil",
  chicken: "Poulet",
  "mine-gem": "Diamant",
};

export function isCosmeticKind(value: unknown): value is CosmeticKind {
  return COSMETIC_KINDS.includes(value as CosmeticKind);
}

/**
 * The first four say what an item is worth; "exclusive" says it is never
 * sold, only earned (parrainage, events).
 */
export const COSMETIC_RARITIES = [
  "common",
  "rare",
  "epic",
  "legendary",
  "exclusive",
] as const;

export type CosmeticRarity = (typeof COSMETIC_RARITIES)[number];

export const COSMETIC_RARITY_LABELS: Record<CosmeticRarity, string> = {
  common: "Commun",
  rare: "Rare",
  epic: "Épique",
  legendary: "Légendaire",
  exclusive: "Exclusif",
};

/** draft: hidden; active: listed to everyone; retired: kept by its owners. */
export type CosmeticStatus = "draft" | "active" | "retired";

/** How a player came to own an item, kept for the collection wording. */
export type CosmeticSource =
  "parrainage-filleul" | "parrainage-parrain" | "grant" | "purchase";

export const COSMETIC_SOURCE_LABELS: Record<CosmeticSource, string> = {
  "parrainage-filleul": "Reçu en tant que filleul",
  "parrainage-parrain": "Reçu au premier palier de parrainage",
  grant: "Offert par le club",
  purchase: "Acheté",
};

/** Unlocked by the filleul on sign-up, and by the parrain at the first tier. */
export const PARRAINAGE_COSMETICS: readonly string[] = [
  "card-skin:parrainage",
  "profile-icon:parrainage",
];

/** One item of the collection, as the player sees it. */
export type CollectionItem = {
  id: string;
  kind: CosmeticKind;
  name: string;
  description: string;
  rarity: CosmeticRarity;
  unlockHint: string | null;
  /** Null while the item has no picture yet: it cannot be worn. */
  asset: string | null;
  /** Null when the player does not own it. */
  owned: { source: CosmeticSource; unlockedAt: string } | null;
  equipped: boolean;
  /** Still owned, but no longer obtainable. */
  retired: boolean;
};

export type Collection = { items: CollectionItem[] };

/** Asset URL of each kind a player wears; a missing kind is the Classique. */
export type EquippedSkins = Partial<Record<CosmeticKind, string>>;

/** Equipment of several players, by player id. */
export type EquippedLookup = Record<string, EquippedSkins>;

/** The hash versions the URL, so the picture can be cached forever. */
export function cosmeticAssetUrl(id: string, hash: string) {
  return `/api/cosmetics/${encodeURIComponent(id)}/asset?v=${hash}`;
}

/**
 * The skin drawn on something a player holds: theirs when they wear one,
 * otherwise the viewer's. Shared things (dealer, shoe, board) take the
 * viewer's directly.
 */
export function skinOf(
  owner: EquippedSkins | undefined,
  viewer: EquippedSkins | undefined,
  kind: CosmeticKind,
) {
  return owner?.[kind] ?? viewer?.[kind];
}
