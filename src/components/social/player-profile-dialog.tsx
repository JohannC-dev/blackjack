"use client";

import {
  CalendarDays,
  Check,
  Clock3,
  Copy,
  LoaderCircle,
  Send,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFriendCode, type PlayerProfile } from "@/lib/social";
import { usePlayerProfile } from "@/lib/social-api";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "./player-avatar";
import { ReferralPanel } from "./referral-panel";
import { useSocial } from "./social-provider";

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
});

export function PlayerProfileDialog({
  playerId,
  version,
  onClose,
}: {
  playerId: string | null;
  version: number;
  onClose: () => void;
}) {
  const { profile, error, reload } = usePlayerProfile(playerId, version);
  const social = useSocial();
  const referralForSelf =
    playerId !== null && playerId === social.overview?.me.id;
  return (
    <Dialog open={!!playerId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto border-white/[0.06] bg-[#15121d] p-0 font-sans text-foreground sm:max-w-[460px]">
        {profile ? (
          <ProfileBody profile={profile} onChanged={reload} />
        ) : error ? (
          <div className="px-6 py-12 text-center">
            <DialogTitle className="text-base">Profil indisponible</DialogTitle>
            <DialogDescription className="mt-1">{error}</DialogDescription>
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={reload}
            >
              Réessayer
            </Button>
          </div>
        ) : (
          <ProfileSkeleton />
        )}
        {referralForSelf && (
          <div className="px-6 pt-4 pb-5">
            <ReferralPanel />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProfileBody({
  profile,
  onChanged,
}: {
  profile: PlayerProfile;
  onChanged: () => void;
}) {
  const copyCode = async () => {
    if (!profile.friendCode) return;
    try {
      await navigator.clipboard.writeText(formatFriendCode(profile.friendCode));
      toast.success("Code ami copié.");
    } catch {
      toast.error("Copie impossible.");
    }
  };

  return (
    <>
      <div className="relative overflow-hidden border-b border-white/[0.06] px-6 pt-7 pb-5">
        <div
          className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-[radial-gradient(closest-side,#a880f32e,transparent)]"
          aria-hidden="true"
        />
        <DialogHeader className="relative flex-row items-center gap-4 text-left">
          <PlayerAvatar
            id={profile.id}
            name={profile.name}
            online={profile.relation === "self" ? undefined : profile.online}
            size="xl"
          />
          <div className="min-w-0 flex-1">
            <DialogTitle className="flex items-center gap-2 font-display text-xl font-semibold">
              <span className="truncate">{profile.name}</span>
              {profile.relation === "self" && (
                <Badge variant="secondary">Vous</Badge>
              )}
              {profile.relation === "friend" && (
                <Badge className="bg-minuit-purple/15 text-minuit-purple">
                  Ami
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {profile.friendCode && (
                  <button
                    type="button"
                    onClick={copyCode}
                    className="inline-flex items-center gap-1 rounded bg-transparent p-0 font-mono tracking-wider text-muted-foreground hover:text-foreground"
                    title="Copier le code ami"
                  >
                    {formatFriendCode(profile.friendCode)}
                    <Copy className="size-3" />
                  </button>
                )}
                {profile.relation !== "self" && (
                  <span
                    className={profile.online ? "text-minuit-mint" : undefined}
                  >
                    {profile.online ? "En ligne" : "Hors ligne"}
                  </span>
                )}
              </div>
            </DialogDescription>
          </div>
        </DialogHeader>
        <div className="relative mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5" />
            Membre depuis {dateFormat.format(new Date(profile.memberSince))}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-3.5" />
            {profile.friends} ami{profile.friends > 1 ? "s" : ""}
          </span>
        </div>
        <RelationActions profile={profile} onChanged={onChanged} />
      </div>

    </>
  );
}

function RelationActions({
  profile,
  onChanged,
}: {
  profile: PlayerProfile;
  onChanged: () => void;
}) {
  const social = useSocial();
  const [busy, setBusy] = useState(false);
  if (profile.relation === "self") return null;
  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    await action();
    setBusy(false);
    onChanged();
  };
  const spinner = busy ? <LoaderCircle className="animate-spin" /> : null;
  const friend = social.overview?.friends.find(
    (item) => item.id === profile.id,
  );

  return (
    <div className="relative mt-5 flex flex-wrap gap-2">
      {profile.relation === "friend" && (
        <>
          <Button
            size="sm"
            disabled={!friend?.online || !!social.invitingId}
            onClick={() => friend && void social.inviteFriend(friend)}
          >
            {social.invitingId === profile.id ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Send />
            )}
            Inviter à jouer
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            disabled={busy}
            onClick={() => run(() => social.remove(profile.id))}
          >
            {spinner ?? <UserMinus />}
            Retirer
          </Button>
        </>
      )}
      {profile.relation === "none" && (
        <Button
          size="sm"
          disabled={busy}
          onClick={() => run(() => social.sendRequest({ userId: profile.id }))}
        >
          {spinner ?? <UserPlus />}
          Ajouter en ami
        </Button>
      )}
      {profile.relation === "incoming" && profile.requestId && (
        <>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => run(() => social.respond(profile.requestId!, true))}
          >
            {spinner ?? <Check />}
            Accepter la demande
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            disabled={busy}
            onClick={() => run(() => social.respond(profile.requestId!, false))}
          >
            Refuser
          </Button>
        </>
      )}
      {profile.relation === "outgoing" && (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => run(() => social.remove(profile.id))}
          title="Annuler la demande"
        >
          {spinner ?? <Clock3 />}
          Demande envoyée · Annuler
        </Button>
      )}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="px-6 py-7">
      <DialogTitle className="sr-only">Chargement du profil</DialogTitle>
      <DialogDescription className="sr-only">Chargement…</DialogDescription>
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3.5 w-24" />
        </div>
      </div>
    </div>
  );
}
