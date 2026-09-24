import { SkinImage } from "../../ui/skin-image";

/** The Classique gem, or the skin the player wears in their own game. */
export function MineDiamond({
  className = "",
  skin,
}: {
  className?: string;
  skin?: string;
}) {
  const classes = `mines-poster-gem ${className}`.trim();
  return (
    <SkinImage
      src={skin}
      className={classes}
      fallback={
        <img
          src="/art/mine-diamond.svg"
          alt=""
          className={classes}
          aria-hidden="true"
          draggable={false}
        />
      }
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
