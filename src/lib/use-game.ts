"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  Ack,
  Command,
  MinesCommand,
  MinesState,
  PokerClientState,
  PokerCommand,
  RouletteCommand,
  RouletteTableState,
  TableState,
  TowerClientState,
  TowerCommand,
  TowerPublicState,
  Wallet,
} from "./types";
import { useProfile, type Credentials } from "./profile-context";
import type { EmoteEvent, EmoteRequest, ReceivedEmote } from "./emotes";

export function useGame() {
  const { profile, loaded, balance, setBalance, authenticate, signOut } =
    useProfile();
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<TableState | null>(null);
  const [pokerState, setPokerState] = useState<PokerClientState | null>(null);
  const [towerState, setTowerState] = useState<TowerClientState | null>(null);
  /** Difference to add to the browser clock to compare it with server deadlines. */
  const [serverTimeOffset, setServerTimeOffset] = useState(0);
  const [minesState, setMinesState] = useState<MinesState | null>(null);
  const [rouletteState, setRouletteState] = useState<RouletteTableState | null>(
    null,
  );
  const [playerId, setPlayerId] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  /** Emotes received and not yet animated. */
  const [emotes, setEmotes] = useState<ReceivedEmote[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const idRef = useRef("");
  const roomRef = useRef<string | null>(null);
  const walletSeq = useRef(0);
  const clockSyncTimer = useRef<number | null>(null);
  /** Whether the Tower view is open, so a reconnection re-enters its room. */
  const towerOpen = useRef(false);
  /** Whether the Roulette view is open, so a reconnection re-enters its room. */
  const rouletteOpen = useRef(false);

  const token = profile?.token;
  useEffect(() => {
    if (!token) return;
    roomRef.current =
      new URLSearchParams(window.location.search).get("table")?.toUpperCase() ??
      null;
    setBalance(null);
    setServerTimeOffset(0);
    const socket = io({
      transports: ["websocket", "polling"],
      reconnectionDelay: 700,
      reconnectionDelayMax: 4000,
    });
    socketRef.current = socket;
    socket.on("connect", () => {
      walletSeq.current = 0;
      const synchronizeClock = () => {
        const sentAt = Date.now();
        socket
          .timeout(2000)
          .emit(
            "clock:sync",
            (
              timeout: Error | null,
              response: { serverTime?: number } | undefined,
            ) => {
              const receivedAt = Date.now();
              if (
                timeout ||
                !response ||
                typeof response.serverTime !== "number" ||
                !Number.isFinite(response.serverTime)
              )
                return;
              const midpoint = sentAt + (receivedAt - sentAt) / 2;
              setServerTimeOffset(response.serverTime - midpoint);
            },
          );
      };
      if (clockSyncTimer.current !== null)
        window.clearInterval(clockSyncTimer.current);
      synchronizeClock();
      clockSyncTimer.current = window.setInterval(synchronizeClock, 30_000);
      socket
        .timeout(8000)
        .emit(
          "join",
          { tableId: roomRef.current },
          (timeout: Error | null, ack: Ack) => {
            if (timeout || !ack?.ok) {
              setConnected(false);
              setError(
                timeout
                  ? "La table ne répond pas. Reconnexion en cours…"
                  : (ack as { error: string }).error,
              );
              return;
            }
            idRef.current = ack.playerId!;
            roomRef.current = ack.tableId ?? roomRef.current;
            setPlayerId(ack.playerId!);
            setConnected(true);
            if (towerOpen.current) socket.emit("tower:join");
            if (rouletteOpen.current) socket.emit("roulette:join");
          },
        );
    });
    socket.on("state", (snapshot: TableState) => {
      if (!snapshot) return;
      setState(snapshot);
    });
    socket.on("wallet", (wallet: Wallet) => {
      if (!wallet || wallet.seq <= walletSeq.current) return;
      walletSeq.current = wallet.seq;
      setBalance(wallet.balance);
    });
    socket.on("poker:state", (snapshot: PokerClientState) => {
      if (!snapshot) return;
      setPokerState(snapshot);
    });
    socket.on("tower:state", (snapshot: TowerClientState) => {
      if (!snapshot || !towerOpen.current) return;
      setTowerState(snapshot);
    });
    socket.on("tower:feed", (snapshot: TowerPublicState) => {
      if (!snapshot || !towerOpen.current) return;
      setTowerState((current) =>
        current ? { ...current, ...snapshot } : current,
      );
    });
    socket.on("emote", (event: EmoteEvent) => {
      if (!event?.id) return;
      setEmotes((current) => [
        ...current.slice(-11),
        { ...event, receivedAt: Date.now() },
      ]);
    });
    socket.on("mines:state", (snapshot: MinesState | null) => {
      setMinesState(snapshot);
    });
    socket.on("roulette:state", (snapshot: RouletteTableState | null) => {
      if (!snapshot || !rouletteOpen.current) return;
      setRouletteState(snapshot);
    });
    socket.on("disconnect", () => {
      setConnected(false);
      setPending(false);
    });
    socket.on("connect_error", () => setConnected(false));
    return () => {
      if (clockSyncTimer.current !== null) {
        window.clearInterval(clockSyncTimer.current);
        clockSyncTimer.current = null;
      }
      socket.disconnect();
      socketRef.current = null;
    };
  }, [setBalance, token]);

  const register = (credentials: Credentials) => authenticate(credentials);
  const command = useCallback((action: Command): Promise<boolean> => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError("La connexion à la table est interrompue.");
      return Promise.resolve(false);
    }
    setPending(true);
    return new Promise((resolve) => {
      socket
        .timeout(6000)
        .emit("command", action, (timeout: Error | null, ack: Ack) => {
          setPending(false);
          if (timeout)
            setError(
              "Pas de réponse du serveur. Vérifiez l’état de la table avant de réessayer.",
            );
          else if (!ack.ok) setError(ack.error);
          resolve(!timeout && ack?.ok);
        });
    });
  }, []);
  const joinBlackjack = useCallback((): Promise<boolean> => {
    const socket = socketRef.current;
    if (!socket?.connected) return Promise.resolve(false);
    return new Promise((resolve) => {
      socket
        .timeout(6000)
        .emit("blackjack:join", (timeout: Error | null, ack: Ack) => {
          if (timeout) {
            setError("La table Blackjack ne répond pas.");
            resolve(false);
            return;
          }
          if (!ack?.ok) {
            setError((ack as { error: string }).error);
            resolve(false);
            return;
          }
          resolve(true);
        });
    });
  }, []);
  const pokerCommand = useCallback((action: PokerCommand): Promise<boolean> => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError("La connexion au club est interrompue.");
      return Promise.resolve(false);
    }
    setPending(true);
    return new Promise((resolve) => {
      socket
        .timeout(6000)
        .emit("poker:command", action, (timeout: Error | null, ack: Ack) => {
          setPending(false);
          if (timeout) setError("Le serveur Poker ne répond pas.");
          else if (!ack.ok) setError(ack.error);
          resolve(!timeout && ack?.ok);
        });
    });
  }, []);
  const towerCommand = useCallback((action: TowerCommand): Promise<boolean> => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError("La connexion au club est interrompue.");
      return Promise.resolve(false);
    }
    setPending(true);
    return new Promise((resolve) => {
      socket
        .timeout(6000)
        .emit("tower:command", action, (timeout: Error | null, ack: Ack) => {
          setPending(false);
          if (timeout) setError("La Tower ne répond pas.");
          else if (!ack.ok) setError(ack.error);
          resolve(!timeout && ack?.ok);
        });
    });
  }, []);
  const sendEmote = useCallback((request: EmoteRequest) => {
    socketRef.current?.emit("emote", request);
  }, []);
  const dismissEmote = useCallback((id: string) => {
    setEmotes((current) => current.filter((event) => event.id !== id));
  }, []);
  const minesCommand = useCallback((action: MinesCommand): Promise<boolean> => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError("La connexion à la mine est interrompue.");
      return Promise.resolve(false);
    }
    setPending(true);
    return new Promise((resolve) => {
      socket
        .timeout(6000)
        .emit("mines:command", action, (timeout: Error | null, ack: Ack) => {
          setPending(false);
          if (timeout) setError("Le serveur de la mine ne répond pas.");
          else if (!ack.ok) setError(ack.error);
          resolve(!timeout && ack?.ok);
        });
    });
  }, []);
  const rouletteCommand = useCallback(
    (action: RouletteCommand): Promise<boolean> => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        setError("La connexion à la roulette est interrompue.");
        return Promise.resolve(false);
      }
      setPending(true);
      return new Promise((resolve) => {
        socket
          .timeout(6000)
          .emit(
            "roulette:command",
            action,
            (timeout: Error | null, ack: Ack) => {
              setPending(false);
              if (timeout) setError("La roulette ne répond pas.");
              else if (!ack.ok) setError(ack.error);
              resolve(!timeout && ack?.ok);
            },
          );
      });
    },
    [],
  );
  /** Opens the Tower: joins a room and restores the climb in progress. */
  const enterTower = useCallback(() => {
    towerOpen.current = true;
    const socket = socketRef.current;
    if (socket?.connected && idRef.current) socket.emit("tower:join");
  }, []);
  /** Closes the Tower: the server settles any climb in progress. */
  const leaveTower = useCallback(() => {
    towerOpen.current = false;
    setTowerState(null);
    socketRef.current?.emit("tower:leave");
  }, []);
  /** Opens a Roulette table assigned independently from the club table. */
  const enterRoulette = useCallback(() => {
    rouletteOpen.current = true;
    const socket = socketRef.current;
    if (socket?.connected && idRef.current) socket.emit("roulette:join");
  }, []);
  /** Leaves the Roulette room while keeping the shared club connection alive. */
  const leaveRoulette = useCallback(() => {
    rouletteOpen.current = false;
    setRouletteState(null);
    socketRef.current?.emit("roulette:leave");
  }, []);
  const changeTable = (tableId: string | null) => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError("Connectez-vous avant de changer de table.");
      return;
    }
    socket
      .timeout(6000)
      .emit("join", { tableId }, (timeout: Error | null, ack: Ack) => {
        if (timeout || !ack?.ok) {
          setError(
            timeout
              ? "La table ne répond pas."
              : (ack as { error: string }).error,
          );
          return;
        }
        roomRef.current = ack.tableId ?? tableId;
        const url = new URL(window.location.href);
        if (tableId === null) url.searchParams.delete("table");
        else url.searchParams.set("table", tableId);
        window.history.replaceState({}, "", url);
      });
  };
  const createPrivateTable = () => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError("Connectez-vous avant de créer une table.");
      return;
    }
    socket
      .timeout(6000)
      .emit(
        "join",
        { createPrivate: true },
        (timeout: Error | null, ack: Ack) => {
          if (timeout || !ack?.ok || !ack.tableId) {
            setError(
              timeout
                ? "La table ne répond pas."
                : !ack?.ok
                  ? (ack as { error: string }).error
                  : "La table privée n’a pas pu être créée.",
            );
            return;
          }
          roomRef.current = ack.tableId;
          const url = new URL(window.location.href);
          url.searchParams.set("table", ack.tableId);
          window.history.replaceState({}, "", url);
        },
      );
  };
  return {
    profile,
    loaded,
    connected,
    state,
    pokerState,
    towerState,
    balance,
    minesState,
    rouletteState,
    playerId,
    error,
    pending,
    serverTimeOffset,
    emotes,
    sendEmote,
    dismissEmote,
    setError,
    register,
    signOut,
    command,
    joinBlackjack,
    pokerCommand,
    towerCommand,
    enterTower,
    leaveTower,
    rouletteCommand,
    enterRoulette,
    leaveRoulette,
    minesCommand,
    changeTable,
    createPrivateTable,
  };
}
