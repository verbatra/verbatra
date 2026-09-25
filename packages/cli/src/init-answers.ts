import {
  type DetectProjectInput,
  type LocaleStyle,
  type ProjectDetection,
  type SupportedFormat,
  scaffoldingMetadata,
  verbatraConfigSchema,
} from "@verbatra/sdk";
import { z } from "zod";
import type { CliErrorCode } from "./cli-error-codes.js";
import { CliUsageError } from "./cli-usage-error.js";
import {
  buildProviderOptions,
  type ConfigDraft,
  DEFAULT_LAYOUTS,
  type DefaultLayout,
  type FormatOrigin,
  INIT_PROVIDER_IDS,
  type InitProviderId,
  isInitProviderId,
  OPENAI_COMPATIBLE_PROVIDER,
  type ProviderChoice,
  takesModel,
} from "./init-config.js";
import { readPackageManifest } from "./package-manifest.js";

export const initOptsSchema = z.object({
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

export type InitOptions = z.infer<typeof initOptsSchema>;

export type ValueSource = "flag" | "detected" | "prompt" | "default";

export type DetectFn = (input: DetectProjectInput) => Promise<ProjectDetection>;

export interface InitSources {
  readonly provider: ValueSource;
  readonly format: FormatOrigin;
  readonly pattern: ValueSource;
  readonly sourceLocale: ValueSource;
  readonly targetLocales: ValueSource;
}

export interface InitPlan {
  readonly draft: ConfigDraft;
  readonly candidate: Record<string, unknown>;
  readonly sources: InitSources;
  readonly detection: ProjectDetection;
}

interface Resolved {
  readonly value: string;
  readonly source: ValueSource;
}

interface MissingFlag {
  readonly flag: string;
  readonly hasDefault: boolean;
  readonly reason: string | undefined;
}

export interface Prompter {
  readonly interactive: boolean;
  readonly acceptDefaults: boolean;
  readonly ask: (question: string) => Promise<string>;
  readonly warn: (message: string) => void;
}

interface Session extends Prompter {
  readonly missing: MissingFlag[];
  readonly problems: CliUsageError[];
  stopped: boolean;
}

interface PickSpec {
  readonly flag: string;
  readonly value: string | undefined;
  readonly label: string;
  readonly detected?: string | undefined;
  readonly fallback?: string | undefined;
  readonly missingReason?: string | undefined;
  readonly validate?: (answer: string) => void;
}

const DEFAULT_FORMAT: SupportedFormat = "i18next-json";
const DEFAULT_SOURCE = "en";
const DEFAULT_TARGETS = "de";
const ENV_VAR_NAME = /^[A-Z_][A-Z0-9_]*$/;
const PROVIDER_FLAG = `--provider <${INIT_PROVIDER_IDS.join("|")}>`;

export function trimmed(value: string | undefined): string {
  return value?.trim() ?? "";
}

function fallbackAnswer(spec: PickSpec, session: Session): Resolved | undefined {
  if (spec.detected !== undefined) {
    return { value: spec.detected, source: "detected" };
  }
  if ((session.interactive || session.acceptDefaults) && spec.fallback !== undefined) {
    return { value: spec.fallback, source: "default" };
  }
  session.missing.push({
    flag: spec.flag,
    hasDefault: spec.fallback !== undefined,
    reason: spec.missingReason,
  });
  return undefined;
}

function emptyFlagError(flag: string): CliUsageError {
  return invalidOption(`${flag} was given an empty value. Pass a value, or leave the flag out.`);
}

const MAX_ASKS = 3;

async function askOnce(session: Session, spec: PickSpec): Promise<Resolved | undefined> {
  const suggestion = spec.detected ?? spec.fallback;
  const question = suggestion === undefined ? `${spec.label}: ` : `${spec.label} [${suggestion}]: `;
  const answer = (await session.ask(question)).trim();
  if (answer !== "") {
    return { value: answer, source: "prompt" };
  }
  if (spec.detected === undefined && spec.fallback !== undefined) {
    return { value: spec.fallback, source: "prompt" };
  }
  return undefined;
}

function answerProblem(spec: PickSpec, answer: string): CliUsageError | undefined {
  try {
    spec.validate?.(answer);
    return undefined;
  } catch (error) {
    if (error instanceof CliUsageError) {
      return error;
    }
    throw error;
  }
}

function refusedAnswer(spec: PickSpec, problem: CliUsageError): CliUsageError {
  return new CliUsageError(
    problem.code,
    `${problem.message} Stopped asking for "${spec.label}" after ${MAX_ASKS} invalid answers; pass ${spec.flag} instead.`,
    problem.candidates,
  );
}

async function askFor(session: Session, spec: PickSpec): Promise<Resolved | undefined> {
  for (let asked = 1; ; asked += 1) {
    const answer = await askOnce(session, spec);
    const problem = answer === undefined ? undefined : answerProblem(spec, answer.value);
    if (problem === undefined) {
      return answer;
    }
    if (asked >= MAX_ASKS) {
      session.problems.push(refusedAnswer(spec, problem));
      session.stopped = true;
      return undefined;
    }
    session.warn(`${problem.message} Answer again.`);
  }
}

async function pick(session: Session, spec: PickSpec): Promise<Resolved | undefined> {
  if (session.stopped) {
    return undefined;
  }
  const flagged = trimmed(spec.value);
  if (flagged !== "") {
    return { value: flagged, source: "flag" };
  }
  if (spec.value !== undefined) {
    session.problems.push(emptyFlagError(spec.flag));
    return undefined;
  }
  const answered = session.interactive ? await askFor(session, spec) : undefined;
  if (session.stopped) {
    return undefined;
  }
  return answered ?? fallbackAnswer(spec, session);
}

async function attempt<T>(session: Session, body: () => Promise<T> | T): Promise<T | undefined> {
  try {
    return await body();
  } catch (error) {
    if (error instanceof CliUsageError) {
      session.problems.push(error);
      return undefined;
    }
    throw error;
  }
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
        `${given.map(([flag]) => flag).join(" and ")} ${given.length === 1 ? "applies" : "apply"} to --provider ${OPENAI_COMPATIBLE_PROVIDER} only.`,
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

function assertBaseUrl(baseUrl: string): void {
  if (!URL.canParse(baseUrl)) {
    throw invalidOption(
      `"${baseUrl}" is not a URL. Enter the server's base URL, such as http://localhost:1234/v1.`,
    );
  }
  assertNoCredentialsInUrl(baseUrl);
}

function assertLocale(locale: string): void {
  if (!verbatraConfigSchema.shape.sourceLocale.safeParse(locale).success) {
    throw new CliUsageError(
      "INVALID_LOCALE",
      `"${locale}" is not a BCP 47 locale code. Enter one such as en, pt-BR, or zh-Hant.`,
    );
  }
}

function assertTargets(answer: string, sourceLocale: string | undefined): void {
  const locales = splitLocales(answer);
  if (locales.length === 0) {
    throw noTargetsError();
  }
  locales.forEach(assertLocale);
  const source = sourceLocale?.toLowerCase();
  if (locales.some((locale) => locale.toLowerCase() === source)) {
    throw new CliUsageError(
      "INVALID_LOCALES",
      `The target locales must not include the source locale ${sourceLocale}.`,
    );
  }
}

function assertPattern(pattern: string): void {
  if (!pattern.includes("{locale}")) {
    throw invalidOption(
      `"${pattern}" has no {locale} token. Enter a pattern such as locales/{locale}.json.`,
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

interface ProviderAnswer {
  readonly choice: ProviderChoice;
  readonly source: ValueSource;
}

async function resolveOpenAiCompatible(
  opts: InitOptions,
  session: Session,
  source: ValueSource,
): Promise<ProviderAnswer | undefined> {
  const baseUrl = await pick(session, {
    flag: "--base-url <url>",
    value: opts.baseUrl,
    label: "Base URL of the OpenAI-compatible server",
    validate: assertBaseUrl,
  });
  const model = await pick(session, {
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
      id: OPENAI_COMPATIBLE_PROVIDER,
      baseUrl: baseUrl.value,
      model: model.value,
      ...(envVar === "" ? {} : { apiKeyEnvVar: envVar }),
    },
    source,
  };
}

async function resolveProvider(
  opts: InitOptions,
  session: Session,
): Promise<ProviderAnswer | undefined> {
  const picked = await pick(session, {
    flag: PROVIDER_FLAG,
    value: opts.provider,
    label: `Provider (${INIT_PROVIDER_IDS.join(", ")})`,
    validate: (answer) => assertProviderFlags(opts, parseProvider(answer)),
  });
  if (picked === undefined) {
    return undefined;
  }
  const id = parseProvider(picked.value);
  assertProviderFlags(opts, id);
  if (id === OPENAI_COMPATIBLE_PROVIDER) {
    return resolveOpenAiCompatible(opts, session, picked.source);
  }
  const model = trimmed(opts.model);
  return { choice: model === "" ? { id } : { id, model }, source: picked.source };
}

function ambiguousCandidates(
  detection: ProjectDetection,
  subject: "format" | "layout",
): readonly string[] | undefined {
  return detection.ambiguities.find((ambiguity) => ambiguity.subject === subject)?.candidates;
}

function ambiguityError(
  code: CliErrorCode,
  subject: string,
  flag: string,
  candidates: readonly string[],
): CliUsageError {
  return new CliUsageError(
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

interface FormatAnswer {
  readonly value: SupportedFormat;
  readonly origin: FormatOrigin;
}

async function resolveFormat(
  opts: InitOptions,
  detection: ProjectDetection,
  session: Session,
): Promise<FormatAnswer | undefined> {
  const candidates = ambiguousCandidates(detection, "format");
  if (trimmed(opts.format) === "" && candidates !== undefined && !session.interactive) {
    session.problems.push(
      ambiguityError("FORMAT_AMBIGUOUS", "format", "--format <id>", candidates),
    );
    return undefined;
  }
  const picked = await pick(session, {
    flag: "--format <id>",
    value: opts.format,
    label: `Locale file format (${(candidates ?? scaffoldingMetadata.supportedFormats).join(", ")})`,
    detected: detection.format?.from === "input" ? undefined : detection.format?.id,
    fallback: candidates?.[0] ?? DEFAULT_FORMAT,
    validate: parseFormat,
  });
  if (picked === undefined) {
    return undefined;
  }
  return { value: parseFormat(picked.value), origin: formatOrigin(picked.source, detection) };
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

async function resolvePattern(
  opts: InitOptions,
  detection: ProjectDetection,
  session: Session,
  defaultLayout: DefaultLayout,
): Promise<Resolved | undefined> {
  const patterns = ambiguousCandidates(detection, "layout");
  if (trimmed(opts.path) === "" && patterns !== undefined && !session.interactive) {
    session.problems.push(
      ambiguityError("LAYOUT_AMBIGUOUS", "file pattern", "--path <pattern>", patterns),
    );
    return undefined;
  }
  return pick(session, {
    flag: "--path <pattern>",
    value: opts.path,
    label: "Locale file pattern",
    detected: detection.layout?.pattern,
    fallback: patterns?.[0] ?? defaultLayout.pattern,
    validate: assertPattern,
  });
}

function unqualifiedSourceReason(file: string): string {
  return `${file} holds strings under no locale name, so init cannot tell which locale it is written in`;
}

function noTargetsError(): CliUsageError {
  return invalidOption(
    "--targets names no locale. Pass one or more comma-separated locales, such as de,fr.",
  );
}

async function resolveLayout(
  opts: InitOptions,
  detection: ProjectDetection,
  session: Session,
  defaultLayout: DefaultLayout,
): Promise<LayoutAnswers | undefined> {
  const layout = detection.layout;
  const unqualified = layout?.unqualifiedSourceFile;
  const sourceLocale = await pick(session, {
    flag: "--source <locale>",
    value: opts.source,
    label: "Source locale",
    detected: layout?.sourceLocale,
    fallback: unqualified === undefined ? DEFAULT_SOURCE : undefined,
    missingReason: unqualified === undefined ? undefined : unqualifiedSourceReason(unqualified),
    validate: assertLocale,
  });
  const targetLocales = await pick(session, {
    flag: "--targets <locales>",
    value: opts.targets,
    label: "Target locales (comma-separated)",
    detected:
      sourceLocale === undefined ? undefined : detectedTargets(detection, sourceLocale.value),
    fallback: DEFAULT_TARGETS,
    validate: (answer) => assertTargets(answer, sourceLocale?.value),
  });
  if (targetLocales !== undefined && splitLocales(targetLocales.value).length === 0) {
    session.problems.push(noTargetsError());
  }
  const pattern = await resolvePattern(opts, detection, session, defaultLayout);
  if (sourceLocale === undefined || targetLocales === undefined || pattern === undefined) {
    return undefined;
  }
  return { sourceLocale, targetLocales, pattern };
}

function localeStyleFor(
  detection: ProjectDetection,
  pattern: Resolved,
  defaultLayout: DefaultLayout,
): LocaleStyle | undefined {
  const layout = detection.layout;
  if (layout === undefined) {
    return pattern.value === defaultLayout.pattern ? defaultLayout.localeStyle : undefined;
  }
  const fitsLayout =
    pattern.source === "detected" || pattern.source === "flag" || pattern.value === layout.pattern;
  return fitsLayout ? layout.localeStyle : undefined;
}

function missingSentence(missing: readonly MissingFlag[], lead = "Missing"): string {
  const flags = missing.map((entry) => entry.flag).join(", ");
  const reasons = missing.flatMap((entry) =>
    entry.reason === undefined ? [] : [`${entry.flag}: ${entry.reason}.`],
  );
  return [`${lead} ${flags}.`, ...reasons].join(" ");
}

function missingOptionsError(session: Session): CliUsageError {
  const missing = session.missing;
  const pronoun = missing.length === 1 ? "it" : "them";
  const flags = missing.map((entry) => entry.flag);
  if (session.interactive) {
    return new CliUsageError(
      "MISSING_OPTIONS",
      `${missingSentence(missing)} ${missing.length === 1 ? "It has" : "They have"} no default, so answer the prompt or pass ${pronoun} as flags.`,
      undefined,
      flags,
    );
  }
  const defaulted = missing.filter((entry) => entry.hasDefault).map((entry) => entry.flag);
  const hint =
    session.acceptDefaults || defaulted.length === 0
      ? ""
      : ` Or add --yes to accept the default for ${defaulted.join(", ")}.`;
  return new CliUsageError(
    "MISSING_OPTIONS",
    `${missingSentence(missing)} init prompts only when stdin is a terminal and neither --yes nor --json is given, so pass ${pronoun} as flags.${hint}`,
    undefined,
    flags,
  );
}

function distinctProblems(problems: readonly CliUsageError[]): readonly CliUsageError[] {
  const seen = new Set<string>();
  return problems.filter((problem) => {
    const identity = `${problem.code}\u0000${problem.message}`;
    if (seen.has(identity)) {
      return false;
    }
    seen.add(identity);
    return true;
  });
}

function combinedError(session: Session): CliUsageError | undefined {
  const [first, ...rest] = distinctProblems(session.problems);
  if (first === undefined) {
    return session.missing.length === 0 ? undefined : missingOptionsError(session);
  }
  const extra = [
    ...rest.map((problem) => `[${problem.code}] ${problem.message}`),
    ...(session.missing.length === 0 ? [] : [missingSentence(session.missing, "Also missing")]),
  ];
  return new CliUsageError(
    first.code,
    [first.message, ...extra].join(" "),
    first.candidates,
    session.missing.map((entry) => entry.flag),
  );
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
    const detail = [...new Set(validated.error.issues.map((issue) => issue.message))].join("; ");
    throw new CliUsageError("CONFIG_INVALID", `Could not scaffold a valid config: ${detail}`);
  }
}

function detectionInput(opts: InitOptions, cwd: string, format: SupportedFormat | undefined) {
  return {
    cwd,
    ...(format === undefined ? {} : { format }),
    ...(trimmed(opts.path) === "" ? {} : { pattern: trimmed(opts.path) }),
    ...(trimmed(opts.source) === "" ? {} : { sourceLocale: trimmed(opts.source) }),
  };
}

export async function planInit(
  opts: InitOptions,
  cwd: string,
  prompter: Prompter,
  detect: DetectFn,
): Promise<InitPlan> {
  const session: Session = { ...prompter, missing: [], problems: [], stopped: false };
  const givenFormat =
    trimmed(opts.format) === ""
      ? undefined
      : await attempt(session, () => parseFormat(trimmed(opts.format)));
  const provider = await attempt(session, () => resolveProvider(opts, session));
  const detection = await detect(detectionInput(opts, cwd, givenFormat));
  const format = await attempt(session, () => resolveFormat(opts, detection, session));
  const defaultLayout = DEFAULT_LAYOUTS[format?.value ?? DEFAULT_FORMAT];
  const answers = await resolveLayout(opts, detection, session, defaultLayout);
  const failure = combinedError(session);
  if (failure !== undefined || provider === undefined || format === undefined || !answers) {
    throw failure ?? missingOptionsError(session);
  }
  const draft: ConfigDraft = {
    importName: readPackageManifest().name,
    sourceLocale: answers.sourceLocale.value,
    targetLocales: splitLocales(answers.targetLocales.value),
    format: format.value,
    formatOrigin: format.origin,
    pattern: answers.pattern.value,
    localeStyle: localeStyleFor(detection, answers.pattern, defaultLayout),
    provider: provider.choice,
  };
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
