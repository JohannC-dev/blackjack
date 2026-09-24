"use client";

import type { ReactElement } from "react";
import { Check, Clock3, UserPlus, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSocial } from "./social-provider";

/** Actions attached to a player wherever their name or avatar appears. */
export function PlayerMenu({
  id,
  name,
  children,
}: {
  id: string;
  name: string;
  children: ReactElement;
}) {
  const social = useSocial();
  const overview = social.overview;
  const self = overview?.me.id === id;
  const friend = overview?.friends.some((item) => item.id === id);
  const incoming = overview?.incoming.find((item) => item.player.id === id);
  const outgoing = overview?.outgoing.some((item) => item.player.id === id);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        className="min-w-44"
        aria-label={`Actions pour ${name}`}
      >
        <DropdownMenuItem onSelect={() => social.openProfile(id)}>
          <UserRound /> Voir le profil
        </DropdownMenuItem>
        {!self && !friend && incoming && (
          <DropdownMenuItem
            onSelect={() => void social.respond(incoming.id, true)}
          >
            <Check /> Accepter la demande
          </DropdownMenuItem>
        )}
        {!self && !friend && outgoing && (
          <DropdownMenuItem disabled>
            <Clock3 /> Demande envoyée
          </DropdownMenuItem>
        )}
        {!self && !friend && !incoming && !outgoing && (
          <DropdownMenuItem
            disabled={!overview}
            onSelect={() => void social.sendRequest({ userId: id })}
          >
            <UserPlus /> Ajouter en ami
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
