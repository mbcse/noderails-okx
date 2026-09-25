import { Reveal } from '@/components/landing/motion';

type SectionHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  align?: 'center' | 'left';
  className?: string;
  eyebrowClassName?: string;
};

export function SectionHeader({
  eyebrow,
  title,
  description,
  align = 'left',
  className = '',
  eyebrowClassName = 'text-indigo-700',
}: SectionHeaderProps) {
  const alignClass = align === 'center' ? 'mx-auto text-center' : 'text-left';

  return (
    <Reveal variant="blur" className={`mb-12 max-w-2xl ${alignClass} ${className}`}>
      <p className={`font-mono text-xs uppercase tracking-[0.2em] font-semibold ${eyebrowClassName}`}>
        {eyebrow}
      </p>
      <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.02em] text-zinc-950 sm:text-4xl">{title}</h2>
      {description ? (
        <p className="mt-3 text-base leading-relaxed text-zinc-600">{description}</p>
      ) : null}
    </Reveal>
  );
}
