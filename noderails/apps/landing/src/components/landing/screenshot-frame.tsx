import Image from 'next/image';

interface ScreenshotFrameProps {
  src: string;
  alt: string;
  url?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  className?: string;
}

/** Product shot in a browser chrome. URL defaults to merchant dashboard. */
export function ScreenshotFrame({
  src,
  alt,
  url = 'merchant.example.local',
  width = 1708,
  height = 885,
  priority = false,
  className = '',
}: ScreenshotFrameProps) {
  return (
    <div className={`nr-panel overflow-hidden p-2 shadow-[var(--shadow-card-lg)] ${className}`}>
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </div>
          <div className="min-w-0 flex-1 truncate rounded-md border border-zinc-200 bg-white px-3 py-1 font-mono text-[11px] text-zinc-500">
            {url}
          </div>
        </div>
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          className="h-auto w-full"
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 1200px"
        />
      </div>
    </div>
  );
}
