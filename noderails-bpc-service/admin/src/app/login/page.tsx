'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Button, Input } from '@/components/ui';
import { BpcLogo } from '@/components/bpc-logo';

export default function LoginPage() {
  const { login, loading, token } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (!loading && token) {
    router.replace('/dashboard');
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f6f9fc] px-4 py-6">
      <div className="admin-mesh" />

      <div className="relative z-10 mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="hidden lg:block">
          <p className="inline-flex items-center rounded-full border border-[#d4d2ff] bg-[#f0f0ff] px-3 py-1 text-xs font-semibold tracking-wide text-[#635bff]">
            BPC ADMIN
          </p>
          <h2 className="mt-5 text-5xl font-bold leading-tight tracking-tight text-[#0a2540]">
            Chains, RPCs,
            <br />
            tokens, and prices.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-[#697386]">
            Operate the Balance and Price Check service: monitor health, manage failover RPC pools,
            register tokens, and tune price source adapters.
          </p>

          <div className="mt-8 grid max-w-xl gap-3">
            {[
              'Multichain RPC failover with LeanRPC priority',
              'Token registry aligned with NodeRails tokenKey',
              'Multi-source price aggregation and cache controls',
            ].map((line) => (
              <div
                key={line}
                className="rounded-xl border border-[#e3e8ee] bg-white/90 px-4 py-3 text-sm text-[#425466] shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              >
                {line}
              </div>
            ))}
          </div>
        </section>

        <div className="w-full max-w-sm justify-self-center lg:justify-self-end">
          <div className="mb-8 text-center">
            <BpcLogo withText className="mx-auto mb-5 h-14 w-auto" />
            <h1 className="text-2xl font-bold text-[#0a2540]">Admin login</h1>
            <p className="mt-1.5 text-sm text-[#697386]">Sign in to manage BPC infrastructure</p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl border border-[#e3e8ee] bg-white p-7 shadow-[0_16px_48px_rgba(10,37,64,0.08)]"
          >
            {error && (
              <div className="rounded-lg border border-[#fbb8c5] bg-[#fdf2f4] p-3 text-sm text-[#df1b41]">
                {error}
              </div>
            )}

            <Input
              label="Email"
              type="email"
              placeholder="admin@bpc.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <Button type="submit" disabled={loading} className="w-full py-2.5">
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
