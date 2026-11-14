import { CHECK_CLI_COMMAND, CHECK_OVERALL_LINE } from "@/lib/check-demo";
import {
  HERO_CHECK_COMMAND,
  HERO_CHECK_OUTPUT,
  HERO_TERMINAL_CHANGED_KEYS,
  HERO_TERMINAL_SOURCE,
  HERO_TERMINAL_SYNCED_KEYS,
} from "@/lib/hero-terminal";
import { LOCK_DEMO_LOCALE, lockLines } from "@/lib/lock-demo";

export type SurfaceLine = {
  readonly text: string;
  readonly hit?: string;
  readonly command?: true;
  readonly collapse?: "phone" | "narrow";
};

export const SURFACE_COUNTS = {
  locale: LOCK_DEMO_LOCALE,
  missing: 0,
  stale: HERO_TERMINAL_CHANGED_KEYS.length,
  upToDate: HERO_TERMINAL_SYNCED_KEYS.length,
  total: HERO_TERMINAL_SOURCE.length,
} as const;

const SURFACE_COVERAGE_PERCENT = Math.round((SURFACE_COUNTS.upToDate / SURFACE_COUNTS.total) * 100);

export const LOCK_STATE_STALE = "stale";

const STALE_COUNT = String(SURFACE_COUNTS.stale);

export function surfaceText(lines: ReadonlyArray<SurfaceLine>): string {
  return lines.map(({ text }) => text).join("\n");
}

export const CLI_LINES: ReadonlyArray<SurfaceLine> = [
  { text: `$ ${HERO_CHECK_COMMAND}`, command: true },
  ...HERO_CHECK_OUTPUT.map((text): SurfaceLine => {
    if (text.includes(`${STALE_COUNT} ${LOCK_STATE_STALE}`))
      return { text, hit: `${STALE_COUNT} ${LOCK_STATE_STALE}` };
    if (text === CHECK_CLI_COMMAND || text === CHECK_OVERALL_LINE)
      return { text, collapse: "narrow" };
    return { text };
  }),
];

export const SDK_CALL_LINES: ReadonlyArray<SurfaceLine> = [
  { text: 'import { check } from "@verbatra/sdk";', collapse: "phone" },
  { text: "const summary = await check({ config });", command: true },
  { text: "summary.locales[0];", command: true },
];

export const SDK_RESULT_LINES: ReadonlyArray<SurfaceLine> = [
  {
    text: `// { locale: ${JSON.stringify(SURFACE_COUNTS.locale)}, missing: ${SURFACE_COUNTS.missing},`,
  },
  {
    text: `//   stale: ${SURFACE_COUNTS.stale}, upToDate: ${SURFACE_COUNTS.upToDate},`,
    hit: `stale: ${SURFACE_COUNTS.stale}`,
  },
  { text: "//   inSync: false, ... }" },
];

const MCP_TOOL = "status.check";

export const MCP_CALL = `${MCP_TOOL}({})`;

export const MCP_RESPONSE_LINES: ReadonlyArray<SurfaceLine> = [
  { text: '{ "inSync": false, "locales": [' },
  {
    text: `  { "locale": ${JSON.stringify(SURFACE_COUNTS.locale)}, "missing": ${SURFACE_COUNTS.missing},`,
  },
  {
    text: `    "stale": ${SURFACE_COUNTS.stale}, "upToDate": ${SURFACE_COUNTS.upToDate}, ... }`,
    hit: `"stale": ${SURFACE_COUNTS.stale}`,
  },
  { text: "] }" },
];

export const STUDIO_ROW = {
  locale: SURFACE_COUNTS.locale,
  percent: SURFACE_COVERAGE_PERCENT,
  keys: `${SURFACE_COUNTS.upToDate} / ${SURFACE_COUNTS.total} keys`,
  missing: SURFACE_COUNTS.missing,
  stale: SURFACE_COUNTS.stale,
  upToDate: SURFACE_COUNTS.upToDate,
} as const;

export const STUDIO_COLUMNS = ["Locale", "Coverage", "Missing", "Stale", "Up to date"] as const;

type RailEntry = { readonly key: string; readonly hash: string; readonly comma: boolean };

export const RAIL_ENTRIES: ReadonlyArray<RailEntry> = lockLines().flatMap((line) =>
  line.kind === "entry" && line.mark === "stale"
    ? [{ key: line.key, hash: line.value, comma: line.comma }]
    : [],
);

export type Surface = "cli" | "studio" | "sdk" | "mcp";

export const SURFACE_DOCS_PATHS: Readonly<Record<Surface, string>> = {
  cli: "/docs/cli/check",
  studio: "/docs/cli/studio",
  sdk: "/docs/sdk/inspect",
  mcp: "/docs/cli/mcp",
};

export const SURFACE_BADGES: Readonly<Record<Exclude<Surface, "mcp">, string>> = {
  cli: "verbatra check",
  studio: "Locales",
  sdk: "check()",
};

export const SURFACE_CODE: Readonly<
  Record<Exclude<Surface, "studio">, ReadonlyArray<SurfaceLine>>
> = {
  cli: CLI_LINES,
  sdk: [...SDK_CALL_LINES, ...SDK_RESULT_LINES],
  mcp: [{ text: MCP_CALL, command: true }, ...MCP_RESPONSE_LINES],
};
