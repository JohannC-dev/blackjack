"use client";

import {
  CalendarDays,
  Check,
  Clock3,
  Copy,
  EyeOff,
  Gift,
  LoaderCircle,
  Medal,
  Send,
  ShieldCheck,
  Trophy,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatFriendCode, type PlayerProfile } from "@/lib/social";
import { usePlayerProfile } from "@/lib/social-api";
import { PlayerAvatar } from "./player-avatar";
import {
  Balance,
  ProfileGames,
  ProfileOverview,
  ProfileRecords,
} from "./profile-stats";
import { ReferralPanel } from "./referral-panel";
import { useSocial } from "./social-provider";
import { VisibilitySettings } from "./visibility-settings";

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** How long the player has been a member, in plain words. */
function membership(since: string) {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000),
  );
  if (days < 1) return "Arrivé aujourd’hui";
  if (days < 31) return `${days} jour${days > 1 ? "s" : ""} au club`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months} mois au club`;
  const years = Math.floor(days / 365.25);
  return `${years} an${years > 1 ? "s" : ""} au club`;
}

/** The profile opens as a modal over the club, one card, four categories. */
export function PlayerProfileModal({
  playerId,
  version,
  balance,
  onClose,
}: {
  playerId: string | null;
  version: number;
  /** The viewer's own chip balance, shown on their own profile. */
  balance: number;
  onClose: () => void;
}) {
  const { profile, error, reload } = usePlayerProfile(playerId, version);
  return (
    <Dialog open={!!playerId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(92dvh,840px)] w-[calc(100vw-1.5rem)] max-w-[880px] flex-col gap-0 overflow-hidden rounded-2xl border-white/[0.07] bg-[#15121d] p-0 font-sans text-foreground shadow-[0_40px_120px_#000000cc] sm:max-w-[880px]"
      >
        <CloseButton />
        {profile ? (
          <ProfileBody profile={profile} balance={balance} onChanged={reload} />
        ) : error ? (
          <Centered>
            <DialogTitle className="font-display text-xl">
              Profil indisponible
            </DialogTitle>
            <DialogDescription className="mt-2">{error}</DialogDescription>
            <Button variant="secondary" className="mt-5" onClick={reload}>
              Réessayer
            </Button>
          </Centered>
        ) : (
          <ProfileSkeleton />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The only way out of the card, always in the same corner. */
function CloseButton() {
  return (
    <DialogClose asChild>
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute top-3 right-3 z-10 text-muted-foreground hover:text-foreground"
        aria-label="Fermer le profil"
      >
        <X />
      </Button>
    </DialogClose>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      {children}
    </div>
  );
}

function ProfileBody({
  profile,
  balance,
  onChanged,
}: {
  profile: PlayerProfile;
  balance: number;
  onChanged: () => void;
}) {
  const self = profile.relation === "self";
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
      <div className="relative shrink-0 overflow-hidden border-b border-white/[0.06]">
        <div
          className="pointer-events-none absolute inset-x-0 -top-40 h-80 bg-[radial-gradient(closest-side,#a880f32b,transparent)]"
          aria-hidden="true"
        />
        <div className="relative px-5 pt-7 pb-6 sm:px-7">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4 sm:gap-5">
              <PlayerAvatar
                id={profile.id}
                name={profile.name}
                online={self ? undefined : profile.online}
                size="2xl"
              />
              <div className="min-w-0">
                <DialogTitle className="flex flex-wrap items-center gap-2.5 font-display text-2xl font-semibold sm:text-3xl">
                  <span className="truncate">{profile.name}</span>
                  {self && <Badge variant="secondary">Vous</Badge>}
                  {profile.relation === "friend" && (
                    <Badge className="bg-minuit-purple/15 text-minuit-purple">
                      Ami
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                    {profile.friendCode && (
                      <button
                        type="button"
                        onClick={copyCode}
                        className="inline-flex items-center gap-1.5 rounded bg-transparent p-0 font-mono tracking-wider text-muted-foreground hover:text-foreground"
                        title="Copier le code ami"
                      >
                        {formatFriendCode(profile.friendCode)}
                        <Copy className="size-3" />
                      </button>
                    )}
                    {!self && (
                      <span
                        className={
                          profile.online ? "text-minuit-mint" : undefined
                        }
                      >
                        {profile.online ? "En ligne" : "Hors ligne"}
                      </span>
                    )}
                  </div>
                </DialogDescription>
              </div>
            </div>
            {self ? (
              <Balance balance={balance} />
            ) : (
              <RelationActions profile={profile} onChanged={onChanged} />
            )}
          </div>
          <dl className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <IdentityFact
              icon={<CalendarDays className="size-3.5" />}
              label="Membre depuis"
              value={dateFormat.format(new Date(profile.memberSince))}
              hint={membership(profile.memberSince)}
            />
            <IdentityFact
              icon={<Users className="size-3.5" />}
              label="Amis"
              value={`${profile.friends}`}
            />
            <IdentityFact
              icon={<Trophy className="size-3.5" />}
              label="Parties jouées"
              value={
                profile.stats ? `${profile.stats.summary.played}` : "Privé"
              }
            />
          </dl>
        </div>
      </div>
      <div className="scroll-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-7 sm:px-7">
        <ProfileSections profile={profile} />
      </div>
    </>
  );
}

function IdentityFact({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.025] px-4 py-3">
      <dt className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {icon}
        {label}
      </dt>
      <dd className="mt-1.5 truncate font-display text-base font-semibold">
        {value}
      </dd>
      {hint && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

/**
 * Everything below the identity card. Parrainage and confidentialité are two
 * separate tabs: a reward programme and a setting have nothing in common.
 */
function ProfileSections({ profile }: { profile: PlayerProfile }) {
  const self = profile.relation === "self";

  if (!profile.stats)
    return (
      <>
        <p className="flex items-start gap-2 rounded-xl border border-white/[0.05] bg-white/[0.025] px-4 py-4 text-sm text-muted-foreground">
          <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {profile.name} garde son profil privé.
        </p>
        {self && profile.visibility && (
          <div className="mt-8">
            <VisibilitySettings visibility={profile.visibility} />
          </div>
        )}
      </>
    );

  return (
    <Tabs defaultValue="overview" className="gap-0">
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-white/[0.03] p-1">
        <TabsTrigger value="overview" className="h-8 px-4">
          Aperçu
        </TabsTrigger>
        <TabsTrigger value="games" className="h-8 px-4">
          Jeux
        </TabsTrigger>
        <TabsTrigger value="records" className="h-8 px-4">
          <Medal />
          Palmarès
        </TabsTrigger>
        {self && (
          <>
            <TabsTrigger value="referral" className="h-8 px-4">
              <Gift />
              Parrainage
            </TabsTrigger>
            <TabsTrigger value="privacy" className="h-8 px-4">
              <ShieldCheck />
              Confidentialité
            </TabsTrigger>
          </>
        )}
      </TabsList>
      <TabsContent value="overview" className="pt-6">
        <ProfileOverview
          stats={profile.stats}
          name={profile.name}
          relation={profile.relation}
        />
      </TabsContent>
      <TabsContent value="games" className="pt-6">
        <ProfileGames
          stats={profile.stats}
          name={profile.name}
          relation={profile.relation}
        />
      </TabsContent>
      <TabsContent value="records" className="pt-6">
        <ProfileRecords
          stats={profile.stats}
          name={profile.name}
          relation={profile.relation}
        />
      </TabsContent>
      {self && (
        <>
          <TabsContent value="referral" className="max-w-xl pt-6">
            <ReferralPanel />
          </TabsContent>
          <TabsContent value="privacy" className="max-w-xl pt-6">
            {profile.visibility && (
              <VisibilitySettings visibility={profile.visibility} />
            )}
          </TabsContent>
        </>
      )}
    </Tabs>
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
    <div className="flex flex-wrap gap-2">
      {profile.relation === "friend" && (
        <>
          <Button
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
            disabled={busy}
            onClick={() => run(() => social.respond(profile.requestId!, true))}
          >
            {spinner ?? <Check />}
            Accepter la demande
          </Button>
          <Button
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
    <div className="px-5 pt-10 pb-8 sm:px-7">
      <DialogTitle className="sr-only">Chargement du profil</DialogTitle>
      <DialogDescription className="sr-only">Chargement…</DialogDescription>
      <div className="flex items-center gap-5">
        <Skeleton className="size-24 rounded-full" />
        <div className="space-y-3">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="mt-8 h-32" />
    </div>
  );
}
