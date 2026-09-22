"use client";

import {
  Castle,
  CircleHelp,
  Coins,
  Disc3,
  History,
  House,
  Settings2,
  Spade,
  Users,
  Wallet,
} from "lucide-react";
import { memo, type ReactNode } from "react";
import { credits } from "@/lib/rules";
import type { CasinoView } from "@/lib/navigation";
import { BlackjackIcon } from "./blackjack-icon";
import { MineBomb } from "../games/mines/mine-art";

type Navigate = (view: CasinoView) => void;

const railButton =
  "relative grid h-[43px] w-[43px] place-items-center rounded-xl border-0 bg-transparent text-[#777185] transition-colors hover:text-[#c7a9ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b79afa]/60 before:pointer-events-none before:absolute before:-left-[17px] before:top-1/2 before:h-[22px] before:w-[3px] before:-translate-y-1/2 before:rounded-r-[3px] before:bg-[#c7a9ff] before:opacity-0 before:shadow-[0_0_14px_#c7a9ff80] before:transition-opacity data-[active=true]:bg-[#9f79ea19] data-[active=true]:text-[#bd9dff] data-[active=true]:before:opacity-100";

export const CasinoRail = memo(function CasinoRail({
  active,
  blackjackLabel = "Blackjack",
  onNavigate,
  onTables,
  onHistory,
  onRules,
}: {
  active: CasinoView;
  blackjackLabel?: string;
  onNavigate: Navigate;
  onTables?: () => void;
  onHistory?: () => void;
  onRules?: () => void;
}) {
  const item = (view: CasinoView, label: string, icon: ReactNode) => (
    <button
      type="button"
      className={
        railButton +
        " max-[700px]:h-[38px] max-[700px]:w-[35px] max-[700px]:before:-left-[10px]"
      }
      data-active={active === view}
      aria-current={active === view ? "page" : undefined}
      title={label}
      aria-label={label}
      onClick={() => onNavigate(view)}
    >
      {icon}
    </button>
  );

  return (
    <aside
      className="fixed inset-y-0 left-0 z-20 flex w-[76px] flex-col items-center border-r border-white/[0.05] bg-[#12101a] max-[700px]:w-[55px] max-[450px]:hidden"
      aria-label="Navigation principale"
    >
      <button
        type="button"
        className="grid h-[83px] w-[76px] place-items-center border-0 bg-transparent text-[#c8b1ff] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b79afa]/60 max-[700px]:h-[69px] max-[700px]:w-[55px]"
        aria-label="Minuit, accueil"
        onClick={() => onNavigate("home")}
      >
        <Spade size={28} fill="currentColor" strokeWidth={1.3} />
      </button>
      <div className="mt-6 flex flex-col gap-4 max-[700px]:mt-5 max-[700px]:gap-3">
        {item("home", "Accueil", <House size={21} />)}
        {item("blackjack", blackjackLabel, <BlackjackIcon />)}
        {item(
          "mines",
          "Jeu de la mine",
          <MineBomb className="!static !h-[22px] !w-[22px]" />,
        )}
        {item("poker", "Poker", <Spade size={21} />)}
        {item("tower", "La Tower", <Castle size={21} />)}
        {item("roulette", "Roulette", <Disc3 size={21} />)}
        {onTables && (
          <button
            type="button"
            className={
              railButton +
              " max-[700px]:h-[38px] max-[700px]:w-[35px] max-[700px]:before:-left-[10px]"
            }
            title="Changer de table"
            aria-label="Changer de table"
            onClick={onTables}
          >
            <Users size={22} />
          </button>
        )}
        {onHistory && (
          <button
            type="button"
            className={
              railButton +
              " max-[700px]:h-[38px] max-[700px]:w-[35px] max-[700px]:before:-left-[10px]"
            }
            title="Historique"
            aria-label="Historique"
            onClick={onHistory}
          >
            <History size={21} />
          </button>
        )}
      </div>
      <div className="mt-auto mb-[25px] flex flex-col items-center gap-[22px] max-[700px]:mb-5 max-[700px]:gap-3">
        {onRules ? (
          <button
            type="button"
            className={
              railButton +
              " max-[700px]:h-[38px] max-[700px]:w-[35px] max-[700px]:before:-left-[10px]"
            }
            title="Règles du jeu"
            aria-label="Règles du jeu"
            onClick={onRules}
          >
            <CircleHelp size={21} />
          </button>
        ) : (
          <button
            type="button"
            className={
              railButton +
              " max-[700px]:h-[38px] max-[700px]:w-[35px] max-[700px]:before:-left-[10px]"
            }
            title="Paramètres"
            aria-label="Paramètres"
          >
            <Settings2 size={20} />
          </button>
        )}
        <div className="grid h-[30px] w-[30px] place-items-center rounded-full border border-[#3a3249] font-serif text-base text-[#746982] max-[700px]:hidden">
          M.
        </div>
      </div>
    </aside>
  );
});

export const ClubHeader = memo(function ClubHeader({
  balance,
  name,
  href,
}: {
  balance: number;
  name: string;
  href?: string;
}) {
  const brand = (
    <>
      MINUIT<span>&#9679;</span>
    </>
  );

  return (
    <header className="topbar">
      {href ? (
        <a className="wordmark" href={href}>
          {brand}
        </a>
      ) : (
        <span className="wordmark">{brand}</span>
      )}
      <span className="topbar-divider" />
      <div className="topbar-right">
        <div className="wallet">
          <Wallet size={17} />
          <b key={balance}>{credits(balance)}</b>
          <span>cr&#233;dits</span>
          <Coins size={16} className="wallet-coin" />
        </div>
        <div className="profile-avatar" title={name || "Votre profil"}>
          {(name || "M").slice(0, 1).toUpperCase()}
        </div>
      </div>
    </header>
  );
});

type BalanceGame = {
  balance: number | null;
  pokerState: { balance: number } | null;
  state: { players: Array<{ id: string; balance: number }> } | null;
  playerId: string;
  profile: { balance: number } | null;
};

export function getClubBalance(game: BalanceGame) {
  return (
    game.balance ??
    game.pokerState?.balance ??
    game.state?.players.find((player) => player.id === game.playerId)
      ?.balance ??
    game.profile?.balance ??
    0
  );
}
