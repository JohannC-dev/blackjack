"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** Stable hue per player, so a friend is recognisable at a glance. */
function hueOf(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

export function PlayerAvatar({
  id,
  name,
  online,
  size = "default",
  className,
}: {
  id: string;
  name: string;
  /** Shows a presence dot when defined. */
  online?: boolean;
  size?: "sm" | "default" | "lg" | "xl";
  className?: string;
}) {
  const hue = hueOf(id);
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <Avatar
        className={cn(
          size === "sm" && "size-7",
          size === "default" && "size-9",
          size === "lg" && "size-11",
          size === "xl" && "size-16",
        )}
      >
        <AvatarFallback
          className={cn(
            "font-bold text-white/90",
            size === "xl"
              ? "text-2xl"
              : size === "lg"
                ? "text-base"
                : "text-xs",
          )}
          style={{
            background: `linear-gradient(140deg, hsl(${hue} 42% 38%), hsl(${(hue + 40) % 360} 36% 22%))`,
          }}
        >
          {(name.trim() || "?").slice(0, 1).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      {online !== undefined && (
        <span
          className={cn(
            "absolute right-0 bottom-0 block rounded-full ring-2 ring-popover",
            size === "xl" ? "size-3.5" : "size-2.5",
            online ? "bg-minuit-mint" : "bg-[#4b4559]",
          )}
          aria-hidden="true"
        />
      )}
    </span>
  );
}
