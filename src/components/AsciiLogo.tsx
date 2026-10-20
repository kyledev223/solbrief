import { APP_NAME } from "@/config/site";
import { asciiLogo } from "@/lib/ascii";

/**
 * Renders the generated block-letter ASCII art (█ = fill, ░ = shadow) as a
 * grid of uniform cells. Web fonts rarely ship block-element glyphs, and the
 * fallback glyphs have different widths, which smears text-mode ASCII art.
 * Drawing each 2-character cell as a square keeps it crisp at any width.
 */
export function AsciiLogo({ text = APP_NAME }: { text?: string }) {
  const lines = asciiLogo(text).split("\n");
  const cols = Math.max(...lines.map((l) => Math.ceil(l.length / 2)));
  const cells = lines.flatMap((line) =>
    Array.from({ length: cols }, (_, c) => {
      const ch = line.slice(c * 2, c * 2 + 2);
      return ch === "██" ? 2 : ch === "░░" ? 1 : 0;
    }),
  );
  return (
    <div role="img" aria-label={text} className="w-full max-w-[860px]">
      <div
        aria-hidden
        className="grid drop-shadow-[0_0_22px_rgba(139,92,246,0.35)]"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: "1px" }}
      >
        {cells.map((v, i) => {
          const t = (i % cols) / cols;
          return (
            <span
              key={i}
              className="aspect-square"
              style={
                v === 2
                  ? { background: `color-mix(in oklab, #8b5cf6 ${Math.round((1 - t) * 100)}%, #38bdf8)` }
                  : v === 1
                    ? { backgroundImage: "repeating-linear-gradient(135deg, rgb(139 92 246 / 0.55) 0 1px, transparent 1px 3px)" }
                    : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}
