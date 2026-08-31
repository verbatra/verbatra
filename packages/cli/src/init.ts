import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import {
  type ScaffoldableProviderId,
  type SupportedFormat,
  scaffoldingMetadata,
  verbatraConfigSchema,
} from "@verbatra/sdk";
import { ensureGitignore } from "./gitignore.js";
import { readPackageManifest } from "./package-manifest.js";
import { askLine, stdinIsTty } from "./prompt.js";
import type { InitOpts, Streams } from "./types.js";

const PROVIDER_IDS = Object.keys(scaffoldingMetadata.providerEnv) as ScaffoldableProviderId[];

const FORMAT_BY_DEP: ReadonlyArray<readonly [string, SupportedFormat]> = [
  ["i18next", "i18next-json"],
  ["vue-i18n", "vue-i18n-json"],
  ["next-intl", "next-intl-json"],
  ["@ngx-translate/core", "ngx-translate-json"],
];
const DEFAULT_FORMAT: SupportedFormat = "i18next-json";

export const DEFAULT_MODEL = scaffoldingMetadata.scaffoldModels;
const TOKEN_LIMIT = 4096;

export interface InitDeps {
  readonly ask?: (question: string) => Promise<string>;
  readonly isTty?: () => boolean;
}

interface Inputs {
  readonly sourceLocale: string;
  readonly targetLocales: string[];
  readonly filesPattern: string;
  readonly provider: ScaffoldableProviderId;
}

function isProviderId(value: string): value is ScaffoldableProviderId {
  return (PROVIDER_IDS as string[]).includes(value);
}

function readDependencyNames(cwd: string): Set<string> {
  const pkgPath = resolve(cwd, "package.json");
  if (!existsSync(pkgPath)) {
    return new Set();
  }
  try {
    const parsed = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return new Set([
      ...Object.keys(parsed.dependencies ?? {}),
      ...Object.keys(parsed.devDependencies ?? {}),
    ]);
  } catch {
    return new Set();
  }
}

function detectFormat(cwd: string): { format: string; detected: boolean } {
  const deps = readDependencyNames(cwd);
  const matches = FORMAT_BY_DEP.filter(([dep]) => deps.has(dep)).map(([, format]) => format);
  const [first, second] = matches;
  if (first !== undefined && second === undefined) {
    return { format: first, detected: true };
  }
  return { format: DEFAULT_FORMAT, detected: false };
}

function buildProviderOptions(id: ScaffoldableProviderId): Record<string, unknown> {
  if (id === "deepl" || id === "google-translate") {
    return {};
  }
  return {
    model: DEFAULT_MODEL[id],
    [scaffoldingMetadata.providerTokenLimitKeys[id]]: TOKEN_LIMIT,
  };
}

const OPTION_COMMENTS: Readonly<Record<string, string>> = {
  model: "      // A sensible default; change to any model this provider supports.",
};

function renderProviderOptions(options: Record<string, unknown>): string[] {
  return Object.entries(options).flatMap(([key, value]) => {
    const line = `      ${key}: ${JSON.stringify(value)},`;
    const comment = OPTION_COMMENTS[key];
    return comment === undefined ? [line] : [comment, line];
  });
}

function renderProviderBlock(id: ScaffoldableProviderId, options: Record<string, unknown>): string {
  const optionLines = renderProviderOptions(options);
  const note =
    id === "deepl"
      ? ["    // DeepL needs no model; add an optional glossaryId here if you have one."]
      : id === "google-translate"
        ? ["    // Google Cloud Translation needs no model."]
        : [];
  const body =
    optionLines.length === 0 ? ["    options: {},"] : ["    options: {", ...optionLines, "    },"];
  return ["  provider: {", `    id: ${JSON.stringify(id)},`, ...note, ...body, "  },"].join("\n");
}

interface ConfigDraft {
  readonly inputs: Inputs;
  readonly format: string;
  readonly detected: boolean;
  readonly importName: string;
  readonly providerOptions: Record<string, unknown>;
}

function renderConfig({
  inputs,
  format,
  detected,
  importName,
  providerOptions,
}: ConfigDraft): string {
  const formatComment = detected
    ? "  // Locale file format, detected from your dependencies."
    : `  // TODO: set your locale file format (one of: ${scaffoldingMetadata.supportedFormats.join(", ")}).`;
  return [
    `import { defineConfig } from ${JSON.stringify(importName)};`,
    "",
    "export default defineConfig({",
    "  // The locale your source strings are written in.",
    `  sourceLocale: ${JSON.stringify(inputs.sourceLocale)},`,
    "  // The locales to translate into (must not include the source locale).",
    `  targetLocales: ${JSON.stringify(inputs.targetLocales)},`,
    formatComment,
    `  format: ${JSON.stringify(format)},`,
    "  files: {",
    "    // Path to each locale file; must contain the {locale} token.",
    `    pattern: ${JSON.stringify(inputs.filesPattern)},`,
    "  },",
    renderProviderBlock(inputs.provider, providerOptions),
    "});",
    "",
  ].join("\n");
}

