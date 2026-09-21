"use client";

import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

type GamePosterProps = {
  className: string;
  index: string;
  art: ReactNode;
  artClassName?: string;
  eyebrow: string;
  title: ReactNode;
  description: string;
  action: string;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
};

export function GamePoster({
  className,
  index,
  art,
  artClassName,
  eyebrow,
  title,
  description,
  action,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
}: GamePosterProps) {
  return (
    <button
      type="button"
      className={`game-poster ${className}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <div className="poster-index">{index}</div>
      <div className={`poster-art ${artClassName ?? ""}`.trim()}>{art}</div>
      <div className="poster-copy">
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
        <strong>
          {action} <ArrowRight size={17} />
        </strong>
      </div>
    </button>
  );
}
