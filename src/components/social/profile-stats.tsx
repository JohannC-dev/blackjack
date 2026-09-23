"use client";

import { Lock, TrendingDown, TrendingUp } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { credits } from "@/lib/rules";
import {
  STAT_GAME_LABELS,
  type GameStats,
  type PlayerStats,
  type Relation,
} from "@/lib/social";
import { cn } from "@/lib/utils";

/** "1 250" becomes "+1 250" or "−1 250": the sign is never left to colour. */
function signed(value: number) {
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) return "0";
  return `${rounded > 0 ? "+" : "−"}${credits(Math.abs(rounded))}`;
}

/** Spoken by screen readers, where "+1,2 k" is unreadable. */
function spokenAmount(value: number) {
  const rounded = Math.round(Math.abs(value) * 100) / 100;
  const amount = `${credits(rounded)} crédit${rounded >= 2 ? "s" : ""}`;
  if (value > 0) return `plus ${amount}`;
  if (value < 0) return `moins ${amount}`;
  return amount;
}

function successRate(won: number, played: number) {
  return played ? Math.round((won / played) * 100) : 0;
}

function Stat({
  label,
  value,
  spoken,
  className,
}: {
  label: string;
  value: string;
  /** Replaces the value for screen readers when the display is shortened. */
  spoken?: string;
  className?: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] px-3 py-2.5">
      <dt className="text-[11px] leading-tight text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 font-display text-lg leading-none font-semibold tabular-nums",
          className,
        )}
      >
        {spoken ? (
          <>
            <span aria-hidden="true">{value}</span>
            <span className="sr-only">{spoken}</span>
          </>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

/** A figure that carries a sign: never colour alone, always an arrow too. */
function SignedStat({ label, value }: { label: string; value: number }) {
  const Icon = value < 0 ? TrendingDown : TrendingUp;
  return (
    <div className="rounded-lg bg-white/[0.03] px-3 py-2.5">
      <dt className="text-[11px] leading-tight text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 flex items-center gap-1.5 font-display text-lg leading-none font-semibold tabular-nums",
          value < 0 ? "text-rose-300" : value > 0 ? "text-minuit-mint" : "",
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span aria-hidden="true">{signed(value)}</span>
        <span className="sr-only">{spokenAmount(value)}</span>
      </dd>
    </div>
  );
}

/** Says why a figure is missing, rather than showing an unexplained dash. */
function EarningsLocked({ name }: { name: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-3 py-2.5 text-xs text-muted-foreground">
      <Lock className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      {name} garde ses gains privés.
    </p>
  );
}

/** Shown in place of the figures before the first finished round. */
export function NoStatsYet({
  name,
  relation,
}: {
  name: string;
  relation: Relation;
}) {
  return (
    <p className="px-1 py-6 text-center text-sm text-muted-foreground">
      {relation === "self"
        ? "Aucune partie terminée pour l’instant. Vos statistiques apparaîtront ici."
        : `${name} n’a pas encore terminé de partie.`}
    </p>
  );
}

/** The headline: how much was played, and the money when it is shared. */
export function ProfileOverview({
  stats,
  name,
  relation,
}: {
  stats: PlayerStats;
  name: string;
  relation: Relation;
}) {
  const { summary } = stats;
  const who = relation === "self" ? "Vous" : name;

  if (!summary.played) return <NoStatsYet name={name} relation={relation} />;

  return (
    <div className="space-y-5">
      <section aria-labelledby="profile-stats-summary">
        <h3 id="profile-stats-summary" className="sr-only">
          Résumé des statistiques
        </h3>
        <dl className="grid grid-cols-2 gap-2">
          <Stat label="Parties jouées" value={credits(summary.played)} />
          <Stat
            label="Taux de réussite"
            value={`${successRate(summary.won, summary.played)} %`}
          />
          <Stat
            label="Meilleur coup"
            value={signed(summary.bestWin)}
            spoken={spokenAmount(summary.bestWin)}
            className="text-minuit-mint"
          />
          <Stat
            label="Jeu de prédilection"
            value={
              summary.favouriteGame
                ? STAT_GAME_LABELS[summary.favouriteGame]
                : "—"
            }
            className="truncate text-base"
          />
        </dl>
      </section>

      <section aria-labelledby="profile-stats-earnings">
        <h3
          id="profile-stats-earnings"
          className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          Gains
        </h3>
        {summary.earnings ? (
          <dl className="grid grid-cols-2 gap-2">
            <SignedStat label="Résultat net" value={summary.earnings.net} />
            <Stat
              label="Total misé"
              value={credits(summary.earnings.wagered)}
            />
            <Stat
              label="Pire perte"
              value={signed(-summary.earnings.worstLoss)}
              spoken={spokenAmount(-summary.earnings.worstLoss)}
              className="text-rose-300"
            />
          </dl>
        ) : (
          <EarningsLocked name={who} />
        )}
      </section>
    </div>
  );
}

/** The detail, one collapsible row per game the player has touched. */
export function ProfileGames({
  stats,
  name,
  relation,
}: {
  stats: PlayerStats;
  name: string;
  relation: Relation;
}) {
  if (!stats.games.length)
    return <NoStatsYet name={name} relation={relation} />;
  return (
    <Accordion type="single" collapsible className="w-full">
      {stats.games.map((game) => (
        <GameRow key={game.game} stats={game} />
      ))}
    </Accordion>
  );
}

/** Closed it shows the essentials; open it shows the detail. */
function GameRow({ stats }: { stats: GameStats }) {
  const label = STAT_GAME_LABELS[stats.game];
  return (
    <AccordionItem value={stats.game} className="border-white/[0.06]">
      <AccordionTrigger className="py-3 text-sm hover:no-underline">
        <span className="flex flex-1 items-center justify-between gap-3 pr-2">
          <span className="font-medium">{label}</span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {stats.played} partie{stats.played > 1 ? "s" : ""}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <dl className="grid grid-cols-2 gap-2 pb-1">
          <Stat
            label="Taux de réussite"
            value={`${successRate(stats.won, stats.played)} %`}
          />
          <Stat
            label="Meilleur gain"
            value={signed(stats.bestWin)}
            spoken={spokenAmount(stats.bestWin)}
            className="text-minuit-mint"
          />
          {stats.earnings && (
            <>
              <SignedStat label="Résultat net" value={stats.earnings.net} />
              <Stat label="Misé" value={credits(stats.earnings.wagered)} />
              <Stat
                label="Pire perte"
                value={signed(-stats.earnings.worstLoss)}
                spoken={spokenAmount(-stats.earnings.worstLoss)}
                className="text-rose-300"
              />
            </>
          )}
        </dl>
      </AccordionContent>
    </AccordionItem>
  );
}
