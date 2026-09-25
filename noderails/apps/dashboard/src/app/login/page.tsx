'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Input } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { AuthSplit } from '@/components/auth-split';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register, merchant, teamMember, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && (merchant || teamMember)) {
      router.push('/dashboard');
    }
  }, [authLoading, merchant, teamMember, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password);
      }
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthSplit>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary">
        {mode === 'login' ? 'Welcome back' : 'Get started'}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">
        {mode === 'login' ? 'Sign in to your dashboard' : 'Create your merchant account'}
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {mode === 'login'
          ? 'Use your merchant email to access payments, payouts, and bank.'
          : 'Create an account to start accepting crypto payments.'}
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <Input
          label="Email"
          type="email"
          icon={Mail}
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          icon={Lock}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((open) => !open)}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />

        {mode === 'login' && (
          <div className="-mt-1 text-right">
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
            >
              Forgot password?
            </Link>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive-muted p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Loading...' : mode === 'login' ? 'Sign in' : 'Create account'}
          {!loading && <ArrowRight className="h-4 w-4" />}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {mode === 'login' ? (
          <>
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={() => setMode('register')}
              className="cursor-pointer font-medium text-primary transition-colors hover:text-primary/80"
            >
              Sign up
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => setMode('login')}
              className="cursor-pointer font-medium text-primary transition-colors hover:text-primary/80"
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </AuthSplit>
  );
}
