import Link from "next/link";
import { APP_NAME, NAV } from "@/config/site";
import { ConnectButton } from "./ConnectButton";
import { SocialButtons } from "./SocialButtons";

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-sm font-extrabold tracking-tight" aria-label={`${APP_NAME} home`}>
          <span aria-hidden className="grid h-6 w-6 place-items-center rounded bg-gradient-to-br from-violet to-cyan text-[11px] text-bg">
            &gt;_
          </span>
          <span className="text-ink">{APP_NAME}</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded px-2.5 py-1.5 text-[13px] text-dim transition-colors hover:bg-panel hover:text-ink">
              <span className="text-violet">&gt;_</span> /{n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <SocialButtons />
          <div className="hidden sm:block">
            <ConnectButton compact />
          </div>
          <details className="relative md:hidden">
            <summary className="cursor-pointer list-none rounded border border-line-2 px-2.5 py-1.5 text-xs text-dim [&::-webkit-details-marker]:hidden" aria-label="Menu">
              ≡ menu
            </summary>
            <div className="absolute right-0 z-50 mt-2 w-56 rounded-md border border-line bg-panel p-2 shadow-xl">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="block rounded px-2.5 py-2 text-sm text-dim hover:bg-panel-2 hover:text-ink">
                  <span className="text-violet">&gt;_</span> /{n.label}
                </Link>
              ))}
              <div className="mt-2 border-t border-line pt-2 sm:hidden">
                <ConnectButton compact />
              </div>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
