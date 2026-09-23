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
import { useState, type ReactNode } from "react";
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { credits } from "@/lib/rules";
import {
  INVITE_GAME_LABELS,
  formatFriendCode,
  type InviteGame,
  type PlayerProfile,
} from "@/lib/social";
import { usePlayerProfile } from "@/lib/social-api";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "./player-avatar";
import { ReferralPanel } from "./referral-panel";
import { useSocial } from "./social-provider";

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
});

function gameLabel(game: string) {
  return INVITE_GAME_LABELS[game as InviteGame] ?? game;
}

function signedCredits(amount: number) {
  return `${amount > 0 ? "+" : amount < 0 ? "−" : ""}${credits(Math.abs(amount))}`;
}

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
  const totals = profile.stats.reduce(
    (sum, game) => ({
      played: sum.played + game.played,
      wagered: sum.wagered + game.wagered,
      net: sum.net + game.net,
      bestWin: Math.max(sum.bestWin, game.bestWin),
    }),
    { played: 0, wagered: 0, net: 0, bestWin: 0 },
  );
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

      <div className="px-6 py-5">
        <div className="grid grid-cols-3 gap-2">
          <StatTile
            label="Parties"
            value={totals.played.toLocaleString("fr-FR")}
          />
          <StatTile label="Misé" value={credits(totals.wagered)} />
          <StatTile
            label="Bilan"
            value={signedCredits(totals.net)}
            className={
              totals.net > 0
                ? "text-minuit-mint"
                : totals.net < 0
                  ? "text-[#f0617a]"
                  : undefined
            }
          />
        </div>
        {totals.bestWin > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Plus beau gain :{" "}
            <b className="font-semibold text-foreground">
              {credits(totals.bestWin)} crédits
            </b>
          </p>
        )}

        <Separator className="my-5 bg-white/[0.06]" />
        <div className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Par jeu
        </div>
        {profile.stats.length ? (
          <div className="divide-y divide-white/[0.05]">
            {profile.stats.map((game) => (
              <div
                key={game.game}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    {gameLabel(game.game)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {game.played.toLocaleString("fr-FR")} partie
                    {game.played > 1 ? "s" : ""} · {credits(game.wagered)} misés
                  </div>
                </div>
                <div
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    game.net > 0 && "text-minuit-mint",
                    game.net < 0 && "text-[#f0617a]",
                  )}
                >
                  {signedCredits(game.net)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Aucune partie jouée pour l’instant.
          </p>
        )}
        {profile.relation === "self" && <ReferralPanel />}
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

function StatTile({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 truncate text-base font-semibold tabular-nums",
          className,
        )}
      >
        {value}
      </div>
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
      <div className="mt-6 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-14" />
        ))}
      </div>
      <Skeleton className="mt-6 h-24" />
    </div>
  );
}
