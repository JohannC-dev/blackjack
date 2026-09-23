"use client";

/** Artwork for the Tower card on the home screen. */
export function TowerPosterArt({ hot }: { hot: boolean }) {
  return (
    <div
      className={`tower-poster-art${hot ? " is-hot" : ""}`}
      aria-hidden="true"
    >
      <img src="/art/tower-poster.svg" alt="" draggable={false} />
    </div>
  );
}
