import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import {
  type DetectProjectInput,
  detectProject,
  type LocaleStyle,
  type ProjectDetection,
  type SupportedFormat,
  scaffoldingMetadata,
  verbatraConfigSchema,
} from "@verbatra/sdk";
import { z } from "zod";
import { CliUsageError } from "./cli-usage-error.js";
import { ensureGitignore, type GitignoreAction } from "./gitignore.js";
import {
  buildProviderOptions,
  type ConfigDraft,
  type FormatOrigin,
  HUMAN_ONLY_PROVIDER,
  INIT_PROVIDER_IDS,
  type InitProviderId,
  isInitProviderId,
  isOptionalKey,
  keyEnvVarFor,
  namesEnvVar,
  OPENAI_COMPATIBLE_PROVIDER,
  type ProviderChoice,
  renderConfig,
  renderEnvExample,
  takesModel,
} from "./init-config.js";
import { renderErrorEnvelope, renderSuccessEnvelope } from "./json-envelope.js";
import { readPackageManifest } from "./package-manifest.js";
import { askLine, stdinIsTty } from "./prompt.js";
import { renderError, toRenderableError } from "./render.js";
import type { Streams } from "./types.js";

export { DEFAULT_MODEL } from "./init-config.js";

export interface InitDeps {
  readonly ask?: (question: string) => Promise<string>;
  readonly isTty?: () => boolean;
  readonly detect?: (input: DetectProjectInput) => Promise<ProjectDetection>;
}

const initOptsSchema = z.object({
  cwd: z.string().optional(),
  provider: z.string().optional(),
  source: z.string().optional(),
  targets: z.string().optional(),
  path: z.string().optional(),
  format: z.string().optional(),
  model: z.string().optional(),
  baseUrl: z.string().optional(),
  apiKeyEnvVar: z.string().optional(),
  yes: z.boolean().optional(),
  force: z.boolean().optional(),
  json: z.boolean().optional(),
});

type InitOptions = z.infer<typeof initOptsSchema>;

export type ValueSource = "flag" | "detected" | "prompt" | "default";

export type FileAction = "created" | "overwritten" | "updated" | "unchanged";

interface Resolved {
  readonly value: string;
  readonly source: ValueSource;
}

interface Prompter {
  readonly interactive: boolean;
  readonly acceptDefaults: boolean;
  readonly ask: (question: string) => Promise<string>;
  readonly missing: string[];
}

interface PickSpec {
  readonly flag: string;
  readonly value: string | undefined;
  readonly label: string;
  readonly detected?: string | undefined;
  readonly fallback?: string | undefined;
}

const CONFIG_FILE = "verbatra.config.ts";
const ENV_EXAMPLE_FILE = ".env.example";
const DEFAULT_FORMAT = "i18next-json";
const DEFAULT_SOURCE = "en";
const DEFAULT_TARGETS = "de";
const DEFAULT_PATTERN = "locales/{locale}.json";
const ENV_VAR_NAME = /^[A-Z_][A-Z0-9_]*$/;
const PROVIDER_FLAG = `--provider <${INIT_PROVIDER_IDS.join("|")}>`;

function trimmed(value: string | undefined): string {
  return value?.trim() ?? "";
}

function fallbackAnswer(spec: PickSpec, prompter: Prompter): Resolved | undefined {
  if (spec.detected !== undefined) {
    return { value: spec.detected, source: "detected" };
  }
  if ((prompter.interactive || prompter.acceptDefaults) && spec.fallback !== undefined) {
    return { value: spec.fallback, source: "default" };
  }
  prompter.missing.push(spec.flag);
  return undefined;
}

async function pick(prompter: Prompter, spec: PickSpec): Promise<Resolved | undefined> {
  const flagged = trimmed(spec.value);
  if (flagged !== "") {
    return { value: flagged, source: "flag" };
  }
  if (prompter.interactive) {
    const suggestion = spec.detected ?? spec.fallback;
    const question =
      suggestion === undefined ? `${spec.label}: ` : `${spec.label} [${suggestion}]: `;
    const answer = (await prompter.ask(question)).trim();
    if (answer !== "") {
      return { value: answer, source: "prompt" };
    }
  }
  return fallbackAnswer(spec, prompter);
}

