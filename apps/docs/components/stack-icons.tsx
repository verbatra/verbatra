import type { ReactNode } from "react";

const VIEWBOX = 24;

const FILE_OUTLINE = "M3.5 2.5h12l5 5v14h-17zM15.5 2.5v5h5";

export const FILE_GLYPH_LABELS = {
  ini: "INI",
  json: "JSON",
  po: ".po",
  xliff: "XLF",
  yaml: "YAML",
} as const;

const LABEL_SIZE = 6.2;
const LABEL_MAX_WIDTH = 13.2;

const STACK_ICON_PATHS = {
  web: "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM3 9h18M6.5 6.5h.01M9 6.5h.01",
  mobile: "M9 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM11 18h2",
  server:
    "M5.5 4h13A1.5 1.5 0 0 1 20 5.5v4a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 9.5v-4A1.5 1.5 0 0 1 5.5 4zM5.5 13h13a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-4A1.5 1.5 0 0 1 5.5 13zM8 7.5h.01M8 16.5h.01",
  custom:
    "M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M8 20H5a1 1 0 0 1-1-1v-3M16 20h3a1 1 0 0 0 1-1v-3M12 8v8M8 12h8",
  ini: FILE_OUTLINE,
  json: FILE_OUTLINE,
  po: FILE_OUTLINE,
  xliff: FILE_OUTLINE,
  yaml: FILE_OUTLINE,
} as const satisfies Record<string, string>;

export type StackIconKey = keyof typeof STACK_ICON_PATHS;

export const FILE_GLYPH_SIZE = 40;

function fileGlyphLabel(icon: StackIconKey): string | undefined {
  return icon in FILE_GLYPH_LABELS
    ? FILE_GLYPH_LABELS[icon as keyof typeof FILE_GLYPH_LABELS]
    : undefined;
}

export function isFileGlyph(icon: StackIconKey): boolean {
  return fileGlyphLabel(icon) !== undefined;
}

function stackIconId(prefix: string, icon: StackIconKey): string {
  return `${prefix}-${icon}`;
}

function FileLabel({ label }: { label: string | undefined }): ReactNode {
  if (label === undefined) {
    return null;
  }
  const width = Math.min(label.length * LABEL_SIZE * 0.62, LABEL_MAX_WIDTH);
  return (
    <text
      x="12"
      y="17.4"
      textAnchor="middle"
      fontFamily="var(--font-mono), monospace"
      fontSize={LABEL_SIZE}
      fontWeight="700"
      fill="currentColor"
      stroke="none"
      textLength={width}
      lengthAdjust="spacingAndGlyphs"
    >
      {label}
    </text>
  );
}

export function StackIconSprite({
  prefix,
  icons,
}: {
  prefix: string;
  icons: ReadonlyArray<StackIconKey>;
}): ReactNode {
  return (
    <svg width="0" height="0" aria-hidden="true" className="absolute">
      <defs>
        {[...new Set(icons)].map((icon) => (
          <symbol key={icon} id={stackIconId(prefix, icon)} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}>
            <path
              d={STACK_ICON_PATHS[icon]}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <FileLabel label={fileGlyphLabel(icon)} />
          </symbol>
        ))}
      </defs>
    </svg>
  );
}

export function StackIcon({
  prefix,
  icon,
  size,
  className,
}: {
  prefix: string;
  icon: StackIconKey;
  size: number;
  className?: string;
}): ReactNode {
  return (
    <svg width={size} height={size} aria-hidden="true" className={className}>
      <use href={`#${stackIconId(prefix, icon)}`} />
    </svg>
  );
}
