import type { CSSProperties } from "react";
import styles from "./poker-shuffle.module.css";

const SHUFFLE_CARDS = Array.from({ length: 8 }, (_, index) => index);

export function PokerShuffleAnimation({ hand }: { hand: number }) {
  return (
    <div
      className={styles.overlay}
      role="status"
      aria-live="polite"
      aria-label={`Mélange des cartes avant la main ${hand + 1}`}
    >
      <div className={styles.animation} aria-hidden="true">
        <div className={styles.deckShadow} />
        {SHUFFLE_CARDS.map((index) => {
          const side = index % 2 === 0 ? -1 : 1;
          const depth = Math.floor(index / 2);
          return (
            <div
              className={styles.card}
              key={index}
              style={
                {
                  "--shuffle-delay": `${index * 35}ms`,
                  "--shuffle-z": index + 1,
                  "--shuffle-split-x": `${side * (48 + depth)}px`,
                  "--shuffle-split-y": `${depth * 1.5 - 2}px`,
                  "--shuffle-angle": `${side * -11}deg`,
                  "--shuffle-riffle-x": `${side * (8 - depth * 0.7)}px`,
                  "--shuffle-riffle-y": `${depth * -2}px`,
                  "--shuffle-cross-x": `${side * -4}px`,
                  "--shuffle-rest-x": `${(index - 3.5) * 0.55}px`,
                  "--shuffle-rest-y": `${(index - 3.5) * -0.65}px`,
                  "--shuffle-rest-angle": `${(index - 3.5) * 0.18}deg`,
                } as CSSProperties
              }
            >
              <div className={styles.cardPattern}>
                <span>♠</span>
                <small>M</small>
              </div>
            </div>
          );
        })}
      </div>
      <div className={styles.copy}>
        <span>MAIN {String(hand + 1).padStart(3, "0")}</span>
        <b>Mélange du jeu</b>
      </div>
    </div>
  );
}