function parseProvider(value: string): InitProviderId {
  if (!isInitProviderId(value)) {
    throw new CliUsageError(
      "INVALID_PROVIDER",
      `Unknown provider "${value}". Pass one of ${INIT_PROVIDER_IDS.join(", ")}.`,
      INIT_PROVIDER_IDS,
    );
  }
  return value;
}

function parseFormat(value: string): SupportedFormat {
  const format = scaffoldingMetadata.supportedFormats.find((known) => known === value);
  if (format === undefined) {
    throw new CliUsageError(
      "INVALID_FORMAT",
      `Unknown format "${value}". Pass one of ${scaffoldingMetadata.supportedFormats.join(", ")}.`,
      scaffoldingMetadata.supportedFormats,
    );
  }
  return format;
}

function invalidOption(message: string): CliUsageError {
  return new CliUsageError("INVALID_OPTION", message);
}

function assertProviderFlags(opts: InitOptions, provider: InitProviderId): void {
  const openAiCompatibleOnly = [
    ["--base-url", opts.baseUrl],
    ["--api-key-env-var", opts.apiKeyEnvVar],
  ] as const;
  if (provider !== OPENAI_COMPATIBLE_PROVIDER) {
    const given = openAiCompatibleOnly.filter(([, value]) => value !== undefined);
    if (given.length > 0) {
      throw invalidOption(
        `${given.map(([flag]) => flag).join(" and ")} apply to --provider ${OPENAI_COMPATIBLE_PROVIDER} only.`,
      );
    }
  }
  if (opts.model !== undefined && !takesModel(provider)) {
    throw invalidOption(`--model does not apply to --provider ${provider}, which takes no model.`);
  }
  const envVar = opts.apiKeyEnvVar;
  if (envVar !== undefined && !ENV_VAR_NAME.test(envVar)) {
    throw invalidOption(
      "--api-key-env-var must name an environment variable in upper case, such as LLM_API_KEY (letters, digits, and underscores, not starting with a digit). The value given is not repeated here in case it is a key; pass the variable's name, never the key.",
    );
  }
}

function assertNoCredentialsInUrl(baseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return;
  }
  if (
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw invalidOption(
      "The base URL must not carry credentials, a query string, or a fragment. Put the key in an environment variable and name it with --api-key-env-var.",
    );
  }
}

async function resolveProviderChoice(
  opts: InitOptions,
  prompter: Prompter,
): Promise<{ readonly choice: ProviderChoice; readonly source: ValueSource } | undefined> {
  const picked = await pick(prompter, {
    flag: PROVIDER_FLAG,
    value: opts.provider,
    label: `Provider (${INIT_PROVIDER_IDS.join(", ")})`,
  });
  if (picked === undefined) {
    return undefined;
  }
  const id = parseProvider(picked.value);
  assertProviderFlags(opts, id);
  if (id !== OPENAI_COMPATIBLE_PROVIDER) {
    const model = trimmed(opts.model);
    return { choice: model === "" ? { id } : { id, model }, source: picked.source };
  }
  const baseUrl = await pick(prompter, {
    flag: "--base-url <url>",
    value: opts.baseUrl,
    label: "Base URL of the OpenAI-compatible server",
  });
  const model = await pick(prompter, {
    flag: "--model <name>",
    value: opts.model,
    label: "Model name",
  });
  if (baseUrl === undefined || model === undefined) {
    return undefined;
  }
  assertNoCredentialsInUrl(baseUrl.value);
  const envVar = trimmed(opts.apiKeyEnvVar);
  return {
    choice: {
      id,
      baseUrl: baseUrl.value,
      model: model.value,
      ...(envVar === "" ? {} : { apiKeyEnvVar: envVar }),
    },
    source: picked.source,
  };
}

