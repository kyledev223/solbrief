import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#07070c" }}>
        <div
          style={{
            width: 150,
            height: 150,
            borderRadius: 30,
            border: "6px solid #8b5cf6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 74,
            fontWeight: 800,
            color: "#38bdf8",
            fontFamily: "monospace",
          }}
        >
          {">_"}
        </div>
      </div>
    ),
    size,
  );
}
