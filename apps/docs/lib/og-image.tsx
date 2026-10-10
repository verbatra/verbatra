import type { CSSProperties } from "react";

export const OG_IMAGE_SIZE = { width: 1200, height: 630 };

export const OG_PALETTE = {
  void: "hsl(240, 24%, 4%)",
  background: "hsl(240, 24%, 6%)",
  strong: "hsl(240, 30%, 94%)",
  muted: "hsl(240, 13%, 65%)",
  faint: "hsl(240, 13%, 58%)",
  glow: "hsl(258, 47%, 74%)",
  purple: "hsl(291, 64%, 42%)",
  glowWash: "hsla(258, 47%, 74%, 0.35)",
  purpleWash: "hsla(291, 64%, 42%, 0.3)",
  glowDeep: "hsl(258, 25%, 10%)",
  purpleDeep: "hsl(291, 40%, 12%)",
  purpleBright: "hsl(291, 64%, 62%)",
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
          fontSize: "26px",
          fontWeight: 700,
          letterSpacing: "6px",
          textTransform: "uppercase",
          color: OG_PALETTE.glow,
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

export type OgHeadlineRow = { locale: string; text: string };

export type OgNumber = { label: string; value: string };

export const OG_FONT = { display: "Space Grotesk", mono: "JetBrains Mono" } as const;

const CODE_SIZE = 22;
const SOURCE_LINE = { size: 68, leading: 1.04, weight: 700 } as const;
const LOCALE_LINE = { size: 34, leading: 1.3, weight: 500 } as const;

export function gutterOffset(line: { size: number; leading: number }): number {
  return Math.round((line.size * line.leading - CODE_SIZE) / 2);
}

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
          fontSize: "28px",
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: OG_PALETTE.strong,
          display: "flex",
        }}
      >
        VERBATRA
      </div>
    </div>
  );
}

function HeadlineRow({ row, source }: { row: OgHeadlineRow; source: boolean }) {
  const line = source ? SOURCE_LINE : LOCALE_LINE;
  return (
    <div style={{ display: "flex", alignItems: "flex-start" }}>
      <div
        style={{
          width: "64px",
          flexShrink: 0,
          paddingTop: `${gutterOffset(line)}px`,
          fontFamily: OG_FONT.mono,
          fontSize: `${CODE_SIZE}px`,
          lineHeight: 1,
          color: source ? OG_PALETTE.glow : OG_PALETTE.faint,
          display: "flex",
        }}
      >
        {row.locale}
      </div>
      <div
        style={{
          fontSize: `${line.size}px`,
          fontWeight: line.weight,
          lineHeight: line.leading,
          letterSpacing: source ? "-0.03em" : "-0.02em",
          color: source ? OG_PALETTE.strong : OG_PALETTE.muted,
          textWrap: "balance",
          display: "flex",
        }}
      >
        {row.text}
      </div>
    </div>
  );
}

function NumberRow({ numbers }: { numbers: ReadonlyArray<OgNumber> }) {
  return (
    <div style={{ display: "flex", gap: "56px", paddingLeft: "64px" }}>
      {numbers.map((number) => (
        <div key={number.label} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div
            style={{
              fontSize: "52px",
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: "-0.035em",
              display: "flex",
            }}
          >
            {number.value}
          </div>
          <div
            style={{ fontSize: "20px", fontWeight: 500, color: OG_PALETTE.muted, display: "flex" }}
          >
            {number.label}
          </div>
        </div>
      ))}
    </div>
  );
}

export function HomeOgFrame({
  headline,
  rows,
  numbers,
  footer,
}: {
  headline: OgHeadlineRow;
  rows: ReadonlyArray<OgHeadlineRow>;
  numbers: ReadonlyArray<OgNumber>;
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
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <HeadlineRow row={headline} source />
        {rows.map((row) => (
          <HeadlineRow key={row.locale} row={row} source={false} />
        ))}
      </div>
      <NumberRow numbers={numbers} />
    </div>
  );
}
