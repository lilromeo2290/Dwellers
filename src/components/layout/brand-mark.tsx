/**
 * Dwellers — Brand mark (pure CSS/SVG, no image assets needed).
 */
export function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`${className} inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm`}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        {/* Roofline */}
        <path
          d="M3.5 10.5 12 4l8.5 6.5"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Walls with door gap */}
        <path
          d="M5.5 10.5V19h5m3 0h5v-8.5"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.75"
        />
        {/* Keystone block */}
        <rect x="10.6" y="14.2" width="2.8" height="4.8" rx="0.7" fill="currentColor" />
      </svg>
    </span>
  )
}
