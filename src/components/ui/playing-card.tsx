"use client";

import { createContext, useContext, type CSSProperties } from "react";
import type { Card } from "@/lib/types";
import { isRed, rankLabel, SUITS } from "@/lib/rules";
import { SkinImage } from "./skin-image";

/**
 * Back worn by the viewer, for the cards of the house and of players without
 * one. Outside a game (posters, icons) there is none: the Classique shows.
 */
export const CardBackSkin = createContext<string | undefined>(undefined);

const CLASSIC_BACK = (
  <>
    <span>♠</span>
    <small>M</small>
  </>
);

export function PlayingCard({
  card,
  back = false,
  index = 0,
  dealDelay,
  decorative = false,
  highlighted = false,
  dimmed = false,
  backSkin,
}: {
  card?: Card;
  back?: boolean;
  index?: number;
  dealDelay?: number;
  decorative?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  /** Back worn by the player holding the card, over the viewer's. */
  /**
   * Back of this card, resolved by the table (frozen for the hand); null for
   * the Classique. Left out, the viewer's live back from the context shows.
   */
  backSkin?: string | null;
}) {
  const viewerBack = useContext(CardBackSkin);
  const skin = backSkin === undefined ? viewerBack : (backSkin ?? undefined);
  const concealed = back || card?.hidden;
  return (
    <div
      className={`playing-card ${concealed ? "card-back" : ""} ${card && !card.hidden && isRed(card) ? "red" : ""} ${decorative ? "decorative-card" : ""} ${highlighted ? "winning-card" : ""} ${dimmed ? "dimmed-card" : ""}`}
      style={
        {
          "--card-index": index,
          "--deal-delay":
            dealDelay === undefined ? undefined : `${dealDelay}ms`,
        } as CSSProperties
      }
      aria-label={
        concealed
          ? card?.hidden
            ? "Carte doublée cachée"
            : "Dos de carte"
          : card
            ? `${rankLabel(card.rank)} ${SUITS[card.suit]}${highlighted ? ", carte de la combinaison gagnante" : ""}`
            : undefined
      }
    >
      {concealed || !card ? (
        <div className={`back-pattern ${skin ? "skinned" : ""}`}>
          <SkinImage src={skin} fallback={CLASSIC_BACK} className="back-skin" />
        </div>
      ) : (
        <>
          <div className="card-corner">
            <b>{rankLabel(card.rank)}</b>
            <span>{SUITS[card.suit]}</span>
          </div>
          <span className="card-pip">{SUITS[card.suit]}</span>
          <div className="card-corner bottom">
            <b>{rankLabel(card.rank)}</b>
            <span>{SUITS[card.suit]}</span>
          </div>
        </>
      )}
    </div>
  );
}
