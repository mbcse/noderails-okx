'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { adminLogin, adminLogout, adminRefresh } from './api';

interface AuthState {
  token: string | null;
  email: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminRefresh()
      .then((res) => {
        setToken(res.accessToken);
        setEmail(res.admin.email);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (e: string, p: string) => {
    const res = await adminLogin(e, p);
    setToken(res.accessToken);
    setEmail(res.admin.email);
  }, []);

  const logout = useCallback(async () => {
    await adminLogout();
    setToken(null);
    setEmail(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, email, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
