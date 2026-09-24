"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  Ack,
  Command,
  MinesCommand,
  MinesState,
  PlinkoCommand,
  PlinkoState,
  PokerClientState,
  PokerCommand,
  RouletteCommand,
  RouletteTableState,
  TableState,
  TowerClientState,
  TowerCommand,
  TowerPublicState,
  ChickenClientState,
  ChickenPublicState,
  ChickenCommand,
  Wallet,
} from "./types";
import { useProfile, type Credentials } from "./profile-context";
import type { EmoteEvent, EmoteRequest, ReceivedEmote } from "./emotes";

/**
 * A Plinko salvo settles up to ten balls in one wallet transaction, a few
 * hundred milliseconds of SQL per ball: it can outlast the usual six seconds.
 * Giving up early would stop the auto mode while the server still drops them.
 */
const PLINKO_COMMAND_TIMEOUT_MS = 20_000;

export function useGame() {
  const { profile, loaded, balance, setBalance, authenticate, signOut } =
    useProfile();
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<TableState | null>(null);
  const [pokerState, setPokerState] = useState<PokerClientState | null>(null);
  const [towerState, setTowerState] = useState<TowerClientState | null>(null);
  const [chickenState, setChickenState] = useState<ChickenClientState | null>(
    null,
  );
  /** Difference to add to the browser clock to compare it with server deadlines. */
  const [serverTimeOffset, setServerTimeOffset] = useState(0);
  const [minesState, setMinesState] = useState<MinesState | null>(null);
  /** `undefined` until the server has answered, `null` when it has no board. */
  const [plinkoState, setPlinkoState] = useState<PlinkoState | null>();
  const [rouletteState, setRouletteState] = useState<RouletteTableState | null>(
    null,
  );
  const [playerId, setPlayerId] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  /** Emotes received and not yet animated. */
  const [emotes, setEmotes] = useState<ReceivedEmote[]>([]);
  const socketRef = useRef<Socket | null>(null);
  /** The live club connection, for features that listen to it (friends). */
  const [socket, setSocket] = useState<Socket | null>(null);
  const idRef = useRef("");
  const roomRef = useRef<string | null>(null);
  const walletSeq = useRef(0);
  const clockSyncTimer = useRef<number | null>(null);
  /** Whether the Tower view is open, so a reconnection re-enters its room. */
  const towerOpen = useRef(false);
  const chickenOpen = useRef(false);
  const chickenRoom = useRef<string | null>(null);
  /** Whether the Roulette view is open, so a reconnection re-enters its room. */
  const rouletteOpen = useRef(false);
  /** Roulette table asked for explicitly (invitation or private table). */
  const rouletteTable = useRef<string | null>(null);

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
    setSocket(socket);
    socket.on("connect", () => {
      window.dispatchEvent(new Event("deployment:check"));
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
            if (chickenOpen.current)
              socket.emit("chicken:join", { roomId: chickenRoom.current });
            if (rouletteOpen.current)
              socket.emit("roulette:join", { tableId: rouletteTable.current });
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
    socket.on("chicken:state", (snapshot: ChickenClientState) => {
      if (snapshot && chickenOpen.current) setChickenState(snapshot);
    });
    socket.on("chicken:feed", (snapshot: ChickenPublicState) => {
      if (!snapshot || !chickenOpen.current) return;
      setChickenState((current) =>
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
    socket.on("plinko:state", (snapshot: PlinkoState | null) => {
      setPlinkoState(snapshot);
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
      setSocket(null);
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
  const refill = useCallback((): Promise<boolean> => {
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
          if (timeout) setError("Le serveur ne répond pas.");
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
  const chickenCommand = useCallback(
    (action: ChickenCommand): Promise<boolean> => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        setError("La connexion à Chicken est interrompue.");
        return Promise.resolve(false);
      }
      setPending(true);
      return new Promise((resolve) => {
        socket
          .timeout(6000)
          .emit(
            "chicken:command",
            action,
            (timeout: Error | null, ack: Ack) => {
              setPending(false);
              if (timeout) setError("Chicken ne répond pas.");
              else if (!ack.ok) setError(ack.error);
              resolve(!timeout && ack?.ok);
            },
          );
      });
    },
    [],
  );
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
  const plinkoCommand = useCallback(
    (action: PlinkoCommand): Promise<boolean> => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        setError("La connexion au Plinko est interrompue.");
        return Promise.resolve(false);
      }
      setPending(true);
      return new Promise((resolve) => {
        socket
          .timeout(PLINKO_COMMAND_TIMEOUT_MS)
          .emit("plinko:command", action, (timeout: Error | null, ack: Ack) => {
            setPending(false);
            if (timeout) setError("Le serveur du Plinko ne répond pas.");
            else if (!ack.ok) setError(ack.error);
            resolve(!timeout && ack?.ok);
          });
      });
    },
    [],
  );
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
  const enterChicken = useCallback(() => {
    chickenOpen.current = true;
    const socket = socketRef.current;
    if (socket?.connected && idRef.current)
      socket.emit(
        "chicken:join",
        { roomId: chickenRoom.current },
        (ack: Ack) => {
          if (!ack.ok) {
            if (chickenRoom.current && ack.error.includes("n’existe plus")) {
              chickenRoom.current = null;
              socket.emit("chicken:join", { joinPublic: true });
            } else setError(ack.error);
          }
        },
      );
  }, []);
  const leaveChicken = useCallback(() => {
    chickenOpen.current = false;
    chickenRoom.current = null;
    setChickenState(null);
    socketRef.current?.emit("chicken:leave");
  }, []);
  const joinChickenRoom = useCallback(
    (roomId: string | null, createPrivate = false): Promise<boolean> => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        setError("La connexion à Chicken est interrompue.");
        return Promise.resolve(false);
      }
      return new Promise((resolve) => {
        socket
          .timeout(6000)
          .emit(
            "chicken:join",
            createPrivate
              ? { createPrivate: true }
              : roomId
                ? { roomId }
                : { joinPublic: true },
            (timeout: Error | null, ack: Ack) => {
              if (timeout) setError("Le salon Chicken ne répond pas.");
              else if (!ack.ok) setError(ack.error);
              else
                chickenRoom.current =
                  createPrivate || roomId ? (ack.tableId ?? roomId) : null;
              resolve(!timeout && ack?.ok);
            },
          );
      });
    },
    [],
  );
  const createPrivateChickenRoom = useCallback(async (): Promise<
    string | null
  > => {
    const joined = await joinChickenRoom(null, true);
    return joined ? chickenRoom.current : null;
  }, [joinChickenRoom]);
  /** Opens a Roulette table assigned independently from the club table. */
  const enterRoulette = useCallback(() => {
    rouletteOpen.current = true;
    const socket = socketRef.current;
    if (socket?.connected && idRef.current)
      socket.emit("roulette:join", { tableId: rouletteTable.current });
  }, []);
  /** Leaves the Roulette room while keeping the shared club connection alive. */
  const leaveRoulette = useCallback(() => {
    rouletteOpen.current = false;
    rouletteTable.current = null;
    setRouletteState(null);
    socketRef.current?.emit("roulette:leave");
  }, []);
  /**
   * Picks the Roulette table to sit at: a friend's table, or a new private
   * one. When the Roulette is not open yet, it is used as soon as it opens.
   */
  const joinRouletteTable = useCallback((tableId: string): Promise<boolean> => {
    rouletteTable.current = tableId;
    const socket = socketRef.current;
    if (!rouletteOpen.current) return Promise.resolve(true);
    if (!socket?.connected) {
      setError("La connexion à la roulette est interrompue.");
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      socket
        .timeout(6000)
        .emit(
          "roulette:join",
          { tableId },
          (timeout: Error | null, ack: Ack) => {
            if (timeout) setError("La roulette ne répond pas.");
            else if (!ack.ok) setError(ack.error);
            resolve(!timeout && ack?.ok);
          },
        );
    });
  }, []);
  const changeTable = useCallback(
    (tableId: string | null): Promise<boolean> => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        setError("Connectez-vous avant de changer de table.");
        return Promise.resolve(false);
      }
      return new Promise((resolve) => {
        socket
          .timeout(6000)
          .emit("join", { tableId }, (timeout: Error | null, ack: Ack) => {
            if (timeout || !ack?.ok) {
              setError(
                timeout
                  ? "La table ne répond pas."
                  : (ack as { error: string }).error,
              );
              resolve(false);
              return;
            }
            roomRef.current = ack.tableId ?? tableId;
            const url = new URL(window.location.href);
            if (tableId === null) url.searchParams.delete("table");
            else url.searchParams.set("table", tableId);
            window.history.replaceState({}, "", url);
            resolve(true);
          });
      });
    },
    [],
  );
  /** Moves to a new private Blackjack table and returns its code. */
  const createPrivateTable = useCallback((): Promise<string | null> => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError("Connectez-vous avant de créer une table.");
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
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
              resolve(null);
              return;
            }
            roomRef.current = ack.tableId;
            const url = new URL(window.location.href);
            url.searchParams.set("table", ack.tableId);
            window.history.replaceState({}, "", url);
            resolve(ack.tableId);
          },
        );
    });
  }, []);
  return {
    profile,
    loaded,
    connected,
    state,
    pokerState,
    towerState,
    chickenState,
    balance,
    minesState,
    plinkoState,
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
    refill,
    joinBlackjack,
    pokerCommand,
    towerCommand,
    enterTower,
    leaveTower,
    chickenCommand,
    enterChicken,
    leaveChicken,
    joinChickenRoom,
    createPrivateChickenRoom,
    rouletteCommand,
    enterRoulette,
    leaveRoulette,
    joinRouletteTable,
    minesCommand,
    plinkoCommand,
    changeTable,
    createPrivateTable,
    socket,
  };
}
