/**
 * Renders the X/Twitter banner and profile picture into ./brand.
 *   npm run brand
 * Uses the same pixel font, palette and >_ mark as the site, and reads the
 * name and ticker from src/config/site.ts, so renaming the product re-draws them.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement, ReactNode } from "react";
import { ImageResponse } from "next/og";
import { APP_NAME, APP_SLUG, TOKEN } from "../src/config/site";
import { pixelMatrix } from "../src/lib/ascii";

const OUT = join(process.cwd(), "brand");
const fonts = ([400, 700, 800] as const).map((weight) => ({
  name: "JBM",
  data: readFileSync(join(OUT, "fonts", `jbm-${weight}.woff`)),
  weight,
  style: "normal" as const,
}));

const BG = "#07070c", PANEL = "#0c0b14", LINE = "#2d2742", INK = "#e6e5f0", DIM = "#9a98b3", FAINT = "#6c6a85";
const VIOLET = [139, 92, 246], CYAN = [56, 189, 248];
const VERIFIED = "#5fb3a6", RISK = "#f87171", WARN = "#fbbf24", VIOLET_SOFT = "#a78bfa";
const lerp = (a: number[], b: number[], t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;

/** Faint grid under one or more radial glows; sizes are padded so each glow layer is full-bleed. */
function grid(cell: number, glows: string[]) {
  const full = glows.map(() => "100% 100%");
  return {
    backgroundColor: BG,
    backgroundImage: [...glows, "linear-gradient(rgba(139,92,246,0.07) 1px, transparent 1px)", "linear-gradient(90deg, rgba(139,92,246,0.07) 1px, transparent 1px)"].join(", "),
    backgroundSize: [...full, `${cell}px ${cell}px`, `${cell}px ${cell}px`].join(", "),
  };
}

