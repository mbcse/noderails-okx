'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, CheckCircle2, Lock, Mail, Shield } from 'lucide-react';
import * as api from '@/lib/api';
import { Input } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/loading';
import { AuthSplit } from '@/components/auth-split';

function InviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const inviteToken = searchParams.get('token') ?? '';

  const [info, setInfo] = useState<{ email: string; name: string | null; permissions: string[]; orgName: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!inviteToken) {
      setError('Missing invite token');
      setLoading(false);
      return;
    }
    api.getInviteInfo(inviteToken)
      .then(setInfo)
      .catch((err: any) => setError(err.message ?? 'Invalid or expired invite'))
      .finally(() => setLoading(false));
  }, [inviteToken]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.acceptInvite(inviteToken, password);
      setAccepted(true);
      setTimeout(() => router.push('/dashboard'), 2000);
    } catch (err: any) {
      setError(err.message ?? 'Failed to accept invite');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthSplit>
      {loading && (
        <div className="py-10 text-center">
          <Spinner />
          <p className="mt-3 text-sm text-muted-foreground">Verifying invite...</p>
        </div>
      )}

      {!loading && error && !info && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive-muted p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
          <Button variant="secondary" className="w-full" onClick={() => router.push('/login')}>
            Go to login
          </Button>
        </div>
      )}

      {accepted && (
        <div className="py-6 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-success" />
          <h2 className="text-lg font-semibold tracking-tight">You&apos;re in</h2>
          <p className="mt-1 text-sm text-muted-foreground">Redirecting to dashboard...</p>
        </div>
      )}

      {!loading && info && !accepted && (
        <>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary">Team invite</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Join {info.orgName ?? 'the team'}
          </h1>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
            <Shield className="h-3 w-3" />
            Team member
          </div>

          <form onSubmit={handleAccept} className="mt-8 space-y-4">
            <Input
              label="Email"
              type="email"
              icon={Mail}
              value={info.email}
              disabled
            />
            <Input
              label="Set password"
              type="password"
              icon={Lock}
              placeholder="Min 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            <Input
              label="Confirm password"
              type="password"
              icon={Lock}
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive-muted p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Setting up...' : 'Accept invite'}
              {!submitting && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already accepted?{' '}
            <Link href="/login" className="font-medium text-primary transition-colors hover:text-primary/80">
              Sign in
            </Link>
          </p>
        </>
      )}
    </AuthSplit>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="flex min-h-svh items-center justify-center"><Spinner /></div>}>
      <InviteContent />
    </Suspense>
  );
}
