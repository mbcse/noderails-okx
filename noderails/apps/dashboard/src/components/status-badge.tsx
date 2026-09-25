'use client';

import {
  Check,
  CheckCircle,
  Circle,
  Clock,
  Coins,
  CreditCard,
  Flask,
  Globe,
  Lightning,
  Pause,
  Prohibit,
  ShieldCheck,
  Warning,
  X,
  XCircle,
} from '@phosphor-icons/react';
import type { Icon } from '@/components/icons';
import { Badge } from '@/components/ui/badge';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'info' | 'outline' | 'ghost';

/* ── EnvBadge ── */

export function EnvBadge({ env, className }: { env: string; className?: string }) {
  const isProduction = /^prod/i.test(env);
  return (
    <Badge variant={isProduction ? 'success' : 'warning'} className={className}>
      {isProduction ? <Globe weight="regular" /> : <Flask weight="regular" />}
      {isProduction ? 'Production' : 'Test'}
    </Badge>
  );
}

/* ── StatusBadge ── */

const STATUS_MAP: Record<string, { variant: BadgeVariant; icon: Icon }> = {
  active: { variant: 'success', icon: CheckCircle },
  activated: { variant: 'success', icon: CheckCircle },
  live: { variant: 'success', icon: Lightning },
  verified: { variant: 'success', icon: ShieldCheck },
  approved: { variant: 'success', icon: ShieldCheck },
  complete: { variant: 'success', icon: Check },
  completed: { variant: 'success', icon: Check },
  confirmed: { variant: 'success', icon: Check },
  captured: { variant: 'success', icon: Check },
  settled: { variant: 'success', icon: Check },
  executed: { variant: 'success', icon: Check },
  dispute_resolved: { variant: 'success', icon: Check },

  pending: { variant: 'warning', icon: Clock },
  pending_review: { variant: 'warning', icon: Clock },
  capturing: { variant: 'warning', icon: Clock },
  scheduled: { variant: 'warning', icon: Clock },
  processing: { variant: 'warning', icon: Clock },
  authorized: { variant: 'default', icon: Circle },
  created: { variant: 'outline', icon: Circle },
  open: { variant: 'default', icon: Circle },
  past_due: { variant: 'warning', icon: Warning },
  partially_refunded: { variant: 'warning', icon: Warning },

  paused: { variant: 'warning', icon: Pause },
  renew: { variant: 'warning', icon: Clock },
  expired: { variant: 'ghost', icon: Prohibit },

  cancelled: { variant: 'ghost', icon: X },
  failed: { variant: 'destructive', icon: XCircle },
  capture_failed: { variant: 'destructive', icon: XCircle },
  rejected: { variant: 'destructive', icon: XCircle },
  disputed: { variant: 'destructive', icon: Warning },
  dispute_lost: { variant: 'destructive', icon: XCircle },
  refunded: { variant: 'secondary', icon: Warning },

  not_started: { variant: 'outline', icon: Circle },
};

function resolveStatus(raw: string): { variant: BadgeVariant; icon: Icon; label: string } {
  const key = raw.toLowerCase().trim().replace(/\s+/g, '_');
  const entry = STATUS_MAP[key];
  const label = raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  if (entry) return { ...entry, label };
  return { variant: 'outline', icon: Circle, label };
}

export function StatusBadge({
  status,
  label: labelOverride,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const { variant, icon: Glyph, label } = resolveStatus(status);
  return (
    <Badge variant={variant} className={className}>
      <Glyph weight="regular" />
      {labelOverride ?? label}
    </Badge>
  );
}

/* ── MetaBadge ── */

const META_ICONS: Record<string, Icon> = {
  chain: Globe,
  network: Globe,
  token: Coins,
  currency: Coins,
  card: CreditCard,
  payment: CreditCard,
};

export function MetaBadge({
  children,
  hint,
  variant = 'info',
  className,
}: {
  children: React.ReactNode;
  hint?: string;
  variant?: BadgeVariant;
  className?: string;
}) {
  const Glyph = hint ? META_ICONS[hint.toLowerCase()] : undefined;
  return (
    <Badge variant={variant} className={className}>
      {Glyph && <Glyph weight="regular" />}
      {children}
    </Badge>
  );
}
