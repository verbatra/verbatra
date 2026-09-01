import type { CSSProperties } from "react";

export const OG_IMAGE_SIZE = { width: 1200, height: 630 };
export const OG_IMAGE_CONTENT_TYPE = "image/png";

const FRAME_BACKGROUND = [
  "radial-gradient(circle at 85% -10%, hsla(258, 47%, 74%, 0.35), transparent 60%)",
  "radial-gradient(circle at -10% 110%, hsla(291, 64%, 42%, 0.3), transparent 55%)",
  "linear-gradient(135deg, hsl(240, 24%, 6%) 0%, hsl(258, 25%, 10%) 55%, hsl(291, 40%, 12%) 100%)",
].join(", ");

const FRAME_STYLE: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  padding: "72px 88px",
  background: FRAME_BACKGROUND,
  color: "hsl(240, 30%, 94%)",
  fontFamily: "sans-serif",
};

function BrandMark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
      <div
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "10px",
          background: "linear-gradient(135deg, hsl(291, 64%, 42%), hsl(258, 47%, 74%))",
          display: "flex",
        }}
      />
      <div
        style={{
          fontSize: "26px",
          fontWeight: 700,
          letterSpacing: "6px",
          textTransform: "uppercase",
          color: "hsl(258, 47%, 74%)",
          display: "flex",
        }}
      >
        Verbatra
      </div>
    </div>
  );
}

function FooterBar({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div
        style={{
          width: "100%",
          height: "2px",
          background: "linear-gradient(90deg, hsl(291, 64%, 42%), hsl(258, 47%, 74%), transparent)",
          display: "flex",
        }}
      />
      <div style={{ fontSize: "20px", color: "hsl(240, 13%, 65%)", display: "flex" }}>{label}</div>
    </div>
  );
}

export function titleFontSize(title: string): number {
  if (title.length > 70) return 44;
  if (title.length > 44) return 54;
  return 66;
}

export function OgFrame({
  eyebrow,
  title,
  description,
  footer,
}: {
  eyebrow?: string | undefined;
  title: string;
  description?: string | undefined;
  footer: string;
}) {
  return (
    <div style={FRAME_STYLE}>
      <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
        <BrandMark />
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "980px" }}>
          {eyebrow ? (
            <div
              style={{
                fontSize: "22px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "3px",
                color: "hsl(291, 64%, 62%)",
                display: "flex",
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          <div
            style={{
              fontSize: `${titleFontSize(title)}px`,
              fontWeight: 700,
              lineHeight: 1.15,
              display: "flex",
            }}
          >
            {title}
          </div>
          {description ? (
            <div
              style={{
                fontSize: "26px",
                color: "hsl(240, 13%, 65%)",
                lineHeight: 1.4,
                display: "flex",
              }}
            >
              {description}
            </div>
          ) : null}
        </div>
      </div>
      <FooterBar label={footer} />
    </div>
  );
}
