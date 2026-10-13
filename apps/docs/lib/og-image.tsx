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
  border: "hsl(240, 23%, 22%)",
} as const;

export function titleFontSize(title: string): number {
  if (title.length > 70) return 44;
  if (title.length > 44) return 54;
  return 66;
}

type OgTerminalLine = { kind: "command" | "output"; text: string };

export const OG_FONT = { display: "Geist", mono: "Geist Mono" } as const;

export const OG_TERMINAL_PROMPT = "$";

const FRAME_STYLE: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  padding: "64px 80px",
  background: OG_PALETTE.void,
  color: OG_PALETTE.strong,
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

function TopBar({ label }: { label: string }) {
  return (
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
        {label}
      </div>
    </div>
  );
}

export function OgFrame({
  title,
  description,
  footer,
}: {
  title: string;
  description?: string | undefined;
  footer: string;
}) {
  return (
    <div style={FRAME_STYLE}>
      <TopBar label={footer} />
      <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
        <div
          style={{
            fontSize: `${titleFontSize(title)}px`,
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: "-0.03em",
            textWrap: "balance",
            display: "flex",
          }}
        >
          {title}
        </div>
        {description ? (
          <div
            style={{
              paddingLeft: "24px",
              borderLeft: `3px solid ${OG_PALETTE.purple}`,
              fontWeight: 500,
              fontSize: "28px",
              lineHeight: 1.4,
              color: OG_PALETTE.muted,
              display: "flex",
            }}
          >
            {description}
          </div>
        ) : null}
      </div>
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
    <div style={FRAME_STYLE}>
      <TopBar label={footer} />
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
