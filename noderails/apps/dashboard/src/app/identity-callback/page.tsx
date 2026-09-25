'use client';

import { useEffect } from 'react';

const MESSAGE = { source: 'noderails-identity', status: 'done' } as const;

export default function IdentityCallbackPage() {
  useEffect(() => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(MESSAGE, window.location.origin);
      return;
    }
    window.location.replace('/dashboard/bank?identity=done');
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <p className="text-sm text-muted-foreground">Verification complete. Returning to Bank…</p>
    </div>
  );
}
