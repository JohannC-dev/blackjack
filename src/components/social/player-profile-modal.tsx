"use client";

import {
  Check,
  Clock3,
  Coins,
  Copy,
  EyeOff,
  Gift,
  LoaderCircle,
  Send,
  ShieldCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { credits } from "@/lib/rules";
import { formatFriendCode, type PlayerProfile } from "@/lib/social";
import { usePlayerProfile } from "@/lib/social-api";
import { PlayerAvatar } from "./player-avatar";
import {
  CardSection,
  GameBadges,
  GameBreakdown,
  ProfileBars,
  StatisticsList,
  signed,
} from "./profile-stats";
import { ReferralPanel } from "./referral-panel";
import { useSocial } from "./social-provider";
import { VisibilitySettings } from "./visibility-settings";

const monthFormat = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
});

/** The profile card: one modal, read top to bottom. */
export function PlayerProfileModal({
  playerId,
  version,
  balance,
  onClose,
}: {
  playerId: string | null;
  version: number;
  /** The viewer's own chip balance, shown on their own card. */
  balance: number;
  onClose: () => void;
}) {
  const { profile, error, reload } = usePlayerProfile(playerId, version);
  return (
    <Dialog open={!!playerId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[min(92dvh,900px)] w-[calc(100vw-1.5rem)] max-w-[720px] flex-col gap-0 overflow-hidden rounded-3xl border border-minuit-purple/25 bg-[#161221] p-0 font-sans text-foreground shadow-[0_40px_120px_#000000cc] sm:max-w-[720px]"
      >
        {profile ? (
          <ProfileCard profile={profile} balance={balance} onChanged={reload} />
        ) : error ? (
          <>
            <CardHeaderBand />
            <div className="px-6 py-10 text-center">
              <DialogTitle className="font-display text-lg">
                Profil indisponible
              </DialogTitle>
              <DialogDescription className="mt-1.5">{error}</DialogDescription>
              <Button variant="secondary" className="mt-5" onClick={reload}>
                Réessayer
              </Button>
            </div>
          </>
        ) : (
          <CardSkeleton />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The banner of the card: avatar, name, chips, and the way out. */
function CardHeaderBand({ children }: { children?: ReactNode }) {
  return (
    <div className="relative shrink-0 bg-[linear-gradient(180deg,#6c4bc9,#3b2a6d)] px-4 pt-4 pb-4 sm:px-6">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,#ffffff26,transparent)]"
        aria-hidden="true"
      />
      <DialogClose asChild>
        <button
          type="button"
          className="absolute top-3 right-3 z-10 grid size-9 place-items-center rounded-full bg-black/25 text-white/85 transition-colors hover:bg-black/40 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
          aria-label="Fermer le profil"
        >
          <X className="size-5" />
        </button>
      </DialogClose>
      {children}
    </div>
  );
}

function Pill({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      className={`flex h-11 items-center gap-2 rounded-full bg-black/45 px-4 font-display text-base font-bold text-white ring-1 ring-white/10 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function ProfileCard({
  profile,
  balance,
  onChanged,
}: {
  profile: PlayerProfile;
  balance: number;
  onChanged: () => void;
}) {
  const self = profile.relation === "self";
  const stats = profile.stats;
  const earnings = stats?.summary.earnings ?? null;

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
      <CardHeaderBand>
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 pt-11 sm:gap-4 sm:pt-13">
          <PlayerAvatar
            id={profile.id}
            name={profile.name}
            online={self ? undefined : profile.online}
            size="2xl"
            className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-full ring-4 ring-white/25 sm:-top-2 [&_[data-slot=avatar]]:shadow-[0_10px_30px_#00000080]"
          />
          <Pill className="min-w-0">
            <DialogTitle className="truncate text-base font-bold sm:text-lg">
              {profile.name}
            </DialogTitle>
            {self ? (
              <Badge variant="secondary" className="shrink-0">
                Vous
              </Badge>
            ) : profile.relation === "friend" ? (
              <Badge className="shrink-0 bg-minuit-purple/25 text-white">
                Ami
              </Badge>
            ) : null}
          </Pill>
          <span className="w-[86px] sm:w-[104px]" aria-hidden="true" />
          {self ? (
            <Pill className="justify-end tabular-nums" title="Solde de jetons">
              <Coins className="size-5 shrink-0 text-minuit-purple" />
              <span className="truncate">{credits(balance)}</span>
            </Pill>
          ) : (
            <Pill className="justify-end">
              <Users className="size-5 shrink-0 text-minuit-purple" />
              <span className="tabular-nums">{profile.friends}</span>
              <span className="text-sm font-normal text-white/70">
                ami{profile.friends > 1 ? "s" : ""}
              </span>
            </Pill>
          )}
        </div>
        <DialogDescription asChild>
          <div className="relative mt-3 flex items-center justify-center gap-2 text-[11px] font-bold tracking-[0.18em] text-white/70 uppercase">
            Membre depuis
            <span className="rounded-full bg-black/35 px-2.5 py-0.5 text-white">
              {monthFormat.format(new Date(profile.memberSince))}
            </span>
            {!self && (
              <span
                className={
                  profile.online ? "text-minuit-mint" : "text-white/55"
                }
              >
                {profile.online ? "· En ligne" : "· Hors ligne"}
              </span>
            )}
          </div>
        </DialogDescription>
      </CardHeaderBand>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-5 sm:px-6">
        <div className="grid gap-2 rounded-2xl border border-minuit-purple/25 bg-minuit-purple/[0.08] p-2.5 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="px-1 text-[10px] font-bold tracking-[0.16em] text-minuit-purple uppercase">
              Code ami
            </p>
            <button
              type="button"
              onClick={copyCode}
              disabled={!profile.friendCode}
              title="Copier le code ami"
              className="mt-1 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-black/45 px-3 font-mono text-sm font-bold tracking-[0.18em] text-white ring-1 ring-white/[0.07] transition-colors hover:bg-black/60 disabled:opacity-50"
            >
              {profile.friendCode
                ? formatFriendCode(profile.friendCode)
                : "————————"}
              <Copy className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          </div>
          <div className="min-w-0">
            <p className="px-1 text-[10px] font-bold tracking-[0.16em] text-minuit-purple uppercase">
              {earnings ? "Résultat net" : "Parties jouées"}
            </p>
            <div
              className={`mt-1 flex h-9 items-center justify-center rounded-lg bg-black/45 px-3 font-display text-base font-bold tabular-nums ring-1 ring-white/[0.07] ${
                earnings
                  ? earnings.net < 0
                    ? "text-rose-300"
                    : "text-minuit-mint"
                  : "text-white"
              }`}
            >
              {earnings
                ? signed(earnings.net)
                : credits(stats?.summary.played ?? 0)}
            </div>
          </div>
        </div>

        {stats ? (
          <>
            <CardSection title="Jeux du club">
              <GameBadges stats={stats} />
            </CardSection>
            <CardSection title="Progression">
              <ProfileBars stats={stats} />
            </CardSection>
            <CardSection title="Statistiques">
              <StatisticsList
                stats={stats}
                name={profile.name}
                relation={profile.relation}
              />
            </CardSection>
            {!!stats.games.length && (
              <CardSection title="Détail par jeu">
                <GameBreakdown stats={stats} />
              </CardSection>
            )}
          </>
        ) : (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-4 text-sm text-muted-foreground">
            <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {profile.name} garde son profil privé.
          </p>
        )}

        {self && (
          <Accordion type="single" collapsible className="mt-5 w-full">
            <AccordionItem value="referral" className="border-white/[0.07]">
              <AccordionTrigger className="text-sm font-bold tracking-wide uppercase hover:no-underline">
                <span className="flex items-center gap-2">
                  <Gift className="size-4 text-minuit-purple" />
                  Parrainage
                </span>
              </AccordionTrigger>
              <AccordionContent className="pt-1">
                <ReferralPanel />
              </AccordionContent>
            </AccordionItem>
            {profile.visibility && (
              <AccordionItem value="privacy" className="border-white/[0.07]">
                <AccordionTrigger className="text-sm font-bold tracking-wide uppercase hover:no-underline">
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-minuit-purple" />
                    Confidentialité
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pt-1">
                  <VisibilitySettings visibility={profile.visibility} />
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        )}

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
    <div className="mt-5 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
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

function CardSkeleton() {
  return (
    <>
      <CardHeaderBand>
        <DialogTitle className="sr-only">Chargement du profil</DialogTitle>
        <DialogDescription className="sr-only">Chargement…</DialogDescription>
        <div className="relative flex items-center justify-center gap-3 pt-11 sm:pt-13">
          <Skeleton className="absolute -top-1 left-1/2 size-20 -translate-x-1/2 rounded-full bg-white/15 sm:size-24" />
          <Skeleton className="h-11 flex-1 rounded-full bg-white/10" />
          <span className="w-[86px] sm:w-[104px]" />
          <Skeleton className="h-11 flex-1 rounded-full bg-white/10" />
        </div>
      </CardHeaderBand>
      <div className="px-4 py-5 sm:px-6">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="mt-4 h-24 rounded-2xl" />
        <Skeleton className="mt-4 h-40 rounded-2xl" />
      </div>
    </>
  );
}
