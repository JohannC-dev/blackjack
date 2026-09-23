"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "minuit.sound.enabled";
type Preloader = (context: AudioContext) => void;

type AudioSettings = {
  enabled: boolean;
  contextRef: { current: AudioContext | null };
  toggle: () => void;
};

const AudioSettingsContext = createContext<AudioSettings | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);

  const enable = useCallback(() => {
    const context = (contextRef.current ??= new AudioContext());
    void context.resume();
    setEnabled(true);
  }, []);

  const disable = useCallback(() => {
    const context = contextRef.current;
    contextRef.current = null;
    if (context) void context.close();
    setEnabled(false);
  }, []);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "1") enable();
    return () => {
      const context = contextRef.current;
      contextRef.current = null;
      if (context) void context.close();
    };
  }, [enable]);

  // Browsers may defer a saved audio preference until the next user gesture.
  useEffect(() => {
    if (!enabled) return;
    const resume = () => {
      const context = contextRef.current;
      if (context?.state === "suspended") void context.resume();
    };
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
  }, [enabled]);

  const toggle = useCallback(() => {
    if (contextRef.current) {
      disable();
      localStorage.setItem(STORAGE_KEY, "0");
    } else {
      enable();
      localStorage.setItem(STORAGE_KEY, "1");
    }
  }, [disable, enable]);

  return (
    <AudioSettingsContext.Provider value={{ enabled, contextRef, toggle }}>
      {children}
    </AudioSettingsContext.Provider>
  );
}

export function useAudioSettings() {
  const settings = useContext(AudioSettingsContext);
  if (!settings) throw new Error("AudioProvider is required");
  return settings;
}

/**
 * Game integration: pass any sample preloaders, then call the game's sound
 * functions with contextRef.current when enabled. The provider owns the
 * preference and closes the context immediately when sound is switched off.
 */
export function useGameAudio(...preloaders: Preloader[]) {
  const settings = useAudioSettings();
  const { enabled, contextRef } = settings;
  useEffect(() => {
    const context = contextRef.current;
    if (enabled && context) for (const preload of preloaders) preload(context);
  }, [enabled, contextRef, ...preloaders]);
  return settings;
}
