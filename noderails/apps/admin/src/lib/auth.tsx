'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import posthog from 'posthog-js';
import * as api from './api';
import { track } from './analytics';

interface AdminState {
  admin: { email: string; role: string } | null;
  token: string | null;
  loading: boolean;
}

interface AdminAuthContextValue extends AdminState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

function accessTokenExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const parsed = JSON.parse(atob(padded)) as { exp?: number };
    return typeof parsed.exp === 'number' ? parsed.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AdminState>({
    admin: null,
    token: null,
    loading: true,
  });

  const commit = useCallback((next: AdminState) => {
    api.syncAdminSession(next.token);
    setState(next);
  }, []);

  // On mount, try to refresh via HttpOnly cookie
  const tryRefresh = useCallback(async () => {
    try {
      const result = await api.adminRefresh();
      commit({ admin: result.admin, token: result.accessToken, loading: false });
    } catch {
      commit({ admin: null, token: null, loading: false });
    }
  }, [commit]);

  useEffect(() => {
    tryRefresh();
  }, [tryRefresh]);

  useEffect(() => {
    return api.subscribeAdminSession((token) => {
      setState((current) => {
        if (current.token === token) return current;
        if (!token) {
          return { admin: null, token: null, loading: false };
        }
        return { ...current, token };
      });
    });
  }, []);

  useEffect(() => {
    if (state.loading || !state.token) return;

    let cancelled = false;
    const token = state.token;
    const expiresAt = accessTokenExpiryMs(token);
    if (!expiresAt) return;

    const refreshSoon = () => {
      if (cancelled) return;
      void api.refreshAdminAccessToken();
    };

    const delay = Math.max(expiresAt - Date.now() - 60_000, 5_000);
    const timer = window.setTimeout(refreshSoon, delay);

    const onVisible = () => {
      if (document.visibilityState !== 'visible' || cancelled) return;
      if (expiresAt - Date.now() < 90_000) refreshSoon();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [state.loading, state.token]);

  useEffect(() => {
    if (state.loading) return;

    if (state.admin) {
      posthog.identify(`admin:${state.admin.email.toLowerCase()}`, {
        role: state.admin.role,
      });
      return;
    }

    posthog.reset();
  }, [state.loading, state.admin]);

  const login = async (email: string, password: string) => {
    track('admin_login_submitted');
    const result = await api.adminLogin(email, password);
    commit({ admin: result.admin, token: result.accessToken, loading: false });
    track('admin_login_succeeded');
  };

  const logout = async () => {
    try {
      await api.adminLogout();
    } finally {
      commit({ admin: null, token: null, loading: false });
      track('admin_logout_succeeded');
    }
  };

  return (
    <AdminAuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be inside AdminAuthProvider');
  return ctx;
}
