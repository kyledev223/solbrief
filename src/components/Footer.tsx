import Link from "next/link";
import { APP_NAME, APP_SLUG, SITE } from "@/config/site";

const MAP = [
  { dir: "brief", items: [["/brief/today", "today"], ["/archive", "archive"]] },
  { dir: "holders", items: [["/dashboard", "dashboard"], ["/ask", "ask"]] },
  { dir: "about", items: [["/docs", "docs"], ["/docs#sources", "sources"], ["/docs#disclaimers", "disclaimers"]] },
] as const;

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line bg-panel/60">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <div className="font-extrabold text-ink">{APP_NAME}</div>
          <p className="mt-2 text-xs leading-relaxed text-faint">{SITE.tagline}</p>
        </div>
        {MAP.map((g) => (
          <div key={g.dir} className="text-xs">
            <div className="text-dim">
              <span className="text-violet">~/</span>
              {g.dir}/
            </div>
            <ul className="mt-2 space-y-1.5">
              {g.items.map(([href, label], i) => (
                <li key={href} className="text-faint">
                  {i === g.items.length - 1 ? "└──" : "├──"}{" "}
                  <Link href={href} className="text-dim hover:text-cyan">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-[11px] text-faint sm:px-6">
          <span>
            {APP_SLUG} <span className="text-cyan">●</span> online
          </span>
          <span>{SITE.disclaimer}</span>
        </div>
      </div>
    </footer>
  );
}
