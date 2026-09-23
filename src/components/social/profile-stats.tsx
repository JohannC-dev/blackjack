"use client";

import {
  Crown,
  Flame,
  Gamepad2,
  Lock,
  Medal,
  Scale,
  Sparkles,
  Target,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { credits } from "@/lib/rules";
import {
  STAT_GAME_LABELS,
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

function percent(part: number, whole: number) {
  return whole ? `${Math.round((part / whole) * 100)} %` : "—";
}

function average(total: number, count: number) {
  return count ? credits(Math.round((total / count) * 10) / 10) : "—";
}

/** A figure, large enough to be read at a glance. */
function Stat({
  label,
  value,
  icon: Icon,
  spoken,
  hint,
  tone,
  className,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  /** Replaces the value for screen readers when the display is shortened. */
  spoken?: string;
  hint?: string;
  tone?: "mint" | "rose";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.05] bg-white/[0.025] px-4 py-3.5",
        className,
      )}
    >
      <dt className="flex items-center gap-1.5 text-[11px] leading-tight font-medium tracking-wide text-muted-foreground uppercase">
        {Icon && <Icon className="size-3.5 shrink-0" aria-hidden="true" />}
        {label}
      </dt>
      <dd
        className={cn(
          "mt-2 font-display text-2xl leading-none font-semibold tabular-nums",
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
      {hint && (
        <p className="mt-1.5 text-[11px] leading-tight text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Says why a figure is missing, rather than showing an unexplained dash. */
function EarningsLocked({ name }: { name: string }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-white/[0.05] bg-white/[0.025] px-4 py-3.5 text-sm text-muted-foreground">
      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {name} garde ses gains privés.
    </p>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        <Icon className="size-4 text-minuit-purple" aria-hidden="true" />
        {title}
      </h3>
      {children}
    </section>
  );
}

const statGrid = "grid grid-cols-2 gap-3 md:grid-cols-4";

/** Shown in place of the figures before the first finished round. */
export function NoStatsYet({
  name,
  relation,
}: {
  name: string;
  relation: Relation;
}) {
  return (
    <p className="rounded-xl border border-white/[0.05] bg-white/[0.025] px-5 py-10 text-center text-sm text-muted-foreground">
      {relation === "self"
        ? "Aucune partie terminée pour l’instant. Vos statistiques apparaîtront ici."
        : `${name} n’a pas encore terminé de partie.`}
    </p>
  );
}

/** The chip balance, plain: the figure and what it counts. */
export function Balance({ balance }: { balance: number }) {
  return (
    <p className="shrink-0 font-display text-3xl leading-none font-semibold tabular-nums sm:text-4xl">
      {credits(balance)}
      <span className="ml-2 text-sm font-normal text-muted-foreground">
        crédits
      </span>
    </p>
  );
}

/**
 * The profile in one page: the figures a player keeps, then the podium of
 * the games and the records.
 */
export function ProfileStats({
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
    <div className="space-y-7">
      <Section title="Statistiques" icon={Trophy}>
        <dl className={statGrid}>
          <Stat
            label="Parties gagnées"
            value={credits(summary.won)}
            icon={Trophy}
            tone="mint"
          />
          <Stat
            label="Meilleur coup"
            value={signed(summary.bestWin)}
            spoken={spokenAmount(summary.bestWin)}
            icon={Flame}
            tone="mint"
          />
          <Stat
            label="Jeu de prédilection"
            value={
              summary.favouriteGame
                ? STAT_GAME_LABELS[summary.favouriteGame]
                : "—"
            }
            icon={Sparkles}
            className="[&>dd]:truncate [&>dd]:text-xl"
          />
          {summary.earnings && (
            <Stat
              label="Mise moyenne"
              value={average(summary.earnings.wagered, summary.played)}
              icon={Scale}
              hint="Par partie"
            />
          )}
        </dl>
        {!summary.earnings && <EarningsLocked name={who} />}
      </Section>

      <ProfileRecords stats={stats} />
    </div>
  );
}

/**
 * The podium and the records: which games a player really lives in, and the
 * single figures they will brag about. Same rule as above: no rate, no
 * counter, no loss.
 */
function ProfileRecords({ stats }: { stats: PlayerStats }) {
  if (!stats.games.length) return null;

  const podium = [...stats.games]
    .sort((left, right) => right.played - left.played)
    .slice(0, 3);
  const mostPlayed = podium[0]!;
  const best = stats.games.reduce((top, game) =>
    game.bestWin > top.bestWin ? game : top,
  );
  const paid = stats.games.filter((game) => game.earnings);
  const richest = paid.length
    ? paid.reduce((top, game) =>
        game.earnings!.net > top.earnings!.net ? game : top,
      )
    : null;
  const steadiest = stats.games.reduce((top, game) =>
    game.won / game.played > top.won / top.played ? game : top,
  );

  return (
    <>
      <Section title="Podium des jeux" icon={Medal}>
        <ol className="space-y-2">
          {podium.map((game, index) => (
            <li
              key={game.game}
              className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.025] px-4 py-3"
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full font-display text-sm font-bold",
                  index === 0 && "bg-[#e9c46a] text-[#2a1e05]",
                  index === 1 && "bg-[#c9ccd6] text-[#22242c]",
                  index === 2 && "bg-[#c98a54] text-[#2a1607]",
                )}
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-base font-semibold">
                  {STAT_GAME_LABELS[game.game]}
                </span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <span
                    className="block h-full rounded-full bg-[linear-gradient(90deg,#7d54d8,#b79afa)]"
                    style={{
                      width: `${Math.round((game.played / mostPlayed.played) * 100)}%`,
                    }}
                  />
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Records" icon={Trophy}>
        <dl className={statGrid}>
          <Stat
            label="Plus gros gain"
            value={signed(best.bestWin)}
            spoken={spokenAmount(best.bestWin)}
            icon={Flame}
            hint={STAT_GAME_LABELS[best.game]}
            tone="mint"
          />
          {richest && (
            <Stat
              label="Jeu le plus rentable"
              value={STAT_GAME_LABELS[richest.game]}
              icon={Crown}
              className="[&>dd]:truncate [&>dd]:text-xl"
            />
          )}
          <Stat
            label="Jeu le plus régulier"
            value={STAT_GAME_LABELS[steadiest.game]}
            icon={Target}
            hint={`${percent(steadiest.won, steadiest.played)} de réussite`}
            className="[&>dd]:truncate [&>dd]:text-xl"
          />
          <Stat
            label="Jeu le plus joué"
            value={STAT_GAME_LABELS[mostPlayed.game]}
            icon={Gamepad2}
            className="[&>dd]:truncate [&>dd]:text-xl"
          />
        </dl>
      </Section>
    </>
  );
}
