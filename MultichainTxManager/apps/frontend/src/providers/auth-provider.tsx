"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { setAccessToken } from "@/lib/api-client";
import type { AdminUser } from "@mtxm/shared";

// ────────────────────────────────────────────────────────────
// Context shape
// ────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ────────────────────────────────────────────────────────────
// Provider
// ────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /* On mount, attempt a silent refresh using the HttpOnly cookie.
     If the cookie exists and is valid, we get a new access token
     and can hydrate the session without localStorage. */
  useEffect(() => {
    apiClient.auth
      .refresh()
      .then((res) => {
        setAccessToken(res.data.accessToken);
        return apiClient.auth.me();
      })
      .then((res) => setUser(res.data))
      .catch(() => {
        setAccessToken(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await apiClient.auth.login({ email, password });
      const { user: loggedInUser, tokens } = response.data;
      // Store access token in memory only (refresh token is in HttpOnly cookie)
      setAccessToken(tokens.accessToken);
      setUser(loggedInUser);
      router.push("/dashboard"); 
    },
    [router],
  );

  const logout = useCallback(async () => {
    try {
      // Server-side: revoke refresh tokens + clear cookie
      await apiClient.auth.logout();
    } catch {
      // Best-effort — clear local state regardless
    }
    setAccessToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      logout,
    }),
    [user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
