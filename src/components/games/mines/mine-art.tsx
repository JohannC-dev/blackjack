export function MineDiamond({ className = "" }: { className?: string }) {
  return (
    <img
      src="/art/mine-diamond.svg"
      alt=""
      className={`mines-poster-gem ${className}`.trim()}
      aria-hidden="true"
      draggable={false}
    />
  );
}

export function MineBomb({ className = "" }: { className?: string }) {
  return (
    <img
      src="/art/mine-bomb.svg"
      alt=""
      className={`mines-poster-bomb ${className}`.trim()}
      aria-hidden="true"
      draggable={false}
    />
  );
}
