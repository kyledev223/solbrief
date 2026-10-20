import { SOCIAL, TOKEN } from "@/config/site";

function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

/** Generic two-tone capsule (not pump.fun's trademark logo). */
function PillIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <g transform="rotate(-45 12 12)">
        <rect x="3" y="8" width="18" height="8" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 8h5a4 4 0 0 1 0 8h-5Z" fill="currentColor" />
      </g>
    </svg>
  );
}

/**
 * X + pump.fun links. Each button only renders once its value is configured
 * (NEXT_PUBLIC_X_HANDLE / NEXT_PUBLIC_TOKEN_MINT), so there are never dead links.
 */
export function SocialButtons({ variant = "icon" }: { variant?: "icon" | "full" }) {
  const links = [
    SOCIAL.x && { href: SOCIAL.x, label: `${TOKEN.symbol} on X`, short: "x.com", Icon: XIcon },
    SOCIAL.pumpfun && { href: SOCIAL.pumpfun, label: `${TOKEN.symbol} on pump.fun`, short: "pump.fun", Icon: PillIcon },
  ].filter((l): l is { href: string; label: string; short: string; Icon: typeof XIcon } => Boolean(l));
  if (!links.length) return null;

  if (variant === "icon") {
    return (
      <div className="flex items-center gap-1.5">
        {links.map(({ href, label, Icon }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            title={label}
            className="grid h-8 w-8 place-items-center rounded border border-line-2 text-dim transition-colors hover:border-violet/60 hover:text-ink"
          >
            <Icon className="h-4 w-4" />
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {links.map(({ href, label, short, Icon }) => (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className="inline-flex items-center gap-2 rounded-md border border-line-2 bg-panel px-3.5 py-2 text-sm font-semibold text-dim transition-colors hover:border-violet/50 hover:text-ink"
        >
          <Icon className="h-4 w-4 text-cyan" />
          {short} ↗
        </a>
      ))}
    </div>
  );
}