function ambiguousCandidates(
  detection: ProjectDetection,
  subject: "format" | "layout",
): readonly string[] | undefined {
  return detection.ambiguities.find((ambiguity) => ambiguity.subject === subject)?.candidates;
}

function refuseAmbiguity(
  code: string,
  subject: string,
  flag: string,
  candidates: readonly string[],
): never {
  throw new CliUsageError(
    code,
    `Several ${subject}s fit this project (${candidates.join(", ")}). Pass ${flag} to choose one.`,
    candidates,
  );
}

function formatOrigin(source: ValueSource, detection: ProjectDetection): FormatOrigin {
  if (source !== "detected") {
    return source;
  }
  return detection.format?.from === "dependencies" ? "dependencies" : "files";
}

async function resolveFormat(
  opts: InitOptions,
  detection: ProjectDetection,
  prompter: Prompter,
): Promise<{ readonly value: string; readonly origin: FormatOrigin } | undefined> {
  const candidates = ambiguousCandidates(detection, "format");
  if (trimmed(opts.format) === "" && candidates !== undefined && !prompter.interactive) {
    refuseAmbiguity("FORMAT_AMBIGUOUS", "format", "--format <id>", candidates);
  }
  const picked = await pick(prompter, {
    flag: "--format <id>",
    value: opts.format,
    label: `Locale file format (${(candidates ?? scaffoldingMetadata.supportedFormats).join(", ")})`,
    detected: detection.format?.from === "input" ? undefined : detection.format?.id,
    fallback: candidates?.[0] ?? DEFAULT_FORMAT,
  });
  if (picked === undefined) {
    return undefined;
  }
  parseFormat(picked.value);
  return { value: picked.value, origin: formatOrigin(picked.source, detection) };
}

function splitLocales(raw: string): string[] {
  return raw
    .split(",")
    .map((locale) => locale.trim())
    .filter((locale) => locale.length > 0);
}

function detectedTargets(detection: ProjectDetection, sourceLocale: string): string | undefined {
  const source = sourceLocale.toLowerCase();
  const targets = (detection.layout?.locales ?? []).filter(
    (locale) => locale.toLowerCase() !== source,
  );
  return targets.length === 0 ? undefined : targets.join(",");
}

interface LayoutAnswers {
  readonly sourceLocale: Resolved;
  readonly targetLocales: Resolved;
  readonly pattern: Resolved;
}

async function resolveLayout(
  opts: InitOptions,
  detection: ProjectDetection,
  prompter: Prompter,
): Promise<LayoutAnswers | undefined> {
  const patterns = ambiguousCandidates(detection, "layout");
  if (trimmed(opts.path) === "" && patterns !== undefined && !prompter.interactive) {
    refuseAmbiguity("LAYOUT_AMBIGUOUS", "file pattern", "--path <pattern>", patterns);
  }
  const layout = detection.layout;
  const sourceLocale = await pick(prompter, {
    flag: "--source <locale>",
    value: opts.source,
    label: "Source locale",
    detected: layout?.sourceLocale,
    fallback: DEFAULT_SOURCE,
  });
  const targetLocales = await pick(prompter, {
    flag: "--targets <locales>",
    value: opts.targets,
    label: "Target locales (comma-separated)",
    detected:
      sourceLocale === undefined ? undefined : detectedTargets(detection, sourceLocale.value),
    fallback: DEFAULT_TARGETS,
  });
  const pattern = await pick(prompter, {
    flag: "--path <pattern>",
    value: opts.path,
    label: "Locale file pattern",
    detected: layout?.pattern,
    fallback: patterns?.[0] ?? DEFAULT_PATTERN,
  });
  if (sourceLocale === undefined || targetLocales === undefined || pattern === undefined) {
    return undefined;
  }
  return { sourceLocale, targetLocales, pattern };
}

function normalizedPattern(pattern: string): string {
  return pattern.replaceAll("\\", "/").replace(/^(?:\.\/)+/, "");
}

function localeStyleFor(detection: ProjectDetection, pattern: string): LocaleStyle | undefined {
  const layout = detection.layout;
  return layout !== undefined && layout.pattern === normalizedPattern(pattern)
    ? layout.localeStyle
    : undefined;
}

