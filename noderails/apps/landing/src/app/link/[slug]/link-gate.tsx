'use client';

import { useEffect, useMemo, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8080';

type Props = {
  slug: string;
  title: string | null;
  collectEmail: boolean;
  requirePassword: boolean;
};

export function LinkGate({ slug, title, collectEmail, requirePassword }: Props) {
  const needsGate = collectEmail || requirePassword;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(!needsGate);

  const status = useMemo(() => {
    if (busy && !needsGate) return 'Redirecting...';
    if (busy) return 'Opening...';
    if (collectEmail && requirePassword) return 'Enter your email and password to continue';
    if (collectEmail) return 'Enter your email to continue';
    if (requirePassword) return 'Enter the password to continue';
    return 'Redirecting...';
  }, [busy, needsGate, collectEmail, requirePassword]);

  const canSubmit =
    (!collectEmail || Boolean(email.trim())) && (!requirePassword || Boolean(password));

  useEffect(() => {
    if (needsGate) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/public/links/${encodeURIComponent(slug)}/click`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error?.message || 'Could not open link');
        }
        const dest = json?.data?.redirectTo as string | undefined;
        if (!dest) throw new Error('Missing redirect');
        if (!cancelled) window.location.replace(dest);
      } catch (err) {
        if (!cancelled) {
          setBusy(false);
          setError(err instanceof Error ? err.message : 'Could not open link');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, needsGate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/public/links/${encodeURIComponent(slug)}/access`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(collectEmail ? { email } : {}),
          ...(requirePassword ? { password } : {}),
          referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error?.message || 'Could not continue');
      }
      const dest = json?.data?.redirectTo as string | undefined;
      if (!dest) throw new Error('Missing redirect');
      window.location.replace(dest);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Could not continue');
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-white text-slate-900">
      <div className="hero-mesh" aria-hidden />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
        <a href="/" className="mb-10 text-sm font-semibold tracking-tight text-zinc-700">
          NodeRails
        </a>
        <div className="glass-card rounded-2xl p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-800">
            {title?.trim() || 'Continue'}
          </h1>
          <p className="mt-2 text-sm text-zinc-500">{status}</p>

          {needsGate && (
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              {collectEmail && (
                <label className="block text-sm font-medium text-zinc-700">
                  Email
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    disabled={busy}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                    placeholder="you@company.com"
                  />
                </label>
              )}
              {requirePassword && (
                <label className="block text-sm font-medium text-zinc-700">
                  Password
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    disabled={busy}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                    placeholder="Enter password"
                  />
                </label>
              )}
              <button
                type="submit"
                disabled={busy || !canSubmit}
                className="nr-btn-cloud inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? 'Opening...' : 'Continue'}
              </button>
            </form>
          )}

          {!needsGate && busy && (
            <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-violet-500" />
            </div>
          )}

          {error && (
            <p className="mt-4 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

export function LinkNotFound() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-white text-slate-900">
      <div className="hero-mesh" aria-hidden />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
        <a href="/" className="mb-10 text-sm font-semibold tracking-tight text-zinc-700">
          NodeRails
        </a>
        <div className="glass-card rounded-2xl p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-800">Nothing found</h1>
          <p className="mt-2 text-sm text-zinc-500">
            This link is missing, disabled, or no longer available.
          </p>
          <a
            href="/"
            className="mt-6 inline-flex text-sm font-semibold text-violet-700 hover:text-violet-900"
          >
            Back to NodeRails
          </a>
        </div>
      </div>
    </main>
  );
}
