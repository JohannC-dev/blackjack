import { PlayingCard } from "./playing-card";

/** A small ace-and-king mark: the two-card 21 that identifies Blackjack. */
export function BlackjackIcon() {
  return (
    <span className="blackjack-icon" aria-hidden="true">
      <PlayingCard
        card={{ id: "blackjack-icon-a", rank: 1, suit: "spades" }}
        decorative
      />
      <PlayingCard
        card={{ id: "blackjack-icon-k", rank: 13, suit: "hearts" }}
        decorative
      />
    </span>
  );
}
