export function MineDiamond({ className = "" }: { className?: string }) {
  return (
    <span
      className={`mines-poster-gem ${className}`.trim()}
      aria-hidden="true"
    />
  );
}

export function MineBomb({ className = "" }: { className?: string }) {
  return (
    <span
      className={`mines-poster-bomb ${className}`.trim()}
      aria-hidden="true"
    />
  );
}
