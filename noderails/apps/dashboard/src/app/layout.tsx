import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { JetBrains_Mono } from 'next/font/google';
import { PostHogAnalyticsProvider } from '@/components/posthog-provider';
import { Toaster } from '@/components/ui/sonner';
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

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NodeRails Dashboard',
  description: 'Merchant dashboard for crypto payment management',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${saans.variable} ${jetbrainsMono.variable}`}>
      <body className={`${saans.className} antialiased`}>
        <PostHogAnalyticsProvider>{children}</PostHogAnalyticsProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
