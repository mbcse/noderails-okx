'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import { Spinner } from '@/components/ui';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !token) router.replace('/login');
  }, [loading, token, router]);

  if (loading || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f9fc]">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#f6f9fc]">
      <div className="admin-mesh" />
      <Sidebar />
      <main className="relative z-10 ml-64 flex-1 p-8">{children}</main>
    </div>
  );
}
