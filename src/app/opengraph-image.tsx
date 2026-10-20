import { ImageResponse } from "next/og";
import { APP_NAME, SITE } from "@/config/site";
import { pixelMatrix } from "@/lib/ascii";

export const alt = `${APP_NAME} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const lerp = (a: number[], b: number[], t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
const VIOLET = [139, 92, 246];
const CYAN = [56, 189, 248];

/** Pixel-art logo drawn from the same block font as the ASCII hero. */
export default function OgImage() {
  const m = pixelMatrix(APP_NAME);
  const cols = m[0]?.length ?? 1;
  const px = Math.min(22, Math.floor(1000 / cols));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "64px 80px",
          background: "#07070c",
          backgroundImage:
            "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(139,92,246,0.35), transparent 70%), linear-gradient(rgba(139,92,246,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.07) 1px, transparent 1px)",
          backgroundSize: "100% 100%, 44px 44px, 44px 44px",
          color: "#e6e5f0",
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24, color: "#9a98b3", marginBottom: 40 }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, background: "#38bdf8" }} />
          {`${APP_NAME.toLowerCase()} ● online`}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {m.map((row, r) => (
            <div key={r} style={{ display: "flex" }}>
              {row.map((on, c) => (
                <div
                  key={c}
                  style={{
                    width: px,
                    height: px,
                    background: on ? lerp(VIOLET, CYAN, c / cols) : "transparent",
                    boxShadow: on ? "0 0 18px rgba(139,92,246,0.45)" : "none",
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", marginTop: 48, fontSize: 32, fontWeight: 700, color: "#e6e5f0" }}>
          <span style={{ color: "#8b5cf6", width: 60, flexShrink: 0 }}>{">_"}</span>
          <span style={{ display: "flex", flex: 1 }}>{SITE.tagline}</span>
        </div>
        <div style={{ display: "flex", marginTop: 20, fontSize: 22, color: "#6c6a85" }}>Daily Solana ecosystem brief · {SITE.disclaimer}</div>
      </div>
    ),
    size,
  );
}
