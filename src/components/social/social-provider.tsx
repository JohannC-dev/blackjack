"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import type { CasinoView } from "@/lib/navigation";
import {
  INVITE_GAME_LABELS,
  type Friend,
  type GameInvite,
  type GameInviteReply,
  type InviteGame,
  type SocialOverview,
} from "@/lib/social";
import { SocialApiError, socialApi } from "@/lib/social-api";
import type { Ack } from "@/lib/types";
import type { useGame } from "@/lib/use-game";
import { FriendsSheet, type FriendsTab } from "./friends-sheet";
import { PlayerProfileDialog } from "./player-profile-dialog";

type Game = ReturnType<typeof useGame>;

/** A game invitation stays answerable this long. */
const INVITE_TTL_MS = 2 * 60_000;

/** Where an invitation sent now would take a friend. */
export type InviteContext = {
  game: InviteGame;
  tableId: string | null;
  /** The current table is already private. */
  isPrivate: boolean;
  /** The game is played at tables, so a private one can be created. */
  canBePrivate: boolean;
};

type SocialContextValue = {
  overview: SocialOverview | null;
  loading: boolean;
  error: string | null;
  gameInvites: GameInvite[];
  /** Received friend requests and game invitations waiting for an answer. */
  pendingCount: number;
  inviteContext: InviteContext;
  privateInvite: boolean;
  setPrivateInvite: (value: boolean) => void;
  /** Friend currently being invited. */
  invitingId: string | null;
  openFriends: (tab?: FriendsTab) => void;
  openProfile: (playerId: string) => void;
  refresh: () => Promise<void>;
  sendRequest: (
    target: { userId: string } | { code: string },
  ) => Promise<boolean>;
  respond: (requestId: string, accept: boolean) => Promise<boolean>;
  remove: (userId: string) => Promise<boolean>;
  inviteFriend: (friend: Friend) => Promise<boolean>;
  acceptInvite: (invite: GameInvite) => Promise<void>;
  declineInvite: (invite: GameInvite) => void;
};

const SocialContext = createContext<SocialContextValue | null>(null);

function errorText(error: unknown) {
  return error instanceof SocialApiError
    ? error.message
    : "Une erreur est survenue.";
}

function randomTableCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function SocialProvider({
  game,
  view,
  onNavigate,
  children,
}: {
  game: Game;
  view: CasinoView;
  onNavigate: (view: CasinoView) => void;
  children: ReactNode;
}) {
  const [overview, setOverview] = useState<SocialOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameInvites, setGameInvites] = useState<GameInvite[]>([]);
  const [privateInvite, setPrivateInvite] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [friendsTab, setFriendsTab] = useState<FriendsTab>("friends");
  const [profileId, setProfileId] = useState<string | null>(null);
  /** Bumped when friendships change, so an open profile reloads. */
  const [socialVersion, setSocialVersion] = useState(0);
  /** Private Roulette table this player created or was invited to. */
  const [privateRouletteId, setPrivateRouletteId] = useState<string | null>(
    null,
  );
  const knownIncoming = useRef<Set<string> | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;

  const refresh = useCallback(async () => {
    try {
      const next = await socialApi.overview();
      // Announce the requests that arrived since the last load.
      const known = knownIncoming.current;
      if (known)
        for (const request of next.incoming)
          if (!known.has(request.id))
            toast(`${request.player.name} vous demande en ami`, {
              id: `friend-request-${request.id}`,
              action: {
                label: "Voir",
                onClick: () => {
                  setFriendsTab("requests");
                  setFriendsOpen(true);
                },
              },
            });
      knownIncoming.current = new Set(next.incoming.map((item) => item.id));
      setOverview(next);
      setError(null);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setLoading(false);
      setSocialVersion((version) => version + 1);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const acceptInviteRef = useRef<(invite: GameInvite) => Promise<void>>(
    async () => undefined,
  );
  const declineInviteRef = useRef<(invite: GameInvite) => void>(
    () => undefined,
  );

  const socket = game.socket;
  useEffect(() => {
    if (!socket) return;
    const onChanged = () => void refresh();
    const onInvite = (invite: GameInvite) => {
      if (!invite?.id) return;
      setGameInvites((current) => [
        invite,
        ...current.filter(
          (item) => item.id !== invite.id && item.from.id !== invite.from.id,
        ),
      ]);
      toast(`${invite.from.name} vous invite`, {
        id: `invite-${invite.id}`,
        description: `${INVITE_GAME_LABELS[invite.game]}${
          invite.private
            ? " · table privée"
            : invite.tableId
              ? " · sa table"
              : ""
        }`,
        duration: 30_000,
        action: {
          label: "Rejoindre",
          onClick: () => void acceptInviteRef.current(invite),
        },
        cancel: {
          label: "Refuser",
          onClick: () => declineInviteRef.current(invite),
        },
      });
    };
    const onReply = (reply: GameInviteReply) => {
      if (!reply?.by) return;
      if (reply.accepted) toast.success(`${reply.by.name} vous rejoint.`);
      else toast(`${reply.by.name} a décliné votre invitation.`);
    };
    socket.on("friends:changed", onChanged);
    socket.on("friends:invite", onInvite);
    socket.on("friends:invite:reply", onReply);
    // Presence may have changed while disconnected.
    socket.on("connect", onChanged);
    return () => {
      socket.off("friends:changed", onChanged);
      socket.off("friends:invite", onInvite);
      socket.off("friends:invite:reply", onReply);
      socket.off("connect", onChanged);
    };
  }, [refresh, socket]);

  // Unanswered invitations expire.
  useEffect(() => {
    if (!gameInvites.length) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setGameInvites((current) =>
        current.filter((invite) => now - invite.sentAt < INVITE_TTL_MS),
      );
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [gameInvites.length]);

  const inviteContext = useMemo((): InviteContext => {
    if (view === "roulette")
      return {
        game: "roulette",
        tableId: game.rouletteState?.id ?? null,
        isPrivate:
          !!privateRouletteId && game.rouletteState?.id === privateRouletteId,
        canBePrivate: true,
      };
    if (view === "poker" || view === "tower" || view === "mines")
      return {
        game: view,
        tableId: null,
        isPrivate: false,
        canBePrivate: false,
      };
    // From the club home, friends meet at the Blackjack table.
    return {
      game: "blackjack",
      tableId: game.state?.id ?? null,
      isPrivate: game.state?.visibility === "private",
      canBePrivate: true,
    };
  }, [
    game.rouletteState?.id,
    game.state?.id,
    game.state?.visibility,
    privateRouletteId,
    view,
  ]);

  /** Leaving a Blackjack table is only allowed between rounds. */
  const canLeaveBlackjackTable = useCallback(() => {
    const { state, playerId } = gameRef.current;
    return (
      !state ||
      state.phase === "betting" ||
      !state.seats.some((seat) => seat.playerId === playerId)
    );
  }, []);

  const inviteFriend = useCallback(
    async (friend: Friend) => {
      const current = gameRef.current;
      const socket = current.socket;
      if (!socket?.connected) {
        toast.error("La connexion au club est interrompue.");
        return false;
      }
      setInvitingId(friend.id);
      try {
        let { tableId } = inviteContext;
        const { game: target } = inviteContext;
        if (
          privateInvite &&
          inviteContext.canBePrivate &&
          !inviteContext.isPrivate
        ) {
          if (target === "blackjack") {
            if (!canLeaveBlackjackTable()) {
              toast.error("Terminez la manche avant de changer de table.");
              return false;
            }
            tableId = await current.createPrivateTable();
          } else {
            const code = randomTableCode();
            tableId = (await current.joinRouletteTable(code)) ? code : null;
            if (tableId) setPrivateRouletteId(tableId);
          }
          if (!tableId) {
            toast.error("La table privée n’a pas pu être créée.");
            return false;
          }
        }
        if ((target === "blackjack" || target === "roulette") && !tableId) {
          toast.error("Votre table est en cours de connexion, réessayez.");
          return false;
        }
        const ack = await new Promise<Ack | null>((resolve) =>
          socket
            .timeout(6000)
            .emit(
              "friends:invite",
              { friendId: friend.id, game: target, tableId },
              (timeout: Error | null, value: Ack) =>
                resolve(timeout ? null : value),
            ),
        );
        if (!ack?.ok) {
          toast.error(ack ? ack.error : "Le club ne répond pas.");
          return false;
        }
        toast.success(`Invitation envoyée à ${friend.name}.`, {
          description: `${INVITE_GAME_LABELS[target]}${
            tableId && tableId !== inviteContext.tableId
              ? " · nouvelle table privée"
              : ""
          }`,
        });
        if (view === "home") onNavigate("blackjack");
        return true;
      } finally {
        setInvitingId(null);
      }
    },
    [canLeaveBlackjackTable, inviteContext, onNavigate, privateInvite, view],
  );

  const reply = useCallback((invite: GameInvite, accepted: boolean) => {
    gameRef.current.socket?.emit("friends:invite:reply", {
      inviteId: invite.id,
      toId: invite.from.id,
      accepted,
    });
  }, []);

  const declineInvite = useCallback(
    (invite: GameInvite) => {
      setGameInvites((current) =>
        current.filter((item) => item.id !== invite.id),
      );
      toast.dismiss(`invite-${invite.id}`);
      reply(invite, false);
    },
    [reply],
  );

  const acceptInvite = useCallback(
    async (invite: GameInvite) => {
      const current = gameRef.current;
      toast.dismiss(`invite-${invite.id}`);
      if (invite.game === "blackjack" && invite.tableId) {
        if (current.state?.id !== invite.tableId) {
          if (!canLeaveBlackjackTable()) {
            toast.error("Terminez votre manche avant de rejoindre votre ami.");
            return;
          }
          if (!(await current.changeTable(invite.tableId))) {
            toast.error("Impossible de rejoindre cette table.");
            return;
          }
        }
      } else if (invite.game === "roulette" && invite.tableId) {
        if (invite.private) setPrivateRouletteId(invite.tableId);
        if (!(await current.joinRouletteTable(invite.tableId))) {
          toast.error("Impossible de rejoindre cette table.");
          return;
        }
      }
      setGameInvites((items) => items.filter((item) => item.id !== invite.id));
      setFriendsOpen(false);
      reply(invite, true);
      onNavigate(invite.game);
    },
    [canLeaveBlackjackTable, onNavigate, reply],
  );
  acceptInviteRef.current = acceptInvite;
  declineInviteRef.current = declineInvite;

  const mutate = useCallback(
    async (action: () => Promise<unknown>, success?: string) => {
      try {
        await action();
        if (success) toast.success(success);
        await refresh();
        return true;
      } catch (failure) {
        toast.error(errorText(failure));
        return false;
      }
    },
    [refresh],
  );

  const sendRequest = useCallback(
    async (target: { userId: string } | { code: string }) => {
      try {
        const result = await socialApi.sendRequest(target);
        toast.success(
          result.accepted
            ? "Vous êtes maintenant amis."
            : "Demande d’ami envoyée.",
        );
        await refresh();
        return true;
      } catch (failure) {
        toast.error(errorText(failure));
        return false;
      }
    },
    [refresh],
  );
  const respond = useCallback(
    (requestId: string, accept: boolean) =>
      mutate(
        () => socialApi.respond(requestId, accept),
        accept ? "Demande acceptée." : undefined,
      ),
    [mutate],
  );
  const remove = useCallback(
    (userId: string) => mutate(() => socialApi.remove(userId)),
    [mutate],
  );

  const openFriends = useCallback((tab: FriendsTab = "friends") => {
    setFriendsTab(tab);
    setFriendsOpen(true);
  }, []);
  /**
   * Single entry point to a player's profile. It opens a dialog for now;
   * once the profile page exists, this is where it gets linked.
   */
  const openProfile = useCallback((playerId: string) => {
    setProfileId(playerId);
  }, []);

  const value = useMemo(
    (): SocialContextValue => ({
      overview,
      loading,
      error,
      gameInvites,
      pendingCount: (overview?.incoming.length ?? 0) + gameInvites.length,
      inviteContext,
      privateInvite,
      setPrivateInvite,
      invitingId,
      openFriends,
      openProfile,
      refresh,
      sendRequest,
      respond,
      remove,
      inviteFriend,
      acceptInvite,
      declineInvite,
    }),
    [
      acceptInvite,
      declineInvite,
      error,
      gameInvites,
      inviteContext,
      inviteFriend,
      invitingId,
      loading,
      openFriends,
      openProfile,
      overview,
      privateInvite,
      refresh,
      remove,
      respond,
      sendRequest,
    ],
  );

  return (
    <SocialContext.Provider value={value}>
      {children}
      <FriendsSheet
        open={friendsOpen}
        onOpenChange={setFriendsOpen}
        tab={friendsTab}
        onTabChange={setFriendsTab}
      />
      <PlayerProfileDialog
        playerId={profileId}
        version={socialVersion}
        onClose={() => setProfileId(null)}
      />
      <Toaster position="bottom-right" closeButton />
    </SocialContext.Provider>
  );
}

export function useSocial() {
  const value = useContext(SocialContext);
  if (!value)
    throw new Error("useSocial doit être utilisé dans SocialProvider.");
  return value;
}

/** For shared chrome that also renders before the player signs in. */
export function useOptionalSocial() {
  return useContext(SocialContext);
}