function renderEnvExample(id: ScaffoldableProviderId): string {
  return [
    `# Copy this file to .env and set your ${id} API key. Do not commit your real key.`,
    `${scaffoldingMetadata.providerEnv[id]}=`,
    "",
  ].join("\n");
}

function writeFileIfAllowed(
  path: string,
  content: string,
  force: boolean,
  label: string,
  streams: Streams,
): void {
  const existed = existsSync(path);
  if (existed && !force) {
    streams.out(`skipped ${label} (exists; use --force to overwrite)\n`);
    return;
  }
  writeFileSync(path, content);
  streams.out(`${existed ? "overwrote" : "created"} ${label}\n`);
}

async function resolveProvider(
  opts: InitOpts,
  interactive: boolean,
  ask: (question: string) => Promise<string>,
  streams: Streams,
): Promise<ScaffoldableProviderId | undefined> {
  let value = opts.provider?.trim() ?? "";
  if (value === "" && interactive) {
    value = await ask(`Provider (${PROVIDER_IDS.join(", ")}): `);
  }
  if (value === "") {
    streams.err(`verbatra: --provider is required (one of ${PROVIDER_IDS.join(", ")})\n`);
    return undefined;
  }
  if (!isProviderId(value)) {
    streams.err(
      `verbatra: unknown provider "${value}" (expected one of ${PROVIDER_IDS.join(", ")})\n`,
    );
    return undefined;
  }
  return value;
}

async function resolveValue(
  flag: string | undefined,
  interactive: boolean,
  ask: (question: string) => Promise<string>,
  label: string,
  fallback: string,
): Promise<string> {
  const flagValue = flag?.trim() ?? "";
  if (flagValue !== "") {
    return flagValue;
  }
  if (!interactive) {
    return fallback;
  }
  const answer = await ask(`${label} [${fallback}]: `);
  return answer === "" ? fallback : answer;
}

export async function runInit(
  opts: InitOpts,
  streams: Streams,
  deps: InitDeps = {},
): Promise<number> {
  const ask = deps.ask ?? askLine;
  const isTty = deps.isTty ?? stdinIsTty;
  const cwd = opts.cwd ?? process.cwd();
  const interactive = opts.yes !== true && isTty();

  const provider = await resolveProvider(opts, interactive, ask, streams);
  if (provider === undefined) {
    return 2;
  }

  const sourceLocale = await resolveValue(opts.source, interactive, ask, "Source locale", "en");
  const targetsRaw = await resolveValue(
    opts.targets,
    interactive,
    ask,
    "Target locales (comma-separated)",
    "de",
  );
  const targetLocales = targetsRaw
    .split(",")
    .map((locale) => locale.trim())
    .filter((locale) => locale.length > 0);
  const filesPattern = await resolveValue(
    opts.path,
    interactive,
    ask,
    "Locale file pattern",
    "locales/{locale}.json",
  );

  const inputs: Inputs = { sourceLocale, targetLocales, filesPattern, provider };
  const { format, detected } = detectFormat(cwd);

  const providerOptions = buildProviderOptions(provider);
  const candidate = {
    sourceLocale,
    targetLocales,
    format,
    files: { pattern: filesPattern },
    provider: { id: provider, options: providerOptions },
  };
  const validated = verbatraConfigSchema.safeParse(candidate);
  if (!validated.success) {
    const detail = validated.error.issues.map((issue) => issue.message).join("; ");
    streams.err(`verbatra: could not scaffold a valid config: ${detail}\n`);
    return 2;
  }

  const importName = readPackageManifest().name;
  const force = opts.force === true;
  writeFileIfAllowed(
    resolve(cwd, "verbatra.config.ts"),
    renderConfig({ inputs, format, detected, importName, providerOptions }),
    force,
    "verbatra.config.ts",
    streams,
  );
  writeFileIfAllowed(
    resolve(cwd, ".env.example"),
    renderEnvExample(provider),
    force,
    ".env.example",
    streams,
  );
  ensureGitignore(cwd, streams);
  return 0;
}
