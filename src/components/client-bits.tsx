"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/** Types the text once; shows it instantly when reduced motion is preferred. */
export function TypingText({ text, speed = 22 }: { text: string; speed?: number }) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setN((x) => (x >= text.length ? (clearInterval(id), x) : x + 1)), speed);
    return () => clearInterval(id);
  }, [text, speed, reduced]);
  const shown = reduced ? text.length : n;
  return (
    <span aria-label={text}>
      <span aria-hidden>{text.slice(0, shown)}</span>
      <span aria-hidden className="ml-0.5 inline-block h-[1.05em] w-[0.55em] translate-y-[0.18em] animate-blink bg-cyan" />
    </span>
  );
}

export function CopyButton({ value, label = "copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // clipboard unavailable — user can select the text manually
        }
      }}
      className="shrink-0 rounded border border-line-2 px-2 py-1 text-[11px] text-dim hover:border-violet/60 hover:text-ink"
      aria-live="polite"
    >
      {done ? "✓ copied" : `>_ ${label}`}
    </button>
  );
}

/** Terminal prompt on the landing page; routes the question to /ask. */
export function PromptInput() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = q.trim();
        router.push(v ? `/ask?q=${encodeURIComponent(v.slice(0, 500))}` : "/ask");
      }}
      className="flex w-full items-center gap-2 rounded-md border border-line-2 bg-bg/80 px-3 py-2.5 focus-within:border-violet/60 glow"
    >
      <label htmlFor="landing-prompt" className="shrink-0 text-sm text-violet">
        ask@brief:~$
      </label>
      <input
        id="landing-prompt"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="which launches today have mint authority enabled?"
        className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-faint focus:outline-none"
        maxLength={500}
        autoComplete="off"
      />
      <button type="submit" className="shrink-0 text-xs text-cyan hover:text-ink">
        ⏎ run
      </button>
    </form>
  );
}
