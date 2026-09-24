export function BpcLogo({ className, withText = false }: { className?: string; withText?: boolean }) {
  return (
    <svg
      viewBox={withText ? '0 0 360 80' : '0 0 80 80'}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="bpc-grad" x1="8" y1="8" x2="72" y2="72" gradientUnits="userSpaceOnUse">
          <stop stopColor="#635bff" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="72" height="72" rx="18" fill="url(#bpc-grad)" />
      <path
        d="M22 48V32h8c4.4 0 8 3.6 8 8s-3.6 8-8 8h-8zm8-4c2.2 0 4-1.8 4-4s-1.8-4-4-4h-4v8h4z"
        fill="white"
      />
      <path d="M42 32h6l8 16 8-16h6v16h-5V39l-7 9h-4l-7-9v9h-5V32z" fill="white" fillOpacity="0.95" />
      {withText && (
        <>
          <text
            x="92"
            y="38"
            fill="#0a2540"
            fontFamily="Inter, system-ui, sans-serif"
            fontSize="28"
            fontWeight="800"
            letterSpacing="-0.5"
          >
            BPC
          </text>
          <text
            x="92"
            y="58"
            fill="#697386"
            fontFamily="Inter, system-ui, sans-serif"
            fontSize="11"
            fontWeight="600"
            letterSpacing="2.5"
          >
            BALANCE & PRICE CHECK
          </text>
        </>
      )}
    </svg>
  );
}
