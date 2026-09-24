"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useEquippedSkins } from "@/lib/cosmetics-api";
import { cn } from "@/lib/utils";

export function PlayerAvatar({
  id,
  name,
  online,
  size = "default",
  className,
  icon: shownIcon,
  tone = "default",
}: {
  id: string;
  name: string;
  /** Shows a presence dot when defined. */
  online?: boolean;
  size?: "sm" | "default" | "lg" | "xl" | "2xl";
  className?: string;
  /** Forces an icon, null for the Classique; by default the one worn. */
  icon?: string | null;
  /** Keeps the old Blackjack highlight on your own occupied seat. */
  tone?: "default" | "blackjack-self";
}) {
  // The profile icon the player wears; the initial stays as the Classique.
  const worn = useEquippedSkins(shownIcon === undefined ? id : null);
  const icon =
    shownIcon === undefined ? worn?.["profile-icon"] : (shownIcon ?? undefined);
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <Avatar
        className={cn(
          size === "sm" && "size-7",
          size === "default" && "size-9",
          size === "lg" && "size-11",
          size === "xl" && "size-16",
          size === "2xl" && "size-20 sm:size-24",
        )}
      >
        {icon && <AvatarImage src={icon} alt="" draggable={false} />}
        <AvatarFallback
          className={cn(
            "border border-[#a985c535] bg-[#4f3565] font-bold text-[#d4b4eb]",
            tone === "blackjack-self" &&
              "border-[#d6b2ff] bg-[#ab88d9] text-[#211230]",
            size === "2xl"
              ? "text-4xl"
              : size === "xl"
                ? "text-2xl"
                : size === "lg"
                  ? "text-xs"
                  : "text-[8px]",
          )}
        >
          {(name.trim() || "?").slice(0, 1).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      {online !== undefined && (
        <span
          className={cn(
            "absolute right-0 bottom-0 block rounded-full ring-2 ring-popover",
            size === "2xl" ? "size-4" : size === "xl" ? "size-3.5" : "size-2.5",
            online ? "bg-minuit-mint" : "bg-[#4b4559]",
          )}
          aria-hidden="true"
        />
      )}
    </span>
  );
}
