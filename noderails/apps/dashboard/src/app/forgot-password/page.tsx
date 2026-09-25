'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Mail } from 'lucide-react';
import { Input } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { AuthSplit } from '@/components/auth-split';
import * as api from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await api.requestPasswordReset(email);
      setSent(true);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to send reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthSplit>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary">Account recovery</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Forgot password</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Enter your merchant email and we will send a reset link.
      </p>

      {sent ? (
        <div className="mt-8 space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-success/20 bg-success-muted p-3 text-sm text-success">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            If an account exists for this email, a password reset link has been sent.
          </div>
          <Button asChild className="w-full">
            <Link href="/login">
              <ArrowLeft className="h-4 w-4" />
              Back to login
            </Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <Input
            label="Merchant email"
            type="email"
            icon={Mail}
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive-muted p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Sending link...' : 'Send reset link'}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remember your password?{' '}
        <Link href="/login" className="font-medium text-primary transition-colors hover:text-primary/80">
          Sign in
        </Link>
      </p>
    </AuthSplit>
  );
}
