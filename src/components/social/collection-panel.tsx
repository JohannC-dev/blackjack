"use client";

import { Check, Lock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardBackSkin, PlayingCard } from "@/components/ui/playing-card";
import { SkinImage } from "@/components/ui/skin-image";
import {
  COSMETIC_KINDS,
  COSMETIC_KIND_LABELS,
  COSMETIC_RARITY_LABELS,
  COSMETIC_SOURCE_LABELS,
  type CollectionItem,
  type CosmeticKind,
  type CosmeticRarity,
  type EquippedSkins,
} from "@/lib/cosmetics";
import { cosmeticsApi, rememberEquipped } from "@/lib/cosmetics-api";
import { useProfile } from "@/lib/profile-context";
import { cn } from "@/lib/utils";
import { ChickenArt } from "../games/chicken/chicken-art";
import { MineDiamond } from "../games/mines/mine-art";
import { PlayerAvatar } from "./player-avatar";

type Me = { id: string; name: string } | null;

const RARITY_FRAMES: Record<CosmeticRarity, string> = {
  common: "border-white/[0.08]",
  rare: "border-sky-400/40",
  epic: "border-minuit-purple/60",
  legendary: "border-amber-300/60",
};

const RARITY_TEXT: Record<CosmeticRarity, string> = {
  common: "text-muted-foreground",
  rare: "text-sky-300",
  epic: "text-minuit-purple",
  legendary: "text-amber-200",
};

/** What the collection shows while the player wears nothing of a kind. */
const CLASSIC_DESCRIPTION: Record<CosmeticKind, string> = {
  "card-back": "Le dos violet du club.",
  "profile-icon": "Votre initiale, sur votre couleur.",
  chicken: "Le poulet de minuit d’origine.",
  "mine-gem": "Le diamant d’origine.",
};

/**
 * The skins of the signed-in player, one section per kind: the Classique,
 * what they own, then what they may still unlock. A click wears an item.
 */
