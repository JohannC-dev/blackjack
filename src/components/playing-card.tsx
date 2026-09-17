import type { CSSProperties } from "react";
import type { Card } from "@/lib/types";
import { isRed, rankLabel, SUITS } from "@/lib/rules";

export function PlayingCard({
  card,
  back = false,
  index = 0,
  decorative = false,
}: {
  card?: Card;
  back?: boolean;
  index?: number;
  decorative?: boolean;
}) {
  return (
    <div
      className={`playing-card ${back ? "card-back" : ""} ${card && isRed(card) ? "red" : ""} ${decorative ? "decorative-card" : ""}`}
      style={{ "--card-index": index } as CSSProperties}
      aria-label={
        back
          ? "Dos de carte"
          : card
            ? `${rankLabel(card.rank)} ${SUITS[card.suit]}`
            : undefined
      }
    >
      {back || !card ? (
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
