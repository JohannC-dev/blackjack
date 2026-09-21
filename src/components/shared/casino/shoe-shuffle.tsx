"use client";

import type { CSSProperties } from "react";
import styles from "./shoe-shuffle.module.css";

const shuffleCards = Array.from({ length: 8 }, (_, index) => {
  const direction = index % 2 === 0 ? -1 : 1;
  const layer = Math.floor(index / 2);

  return {
    "--shuffle-delay": `${index * 20}ms`,
    "--card-split-x": `${direction * (18 + layer * 1.8)}px`,
    "--card-split-y": `${-5 - layer * 0.8}px`,
    "--card-split-angle": `${direction * (6 + layer * 0.7)}deg`,
    "--card-weave-x": `${direction * (3 + layer * 0.6)}px`,
    "--card-weave-y": `${-1 + (index % 3) * 1.2}px`,
    "--card-weave-angle": `${direction * (1.2 + layer * 0.3)}deg`,
  } as CSSProperties;
});

/** Decorative overlay; the shoe parent supplies positioning and width. */
export function ShoeShuffleAnimation({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div className={styles.root} aria-hidden="true">
      <div className={styles.deck}>
        <span className={styles.shadow} />
        <span className={`${styles.packet} ${styles.packetLeft}`} />
        <span className={`${styles.packet} ${styles.packetRight}`} />
        {shuffleCards.map((style, index) => (
          <span className={styles.card} style={style} key={index} />
        ))}
      </div>
    </div>
  );
}
