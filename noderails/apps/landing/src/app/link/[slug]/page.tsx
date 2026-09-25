import type { Metadata } from 'next';
import { LinkGate, LinkNotFound } from './link-gate';

const API_BASE =
  process.env.NODERAILS_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://127.0.0.1:8080';

type PublicLink = {
  slug: string;
  title: string | null;
  collectEmail: boolean;
  requirePassword: boolean;
  status: string;
};

async function fetchLink(slug: string): Promise<PublicLink | null> {
  try {
    const res = await fetch(`${API_BASE}/public/links/${encodeURIComponent(slug)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.data as PublicLink) ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const link = await fetchLink(slug);
  if (!link) {
    return { title: 'Nothing found | NodeRails', robots: { index: false, follow: false } };
  }
  return {
    title: `${link.title?.trim() || 'Link'} | NodeRails`,
    robots: { index: false, follow: false },
  };
}

export default async function ShortLinkPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const link = await fetchLink(slug);
  if (!link) return <LinkNotFound />;
  return (
    <LinkGate
      slug={link.slug}
      title={link.title}
      collectEmail={link.collectEmail}
      requirePassword={Boolean(link.requirePassword)}
    />
  );
}