export function CollectionPanel() {
  const { profile } = useProfile();
  const me = profile ? { id: profile.token, name: profile.name } : null;
  const [items, setItems] = useState<CollectionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<CosmeticKind | null>(null);

  const load = useCallback(() => {
    setError(null);
    cosmeticsApi.collection().then(
      (collection) => setItems(collection.items),
      (failure: unknown) =>
        setError(
          failure instanceof Error
            ? failure.message
            : "Collection indisponible.",
        ),
    );
  }, []);

  useEffect(load, [load]);

  const equip = async (kind: CosmeticKind, cosmeticId: string | null) => {
    if (!items || saving) return;
    const previous = items;
    setSaving(kind);
    setItems(
      items.map((item) =>
        item.kind === kind
          ? { ...item, equipped: item.id === cosmeticId }
          : item,
      ),
    );
    try {
      const worn: EquippedSkins = await cosmeticsApi.equip(kind, cosmeticId);
      if (me) rememberEquipped(me.id, worn);
    } catch (failure) {
      setItems(previous);
      toast.error(
        failure instanceof Error ? failure.message : "Choix non enregistré.",
      );
    } finally {
      setSaving(null);
    }
  };

  if (error)
    return (
      <div>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={load}>
          Réessayer
        </Button>
      </div>
    );
  if (!items)
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-44 animate-pulse rounded-xl bg-white/[0.03]"
          />
        ))}
      </div>
    );

  return (
    <div className="space-y-8">
      {COSMETIC_KINDS.map((kind) => {
        const ofKind = items.filter((item) => item.kind === kind);
        const owned = ofKind.filter((item) => item.owned);
        const locked = ofKind.filter((item) => !item.owned);
        const classicWorn = !ofKind.some((item) => item.equipped);
        return (
          <section key={kind} aria-labelledby={`collection-${kind}`}>
            <h3
              id={`collection-${kind}`}
              className="mb-3 flex items-baseline gap-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase"
            >
              {COSMETIC_KIND_LABELS[kind]}
              <span className="font-normal tracking-normal normal-case">
                {owned.length + 1} / {ofKind.length + 1}
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile
                kind={kind}
                name="Classique"
                detail={CLASSIC_DESCRIPTION[kind]}
                asset={null}
                me={me}
                worn={classicWorn}
                busy={saving === kind}
                onWear={() => void equip(kind, null)}
              />
              {owned.map((item) => (
                <Tile
                  key={item.id}
                  kind={kind}
                  name={item.name}
                  detail={
                    item.asset
                      ? COSMETIC_SOURCE_LABELS[item.owned!.source]
                      : "Visuel à venir"
                  }
                  rarity={item.rarity}
                  asset={item.asset}
                  me={me}
                  worn={item.equipped}
                  retired={item.retired}
                  soon={!item.asset}
                  busy={saving === kind}
                  onWear={
                    item.asset ? () => void equip(kind, item.id) : undefined
                  }
                />
              ))}
              {locked.map((item) => (
                <Tile
                  key={item.id}
                  kind={kind}
                  name={item.name}
                  detail={item.unlockHint ?? item.description}
                  rarity={item.rarity}
                  asset={item.asset}
                  me={me}
                  locked
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Tile({
  kind,
  name,
  detail,
  rarity,
  asset,
  me,
  worn = false,
  retired = false,
  soon = false,
  locked = false,
  busy = false,
  onWear,
}: {
  kind: CosmeticKind;
  name: string;
  detail: string;
  rarity?: CosmeticRarity;
  asset: string | null;
  me: Me;
  worn?: boolean;
  retired?: boolean;
  soon?: boolean;
  locked?: boolean;
  busy?: boolean;
  onWear?: () => void;
}) {
  const wearable = !!onWear && !locked && !worn;
  return (
    <button
      type="button"
      disabled={!wearable || busy}
      onClick={onWear}
      aria-pressed={worn}
      className={cn(
        "group relative flex flex-col items-center gap-2 rounded-xl border bg-white/[0.025] px-3 pt-4 pb-3 text-center transition-colors",
        rarity ? RARITY_FRAMES[rarity] : "border-white/[0.08]",
        worn && "bg-minuit-purple/10 ring-2 ring-minuit-purple/70",
        wearable && "cursor-pointer hover:bg-white/[0.06]",
        !wearable && !worn && "cursor-default",
        locked && "opacity-55",
      )}
    >
      <span className="grid h-24 w-full place-items-center">
        <Preview kind={kind} asset={asset} me={me} />
      </span>
      <span className="w-full min-w-0">
        <span className="block truncate text-sm font-semibold">{name}</span>
        {rarity && (
          <span
            className={cn(
              "block text-[10px] font-semibold tracking-wider uppercase",
              RARITY_TEXT[rarity],
            )}
          >
            {COSMETIC_RARITY_LABELS[rarity]}
          </span>
        )}
        <span className="mt-1 block text-xs leading-snug text-muted-foreground">
          {detail}
        </span>
      </span>
      <span className="absolute top-2 right-2 flex gap-1">
        {worn && (
          <span
            className="grid size-5 place-items-center rounded-full bg-minuit-purple text-[#1a1426]"
            aria-label="Équipé"
          >
            <Check className="size-3" strokeWidth={3} />
          </span>
        )}
        {locked && (
          <span
            className="grid size-5 place-items-center rounded-full bg-white/[0.08] text-muted-foreground"
            aria-label="Verrouillé"
          >
            <Lock className="size-3" />
          </span>
        )}
      </span>
      {(soon || retired) && (
        <span className="absolute top-2 left-2 flex gap-1">
          {soon && (
            <Badge variant="secondary" className="text-[10px]">
              Bientôt
            </Badge>
          )}
          {retired && (
            <Badge variant="outline" className="text-[10px]">
              Édition terminée
            </Badge>
          )}
        </span>
      )}
    </button>
  );
}

/** The item drawn the way the game draws it. */
function Preview({
  kind,
  asset,
  me,
}: {
  kind: CosmeticKind;
  asset: string | null;
  me: Me;
}) {
  if (kind === "card-back")
    return (
      // The Classique must not pick up the back the viewer wears.
      <CardBackSkin.Provider value={undefined}>
        <PlayingCard back decorative backSkin={asset ?? undefined} />
      </CardBackSkin.Provider>
    );
  if (kind === "profile-icon")
    return (
      <PlayerAvatar
        id={me?.id ?? "classique"}
        name={me?.name ?? "?"}
        size="xl"
        icon={asset}
      />
    );
  if (kind === "chicken")
    return (
      <SkinImage
        src={asset}
        className="size-20 object-contain"
        fallback={<ChickenArt className="size-20" />}
      />
    );
  return <MineDiamond skin={asset ?? undefined} className="size-14" />;
}
