/**
 * Logo « atome » — noyau + orbites (même géométrie que /favicon.svg).
 */
export function BrandMark({ className = "h-9 w-9 shrink-0", title = "AtomVoice" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <circle cx="20" cy="20" r="4" className="fill-discord-accent" />
      <ellipse
        cx="20"
        cy="20"
        rx="15.5"
        ry="6.5"
        className="stroke-discord-accent"
        strokeWidth="1.5"
        opacity="0.92"
        transform="rotate(0 20 20)"
      />
      <ellipse
        cx="20"
        cy="20"
        rx="15.5"
        ry="6.5"
        className="stroke-[#53b4ff]"
        strokeWidth="1.35"
        opacity="0.58"
        transform="rotate(58 20 20)"
      />
      <ellipse
        cx="20"
        cy="20"
        rx="15.5"
        ry="6.5"
        className="stroke-discord-green"
        strokeWidth="1.2"
        opacity="0.48"
        transform="rotate(118 20 20)"
      />
    </svg>
  );
}
