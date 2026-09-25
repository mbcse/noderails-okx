'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { NodeRailsLogo } from '@/components/noderails-logo';
import { TrackedLink } from '@/components/tracked-link';
import { ProductsNavDropdown } from '@/components/landing/products-nav-dropdown';

type NavLink = { label: string; href: string };

type LandingNavProps = {
  links: readonly NavLink[];
  loginHref: string;
};

/**
 * Sticky nav with a scroll progress beam and a condensing frosted
 * backdrop once the page scrolls. Content matches the original nav.
 */
export function LandingNav({ links, loginHref }: LandingNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      setScrolled(y > 12);
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, y / max) : 0;
      progressRef.current?.style.setProperty('transform', `scaleX(${p.toFixed(4)})`);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <header className={`nr-nav sticky top-0 z-50${scrolled ? ' is-scrolled' : ''}`}>
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6 sm:gap-4 lg:px-12">
        <a href="/" className="flex min-w-0 shrink items-center">
          <NodeRailsLogo withText className="h-auto w-[min(160px,42vw)] sm:w-[200px] lg:w-[220px]" />
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          <ProductsNavDropdown triggerClassName="nr-nav-link" />
          {links.map((item) => (
            <a key={item.label} href={item.href} className="nr-nav-link">
              {item.label}
            </a>
          ))}
        </nav>

        <TrackedLink
          href={loginHref}
          event="landing_login_clicked"
          properties={{ location: 'nav' }}
          className="nr-btn-cloud inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-3 py-2 text-xs font-semibold text-white sm:px-4 sm:text-sm"
        >
          <span className="sm:hidden">Login</span>
          <span className="hidden sm:inline">Merchant Login</span>
          <ChevronRight className="h-4 w-4" />
        </TrackedLink>
      </div>
      <div ref={progressRef} className="nr-progress" aria-hidden />
    </header>
  );
}
