import { create } from "zustand";

import type { AuthUser } from "@/api/auth";
import { syncThemeFromUser } from "@/store/theme";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

type SessionPayload = {
  token: string;
  user: AuthUser;
};

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  status: AuthStatus;
  setLoading: () => void;
  setSession: (payload: SessionPayload) => void;
  setUser: (user: AuthUser) => void;
  markAnonymous: () => void;
  clearSession: () => void;
};

const STORAGE_KEY = "metrolog.auth.token";

function getStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(STORAGE_KEY);
}

function persistToken(token: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (token) {
    window.localStorage.setItem(STORAGE_KEY, token);
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}

const initialToken = getStoredToken();

export const useAuthStore = create<AuthState>((set) => ({
  token: initialToken,
  user: null,
  status: initialToken ? "loading" : "anonymous",
  setLoading: () =>
    set((state) => ({
      status: state.token ? "loading" : "anonymous",
    })),
  setSession: ({ token, user }) => {
    persistToken(token);
    syncThemeFromUser(user.themePreference);
    set({
      token,
      user,
      status: "authenticated",
    });
  },
  setUser: (user) =>
    set((state) => {
      syncThemeFromUser(user.themePreference);
      return {
        token: state.token,
        user,
        status: state.token ? "authenticated" : "anonymous",
      };
    }),
  markAnonymous: () => {
    persistToken(null);
    set({
      token: null,
      user: null,
      status: "anonymous",
    });
  },
  clearSession: () => {
    persistToken(null);
    set({
      token: null,
      user: null,
      status: "anonymous",
    });
  },
}));
