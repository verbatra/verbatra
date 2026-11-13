import {
  HERO_TERMINAL_CHANGED_KEYS,
  HERO_TERMINAL_LOCALES,
  HERO_TERMINAL_SOURCE,
  HERO_TRANSLATE_OUTPUT,
} from "@/lib/hero-terminal";
import type { LandingFeatureId } from "@/lib/landing-features";
import { PLAYGROUND_FILES_PATTERN, PLAYGROUND_SOURCE_LOCALE } from "@/lib/landing-playground";
import { splitPlaceholders } from "@/lib/placeholder-segments";

export type ArtifactLine =
  | { readonly kind: "command"; readonly text: string }
  | { readonly kind: "output"; readonly text: string; readonly hit?: true }
  | { readonly kind: "more"; readonly count: number }
  | { readonly kind: "moreChecks" };

export type ArtifactBlock =
  | { readonly kind: "cli"; readonly lines: ReadonlyArray<ArtifactLine> }
  | { readonly kind: "file"; readonly lines: ReadonlyArray<ArtifactLine> }
  | {
      readonly kind: "sheet";
      readonly columns: ReadonlyArray<string>;
      readonly rows: ReadonlyArray<ReadonlyArray<string>>;
    }
  | { readonly kind: "shot" };

export type FeatureArtifact = {
  readonly head: string;
  readonly count?: number;
  readonly result?: string;
  readonly blocks: ReadonlyArray<ArtifactBlock>;
};

export type ArtifactWords = {
  readonly more: (count: number) => string;
  readonly moreChecks: () => string;
};

export function artifactLineText(line: ArtifactLine, words: ArtifactWords): string {
  switch (line.kind) {
    case "command":
      return `$ ${line.text}`;
    case "more":
      return `  ${words.more(line.count)}`;
    case "moreChecks":
      return `  ${words.moreChecks()}`;
    case "output":
      return line.text;
  }
}

const CLI = "npx @verbatra/cli";

const SOURCE_FILE = PLAYGROUND_FILES_PATTERN.replace("{locale}", PLAYGROUND_SOURCE_LOCALE);

const TARGET_LOCALE = HERO_TERMINAL_LOCALES[0]?.locale ?? "";

const total = HERO_TERMINAL_SOURCE.length;
const changed = HERO_TERMINAL_CHANGED_KEYS.length;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function command(text: string): ArtifactLine {
  return { kind: "command", text: `${CLI} ${text}` };
}

function output(text: string): ArtifactLine {
  return { kind: "output", text };
}

function hit(text: string): ArtifactLine {
  return { kind: "output", text, hit: true };
}

export const FEATURE_SOURCE_PATH = "src/Checkout.tsx";

export const FEATURE_SOURCE_CODE = `import { useTranslation } from "react-i18next";

export function Checkout() {
  const { t } = useTranslation();
  return (
    <section>
      <h1>{t("checkout.title")}</h1>
      <p>{t("checkout.giftNote", "Add a gift note")}</p>
      <button>{t("checkout.pay")}</button>
      <a href="/cart">{t("checkout.backToCart", "Back to cart")}</a>
    </section>
  );
}
`;

export const FEATURE_NEW_KEYS = [
  { key: "checkout.giftNote", line: 8 },
  { key: "checkout.backToCart", line: 10 },
] as const;

export const EXTRACT_OUTPUT: ReadonlyArray<ArtifactLine> = [
  output("verbatra extract"),
  output(`  1 file scanned, ${plural(changed, "key")} already present`),
  hit(`  would add ${plural(FEATURE_NEW_KEYS.length, "key")} to ${SOURCE_FILE}`),
  output(`  new keys (${FEATURE_NEW_KEYS.length}):`),
  ...FEATURE_NEW_KEYS.map(({ key, line }) => hit(`    ${key}  ${FEATURE_SOURCE_PATH}:${line}`)),
  output("dry run, nothing written"),
];

export const TYPES_FILE = "verbatra-types.d.ts";

function argumentsOf(value: string): ReadonlyArray<string> {
  return splitPlaceholders(value)
    .filter(({ placeholder }) => placeholder)
    .map(({ text }) => text.slice(1, -1));
}

function declarationOf(key: string, value: string): string {
  const names = argumentsOf(value);
  const type =
    names.length === 0
      ? "VerbatraNoArguments"
      : `{ ${names.map((name) => `readonly ${JSON.stringify(name)}: VerbatraArgument`).join("; ")} }`;
  return `  ${JSON.stringify(key)}: ${type};`;
}

export const TYPES_DECLARATIONS: ReadonlyArray<{ readonly text: string; readonly shown: boolean }> =
  HERO_TERMINAL_SOURCE.map(({ key, value }) => ({
    text: declarationOf(key, value),
    shown: argumentsOf(value).length > 0 || HERO_TERMINAL_CHANGED_KEYS.includes(key),
  }));

const withArguments = HERO_TERMINAL_SOURCE.filter(
  ({ value }) => argumentsOf(value).length > 0,
).length;

export const TYPES_OUTPUT: ReadonlyArray<ArtifactLine> = [
  output("verbatra types"),
  hit(
    `  ${plural(total, "key")} declared, ${withArguments} of them taking arguments, from ${SOURCE_FILE}`,
  ),
  output(`  wrote ${TYPES_FILE}`),
];

