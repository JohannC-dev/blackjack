"use client";

import { useState, type ReactNode } from "react";

/**
 * The picture of a skin, always through <img> so an SVG never runs script.
 * Falls back to the Classique when there is none or it fails to load.
 */
export function SkinImage({
  src,
  fallback,
  className,
}: {
  src: string | null | undefined;
  fallback: ReactNode;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className}
      onError={() => setFailed(src)}
    />
  );
}
