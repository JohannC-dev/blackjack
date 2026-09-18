"use client";

import type { CSSProperties } from "react";
import styles from "./shoe-shuffle.module.css";

const edges = Array.from({ length: 6 }, (_, index) => {
  const direction = index % 2 === 0 ? -1 : 1;
  const layer = Math.floor(index / 2);

  return {
    "--shuffle-delay": `${index * 26}ms`,
    "--edge-x": `${(index - 2.5) * 3.2}px`,
    "--split-x": `${direction * (30 + layer * 2)}px`,
    "--split-y": `${-7 - layer * 1.4}px`,
    "--split-angle": `${direction * (10 + layer * 0.8)}deg`,
    "--weave-x": `${direction * -8}px`,
    "--weave-y": `${-4 - layer}px`,
    "--weave-angle": `${direction * -2.5}deg`,
  } as CSSProperties;
});

/** Decorative overlay; the shoe parent supplies positioning and width. */
export function ShoeShuffleAnimation({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div className={styles.root} aria-hidden="true">
      <div className={styles.deck}>
        <span className={styles.shadow} />
        {edges.map((style, index) => (
          <span className={styles.edge} style={style} key={index} />
        ))}
      </div>
    </div>
  );
}
