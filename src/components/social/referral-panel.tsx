"use client";

import { Check, Copy, Gift, Lock, Sparkles, Users } from "lucide-react";
import { Fragment } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { COSMETICS, COSMETIC_KIND_LABELS } from "@/lib/cosmetics";
import { credits } from "@/lib/rules";
import {
  REFERRAL_WELCOME_BONUS,
  type Filleul,
  type ReferralOverview,
  type ReferralTierState,
} from "@/lib/referral";
import { useReferralOverview } from "@/lib/referral-api";
import { formatFriendCode } from "@/lib/social";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "./player-avatar";
import { useSocial } from "./social-provider";

const dayFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * The parrainage section of a player's own profile: the code they hand out,
 * the state of their filleuls and the five tiers.
 */
export function ReferralPanel() {
  const social = useSocial();
  const { overview, error, reload } = useReferralOverview(
    true,
    social.referralVersion,
  );

  if (error)
    return (
      <Section>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
          Réessayer
        </Button>
      </Section>
    );
  if (!overview)
    return (
      <Section>
        <Skeleton className="h-16" />
        <Skeleton className="mt-2 h-24" />
      </Section>
    );
  return <ReferralBody overview={overview} />;
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Separator className="my-5 bg-white/[0.06]" />
      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        <Gift className="size-3.5" />
        Parrainage
      </div>
      {children}
    </>
  );
}

function ReferralBody({ overview }: { overview: ReferralOverview }) {
  const social = useSocial();
  const count = overview.filleuls.length;
  const copyCode = async () => {
    if (!overview.code) return;
    try {
      await navigator.clipboard.writeText(formatFriendCode(overview.code));
      toast.success("Code de parrainage copié.");
    } catch {
      toast.error("Copie impossible.");
    }
  };

  return (
    <Section>
      <div className="rounded-lg border border-minuit-purple/25 bg-minuit-purple/[0.07] px-3.5 py-3">
        <p className="text-xs text-muted-foreground">
          Donnez ce code à vos amis : à l’inscription, ils reçoivent{" "}
          <b className="font-semibold text-foreground">
            {credits(REFERRAL_WELCOME_BONUS)} crédits
          </b>{" "}
          de plus, et vous avancez dans les paliers.
        </p>
        <button
          type="button"
          onClick={copyCode}
          disabled={!overview.code}
          className="mt-2 inline-flex items-center gap-2 rounded-md bg-white/[0.04] px-3 py-1.5 font-mono text-base font-semibold tracking-[0.2em] text-foreground hover:bg-white/[0.08] disabled:opacity-50"
          title="Copier mon code de parrainage"
        >
          {overview.code ? formatFriendCode(overview.code) : "————————"}
          <Copy className="size-3.5 text-muted-foreground" />
        </button>
      </div>

      {overview.parrain && (
        <button
          type="button"
          onClick={() => social.openProfile(overview.parrain!.id)}
          className="mt-3 flex w-full items-center gap-2.5 rounded-lg px-1 py-2 text-left hover:bg-white/[0.03]"
        >
          <PlayerAvatar
            id={overview.parrain.id}
            name={overview.parrain.name}
            size="sm"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {overview.parrain.name}
            </span>
            <span className="block text-xs text-muted-foreground">
              Votre parrain depuis le{" "}
              {dayFormat.format(new Date(overview.parrain.since))}
            </span>
          </span>
        </button>
      )}

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-semibold tracking-[0.14em] uppercase">
          Progression des filleuls
        </span>
        <span>
          {overview.earned > 0
            ? `${credits(overview.earned)} gagnés`
            : "Aucune récompense"}
        </span>
      </div>

      <div className="mt-4 mb-2 flex items-center gap-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        <Users className="size-3.5" />
        Mes filleuls · {count}
      </div>
      {count ? (
        <div className="divide-y divide-white/[0.05]">
          {overview.filleuls.map((filleul) => (
            <Fragment key={filleul.id}>
              <button
                type="button"
                onClick={() => social.openProfile(filleul.id)}
                className="flex w-full items-center gap-2.5 py-2.5 text-left hover:bg-white/[0.02]"
              >
                <PlayerAvatar
                  id={filleul.id}
                  name={filleul.name}
                  online={filleul.online}
                  size="sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {filleul.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Depuis le {dayFormat.format(new Date(filleul.joinedAt))}
                    {filleul.played > 0
                      ? ` · ${filleul.played.toLocaleString("fr-FR")} partie${
                          filleul.played > 1 ? "s" : ""
                        } · ${credits(filleul.wagered)} misés`
                      : " · n’a pas encore joué"}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs",
                    filleul.online
                      ? "text-minuit-mint"
                      : "text-muted-foreground",
                  )}
                >
                  {filleul.online ? "En ligne" : "Hors ligne"}
                </span>
              </button>
              <TierLadder filleul={filleul} />
            </Fragment>
          ))}
        </div>
      ) : (
        <p className="py-3 text-sm text-muted-foreground">
          Personne n’a encore utilisé votre code.
        </p>
      )}

      <Cosmetics overview={overview} />
    </Section>
  );
}

