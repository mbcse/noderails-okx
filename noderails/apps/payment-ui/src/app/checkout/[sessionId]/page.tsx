'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getCheckoutSession } from '@/lib/api';
import { PaymentLinkCheckout } from '@/components/payment-link-checkout';
import { CheckoutWeb3Provider } from '@/components/checkout-web3-provider';
import { Loader2, AlertCircle, XCircle } from 'lucide-react';

type PageState =
  | { phase: 'loading' }
  | { phase: 'not-found' }
  | { phase: 'expired'; bankReturnUrl?: string }
  | { phase: 'error'; message: string }
  | { phase: 'checkout'; sessionData: any };

function bankReturnUrlFromSession(session: {
  metadata?: unknown;
  cancelUrl?: string | null;
}): string | undefined {
  const meta = session.metadata && typeof session.metadata === 'object'
    ? (session.metadata as Record<string, unknown>)
    : null;
  if (meta?.purpose !== 'bank_global_account') return undefined;
  const cancel = typeof session.cancelUrl === 'string' ? session.cancelUrl.trim() : '';
  if (!cancel) return undefined;
  try {
    const url = new URL(cancel);
    url.searchParams.delete('cancelled');
    return url.toString();
  } catch {
    return cancel;
  }
}

export default function CheckoutSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [state, setState] = useState<PageState>({ phase: 'loading' });

  useEffect(() => {
    if (!sessionId) return;

    async function init() {
      const session = await getCheckoutSession(sessionId);
      if (session && 'error' in session && typeof session.error === 'string') {
        setState({ phase: 'error', message: session.error });
        return;
      }
      if (!session) {
        setState({ phase: 'not-found' });
        return;
      }

      if (session.status === 'EXPIRED') {
        setState({
          phase: 'expired',
          bankReturnUrl: bankReturnUrlFromSession({
            metadata: session.metadata,
            cancelUrl: typeof session.cancelUrl === 'string' ? session.cancelUrl : null,
          }),
        });
        return;
      }

      if (session.status === 'COMPLETE') {
        setState({ phase: 'error', message: 'This checkout session has already been completed.' });
        return;
      }

      setState({ phase: 'checkout', sessionData: session });
    }

    init();
  }, [sessionId]);

  if (state.phase === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--muted-foreground)]" />
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">Loading checkout...</p>
        </div>
      </div>
    );
  }

  if (state.phase === 'not-found') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-[var(--destructive)]" />
          <p className="mt-3 text-lg font-semibold">Checkout Not Found</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            This checkout session does not exist or has been deleted.
          </p>
        </div>
      </div>
    );
  }

  if (state.phase === 'expired') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="text-center">
          <XCircle className="mx-auto h-10 w-10 text-[var(--destructive)]" />
          <p className="mt-3 text-lg font-semibold">Session Expired</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            This checkout session has expired. Please request a new checkout link.
          </p>
          {state.bankReturnUrl && (
            <a
              href={state.bankReturnUrl}
              className="mt-4 inline-flex text-sm font-medium text-[var(--primary)] underline-offset-4 hover:underline"
            >
              Return to Bank
            </a>
          )}
        </div>
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-[var(--destructive)]" />
          <p className="mt-3 text-lg font-semibold">Checkout Unavailable</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{state.message}</p>
        </div>
      </div>
    );
  }

  // Map session data to PaymentLinkCheckout shape
  const { sessionData } = state;
  const firstItem = sessionData.items?.[0];

  const linkData = {
    id: sessionData.id,
    checkoutSessionId: sessionData.id,
    name: firstItem?.name ?? 'Checkout',
    description: firstItem?.description ?? null,
    slug: sessionData.id,
    amount: sessionData.amount,
    subtotal: sessionData.subtotal ?? null,
    taxAmount: sessionData.taxAmount ?? null,
    taxDescription: sessionData.taxDescription ?? null,
    currency: sessionData.currency,
    isActive: true,
    requireBillingDetails: sessionData.requireBillingDetails ?? false,
    successUrl: String(sessionData.successUrl ?? '')
      .replaceAll('{CHECKOUT_SESSION_ID}', sessionData.id) || null,
    cancelUrl: String(sessionData.cancelUrl ?? '')
      .replaceAll('{CHECKOUT_SESSION_ID}', sessionData.id) || null,
    app: sessionData.app,
    acceptedChains: sessionData.acceptedChains ?? [],
    acceptedTokens: sessionData.acceptedTokens ?? [],
    conversionEnabled: Boolean(sessionData.conversionEnabled),
    targetTokenKey: sessionData.targetTokenKey ?? null,
    productPlan: firstItem?.productPlan ?? null,
    productPlanPrice: firstItem?.productPlanPrice ?? null,
    items: sessionData.items ?? [],
  };

  return (
    <CheckoutWeb3Provider chains={linkData.acceptedChains ?? []}>
      <PaymentLinkCheckout link={linkData} />
    </CheckoutWeb3Provider>
  );
}
