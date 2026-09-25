import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { PostHogAnalyticsProvider } from '@/components/posthog-provider';
import './globals.css';

const saans = localFont({
  src: '../fonts/SaansUprightsVF.woff2',
  variable: '--font-sans',
  display: 'swap',
  weight: '300 800',
  fallback: [
    'SF Pro Text',
    'SF Pro Display',
    '-apple-system',
    'BlinkMacSystemFont',
    'system-ui',
    'sans-serif',
  ],
  adjustFontFallback: 'Arial',
});

const DEFAULT_SITE_URL = 'https://www.example.local';

function resolveSiteUrl(rawUrl?: string): string {
  if (!rawUrl) return DEFAULT_SITE_URL;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname === 'example.local') {
      parsed.hostname = 'www.example.local';
      parsed.protocol = 'https:';
    }
    return parsed.origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

const SITE_URL = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
const SITE_TITLE = 'NodeRails | Crypto Payment Infrastructure';
const SITE_DESCRIPTION =
  'Accept crypto payments with hosted checkout, payment links, subscriptions, invoices, and built-in dispute protection.';
const OG_IMAGE_PATH = '/og/landing-upper-panel.png';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: 'NodeRails',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    images: [
      {
        url: OG_IMAGE_PATH,
        width: 1200,
        height: 630,
        alt: 'NodeRails landing page preview',
      },
    ],
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE_PATH],
    site: '@noderails',
    creator: '@noderails',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={saans.variable}>
      <body className={`${saans.className} antialiased`}>
        <PostHogAnalyticsProvider>{children}</PostHogAnalyticsProvider>
      </body>
    </html>
  );
}
