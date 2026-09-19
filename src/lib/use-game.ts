"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  Ack,
  Command,
  PokerClientState,
  PokerCommand,
  Profile,
  TableState,
} from "./types";
import { newToken } from "./identity";

const STORAGE_KEY = "minuit.profile.v1";
export function useGame() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<TableState | null>(null);
  const [pokerState, setPokerState] = useState<PokerClientState | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const idRef = useRef("");
  const roomRef = useRef("MINUIT");
  const storageWarned = useRef(false);

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
    const socket = io({
      transports: ["websocket", "polling"],
      reconnectionDelay: 700,
      reconnectionDelayMax: 4000,
    });
    socketRef.current = socket;
    socket.on("connect", () => {
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
          },
        );
    });
    socket.on("state", (snapshot: TableState) => {
      if (!snapshot) return;
      setState(snapshot);
      const me = snapshot.players.find((p) => p.id === idRef.current);
      if (me && profileRef.current)
        save({ ...profileRef.current, name: me.name, balance: me.balance });
    });
    socket.on("poker:state", (snapshot: PokerClientState) => {
      if (!snapshot) return;
      setPokerState(snapshot);
      if (profileRef.current)
        save({ ...profileRef.current, balance: snapshot.balance });
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
        },
      );
  };
  return {
    profile,
    loaded,
    connected,
    state,
    pokerState,
    playerId,
    error,
    pending,
    setError,
    register,
    command,
    pokerCommand,
    changeTable,
  };
}
