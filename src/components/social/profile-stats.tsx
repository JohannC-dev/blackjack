"use client";

import {
  Coins,
  Dices,
  Flame,
  Gamepad2,
  Crown,
  Gauge,
  Lock,
  Medal,
  Percent,
  Scale,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
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

function percent(part: number, whole: number) {
  return whole ? `${Math.round((part / whole) * 100)} %` : "—";
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

/** A figure that carries a sign: never colour alone, always an arrow too. */
function SignedStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  const Arrow = value < 0 ? TrendingDown : TrendingUp;
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.025] px-4 py-3.5">
      <dt className="flex items-center gap-1.5 text-[11px] leading-tight font-medium tracking-wide text-muted-foreground uppercase">
        <Scale className="size-3.5 shrink-0" aria-hidden="true" />
        {label}
      </dt>
      <dd
        className={cn(
          "mt-2 flex items-center gap-1.5 font-display text-2xl leading-none font-semibold tabular-nums",
          value < 0 ? "text-rose-300" : value > 0 ? "text-minuit-mint" : "",
        )}
      >
        <Arrow className="size-5 shrink-0" aria-hidden="true" />
        <span aria-hidden="true">{signed(value)}</span>
        <span className="sr-only">{spokenAmount(value)}</span>
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

/** The chip balance: the first figure of a player's own profile. */
export function BalanceHero({ balance }: { balance: number }) {
  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-minuit-purple/25 bg-minuit-purple/[0.07] px-5 py-5 sm:px-6 sm:py-6"
      aria-label="Solde de jetons"
    >
      <div
        className="pointer-events-none absolute -top-20 -right-10 size-56 rounded-full bg-[radial-gradient(closest-side,#a880f33d,transparent)]"
        aria-hidden="true"
      />
      <p className="relative flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
        <Wallet className="size-3.5" aria-hidden="true" />
        Solde de jetons
      </p>
      <p className="relative mt-3 flex items-baseline gap-2.5 font-display text-4xl leading-none font-semibold tabular-nums sm:text-5xl">
        <Coins
          className="size-7 shrink-0 self-center text-minuit-purple sm:size-8"
          aria-hidden="true"
        />
        {credits(balance)}
        <span className="text-base font-normal text-muted-foreground">
          crédits
        </span>
      </p>
    </section>
  );
}

/**
 * The headline: the balance first, then what was played and the money when it
 * is shared.
 */
export function ProfileOverview({
  stats,
  name,
  relation,
  balance,
}: {
  stats: PlayerStats;
  name: string;
  relation: Relation;
  /** The player's own chip balance, shown first. Null for other players. */
  balance: number | null;
}) {
  const { summary } = stats;
  const who = relation === "self" ? "Vous" : name;
  const lost = Math.max(summary.played - summary.won, 0);

  return (
    <div className="space-y-7">
      {balance !== null && <BalanceHero balance={balance} />}

      {!summary.played ? (
        <NoStatsYet name={name} relation={relation} />
      ) : (
        <>
          <Section title="Parties" icon={Dices}>
            <dl className={statGrid}>
              <Stat
                label="Parties jouées"
                value={credits(summary.played)}
                icon={Gamepad2}
              />
              <Stat
                label="Parties gagnées"
                value={credits(summary.won)}
                icon={Trophy}
                tone="mint"
              />
              <Stat
                label="Parties perdues"
                value={credits(lost)}
                icon={Target}
                tone="rose"
              />
              <Stat
                label="Taux de réussite"
                value={percent(summary.won, summary.played)}
                icon={Percent}
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
              <Stat
                label="Jeux pratiqués"
                value={`${stats.games.length}`}
                icon={Dices}
                hint={stats.games
                  .map((game) => STAT_GAME_LABELS[game.game])
                  .join(" · ")}
              />
              <Stat
                label="Parties par jeu"
                value={average(summary.played, stats.games.length)}
                icon={Gauge}
                hint="En moyenne"
              />
            </dl>
          </Section>

          <Section title="Gains" icon={Coins}>
            {summary.earnings ? (
              <dl className={statGrid}>
                <SignedStat
                  label="Résultat net"
                  value={summary.earnings.net}
                  hint="Toutes parties confondues"
                />
                <Stat
                  label="Total misé"
                  value={credits(summary.earnings.wagered)}
                  icon={Coins}
                />
                <Stat
                  label="Pire perte"
                  value={signed(-summary.earnings.worstLoss)}
                  spoken={spokenAmount(-summary.earnings.worstLoss)}
                  icon={TrendingDown}
                  tone="rose"
                />
                <Stat
                  label="Rendement"
                  value={signedPercent(
                    summary.earnings.net,
                    summary.earnings.wagered,
                  )}
                  icon={Percent}
                  hint="Résultat net sur total misé"
                  tone={summary.earnings.net < 0 ? "rose" : "mint"}
                />
                <Stat
                  label="Mise moyenne"
                  value={average(summary.earnings.wagered, summary.played)}
                  icon={Scale}
                  hint="Par partie"
                />
                <Stat
                  label="Résultat moyen"
                  value={signed(summary.earnings.net / summary.played)}
                  spoken={spokenAmount(summary.earnings.net / summary.played)}
                  icon={Gauge}
                  hint="Par partie"
                  tone={summary.earnings.net < 0 ? "rose" : "mint"}
                />
              </dl>
            ) : (
              <EarningsLocked name={who} />
            )}
          </Section>
        </>
      )}
    </div>
  );
}

