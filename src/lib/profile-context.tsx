"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authClient } from "./auth-client";
import { REFERRAL_CODE_FIELD } from "./referral";
import { normalizeFriendCode } from "./social";
import type { Profile } from "./types";

export type Credentials = {
  readonly mode: "sign-in" | "sign-up";
  readonly email: string;
  readonly password: string;
  /** Cloudflare Turnstile token, only sent with sign-in requests. */
  readonly captchaToken?: string;
  readonly name?: string;
  /** Parrainage code, only ever accepted while signing up. */
  readonly referralCode?: string;
};

type ProfileContextValue = {
  readonly profile: Profile | null;
  readonly loaded: boolean;
  readonly balance: number | null;
  readonly authenticate: (credentials: Credentials) => Promise<string | null>;
  readonly signOut: () => Promise<void>;
  readonly setBalance: (balance: number | null) => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const [balance, setBalance] = useState<number | null>(null);
  const user = session.data?.user;

  useEffect(() => {
    if (!user) {
      setBalance(null);
      return;
    }
    const controller = new AbortController();
    void fetch("/api/profile", {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("profile");
        return (await response.json()) as { balance: number };
      })
      .then((profile) => setBalance(profile.balance))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setBalance(null);
      });
    return () => controller.abort();
  }, [user?.id]);

  const authenticate = useCallback(async (credentials: Credentials) => {
    if (credentials.mode === "sign-up") {
      const referralCode = normalizeFriendCode(credentials.referralCode ?? "");
      const result = await authClient.signUp.email({
        name: credentials.name?.trim() ?? "",
        email: credentials.email.trim(),
        password: credentials.password,
        // Travels with the sign-up: the server binds the parrainage there.
        ...(referralCode ? { [REFERRAL_CODE_FIELD]: referralCode } : {}),
      });
      return result.error?.message ?? null;
    }
    const result = await authClient.signIn.email({
      email: credentials.email.trim(),
      password: credentials.password,
      ...(credentials.captchaToken
        ? {
            fetchOptions: {
              headers: { "x-captcha-response": credentials.captchaToken },
            },
          }
        : {}),
    });
    return result.error?.message ?? null;
  }, []);

  const signOut = useCallback(async () => {
    await authClient.signOut();
    setBalance(null);
  }, []);

  const profile = useMemo<Profile | null>(
    () =>
      user
        ? {
            token: user.id,
            name: user.name,
            email: user.email,
            balance: balance ?? 0,
          }
        : null,
    [balance, user],
  );

  return (
    <ProfileContext.Provider
      value={{
        profile,
        loaded: !session.isPending,
        balance,
        authenticate,
        signOut,
        setBalance,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const value = useContext(ProfileContext);
  if (!value)
    throw new Error("useProfile doit être utilisé dans ProfileProvider.");
  return value;
}