function TierLadder({
  filleul,
}: {
  filleul: Filleul;
}) {
  const next = filleul.nextTier;
  const previous = [...filleul.tiers]
    .reverse()
    .find((tier) => tier.reached)?.wagered;
  const floor = next ? (previous ?? 0) : filleul.wagered;
  const span = next ? next.wagered - floor : 1;
  const progress = next
    ? Math.min(
        100,
        Math.max(0, ((filleul.wagered - floor) / Math.max(1, span)) * 100),
      )
    : 100;

  return (
    <div className="border-b border-white/[0.05] px-2 pb-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {credits(filleul.wagered)} misés
        </span>
        <span className="text-xs text-muted-foreground">
          {next ? `Prochain : ${credits(next.wagered)}` : "Tous les paliers"}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        aria-label="Progression vers le palier suivant"
      >
        <div
          className="h-full rounded-full bg-minuit-purple transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {next
          ? `Encore ${credits(next.wagered - filleul.wagered)} à miser pour « ${next.label} » · ${credits(next.reward)}`
          : "Tous les paliers sont atteints pour ce filleul."}
      </p>
      <ul className="mt-3 space-y-1.5">
        {filleul.tiers.map((tier) => (
          <TierRow key={tier.tier} tier={tier} />
        ))}
      </ul>
    </div>
  );
}

function TierRow({ tier }: { tier: ReferralTierState }) {
  return (
    <li
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2 py-1.5",
        tier.reached ? "bg-white/[0.03]" : "opacity-60",
      )}
    >
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold",
          tier.reached
            ? "bg-minuit-purple/20 text-minuit-purple"
            : "bg-white/[0.06] text-muted-foreground",
        )}
        aria-hidden="true"
      >
        {tier.reached ? <Check className="size-3" /> : tier.tier}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {tier.label}
        </span>
        <span className="block text-xs text-muted-foreground">
          {credits(tier.wagered)} misés
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 text-sm font-semibold tabular-nums",
          tier.grantedAt ? "text-minuit-mint" : "text-muted-foreground",
        )}
      >
        {tier.grantedAt ? "+" : ""}
        {credits(tier.reward)}
      </span>
    </li>
  );
}

function Cosmetics({ overview }: { overview: ReferralOverview }) {
  const owned = new Map(overview.cosmetics.map((item) => [item.id, item]));
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        <Sparkles className="size-3.5" />
        Récompenses du parrainage
      </div>
      <ul className="space-y-1.5">
        {Object.values(COSMETICS).map((cosmetic) => {
          const unlocked = owned.get(cosmetic.id);
          return (
            <li
              key={cosmetic.id}
              className={cn(
                "flex items-center gap-2.5 rounded-md border border-white/[0.06] px-2.5 py-2",
                unlocked ? "bg-white/[0.03]" : "opacity-60",
              )}
            >
              <span
                className="grid size-7 shrink-0 place-items-center rounded-md bg-white/[0.05] text-muted-foreground"
                aria-hidden="true"
              >
                {unlocked ? (
                  <Sparkles className="size-3.5 text-minuit-purple" />
                ) : (
                  <Lock className="size-3.5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {cosmetic.name}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {COSMETIC_KIND_LABELS[cosmetic.kind]} ·{" "}
                  {unlocked
                    ? unlocked.source === "parrainage-filleul"
                      ? "Reçu en tant que filleul"
                      : "Reçu au premier palier"
                    : cosmetic.description}
                </span>
              </span>
              {unlocked && !cosmetic.wearable && (
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  Bientôt
                </Badge>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
