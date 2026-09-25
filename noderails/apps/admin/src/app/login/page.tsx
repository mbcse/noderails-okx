'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminAuthProvider, useAdminAuth } from '@/lib/auth';
import { Button, Input } from '@/components/ui';
import { Alert } from '@/components/page';
import { NodeRailsLogo } from '@/components/noderails-logo';

function LoginForm() {
  const { login } = useAdminAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message ?? 'Could not sign in. Check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f6f9fc] px-4 py-8">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(820px 520px at 12% -8%, rgba(99,91,255,0.16), transparent 60%), radial-gradient(640px 480px at 100% 100%, rgba(10,37,64,0.08), transparent 62%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(10,37,64,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(10,37,64,0.05) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="hidden text-[#0a2540] lg:block">
          <p className="inline-flex items-center rounded-full border border-[#d4d2ff] bg-[#f0f0ff] px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-[#635bff]">
            PLATFORM ADMIN
          </p>
          <h2 className="mt-5 text-5xl font-bold leading-[1.1] tracking-tight">
            Operations,
            <br />
            compliance, and risk
            <br />
            in one place.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-[#697386]">
            Review merchants, settle disputes, warm email campaigns, and keep chain and fee policy under control.
          </p>
          <div className="mt-8 grid max-w-xl gap-3">
            {[
              'Merchant lifecycle and compliance',
              'Disputes, bank, and webhook reliability',
              'Chain, token, and fee guardrails',
            ].map((line) => (
              <div key={line} className="rounded-xl border border-[#e3e8ee] bg-white/90 px-4 py-3 text-sm text-[#425466] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                {line}
              </div>
            ))}
          </div>
        </section>

        <div className="w-full max-w-sm justify-self-center lg:justify-self-end">
          <div className="mb-7 text-center">
            <NodeRailsLogo withText className="mx-auto mb-5 w-[280px] h-auto" />
            <h1 className="text-2xl font-bold text-[#0a2540]">Sign in</h1>
            <p className="mt-1.5 text-sm text-[#697386]">Use your platform admin credentials</p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-3xl border border-white bg-white/95 p-7 shadow-[0_24px_70px_rgba(10,37,64,0.12)] backdrop-blur"
          >
            {error && <Alert>{error}</Alert>}
            <Input
              label="Email"
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" disabled={loading} className="w-full py-2.5">
              {loading ? 'Signing in…' : 'Continue'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AdminAuthProvider>
      <LoginForm />
    </AdminAuthProvider>
  );
}
