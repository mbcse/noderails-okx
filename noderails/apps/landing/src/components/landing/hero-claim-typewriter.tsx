'use client';

import { useEffect, useState } from 'react';

const CLAIM_PARTS = [
  { text: 'The most ', mark: false },
  { text: 'advanced', mark: true },
  { text: ' and ', mark: false },
  { text: 'comprehensive', mark: true },
  { text: ' gateway for checkout, payouts, and settlement.', mark: false },
] as const;

const FULL_CLAIM = CLAIM_PARTS.map((part) => part.text).join('');
const CHAR_MS = 26;
const START_MS = 480;

function renderClaim(length: number) {
  let left = length;
  const nodes = [];

  for (let i = 0; i < CLAIM_PARTS.length; i += 1) {
    if (left <= 0) break;
    const part = CLAIM_PARTS[i];
    const slice = part.text.slice(0, left);
    left -= slice.length;
    nodes.push(
      part.mark ? (
        <span key={i} className="nr-mark-cloud">
          {slice}
        </span>
      ) : (
        <span key={i}>{slice}</span>
      ),
    );
  }

  return nodes;
}

export function HeroClaimTypewriter() {
  const [count, setCount] = useState(0);
  const [showCaret, setShowCaret] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setCount(FULL_CLAIM.length);
      return;
    }

    let cancelled = false;
    let tickTimer = 0;
    let i = 0;
    setCount(0);
    setShowCaret(true);

    const startTimer = window.setTimeout(function tick() {
      if (cancelled) return;
      i += 1;
      setCount(i);
      if (i < FULL_CLAIM.length) {
        tickTimer = window.setTimeout(tick, CHAR_MS);
        return;
      }
      tickTimer = window.setTimeout(() => {
        if (!cancelled) setShowCaret(false);
      }, 1600);
    }, START_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      window.clearTimeout(tickTimer);
    };
  }, []);

  return (
    <p className="mx-auto mt-5 min-h-[3.4em] max-w-xl text-[17px] font-normal leading-snug tracking-[-0.012em] text-zinc-700 sm:text-[19px] lg:mx-0">
      <span className="sr-only">{FULL_CLAIM}</span>
      <span aria-hidden="true">
        {renderClaim(count)}
        {showCaret ? <span className="nr-caret nr-caret-claim" /> : null}
      </span>
    </p>
  );
}
