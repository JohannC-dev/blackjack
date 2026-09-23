"use client";

import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { credits } from "@/lib/rules";
import {
  STAT_GAMES,
  STAT_GAME_LABELS,
  type PlayerStats,
  type Relation,
  type StatGame,
} from "@/lib/social";
import { cn } from "@/lib/utils";
import { BlackjackIcon } from "@/components/ui/blackjack-icon";

/** "1 250" becomes "+1 250" or "−1 250": the sign is never left to colour. */
export function signed(value: number) {
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

function share(part: number, whole: number) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

function percent(part: number, whole: number) {
  return whole ? `${share(part, whole)} %` : "—";
}

/** A share that can go either way, e.g. the return on every credit wagered. */
function signedPercent(part: number, whole: number) {
  if (!whole) return "—";
  const value = Math.round((part / whole) * 100);
  if (value === 0) return "0 %";
  return `${value > 0 ? "+" : "−"}${Math.abs(value)} %`;
}

function average(total: number, count: number) {
  return count ? credits(Math.round((total / count) * 10) / 10) : "—";
}

/** The game art of the rail, reused as the medals of a player card. */
const gameArt: Record<StatGame, string | null> = {
  blackjack: null,
  roulette: "/art/rail-roulette.svg",
  poker: "/art/rail-poker.svg?v=2",
  tower: "/art/rail-tower.svg",
  mines: "/art/mine-bomb.svg",
};

/** One medal per game, dimmed for the games never played. */
export function GameBadges({ stats }: { stats: PlayerStats }) {
  const played = new Map(stats.games.map((game) => [game.game, game.played]));
  return (
    <ul className="grid grid-cols-5 gap-1.5 sm:gap-3">
      {STAT_GAMES.map((game) => {
        const count = played.get(game) ?? 0;
        const art = gameArt[game];
        return (
          <li
            key={game}
            className={cn(
              "flex flex-col items-center gap-1.5 text-center",
              !count && "opacity-35 grayscale",
            )}
          >
            <span className="relative grid size-13 place-items-center rounded-2xl border border-white/[0.07] bg-white/[0.04] sm:size-15">
              {art ? (
                <img
                  src={art}
                  alt=""
                  width={30}
                  height={30}
                  className="size-7 object-contain sm:size-8"
                  aria-hidden="true"
                  draggable={false}
                />
              ) : (
                <BlackjackIcon />
              )}
              {!!count && (
                <span className="absolute -right-1.5 -bottom-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-minuit-purple px-1 font-display text-[11px] font-bold text-[#1a1426] ring-2 ring-[#161221]">
                  {count > 999 ? "999+" : count}
                </span>
              )}
            </span>
            <span className="text-[9px] leading-tight font-bold tracking-wide text-muted-foreground uppercase sm:text-[10px]">
              {STAT_GAME_LABELS[game]}
            </span>
            <span className="sr-only">
              {count ? `${count} partie${count > 1 ? "s" : ""}` : "jamais joué"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Bar({
  label,
  value,
  max,
  caption,
  tone = "purple",
}: {
  label: string;
  value: number;
  max: number;
  caption: string;
  tone?: "purple" | "mint";
}) {
  const filled = max ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-[10px] leading-tight font-bold tracking-wide text-muted-foreground uppercase sm:w-36 sm:text-[11px]">
        {label}
      </span>
      <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/[0.06]">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            tone === "mint"
              ? "bg-[linear-gradient(90deg,#4bbd8c,#83e9bc)]"
              : "bg-[linear-gradient(90deg,#7d54d8,#b79afa)]",
          )}
          style={{ width: `${filled}%` }}
        />
        <span className="absolute inset-0 grid place-items-center font-display text-[11px] font-bold tabular-nums text-white drop-shadow-[0_1px_2px_#000]">
          {caption}
        </span>
      </div>
    </div>
  );
}

/** The two gauges of the card: how often it wins, how wide it plays. */
export function ProfileBars({ stats }: { stats: PlayerStats }) {
  const { summary } = stats;
  return (
    <div className="space-y-2.5">
      <Bar
        label="Taux de réussite"
        value={summary.won}
        max={summary.played}
        caption={percent(summary.won, summary.played)}
        tone="mint"
      />
      <Bar
        label="Jeux explorés"
        value={stats.games.length}
        max={STAT_GAMES.length}
        caption={`${stats.games.length}/${STAT_GAMES.length}`}
      />
    </div>
  );
}

function Row({
  label,
  value,
  spoken,
  tone,
}: {
  label: string;
  value: string;
  spoken?: string;
  tone?: "mint" | "rose";
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2 odd:bg-white/[0.02]">
      <dt className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase sm:text-xs">
        {label}
      </dt>
      <dd
        className={cn(
          "font-display text-base font-bold tabular-nums sm:text-lg",
          tone === "mint" && "text-minuit-mint",
          tone === "rose" && "text-rose-300",
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

export function CardSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-4">
      <div className="mb-2 flex items-center gap-3">
        <h3 className="font-display text-sm font-bold tracking-[0.16em] text-minuit-purple uppercase">
          {title}
        </h3>
        <span className="h-px flex-1 bg-gradient-to-r from-minuit-purple/40 to-transparent" />
        {action}
      </div>
      {children}
    </section>
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
    <p className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-6 text-center text-sm text-muted-foreground">
      {relation === "self"
        ? "Aucune partie terminée pour l’instant. Vos statistiques apparaîtront ici."
        : `${name} n’a pas encore terminé de partie.`}
    </p>
  );
}

/** Every figure of the profile, in one list, as a player card shows them. */
export function StatisticsList({
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
  const lost = Math.max(summary.played - summary.won, 0);
  const earnings = summary.earnings;

  if (!summary.played) return <NoStatsYet name={name} relation={relation} />;

  return (
    <>
      <dl className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.015]">
        <Row label="Parties jouées" value={credits(summary.played)} />
        <Row label="Parties gagnées" value={credits(summary.won)} tone="mint" />
        <Row label="Parties perdues" value={credits(lost)} tone="rose" />
        <Row
          label="Taux de réussite"
          value={percent(summary.won, summary.played)}
        />
        <Row
          label="Meilleur coup"
          value={signed(summary.bestWin)}
          spoken={spokenAmount(summary.bestWin)}
          tone="mint"
        />
        <Row
          label="Jeu de prédilection"
          value={
            summary.favouriteGame
              ? STAT_GAME_LABELS[summary.favouriteGame]
              : "—"
          }
        />
        <Row
          label="Parties par jeu"
          value={average(summary.played, stats.games.length)}
        />
        {earnings && (
          <>
            <Row
              label="Résultat net"
              value={signed(earnings.net)}
              spoken={spokenAmount(earnings.net)}
              tone={earnings.net < 0 ? "rose" : "mint"}
            />
            <Row label="Total misé" value={credits(earnings.wagered)} />
            <Row
              label="Pire perte"
              value={signed(-earnings.worstLoss)}
              spoken={spokenAmount(-earnings.worstLoss)}
              tone="rose"
            />
            <Row
              label="Rendement"
              value={signedPercent(earnings.net, earnings.wagered)}
              tone={earnings.net < 0 ? "rose" : "mint"}
            />
            <Row
              label="Mise moyenne"
              value={average(earnings.wagered, summary.played)}
            />
            <Row
              label="Résultat moyen"
              value={signed(earnings.net / summary.played)}
              spoken={spokenAmount(earnings.net / summary.played)}
              tone={earnings.net < 0 ? "rose" : "mint"}
            />
          </>
        )}
      </dl>
      {!earnings && (
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5 text-xs text-muted-foreground">
          <Lock className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {who} garde ses gains privés.
        </p>
      )}
    </>
  );
}

/** One line per game: what was played there, and what it paid. */
export function GameBreakdown({ stats }: { stats: PlayerStats }) {
  if (!stats.games.length) return null;
  return (
    <ul className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.015]">
      {stats.games.map((game) => (
        <li
          key={game.game}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2.5 odd:bg-white/[0.02]"
        >
          <span className="font-display text-sm font-bold">
            {STAT_GAME_LABELS[game.game]}
          </span>
          <span className="flex flex-wrap items-center gap-x-3 text-xs tabular-nums text-muted-foreground">
            <span>
              {credits(game.played)} partie{game.played > 1 ? "s" : ""}
            </span>
            <span>{percent(game.won, game.played)} de réussite</span>
            <span className="text-minuit-mint">
              <span aria-hidden="true">{signed(game.bestWin)}</span>
              <span className="sr-only">
                meilleur gain {spokenAmount(game.bestWin)}
              </span>{" "}
              au mieux
            </span>
            {game.earnings && (
              <span
                className={
                  game.earnings.net < 0 ? "text-rose-300" : "text-minuit-mint"
                }
              >
                <span aria-hidden="true">{signed(game.earnings.net)}</span>
                <span className="sr-only">
                  résultat net {spokenAmount(game.earnings.net)}
                </span>{" "}
                net
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