function missingOptionsError(prompter: Prompter): CliUsageError {
  if (prompter.interactive) {
    return new CliUsageError(
      "MISSING_OPTIONS",
      `Missing ${prompter.missing.join(", ")}. ${prompter.missing.length === 1 ? "It has" : "They have"} no default, so answer the prompt or pass ${prompter.missing.length === 1 ? "it" : "them"} as flags.`,
    );
  }
  const hint = prompter.acceptDefaults
    ? ""
    : " Add --yes to accept the defaults for the ones that have one.";
  return new CliUsageError(
    "MISSING_OPTIONS",
    `Missing ${prompter.missing.join(", ")}. init prompts only when stdin is a terminal and neither --yes nor --json is given, so pass ${prompter.missing.length === 1 ? "it" : "them"} as flags.${hint}`,
  );
}

export interface InitSources {
  readonly provider: ValueSource;
  readonly format: FormatOrigin;
  readonly pattern: ValueSource;
  readonly sourceLocale: ValueSource;
  readonly targetLocales: ValueSource;
}

interface InitPlan {
  readonly draft: ConfigDraft;
  readonly candidate: Record<string, unknown>;
  readonly sources: InitSources;
  readonly detection: ProjectDetection;
}

function draftFrom(
  providerChoice: ProviderChoice,
  format: { readonly value: string; readonly origin: FormatOrigin },
  answers: LayoutAnswers,
  detection: ProjectDetection,
): ConfigDraft {
  return {
    importName: readPackageManifest().name,
    sourceLocale: answers.sourceLocale.value,
    targetLocales: splitLocales(answers.targetLocales.value),
    format: format.value,
    formatOrigin: format.origin,
    pattern: answers.pattern.value,
    localeStyle: localeStyleFor(detection, answers.pattern.value),
    provider: providerChoice,
  };
}

function candidateConfig(draft: ConfigDraft): Record<string, unknown> {
  const localeStyle =
    draft.localeStyle === undefined || draft.localeStyle === "literal"
      ? {}
      : { localeStyle: draft.localeStyle };
  return {
    sourceLocale: draft.sourceLocale,
    targetLocales: draft.targetLocales,
    format: draft.format,
    files: { pattern: draft.pattern, ...localeStyle },
    provider: { id: draft.provider.id, options: buildProviderOptions(draft.provider) },
  };
}

function assertValid(candidate: Record<string, unknown>): void {
  const validated = verbatraConfigSchema.safeParse(candidate);
  if (!validated.success) {
    const detail = validated.error.issues.map((issue) => issue.message).join("; ");
    throw new CliUsageError("CONFIG_INVALID", `Could not scaffold a valid config: ${detail}`);
  }
}

async function planInit(
  opts: InitOptions,
  cwd: string,
  prompter: Prompter,
  detect: NonNullable<InitDeps["detect"]>,
): Promise<InitPlan> {
  const givenFormat = trimmed(opts.format) === "" ? undefined : parseFormat(trimmed(opts.format));
  const provider = await resolveProviderChoice(opts, prompter);
  const detection = await detect({
    cwd,
    ...(givenFormat === undefined ? {} : { format: givenFormat }),
    ...(trimmed(opts.path) === "" ? {} : { pattern: trimmed(opts.path) }),
    ...(trimmed(opts.source) === "" ? {} : { sourceLocale: trimmed(opts.source) }),
  });
  const format = await resolveFormat(opts, detection, prompter);
  const answers = await resolveLayout(opts, detection, prompter);
  if (provider === undefined || format === undefined || answers === undefined) {
    throw missingOptionsError(prompter);
  }
  const draft = draftFrom(provider.choice, format, answers, detection);
  const candidate = candidateConfig(draft);
  assertValid(candidate);
  return {
    draft,
    candidate,
    sources: {
      provider: provider.source,
      format: format.origin,
      pattern: answers.pattern.source,
      sourceLocale: answers.sourceLocale.source,
      targetLocales: answers.targetLocales.source,
    },
    detection,
  };
}

