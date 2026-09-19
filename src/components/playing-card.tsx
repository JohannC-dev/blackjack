import type { CSSProperties } from "react";
import type { Card } from "@/lib/types";
import { isRed, rankLabel, SUITS } from "@/lib/rules";

export function PlayingCard({
  card,
  back = false,
  index = 0,
  dealDelay,
  decorative = false,
}: {
  card?: Card;
  back?: boolean;
  index?: number;
  dealDelay?: number;
  decorative?: boolean;
}) {
  const concealed = back || card?.hidden;
  return (
    <div
      className={`playing-card ${concealed ? "card-back" : ""} ${card && !card.hidden && isRed(card) ? "red" : ""} ${decorative ? "decorative-card" : ""}`}
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
            ? `${rankLabel(card.rank)} ${SUITS[card.suit]}`
            : undefined
      }
    >
      {concealed || !card ? (
        <div className="back-pattern">
          <span>♠</span>
          <small>M</small>
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
