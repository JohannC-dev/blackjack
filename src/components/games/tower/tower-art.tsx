"use client";

import { Crown } from "lucide-react";
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { TowerFx } from "./tower-fx";

const FLOORS = 4;

/** Lobby poster: an isometric tower of cards that catches fire when `hot`. */
export function TowerPosterArt({ hot }: { hot: boolean }) {
  const artRef = useRef<HTMLDivElement>(null);
  const boundsRef = useRef<HTMLDivElement>(null);
  const isoRef = useRef<HTMLDivElement>(null);

  // Fit the fire box to the projected silhouette of the 3D blocks.
  useLayoutEffect(() => {
    const fit = () => {
      const art = artRef.current?.getBoundingClientRect();
      const faces = isoRef.current?.querySelectorAll(
        ".tpa-front, .tpa-side, .tpa-top",
      );
      const bounds = boundsRef.current;
      if (!art || !faces?.length || !bounds) return;
      let left = Infinity;
      let right = -Infinity;
      let top = Infinity;
      let bottom = -Infinity;
      for (const face of faces) {
        const rect = face.getBoundingClientRect();
        left = Math.min(left, rect.left);
        right = Math.max(right, rect.right);
        top = Math.min(top, rect.top);
        bottom = Math.max(bottom, rect.bottom);
      }
      Object.assign(bounds.style, {
        left: `${left - art.left}px`,
        top: `${top - art.top}px`,
        width: `${right - left}px`,
        height: `${bottom - top}px`,
      });
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (artRef.current) observer.observe(artRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="tower-poster-art" ref={artRef} aria-hidden="true">
      <div className="tpa-beam" />
      <div className="tpa-shadow" />
      <TowerFx
        targetRef={boundsRef}
        heat={hot ? 0.75 : 0.2}
        density={0.5}
        className="tpa-fx"
      />
      <div className="tpa-bounds" ref={boundsRef} />
      <div className="tpa-scene">
        <div className="tpa-iso" ref={isoRef}>
          {Array.from({ length: FLOORS }, (_, floor) => (
            <div
              key={floor}
              className="tpa-block"
              style={{ "--i": floor } as CSSProperties}
            >
              <span className="tpa-front" />
              <span className="tpa-side" />
              <span className="tpa-top">
                {Array.from({ length: 3 }, (_, column) => (
                  <i
                    key={column}
                    className={
                      floor === FLOORS - 1 && column === 1
                        ? "picked"
                        : undefined
                    }
                  />
                ))}
              </span>
            </div>
          ))}
          <span className="tpa-crown">
            <Crown size={26} />
          </span>
        </div>
      </div>
    </div>
  );
}
