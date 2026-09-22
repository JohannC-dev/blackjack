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
  Profile,
  RouletteCommand,
  RouletteTableState,
  TableState,
  TowerClientState,
  TowerCommand,
  TowerPublicState,
  Wallet,
} from "./types";
import { newToken } from "./identity";
import type { EmoteEvent, EmoteRequest, ReceivedEmote } from "./emotes";

const STORAGE_KEY = "minuit.profile.v1";
export function useGame() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<TableState | null>(null);
  const [pokerState, setPokerState] = useState<PokerClientState | null>(null);
  const [towerState, setTowerState] = useState<TowerClientState | null>(null);
  /** Shared wallet: only the server's wallet event sets it, never a game snapshot. */
  const [balance, setBalance] = useState<number | null>(null);
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
  const profileRef = useRef<Profile | null>(null);
  const idRef = useRef("");
  const roomRef = useRef("MINUIT");
  const storageWarned = useRef(false);
  const walletSeq = useRef(0);
  /** Whether the Tower view is open, so a reconnection re-enters its room. */
  const towerOpen = useRef(false);
  /** Whether the Roulette view is open, so a reconnection sits back down. */
  const rouletteOpen = useRef(false);

  const save = useCallback((p: Profile) => {
    profileRef.current = p;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch {
      if (!storageWarned.current) {
        setError(
          "Le stockage local est indisponible : le profil sera perdu à la fermeture.",
        );
        storageWarned.current = true;
      }
    }
  }, []);
  useEffect(() => {
    const room = new URLSearchParams(window.location.search)
      .get("table")
      ?.toUpperCase();
    if (room && /^[A-Z0-9]{4,12}$/.test(room)) roomRef.current = room;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const p = JSON.parse(stored);
        if (
          typeof p.token === "string" &&
          /^[a-f0-9-]{36}$/i.test(p.token) &&
          typeof p.name === "string" &&
          p.name.trim() &&
          typeof p.balance === "number" &&
          Number.isFinite(p.balance) &&
          p.balance >= 0
        ) {
          profileRef.current = p;
          setProfile(p);
        }
      }
    } catch {
      /* A missing or damaged profile opens onboarding. */
    }
    setLoaded(true);
  }, []);

  const token = profile?.token;
  useEffect(() => {
    if (!token) return;
    setBalance(null);
    const socket = io({
      transports: ["websocket", "polling"],
      reconnectionDelay: 700,
      reconnectionDelayMax: 4000,
    });
    socketRef.current = socket;
    socket.on("connect", () => {
      walletSeq.current = 0;
      socket
        .timeout(8000)
        .emit(
          "join",
          { profile: profileRef.current, tableId: roomRef.current },
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
      const me = snapshot.players.find((p) => p.id === idRef.current);
      if (me && profileRef.current && me.name !== profileRef.current.name)
        save({ ...profileRef.current, name: me.name });
    });
    socket.on("wallet", (wallet: Wallet) => {
      if (!wallet || wallet.seq <= walletSeq.current) return;
      walletSeq.current = wallet.seq;
      setBalance(wallet.balance);
      if (profileRef.current)
        save({ ...profileRef.current, balance: wallet.balance });
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
    socket.on("roulette:state", (snapshot: RouletteTableState) => {
      if (!snapshot || !rouletteOpen.current) return;
      setRouletteState(snapshot);
    });
    socket.on("disconnect", () => {
      setConnected(false);
      setPending(false);
    });
    socket.on("connect_error", () => setConnected(false));
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, save]);

  const register = (name: string) => {
    const p = { token: newToken(), name: name.trim(), balance: 2000 };
    save(p);
    setProfile(p);
  };
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
  const refillWallet = useCallback((): Promise<boolean> => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError("La connexion au club est interrompue.");
      return Promise.resolve(false);
    }
    setPending(true);
    return new Promise((resolve) => {
      socket
        .timeout(6000)
        .emit("wallet:refill", (timeout: Error | null, ack: Ack) => {
          setPending(false);
          if (timeout) setError("Le club ne répond pas. Réessayez.");
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
  /** Opens the Roulette: sits at the table sharing the Blackjack code. */
  const enterRoulette = useCallback(() => {
    rouletteOpen.current = true;
    const socket = socketRef.current;
    if (socket?.connected && idRef.current) socket.emit("roulette:join");
  }, []);
  /** Closes the Roulette: unplayed chips are dropped, a spin is still paid. */
  const leaveRoulette = useCallback(() => {
    rouletteOpen.current = false;
    setRouletteState(null);
    socketRef.current?.emit("roulette:leave");
  }, []);
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
  const changeTable = (tableId: string) => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError("Connectez-vous avant de changer de table.");
      return;
    }
    socket
      .timeout(6000)
      .emit(
        "join",
        { profile: profileRef.current, tableId },
        (timeout: Error | null, ack: Ack) => {
          if (timeout || !ack?.ok) {
            setError(
              timeout
                ? "La table ne répond pas."
                : (ack as { error: string }).error,
            );
            return;
          }
          roomRef.current = tableId;
          const url = new URL(window.location.href);
          url.searchParams.set("table", tableId);
          window.history.replaceState({}, "", url);
          if (rouletteOpen.current) socket.emit("roulette:join");
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
    emotes,
    sendEmote,
    dismissEmote,
    setError,
    register,
    command,
    refillWallet,
    joinBlackjack,
    pokerCommand,
    towerCommand,
    enterTower,
    leaveTower,
    minesCommand,
    rouletteCommand,
    enterRoulette,
    leaveRoulette,
    changeTable,
  };
}
