'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react';
import { Input } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/loading';
import { AuthSplit } from '@/components/auth-split';
import * as api from '@/lib/api';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get('token') ?? '', [searchParams]);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Invalid or missing reset token.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthSplit>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary">Account recovery</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Set new password</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Choose a new password for your merchant account.
      </p>

      {done ? (
        <div className="mt-8 space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-success/20 bg-success-muted p-3 text-sm text-success">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            Password reset successful. You can now sign in with your new password.
          </div>
          <Button asChild className="w-full">
            <Link href="/login">
              Go to login
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <Input
            label="New password"
            type={showPassword ? 'text' : 'password'}
            icon={Lock}
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
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
          <Input
            label="Confirm new password"
            type={showPassword ? 'text' : 'password'}
            icon={Lock}
            placeholder="Re-enter new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive-muted p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Updating password...' : 'Reset password'}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </Button>
        </form>
      )}

      {!done && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Need a new reset link?{' '}
          <Link href="/forgot-password" className="font-medium text-primary transition-colors hover:text-primary/80">
            Request again
          </Link>
        </p>
      )}
    </AuthSplit>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-svh items-center justify-center"><Spinner /></div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
