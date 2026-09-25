'use client';

/**
 * Zero-dependency motion primitives for the landing page.
 *
 * All animation is CSS-driven (classes defined in globals.css); these
 * components only toggle classes/CSS variables via IntersectionObserver
 * and pointer events. `prefers-reduced-motion` is honored in CSS.
 */

import {
  createElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

/* ── Shared IntersectionObserver (one instance for every Reveal) ── */

type OnIntersect = () => void;

const intersectCallbacks = new WeakMap<Element, OnIntersect>();
let sharedObserver: IntersectionObserver | null = null;

function observeOnce(el: Element, cb: OnIntersect): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    cb();
    return () => {};
  }
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            intersectCallbacks.get(entry.target)?.();
            intersectCallbacks.delete(entry.target);
            sharedObserver?.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );
  }
  intersectCallbacks.set(el, cb);
  sharedObserver.observe(el);
  return () => {
    intersectCallbacks.delete(el);
    sharedObserver?.unobserve(el);
  };
}

function useInViewOnce<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return observeOnce(el, () => setInView(true));
  }, []);

  return { ref, inView };
}

/* ── Reveal: fade/slide/blur in when scrolled into view ── */

export type RevealVariant = 'up' | 'left' | 'right' | 'scale' | 'blur';

type RevealProps = {
  children: ReactNode;
  /** Element to render (div, li, section…). Defaults to div. */
  as?: ElementType;
  variant?: RevealVariant;
  /** Transition delay in ms (use for stagger). */
  delay?: number;
  className?: string;
  style?: CSSProperties;
  id?: string;
};

export function Reveal({
  children,
  as = 'div',
  variant = 'up',
  delay = 0,
  className = '',
  style,
  id,
}: RevealProps) {
  const { ref, inView } = useInViewOnce<HTMLElement>();

  const mergedStyle: CSSProperties = {
    ...(delay ? ({ '--nr-delay': `${delay}ms` } as CSSProperties) : {}),
    ...style,
  };

  return createElement(
    as,
    {
      ref,
      id,
      className: `nr-reveal nr-reveal-${variant}${inView ? ' is-in' : ''}${className ? ` ${className}` : ''}`,
      style: mergedStyle,
    },
    children,
  );
}

/* ── CountUp: animate numeric stats when they enter the viewport ── */

const NUMERIC_RE = /^([^0-9]*)([0-9][0-9,]*(?:\.[0-9]+)?)(.*)$/;

type CountUpProps = {
  /** Final display string, e.g. "99.99%", "1000+", "<30s". */
  value: string;
  className?: string;
  durationMs?: number;
};

export function CountUp({ value, className = '', durationMs = 1600 }: CountUpProps) {
  const { ref, inView } = useInViewOnce<HTMLSpanElement>();
  const [display, setDisplay] = useState<string | null>(null);

  const match = NUMERIC_RE.exec(value);

  useEffect(() => {
    if (!inView) return;
    const parsed = NUMERIC_RE.exec(value);
    if (!parsed) return;

    const numText = parsed[2];
    const target = Number.parseFloat(numText.replace(/,/g, ''));
    const decimals = numText.includes('.') ? (numText.split('.')[1]?.length ?? 0) : 0;
    const useGrouping = numText.includes(',');

    const format = (n: number) =>
      n.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping,
      });

    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setDisplay(format(target));
      return;
    }

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutExpo — fast start, precise landing
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplay(format(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, durationMs]);

  // Non-numeric values (e.g. "Multi-Chain") render as-is.
  if (!match) {
    return <span className={className}>{value}</span>;
  }

  const [, prefix, , suffix] = match;

  // Text-styling classes (e.g. gradient text) must sit on the spans that
  // actually contain the digits — background-clip:text does not inherit.
  const textClass = className ? ` ${className}` : '';

  return (
    <span ref={ref} aria-label={value} className="relative inline-block tabular-nums">
      {/* Static value reserves layout width and is the no-JS fallback. */}
      <span aria-hidden className={`nr-count-static invisible${textClass}`}>
        {value}
      </span>
      <span aria-hidden className={`nr-count-live absolute inset-0${textClass}`}>
        {prefix}
        {display ?? '0'}
        {suffix}
      </span>
    </span>
  );
}

/* ── SpotlightGroup: cursor-tracked glow on child .nr-spot cards ── */

type SpotlightGroupProps = {
  children: ReactNode;
  className?: string;
};

export function SpotlightGroup({ children, className = '' }: SpotlightGroupProps) {
  const ref = useRef<HTMLDivElement>(null);

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const root = ref.current;
    if (!root) return;
    for (const card of root.querySelectorAll<HTMLElement>('.nr-spot')) {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--nr-mx', `${e.clientX - rect.left}px`);
      card.style.setProperty('--nr-my', `${e.clientY - rect.top}px`);
    }
  };

  return (
    <div ref={ref} onPointerMove={onPointerMove} className={className}>
      {children}
    </div>
  );
}

/* ── TiltFrame: subtle pointer-driven 3D tilt (mouse only) ── */

type TiltFrameProps = {
  children: ReactNode;
  className?: string;
  /** Max tilt in degrees. Keep small for a premium feel. */
  maxTilt?: number;
};

export function TiltFrame({ children, className = '', maxTilt = 4 }: TiltFrameProps) {
  const ref = useRef<HTMLDivElement>(null);

  const reset = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'perspective(1400px) rotateX(0deg) rotateY(0deg)';
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const el = ref.current;
    if (!el) return;
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(1400px) rotateX(${(ny * -maxTilt).toFixed(2)}deg) rotateY(${(nx * maxTilt).toFixed(2)}deg)`;
  };

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      className={`transition-transform duration-300 ease-out will-change-transform ${className}`}
      style={{ transform: 'perspective(1400px) rotateX(0deg) rotateY(0deg)' }}
    >
      {children}
    </div>
  );
}