/** The detail, one open card per game the player has touched. */
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
    <div className="space-y-5">
      {stats.games.map((game) => (
        <GameCard key={game.game} stats={game} />
      ))}
    </div>
  );
}

/** Everything one game holds, visible without a click. */
function GameCard({ stats }: { stats: GameStats }) {
  const lost = Math.max(stats.played - stats.won, 0);
  return (
    <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-semibold">
          {STAT_GAME_LABELS[stats.game]}
        </h3>
        <span className="text-xs tabular-nums text-muted-foreground">
          {credits(stats.played)} partie{stats.played > 1 ? "s" : ""} ·{" "}
          {credits(stats.won)} gagnée{stats.won > 1 ? "s" : ""} ·{" "}
          {credits(lost)} perdue{lost > 1 ? "s" : ""}
        </span>
      </header>
      <dl className={statGrid}>
        <Stat
          label="Taux de réussite"
          value={percent(stats.won, stats.played)}
          icon={Percent}
        />
        <Stat
          label="Meilleur gain"
          value={signed(stats.bestWin)}
          spoken={spokenAmount(stats.bestWin)}
          icon={Flame}
          tone="mint"
        />
        {stats.earnings && (
          <>
            <SignedStat label="Résultat net" value={stats.earnings.net} />
            <Stat
              label="Total misé"
              value={credits(stats.earnings.wagered)}
              icon={Coins}
            />
            <Stat
              label="Pire perte"
              value={signed(-stats.earnings.worstLoss)}
              spoken={spokenAmount(-stats.earnings.worstLoss)}
              icon={TrendingDown}
              tone="rose"
            />
            <Stat
              label="Mise moyenne"
              value={average(stats.earnings.wagered, stats.played)}
              icon={Scale}
              hint="Par partie"
            />
            <Stat
              label="Rendement"
              value={signedPercent(stats.earnings.net, stats.earnings.wagered)}
              icon={Gauge}
              tone={stats.earnings.net < 0 ? "rose" : "mint"}
            />
          </>
        )}
      </dl>
    </section>
  );
}

/**
 * The podium and the records: which games a player really lives in, and the
 * single figures they will brag about.
 */
export function ProfileRecords({
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
  const harshest = paid.length
    ? paid.reduce((worst, game) =>
        game.earnings!.worstLoss > worst.earnings!.worstLoss ? game : worst,
      )
    : null;
  const steadiest = stats.games.reduce((top, game) =>
    game.won / game.played > top.won / top.played ? game : top,
  );

  return (
    <div className="space-y-7">
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
              <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                <b className="block font-display text-base font-semibold text-foreground">
                  {credits(game.played)}
                </b>
                partie{game.played > 1 ? "s" : ""}
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
          {harshest && (
            <Stat
              label="Pire perte"
              value={signed(-harshest.earnings!.worstLoss)}
              spoken={spokenAmount(-harshest.earnings!.worstLoss)}
              icon={TrendingDown}
              hint={STAT_GAME_LABELS[harshest.game]}
              tone="rose"
            />
          )}
          {richest && (
            <Stat
              label="Jeu le plus rentable"
              value={STAT_GAME_LABELS[richest.game]}
              icon={Crown}
              hint={`${signed(richest.earnings!.net)} au total`}
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
            hint={`${credits(mostPlayed.played)} partie${mostPlayed.played > 1 ? "s" : ""}`}
            className="[&>dd]:truncate [&>dd]:text-xl"
          />
          <Stat
            label="Jeux pratiqués"
            value={`${stats.games.length}`}
            icon={Dices}
            hint={stats.games
              .map((game) => STAT_GAME_LABELS[game.game])
              .join(" · ")}
          />
        </dl>
      </Section>
    </div>
  );
}
