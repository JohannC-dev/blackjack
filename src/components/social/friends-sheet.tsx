"use client";

import {
  Check,
  Clock3,
  Copy,
  EllipsisVertical,
  Inbox,
  LoaderCircle,
  Lock,
  Search,
  Send,
  UserMinus,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FRIEND_CODE_LENGTH,
  INVITE_GAME_LABELS,
  formatFriendCode,
  normalizeFriendCode,
  type Friend,
  type PlayerSearchResult,
} from "@/lib/social";
import { SocialApiError, socialApi } from "@/lib/social-api";
import { PlayerAvatar } from "./player-avatar";
import { useSocial } from "./social-provider";

export type FriendsTab = "friends" | "requests" | "search";

export function FriendsSheet({
  open,
  onOpenChange,
  tab,
  onTabChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: FriendsTab;
  onTabChange: (tab: FriendsTab) => void;
}) {
  const social = useSocial();
  const friends = social.overview?.friends ?? [];
  const requestCount = social.pendingCount;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 border-white/[0.06] bg-[#13111b] p-0 font-sans text-foreground sm:max-w-[420px]"
      >
        <SheetHeader className="gap-3 border-b border-white/[0.06] px-5 pt-5 pb-4">
          <div>
            <SheetTitle className="font-display text-lg font-semibold">
              Amis
            </SheetTitle>
            <SheetDescription className="text-[13px]">
              Retrouvez vos amis et jouez à la même table.
            </SheetDescription>
          </div>
          <FriendCodeCard code={social.overview?.me.friendCode ?? null} />
        </SheetHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => onTabChange(value as FriendsTab)}
          className="min-h-0 flex-1 gap-0"
        >
          <div className="px-5 pt-4">
            <TabsList className="grid w-full grid-cols-3 bg-white/[0.04]">
              <TabsTrigger
                value="friends"
                className="data-[state=active]:bg-accent"
              >
                Amis
                {!!friends.length && (
                  <span className="text-xs text-muted-foreground">
                    {friends.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="requests"
                className="data-[state=active]:bg-accent"
              >
                Demandes
                {!!requestCount && (
                  <Badge className="h-4 min-w-4 rounded-full px-1 text-[10px] tabular-nums">
                    {requestCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="search"
                className="data-[state=active]:bg-accent"
              >
                Rechercher
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="friends"
            className="flex min-h-0 flex-col data-[state=inactive]:hidden"
          >
            <InviteSettings />
            <ScrollArea className="min-h-0 flex-1">
              <FriendsList onSearch={() => onTabChange("search")} />
            </ScrollArea>
          </TabsContent>
          <TabsContent
            value="requests"
            className="min-h-0 data-[state=inactive]:hidden"
          >
            <ScrollArea className="h-full">
              <RequestsList />
            </ScrollArea>
          </TabsContent>
          <TabsContent
            value="search"
            className="flex min-h-0 flex-col data-[state=inactive]:hidden"
          >
            <PlayerSearch active={open && tab === "search"} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function FriendCodeCard({ code }: { code: string | null }) {
  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(formatFriendCode(code));
      toast.success("Code ami copié.");
    } catch {
      toast.error("Copie impossible, notez-le à la main.");
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Votre code ami
        </div>
        {code ? (
          <div className="font-mono text-[15px] font-semibold tracking-[0.12em] text-minuit-purple">
            {formatFriendCode(code)}
          </div>
        ) : (
          <Skeleton className="mt-1 h-5 w-28" />
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={copy}
        disabled={!code}
        className="text-muted-foreground"
      >
        <Copy />
        Copier
      </Button>
    </div>
  );
}

function InviteSettings() {
  const social = useSocial();
  const context = social.inviteContext;
  const game = INVITE_GAME_LABELS[context.game];
  const destination = !context.canBePrivate
    ? `${game} · votre ami rejoindra le jeu`
    : context.isPrivate
      ? `${game} · votre table privée ${context.tableId ?? ""}`
      : social.privateInvite
        ? `${game} · une nouvelle table privée`
        : `${game} · votre table ${context.tableId ?? ""}`;
  return (
    <div className="mx-5 mt-4 mb-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-3">
        <Label
          htmlFor="private-invite"
          className="flex min-w-0 flex-col items-start gap-0.5"
        >
          <span className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Lock className="size-3.5 text-minuit-purple" />
            Créer une table privée
          </span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {destination.trim()}
          </span>
        </Label>
        <Switch
          id="private-invite"
          checked={
            context.isPrivate || (context.canBePrivate && social.privateInvite)
          }
          disabled={!context.canBePrivate || context.isPrivate}
          onCheckedChange={social.setPrivateInvite}
        />
      </div>
    </div>
  );
}

function FriendsList({ onSearch }: { onSearch: () => void }) {
  const social = useSocial();
  if (social.loading) return <ListSkeleton />;
  if (social.error && !social.overview)
    return (
      <EmptyState
        icon={<Users />}
        title="Amis indisponibles"
        text={social.error}
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void social.refresh()}
          >
            Réessayer
          </Button>
        }
      />
    );
  const friends = [...(social.overview?.friends ?? [])].sort(
    (left, right) => Number(right.online) - Number(left.online),
  );
  if (!friends.length)
    return (
      <EmptyState
        icon={<Users />}
        title="Pas encore d’amis"
        text="Cherchez un joueur par son pseudo ou partagez votre code ami."
        action={
          <Button size="sm" onClick={onSearch}>
            <UserPlus />
            Ajouter un ami
          </Button>
        }
      />
    );
  const online = friends.filter((friend) => friend.online).length;
  return (
    <div className="px-3 pb-4">
      <SectionTitle>
        {online} en ligne · {friends.length} ami{friends.length > 1 ? "s" : ""}
      </SectionTitle>
      {friends.map((friend) => (
        <FriendRow key={friend.id} friend={friend} />
      ))}
    </div>
  );
}

function FriendRow({ friend }: { friend: Friend }) {
  const social = useSocial();
  const inviting = social.invitingId === friend.id;
  return (
    <PlayerRow
      id={friend.id}
      name={friend.name}
      online={friend.online}
      detail={friend.online ? "En ligne" : "Hors ligne"}
      detailClassName={friend.online ? "text-minuit-mint" : undefined}
    >
      <Button
        size="sm"
        variant={friend.online ? "default" : "secondary"}
        disabled={!friend.online || !!social.invitingId}
        onClick={() => void social.inviteFriend(friend)}
        title={
          friend.online
            ? `Inviter ${friend.name}`
            : `${friend.name} n’est pas connecté`
        }
      >
        {inviting ? <LoaderCircle className="animate-spin" /> : <Send />}
        Inviter
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground"
            aria-label={`Actions pour ${friend.name}`}
          >
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => social.openProfile(friend.id)}>
            <UserRound />
            Voir le profil
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => void social.remove(friend.id)}
          >
            <UserMinus />
            Retirer des amis
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </PlayerRow>
  );
}

function RequestsList() {
  const social = useSocial();
  if (social.loading) return <ListSkeleton />;
  const incoming = social.overview?.incoming ?? [];
  const outgoing = social.overview?.outgoing ?? [];
  const invites = social.gameInvites;
  if (!incoming.length && !outgoing.length && !invites.length)
    return (
      <EmptyState
        icon={<Inbox />}
        title="Aucune demande"
        text="Les demandes d’ami et les invitations à jouer arrivent ici."
      />
    );
  return (
    <div className="px-3 pt-3 pb-4">
      {!!invites.length && (
        <>
          <SectionTitle>Invitations à jouer</SectionTitle>
          {invites.map((invite) => (
            <PlayerRow
              key={invite.id}
              id={invite.from.id}
              name={invite.from.name}
              online
              detail={`${INVITE_GAME_LABELS[invite.game]}${invite.private ? " · table privée" : ""}`}
              detailClassName="text-minuit-purple"
            >
              <Button
                size="sm"
                onClick={() => void social.acceptInvite(invite)}
              >
                Rejoindre
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground"
                aria-label="Refuser l’invitation"
                onClick={() => social.declineInvite(invite)}
              >
                <X />
              </Button>
            </PlayerRow>
          ))}
        </>
      )}
      {!!incoming.length && (
        <>
          <SectionTitle>Reçues</SectionTitle>
          {incoming.map((request) => (
            <PlayerRow
              key={request.id}
              id={request.player.id}
              name={request.player.name}
              detail="Veut devenir votre ami"
            >
              <Button
                size="sm"
                onClick={() => void social.respond(request.id, true)}
              >
                <Check />
                Accepter
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground"
                aria-label="Refuser la demande"
                onClick={() => void social.respond(request.id, false)}
              >
                <X />
              </Button>
            </PlayerRow>
          ))}
        </>
      )}
      {!!outgoing.length && (
        <>
          <SectionTitle>Envoyées</SectionTitle>
          {outgoing.map((request) => (
            <PlayerRow
              key={request.id}
              id={request.player.id}
              name={request.player.name}
              detail="En attente de réponse"
            >
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => void social.remove(request.player.id)}
              >
                Annuler
              </Button>
            </PlayerRow>
          ))}
        </>
      )}
    </div>
  );
}

/** Keeps what was typed as a friend code: ABCD-EFGH. */
function typedFriendCode(input: string) {
  const code = input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, FRIEND_CODE_LENGTH);
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

function PlayerSearch({ active }: { active: boolean }) {
  const social = useSocial();
  const [query, setQuery] = useState("");
  // undefined: nothing looked up yet, null: nobody has this code.
  const [result, setResult] = useState<PlayerSearchResult | null>();
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  // A single lookup, once the code is complete.
  const code = normalizeFriendCode(query);
  useEffect(() => {
    setResult(undefined);
    setError(null);
    if (!active || !code) {
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    socialApi.findByCode(code, controller.signal).then(
      (found) => {
        setResult(found);
        setSearching(false);
      },
      (failure: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          failure instanceof SocialApiError
            ? failure.message
            : "Recherche indisponible.",
        );
        setSearching(false);
      },
    );
    return () => controller.abort();
    // The overview refreshes the relation after an answer elsewhere.
  }, [active, code, version, social.overview]);

  const act = async (action: () => Promise<boolean>) => {
    setBusy(true);
    await action();
    setBusy(false);
    setVersion((value) => value + 1);
  };

  return (
    <>
      <div className="px-5 pt-4 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(typedFriendCode(event.target.value))}
            placeholder="Code ami (ABCD-EFGH)"
            className="h-10 bg-white/[0.03] pl-9 font-mono tracking-[0.12em] uppercase"
            aria-label="Code ami du joueur"
            autoComplete="off"
            spellCheck={false}
          />
          {searching && (
            <LoaderCircle className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-3 pb-4">
          {!code ? (
            <EmptyState
              icon={<Search />}
              title="Ajoutez un ami"
              text="Saisissez son code ami complet. Il le trouve dans son menu de profil."
            />
          ) : error ? (
            <EmptyState
              icon={<Search />}
              title="Recherche indisponible"
              text={error}
            />
          ) : result === null ? (
            <EmptyState
              icon={<Search />}
              title="Aucun joueur trouvé"
              text="Vérifiez le code ami : aucun joueur ne le possède."
            />
          ) : (
            result && (
              <PlayerRow
                id={result.id}
                name={result.name}
                detail={
                  result.friendCode ? formatFriendCode(result.friendCode) : "—"
                }
                detailClassName="font-mono tracking-wider"
              >
                <SearchAction
                  result={result}
                  busy={busy}
                  onAdd={() =>
                    act(() => social.sendRequest({ userId: result.id }))
                  }
                  onAccept={() =>
                    act(() => social.respond(result.requestId!, true))
                  }
                  onCancel={() => act(() => social.remove(result.id))}
                />
              </PlayerRow>
            )
          )}
        </div>
      </ScrollArea>
    </>
  );
}

function SearchAction({
  result,
  busy,
  onAdd,
  onAccept,
  onCancel,
}: {
  result: PlayerSearchResult;
  busy: boolean;
  onAdd: () => void;
  onAccept: () => void;
  onCancel: () => void;
}) {
  const spinner = busy ? <LoaderCircle className="animate-spin" /> : null;
  switch (result.relation) {
    case "self":
      return <Badge variant="secondary">Vous</Badge>;
    case "friend":
      return (
        <Badge variant="secondary" className="gap-1">
          <Check className="size-3" />
          Ami
        </Badge>
      );
    case "outgoing":
      return (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          disabled={busy}
          onClick={onCancel}
          title="Annuler la demande"
        >
          {spinner ?? <Clock3 />}
          Envoyée
        </Button>
      );
    case "incoming":
      return (
        <Button size="sm" disabled={busy} onClick={onAccept}>
          {spinner ?? <Check />}
          Accepter
        </Button>
      );
    default:
      return (
        <Button size="sm" variant="secondary" disabled={busy} onClick={onAdd}>
          {spinner ?? <UserPlus />}
          Ajouter
        </Button>
      );
  }
}

function PlayerRow({
  id,
  name,
  online,
  detail,
  detailClassName,
  children,
}: {
  id: string;
  name: string;
  online?: boolean;
  detail: string;
  detailClassName?: string;
  children: ReactNode;
}) {
  const social = useSocial();
  return (
    <div className="group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.03]">
      <button
        type="button"
        onClick={() => social.openProfile(id)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md bg-transparent p-0 text-left focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
        aria-label={`Voir le profil de ${name}`}
      >
        <PlayerAvatar id={id} name={name} online={online} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{name}</span>
          <span
            className={
              "block truncate text-xs text-muted-foreground " +
              (detailClassName ?? "")
            }
          >
            {detail}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pt-3 pb-1.5 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
      {children}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="mb-1 grid size-11 place-items-center rounded-full bg-white/[0.04] text-minuit-purple [&_svg]:size-5">
        {icon}
      </span>
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-[260px] text-xs leading-relaxed text-muted-foreground">
        {text}
      </p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-1 px-5 pt-3">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex items-center gap-3 py-2">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