function hasVerbatraProperty(path: string): boolean {
  try {
    const manifest: unknown = JSON.parse(readFileSync(path, "utf8"));
    return typeof manifest === "object" && manifest !== null && "verbatra" in manifest;
  } catch {
    return false;
  }
}

function competingConfig(cwd: string): string | undefined {
  return scaffoldingMetadata.configSearchPlaces.find((name) => {
    if (name === CONFIG_FILE) {
      return false;
    }
    const path = resolve(cwd, name);
    if (!existsSync(path)) {
      return false;
    }
    return name !== "package.json" || hasVerbatraProperty(path);
  });
}

function configAction(cwd: string, content: string, force: boolean): FileAction {
  const competing = competingConfig(cwd);
  if (competing !== undefined) {
    throw new CliUsageError(
      "CONFIG_EXISTS",
      `${competing} already configures verbatra in this directory and would be read before ${CONFIG_FILE}. Edit it, or remove it and run init again.`,
    );
  }
  const path = resolve(cwd, CONFIG_FILE);
  if (!existsSync(path)) {
    return "created";
  }
  if (readFileSync(path, "utf8") === content) {
    return "unchanged";
  }
  if (!force) {
    throw new CliUsageError(
      "CONFIG_EXISTS",
      `${CONFIG_FILE} already exists with different content. Pass --force to overwrite it, or edit it by hand.`,
    );
  }
  return "overwritten";
}

function writeEnvExample(cwd: string, choice: ProviderChoice, envVar: string): FileAction {
  const path = resolve(cwd, ENV_EXAMPLE_FILE);
  if (!existsSync(path)) {
    writeFileSync(path, renderEnvExample(choice, envVar));
    return "created";
  }
  const content = readFileSync(path, "utf8");
  if (namesEnvVar(content, envVar)) {
    return "unchanged";
  }
  const separator = content.length === 0 || content.endsWith("\n") ? "" : "\n";
  appendFileSync(path, `${separator}${envVar}=\n`);
  return "updated";
}

interface WrittenFile {
  readonly path: string;
  readonly action: FileAction;
}

const SILENT_STREAMS: Streams = { out: () => {}, err: () => {} };

function writePlan(
  plan: InitPlan,
  cwd: string,
  force: boolean,
  streams: Streams,
): readonly WrittenFile[] {
  const content = renderConfig(plan.draft);
  const action = configAction(cwd, content, force);
  if (action !== "unchanged") {
    writeFileSync(resolve(cwd, CONFIG_FILE), content);
  }
  streams.out(`${action === "overwritten" ? "overwrote" : action} ${CONFIG_FILE}\n`);
  const files: WrittenFile[] = [{ path: CONFIG_FILE, action }];
  const envVar = keyEnvVarFor(plan.draft.provider);
  if (envVar !== undefined) {
    const envAction = writeEnvExample(cwd, plan.draft.provider, envVar);
    streams.out(`${envAction} ${ENV_EXAMPLE_FILE}\n`);
    files.push({ path: ENV_EXAMPLE_FILE, action: envAction });
  }
  const gitignore: GitignoreAction = ensureGitignore(cwd, streams);
  files.push({ path: ".gitignore", action: gitignore });
  return files;
}

export interface NextStep {
  readonly description: string;
  readonly command: string | null;
}