/** Pixel logo with the hero's one-pixel drop shadow. */
function Logo({ text, px }: { text: string; px: number }) {
  const m = pixelMatrix(text);
  const cols = m[0]?.length ?? 1;
  const at = (r: number, c: number) => r >= 0 && r < m.length && c >= 0 && c < cols && m[r][c];
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {Array.from({ length: m.length + 1 }, (_, r) => (
        <div key={r} style={{ display: "flex" }}>
          {Array.from({ length: cols + 1 }, (_, c) => {
            const on = at(r, c);
            const shade = !on && at(r - 1, c - 1);
            return (
              <div
                key={c}
                style={{
                  width: px,
                  height: px,
                  background: on ? lerp(VIOLET, CYAN, c / cols) : shade ? "rgba(139,92,246,0.22)" : "transparent",
                  boxShadow: on ? `0 0 ${px}px rgba(139,92,246,0.45)` : "none",
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Chip({ k, label, color }: { k: number; label: string; color: string }) {
  return (
    <div style={{ display: "flex", padding: `${2 * k}px ${8 * k}px`, border: `${1.5 * k}px solid ${color}`, color, fontSize: 15 * k, fontWeight: 700, marginRight: 10 * k }}>
      {label}
    </div>
  );
}

/** One row of the terminal panel: `> cmd   body`. */
function Step({ k, cmd, children }: { k: number; cmd: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginTop: 13 * k, fontSize: 17 * k }}>
      <span style={{ color: "#8b5cf6", width: 22 * k }}>{">"}</span>
      <span style={{ color: INK, width: 110 * k, fontWeight: 700 }}>{cmd}</span>
      <div style={{ display: "flex", alignItems: "center", color: DIM }}>{children}</div>
    </div>
  );
}

function Banner({ k }: { k: number }) {
  const dot = (size: number, background: string, extra = {}) => ({ width: size * k, height: size * k, borderRadius: size * k, background, ...extra });

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        // Bottom-left stays empty: X overlays the profile picture there.
        padding: `${62 * k}px ${80 * k}px 0 ${110 * k}px`,
        color: INK,
        fontFamily: "JBM",
        ...grid(44 * k, [
          "radial-gradient(ellipse 60% 80% at 30% 0%, rgba(139,92,246,0.32), transparent 70%)",
          "radial-gradient(ellipse 40% 70% at 85% 60%, rgba(56,189,248,0.10), transparent 70%)",
        ]),
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", marginTop: 8 * k }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 17 * k, color: DIM, marginBottom: 26 * k }}>
          <div style={dot(11, "#38bdf8", { marginRight: 10 * k, boxShadow: `0 0 ${12 * k}px rgba(56,189,248,0.8)` })} />
          {`${APP_SLUG} · online · ${TOKEN.symbol}`}
        </div>
        <Logo text={APP_NAME} px={13 * k} />
        <div style={{ display: "flex", marginTop: 30 * k, fontSize: 25 * k, fontWeight: 700 }}>
          <span style={{ color: "#8b5cf6", marginRight: 14 * k }}>{">_"}</span>
          The daily Solana brief.
        </div>
        <div style={{ display: "flex", marginTop: 8 * k, marginLeft: 46 * k, fontSize: 19 * k, color: DIM }}>Facts labeled. Speculation labeled.</div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: 560 * k,
          marginTop: 22 * k,
          padding: `${20 * k}px ${26 * k}px ${24 * k}px`,
          background: PANEL,
          border: `${1.5 * k}px solid ${LINE}`,
          boxShadow: `0 0 0 ${k}px rgba(139,92,246,0.25), 0 ${12 * k}px ${60 * k}px -${14 * k}px rgba(139,92,246,0.55), 0 0 ${90 * k}px -${40 * k}px rgba(56,189,248,0.7)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 14 * k, color: FAINT, paddingBottom: 12 * k, borderBottom: `${k}px solid ${LINE}` }}>
          {[RISK, WARN, VERIFIED].map((c) => (
            <div key={c} style={dot(11, c, { opacity: 0.8, marginRight: 7 * k })} />
          ))}
          <span style={{ marginLeft: 10 * k }}>{`~/${APP_SLUG} — daily run`}</span>
        </div>
        <Step k={k} cmd="collect">dexscreener · gecko · jupiter · rss</Step>
        <Step k={k} cmd="analyze">volume &gt; 3× 7d avg · liq Δ &gt; 40%</Step>
        <Step k={k} cmd="flag">
          <Chip k={k} label="LP_UNLOCKED" color={RISK} />
          <Chip k={k} label="TOP10" color={WARN} />
          <Chip k={k} label="NEW_PAIR" color={WARN} />
        </Step>
        <Step k={k} cmd="label">
          <Chip k={k} label="VERIFIED" color={VERIFIED} />
          <Chip k={k} label="SPECULATION" color={VIOLET_SOFT} />
        </Step>
        <Step k={k} cmd="publish">
          <span>12:00 UTC</span>
          <div style={dot(9, VERIFIED, { marginLeft: 14 * k, marginRight: 8 * k })} />
          <span style={{ color: VERIFIED }}>brief live</span>
          <div style={{ width: 10 * k, height: 20 * k, background: "#38bdf8", marginLeft: 12 * k }} />
        </Step>
      </div>
    </div>
  );
}

/** The >_ mark from src/app/icon.svg, centered for X's circular crop. */
function Pfp({ size }: { size: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...grid(size / 8, ["radial-gradient(circle at 50% 50%, rgba(139,92,246,0.38), transparent 62%)"]),
      }}
    >
      <svg width={size} height={size} viewBox="0 0 64 64">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
        <g transform="translate(33 32) scale(0.92) translate(-32 -32)">
          <path d="M15 21 L28 32 L15 43" fill="none" stroke="url(#g)" strokeWidth={6} strokeLinecap="square" />
          <rect x={32} y={40} width={17} height={6} fill="#38bdf8" />
        </g>
      </svg>
    </div>
  );
}

async function render(name: string, element: ReactNode, width: number, height: number) {
  const res = new ImageResponse(element as ReactElement, { width, height, fonts });
  writeFileSync(join(OUT, name), Buffer.from(await res.arrayBuffer()));
  console.log(`wrote brand/${name}`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  await render("twitter-banner-1500x500.png", <Banner k={1} />, 1500, 500);
  await render("twitter-banner-3000x1000.png", <Banner k={2} />, 3000, 1000);
  await render("twitter-pfp-1000.png", <Pfp size={1000} />, 1000, 1000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
