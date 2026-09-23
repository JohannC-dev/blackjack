"use client";

import { Copy, LogOut, UserPlus, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatFriendCode } from "@/lib/social";
import { PlayerAvatar } from "./player-avatar";
import { useOptionalSocial } from "./social-provider";

/** The avatar of the club header, opening the player's own menu. */
export function ProfileMenu({
  name,
  onSignOut,
}: {
  name: string;
  onSignOut?: () => void | Promise<void>;
}) {
  const social = useOptionalSocial();
  const me = social?.overview?.me;
  const pending = social?.pendingCount ?? 0;
  const initial = (name || "M").slice(0, 1).toUpperCase();

  if (!social && !onSignOut)
    return (
      <span className="profile-avatar" title={name || "Votre profil"}>
        {initial}
      </span>
    );

  const copyCode = async () => {
    if (!me?.friendCode) return;
    try {
      await navigator.clipboard.writeText(formatFriendCode(me.friendCode));
      toast.success("Code ami copié.");
    } catch {
      toast.error("Copie impossible.");
    }
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="profile-avatar relative"
          aria-label={
            pending
              ? `Votre profil, ${pending} demande${pending > 1 ? "s" : ""} en attente`
              : "Votre profil"
          }
          title={name || "Votre profil"}
        >
          {initial}
          {!!pending && (
            <span
              className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-minuit-purple px-1 text-[9px] leading-none font-bold text-[#1a1426] ring-2 ring-[#100e18]"
              aria-hidden="true"
            >
              {pending > 9 ? "9+" : pending}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-64 border-white/[0.07] bg-[#17141f] p-1.5 font-sans"
      >
        <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2">
          <PlayerAvatar id={me?.id ?? name} name={name} size="lg" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">
              {name}
            </span>
            {me?.friendCode ? (
              <span className="block font-mono text-xs font-normal tracking-wider text-muted-foreground">
                {formatFriendCode(me.friendCode)}
              </span>
            ) : (
              <span className="block text-xs font-normal text-muted-foreground">
                Membre du club
              </span>
            )}
          </span>
        </DropdownMenuLabel>
        {social && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={!me}
                onSelect={() => me && social.openProfile(me.id)}
              >
                <UserRound />
                Mon profil
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  social.openFriends(
                    social.pendingCount ? "requests" : "friends",
                  )
                }
              >
                <Users />
                Amis
                {!!pending && (
                  <Badge className="ml-auto h-4 min-w-4 rounded-full px-1 text-[10px] tabular-nums">
                    {pending}
                  </Badge>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => social.openFriends("search")}>
                <UserPlus />
                Ajouter un ami
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!me?.friendCode} onSelect={copyCode}>
                <Copy />
                Copier mon code ami
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
        {onSignOut && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => void onSignOut()}
            >
              <LogOut />
              Se déconnecter
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