function shellQuote(value: string): string {
  return /^[\w./:@-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

function nextSteps(plan: InitPlan, cwdFlag: string | undefined): readonly NextStep[] {
  const suffix = cwdFlag === undefined ? "" : ` --cwd ${shellQuote(cwdFlag)}`;
  const steps: NextStep[] = [];
  if (plan.sources.format === "default") {
    steps.push({
      description: `Set format in ${CONFIG_FILE}: init found no locale file to detect it from.`,
      command: null,
    });
  }
  const envVar = keyEnvVarFor(plan.draft.provider);
  if (envVar !== undefined) {
    steps.push({
      description: isOptionalKey(plan.draft.provider)
        ? `Set ${envVar} in .env only if your server requires a key. Never commit .env.`
        : `Copy ${ENV_EXAMPLE_FILE} to .env and set ${envVar} there. Never commit .env.`,
      command: null,
    });
  }
  steps.push({
    description: "Check the setup. It calls no provider and reads no key value.",
    command: `npx verbatra doctor${suffix}`,
  });
  steps.push(
    plan.draft.provider.id === HUMAN_ONLY_PROVIDER
      ? {
          description: "Hand the untranslated keys to a person as a workbook.",
          command: `npx verbatra export${suffix}`,
        }
      : {
          description: "Preview what a run would translate, without calling the provider.",
          command: `npx verbatra translate --dry-run --json${suffix}`,
        },
  );
  return steps;
}

function detectionForJson(detection: ProjectDetection): unknown {
  const layout = detection.layout;
  return {
    format: detection.format ?? null,
    layout: layout === undefined ? null : { ...layout, sourceLocale: layout.sourceLocale ?? null },
    ambiguities: detection.ambiguities,
    confidence: detection.confidence,
    reasons: detection.reasons,
  };
}

function renderDetectionHuman(detection: ProjectDetection): string | undefined {
  if (detection.confidence === "none") {
    return undefined;
  }
  const parts = [
    detection.format === undefined ? undefined : `format ${detection.format.id}`,
    detection.layout === undefined ? undefined : `pattern ${detection.layout.pattern}`,
    detection.layout === undefined || detection.layout.locales.length === 0
      ? undefined
      : `locales ${detection.layout.locales.join(", ")}`,
  ].filter((part) => part !== undefined);
  return `detected ${parts.join(", ")} (confidence: ${detection.confidence})`;
}

function renderNextStepsHuman(steps: readonly NextStep[]): string {
  const lines = steps.map((step) =>
    step.command === null
      ? `  - ${step.description}`
      : `  - ${step.command}  (${step.description})`,
  );
  return ["next steps:", ...lines].join("\n");
}

function interactiveMode(opts: InitOptions, isTty: () => boolean): boolean {
  return opts.yes !== true && opts.json !== true && isTty();
}

function renderFailure(error: unknown, json: boolean, streams: Streams): number {
  const renderable = toRenderableError(error);
  streams.err(`${renderError(renderable)}\n`);
  if (json) {
    streams.out(`${renderErrorEnvelope("init", renderable)}\n`);
  }
  return 2;
}

export async function runInit(
  rawOpts: unknown,
  streams: Streams,
  deps: InitDeps = {},
): Promise<number> {
  const parsed = initOptsSchema.safeParse(rawOpts);
  const json = parsed.success && parsed.data.json === true;
  try {
    const opts = initOptsSchema.parse(rawOpts);
    const cwd = opts.cwd ?? process.cwd();
    const prompter: Prompter = {
      interactive: interactiveMode(opts, deps.isTty ?? stdinIsTty),
      acceptDefaults: opts.yes === true,
      ask: deps.ask ?? askLine,
      missing: [],
    };
    const plan = await planInit(opts, cwd, prompter, deps.detect ?? detectProject);
    const files = writePlan(plan, cwd, opts.force === true, json ? SILENT_STREAMS : streams);
    const steps = nextSteps(plan, opts.cwd);
    if (json) {
      const keyEnvVar = keyEnvVarFor(plan.draft.provider);
      streams.out(
        `${renderSuccessEnvelope("init", {
          configPath: resolve(cwd, CONFIG_FILE),
          files,
          config: plan.candidate,
          sources: plan.sources,
          apiKeyEnvVar: keyEnvVar ?? null,
          detection: detectionForJson(plan.detection),
          nextSteps: steps,
        })}\n`,
      );
      return 0;
    }
    const detected = renderDetectionHuman(plan.detection);
    if (detected !== undefined) {
      streams.out(`${detected}\n`);
    }
    streams.out(`${renderNextStepsHuman(steps)}\n`);
    return 0;
  } catch (error) {
    return renderFailure(error, json, streams);
  }
}