function typesExcerpt(): ReadonlyArray<ArtifactLine> {
  const lines: ArtifactLine[] = [output("export interface VerbatraMessages {")];
  let hidden = 0;
  const flush = () => {
    if (hidden > 0) lines.push({ kind: "more", count: hidden });
    hidden = 0;
  };
  for (const { text, shown } of TYPES_DECLARATIONS) {
    if (!shown) {
      hidden += 1;
      continue;
    }
    flush();
    lines.push(text.includes("readonly") ? hit(text) : output(text));
  }
  flush();
  lines.push(output("}"));
  return lines;
}

export const DOCTOR_OUTPUT: ReadonlyArray<ArtifactLine> = [
  output("verbatra doctor"),
  output("  [ok  ] Configuration: Loaded .verbatrarc.json."),
  output('  [ok  ] Format adapter: Format "next-intl-json" resolves to an adapter.'),
  output('  [ok  ] Provider: Provider "gemini" resolves to a factory.'),
  output(
    "  [fail] API key environment variable: The GEMINI_API_KEY environment variable is not set.",
  ),
  output(
    "         fix: Set GEMINI_API_KEY in the environment, or, with the CLI, in a .env file in the project directory.",
  ),
  { kind: "moreChecks" },
  output("1 problem found (run verbatra doctor again after fixing it)"),
];

export const DRY_RUN_OUTPUT: ReadonlyArray<ArtifactLine> = [
  output("verbatra translate (dry run)"),
  hit(`  ${TARGET_LOCALE}: ${changed} would translate, ${total - changed} unchanged`),
  output(
    `${HERO_TERMINAL_LOCALES.length} succeeded, 0 partial, 0 failed (dry run: nothing written)`,
  ),
];

export const WATCH_OUTPUT: ReadonlyArray<ArtifactLine> = [
  output(
    `verbatra: watching ${PLAYGROUND_SOURCE_LOCALE} (${PLAYGROUND_FILES_PATTERN}); running initial translation`,
  ),
  output(`verbatra: translating ${TARGET_LOCALE}`),
  output(`verbatra: ${TARGET_LOCALE} batch 1/1`),
  output(`verbatra: ${TARGET_LOCALE}: writing`),
  output(`verbatra: ${TARGET_LOCALE} done, ${changed} translated`),
  output(`verbatra: run finished, ${plural(HERO_TERMINAL_LOCALES.length, "locale")} processed`),
  ...HERO_TRANSLATE_OUTPUT.map((text, index) => (index === 1 ? hit(text) : output(text))),
  output("verbatra: waiting for changes..."),
];

export const EXPORT_DIRECTORY = "verbatra-translations";

export const EXPORT_OUTPUT: ReadonlyArray<ArtifactLine> = [
  output(`verbatra export -> ${EXPORT_DIRECTORY}`),
  hit(`  ${TARGET_LOCALE}: ${plural(changed, "row")}`),
  output(`${plural(changed, "row")} across ${plural(HERO_TERMINAL_LOCALES.length, "locale")}`),
];

export const EXPORT_COLUMNS = ["Key", "Source", "Status", "Translation"] as const;

export const EXPORT_ROWS: ReadonlyArray<ReadonlyArray<string>> = HERO_TERMINAL_SOURCE.filter(
  ({ before }) => before !== undefined,
)
  .map(({ key, value }) => [key, value, "changed", ""])
  .sort(([a = ""], [b = ""]) => a.localeCompare(b));

function resultOf(lines: ReadonlyArray<ArtifactLine>): string {
  const line = lines.find((entry) => entry.kind === "output" && entry.hit === true);
  if (line?.kind !== "output") throw new Error("a feature artifact marks no output line");
  return line.text.trim();
}

export const FEATURE_ARTIFACTS: Readonly<Record<LandingFeatureId, FeatureArtifact>> = {
  extract: {
    head: "verbatra extract",
    count: FEATURE_NEW_KEYS.length,
    result: resultOf(EXTRACT_OUTPUT),
    blocks: [{ kind: "cli", lines: [command("extract --dry-run"), ...EXTRACT_OUTPUT] }],
  },
  types: {
    head: TYPES_FILE,
    count: total,
    result: resultOf(TYPES_OUTPUT),
    blocks: [
      { kind: "cli", lines: [command("types"), ...TYPES_OUTPUT] },
      { kind: "file", lines: typesExcerpt() },
    ],
  },
  doctor: {
    head: "verbatra doctor",
    result: resultOf(DRY_RUN_OUTPUT),
    blocks: [
      {
        kind: "cli",
        lines: [
          command("doctor"),
          ...DOCTOR_OUTPUT,
          command("translate --dry-run"),
          ...DRY_RUN_OUTPUT,
        ],
      },
    ],
  },
  watch: {
    head: "verbatra watch",
    result: resultOf(WATCH_OUTPUT),
    blocks: [{ kind: "cli", lines: [command("watch"), ...WATCH_OUTPUT] }],
  },
  handoff: {
    head: `${EXPORT_DIRECTORY}/${TARGET_LOCALE}.csv`,
    count: changed,
    result: resultOf(EXPORT_OUTPUT),
    blocks: [
      { kind: "cli", lines: [command("export --format csv"), ...EXPORT_OUTPUT] },
      { kind: "sheet", columns: EXPORT_COLUMNS, rows: EXPORT_ROWS },
    ],
  },
  studio: {
    head: "verbatra studio",
    blocks: [{ kind: "shot" }],
  },
};
