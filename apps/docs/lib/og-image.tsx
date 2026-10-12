import type { CSSProperties } from "react";

export const OG_WORDMARK = "verbatra";

export const OG_IMAGE_SIZE = { width: 1200, height: 630 };

export const OG_PALETTE = {
  void: "hsl(240, 24%, 4%)",
  background: "hsl(240, 24%, 6%)",
  strong: "hsl(240, 30%, 94%)",
  muted: "hsl(240, 13%, 65%)",
  faint: "hsl(240, 13%, 58%)",
  glow: "hsl(258, 60%, 74%)",
  purple: "hsl(258, 52%, 56%)",
  glowWash: "hsla(258, 60%, 74%, 0.35)",
  purpleWash: "hsla(258, 52%, 56%, 0.3)",
  glowDeep: "hsl(258, 25%, 10%)",
  purpleDeep: "hsl(258, 40%, 12%)",
  purpleBright: "hsl(258, 60%, 66%)",
  border: "hsl(240, 23%, 22%)",
} as const;

const FRAME_BACKGROUND = [
  `radial-gradient(circle at 85% -10%, ${OG_PALETTE.glowWash}, transparent 60%)`,
  `radial-gradient(circle at -10% 110%, ${OG_PALETTE.purpleWash}, transparent 55%)`,
  `linear-gradient(135deg, ${OG_PALETTE.background} 0%, ${OG_PALETTE.glowDeep} 55%, ${OG_PALETTE.purpleDeep} 100%)`,
].join(", ");

const FRAME_STYLE: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  padding: "56px 88px",
  background: FRAME_BACKGROUND,
  color: OG_PALETTE.strong,
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
          background: `linear-gradient(135deg, ${OG_PALETTE.purple}, ${OG_PALETTE.glow})`,
          display: "flex",
        }}
      />
      <div
        style={{
          fontSize: "30px",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: OG_PALETTE.glow,
          display: "flex",
        }}
      >
        {OG_WORDMARK}
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
          background: `linear-gradient(90deg, ${OG_PALETTE.purple}, ${OG_PALETTE.glow}, transparent)`,
          display: "flex",
        }}
      />
      <div style={{ fontSize: "20px", color: OG_PALETTE.muted, display: "flex" }}>{label}</div>
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
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <BrandMark />
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "980px" }}>
          {eyebrow ? (
            <div
              style={{
                fontSize: "22px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "3px",
                color: OG_PALETTE.purpleBright,
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
                color: OG_PALETTE.muted,
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

export type OgTerminalLine = { kind: "command" | "output"; text: string };

export const OG_FONT = { display: "Geist", mono: "Geist Mono" } as const;

export const OG_TERMINAL_PROMPT = "$";

const HOME_FRAME_STYLE: CSSProperties = {
  ...FRAME_STYLE,
  padding: "64px 80px",
  background: OG_PALETTE.void,
  fontFamily: OG_FONT.display,
};

function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 4 L12 20 L20 4"
          stroke={OG_PALETTE.glow}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div
        style={{
          fontSize: "32px",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: OG_PALETTE.strong,
          display: "flex",
        }}
      >
        {OG_WORDMARK}
      </div>
    </div>
  );
}

function TerminalLine({ line }: { line: OgTerminalLine }) {
  if (line.kind === "output") {
    return (
      <div style={{ display: "flex", color: OG_PALETTE.muted, whiteSpace: "pre" }}>{line.text}</div>
    );
  }
  return (
    <div style={{ display: "flex", gap: "14px", color: OG_PALETTE.strong, whiteSpace: "pre" }}>
      <div style={{ display: "flex", color: OG_PALETTE.glow }}>{OG_TERMINAL_PROMPT}</div>
      <div style={{ display: "flex" }}>{line.text}</div>
    </div>
  );
}

export function HomeOgFrame({
  headline,
  lines,
  footer,
}: {
  headline: string;
  lines: ReadonlyArray<OgTerminalLine>;
  footer: string;
}) {
  return (
    <div style={HOME_FRAME_STYLE}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Wordmark />
        <div
          style={{
            fontFamily: OG_FONT.mono,
            fontSize: "20px",
            color: OG_PALETTE.muted,
            display: "flex",
          }}
        >
          {footer}
        </div>
      </div>
      <div
        style={{
          fontSize: "76px",
          fontWeight: 700,
          lineHeight: 1.04,
          letterSpacing: "-0.03em",
          color: OG_PALETTE.strong,
          textWrap: "balance",
          display: "flex",
        }}
      >
        {headline}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          padding: "26px 30px",
          border: `1px solid ${OG_PALETTE.border}`,
          borderLeft: `3px solid ${OG_PALETTE.purple}`,
          borderRadius: "12px",
          background: OG_PALETTE.background,
          fontFamily: OG_FONT.mono,
          fontSize: "22px",
          lineHeight: 1.35,
        }}
      >
        {lines.map((line) => (
          <TerminalLine key={`${line.kind}:${line.text}`} line={line} />
        ))}
      </div>
    </div>
  );
}
