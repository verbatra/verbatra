import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  type LocaleResource,
  pseudolocalizeValue,
  type SupportedFormat,
  type TranslationEntry,
} from "@verbatra/core";
import type { AdapterRegistry, FormatAdapter } from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { createLocalePathResolver, type LocalePathResolver } from "../locale-path/resolver.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { gateCandidateValue } from "./integrity-gate.js";
import { readSourceResource } from "./source.js";
import { targetUnwritableMessage, writeTargetResource } from "./write-target.js";

const DEFAULT_PSEUDO_LOCALE = "en-XA";

const DEFAULT_PSEUDO_DIRECTORY = ".verbatra-local/pseudo";

const MAX_SEED_BYTES = 16 * 1024 * 1024;

const SEEDED_FROM_SOURCE: ReadonlySet<SupportedFormat> = new Set<SupportedFormat>([
  "apple-xcstrings",
  "xliff",
]);

const PIPE_SEGMENTED_FORMATS: ReadonlySet<SupportedFormat> = new Set<SupportedFormat>([
  "vue-i18n-json",
]);

const XLIFF_TARGET_LANGUAGE = /\b(target-language|trgLang)\s*=\s*(["'])[^"']*\2/g;

const SEGMENT_PADDING = /^(\s*)([\s\S]*?)(\s*)$/;

const GROUP_OPEN = new Set(["{", "("]);

const GROUP_CLOSE = new Set(["}", ")"]);

/** Input for {@link pseudolocalize}. */
export interface PseudolocalizeInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against. Defaults to the process working directory. */
  readonly cwd?: string;
  /**
   * The pseudolocale's BCP-47 code. Defaults to `en-XA`. It must not be the source locale or any
   * configured target locale, so a pseudolocale can never stand in for a real translation.
   */
  readonly locale?: string;
  /**
   * Directory the pseudolocale file is written under, relative to `cwd`. Defaults to
   * `.verbatra-local/pseudo`, which `verbatra init` already adds to `.gitignore`. The configured
   * `files.pattern` is expanded inside it, so the file keeps the layout the application expects.
   *
   * It must name a directory inside `cwd`: an absolute path, one that climbs out with `..`, and
   * `cwd` itself are all refused, as is any directory that already holds a configured locale file,
   * so a generated pseudolocale never lands outside the project or beside the real translations
   * where nothing ignores it.
   */
  readonly out?: string;
}

/** Injectable dependencies for {@link pseudolocalize}. Every field has a working default. */
export interface PseudolocalizeDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

/** The result of {@link pseudolocalize}: what was generated and where it landed. */
export interface PseudolocalizeResult {
  /** The pseudolocale that was generated. */
  readonly locale: string;
  /** Absolute path of the file that was written, or would have been written on a changed run. */
  readonly path: string;
  /** How many source entries were processed. */
  readonly entries: number;
  /** How many entries carry a pseudolocalized value. */
  readonly transformed: number;
  /**
   * Keys whose source value was copied verbatim because a pseudolocalized value would not have
   * passed the same integrity gate a translation must pass. Never a failure: the entry is still
   * present and still renders.
   */
  readonly copied: readonly string[];
  /** False when the file on disk already matched, so nothing was rewritten. */
  readonly written: boolean;
}

function escapesWorkingDirectory(inside: string): boolean {
  return inside === "" || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside);
}

function resolveOutputRoot(cwd: string, out: string | undefined): string {
  const requested = out ?? DEFAULT_PSEUDO_DIRECTORY;
  const root = isAbsolute(requested) ? requested : resolve(cwd, requested);
  if (isAbsolute(requested) || escapesWorkingDirectory(relative(cwd, root))) {
    throw new SdkError(
      "PSEUDO_OUTPUT_CONFLICT",
      `The output directory "${requested}" must be a relative path naming a directory inside the working directory, so a pseudolocale is never written outside the project it was generated from, and never into the project root itself.`,
    );
  }
  return root;
}

function configuredLocales(config: VerbatraConfig): readonly string[] {
  return [config.sourceLocale, ...config.targetLocales];
}

function assertPseudoLocaleIsNotConfigured(config: VerbatraConfig, locale: string): void {
  const key = locale.toLowerCase();
  if (configuredLocales(config).some((configured) => configured.toLowerCase() === key)) {
    throw new SdkError(
      "PSEUDO_OUTPUT_CONFLICT",
      `The pseudolocale "${locale}" is already a configured locale, so generating it would stand in for a real translation. Choose a code that is neither the source locale nor a target locale.`,
    );
  }
}

function assertOutputIsAwayFromTheLocaleFiles(
  config: VerbatraConfig,
  resolver: LocalePathResolver,
  outputPath: string,
): void {
  const outputDirectory = dirname(outputPath);
  for (const locale of configuredLocales(config)) {
    if (dirname(resolver.pathFor(locale)) === outputDirectory) {
      throw new SdkError(
        "PSEUDO_OUTPUT_CONFLICT",
        `The pseudolocale would be written to ${outputPath}, beside the locale file for "${locale}", where it is not covered by the scaffolded ignore list. Choose an output directory that holds no real locale file.`,
      );
    }
  }
}

interface PseudoEntries {
  readonly entries: Map<string, TranslationEntry>;
  readonly copied: readonly string[];
}

function splitPluralForms(value: string): readonly string[] {
  const forms: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    const char = value.charAt(i);
    if (GROUP_OPEN.has(char)) {
      depth += 1;
    } else if (GROUP_CLOSE.has(char)) {
      depth = Math.max(0, depth - 1);
    } else if (char === "|" && depth === 0) {
      forms.push(value.slice(start, i));
      start = i + 1;
    }
  }
  forms.push(value.slice(start));
  return forms;
}

function pseudolocalizeSegment(segment: string): string {
  const [, lead = "", body = "", trail = ""] = SEGMENT_PADDING.exec(segment) ?? [];
  return body === "" ? segment : `${lead}${pseudolocalizeValue(body)}${trail}`;
}

function pseudolocalizeEntryValue(entry: TranslationEntry, format: SupportedFormat): string {
  if (!entry.isPlural || !PIPE_SEGMENTED_FORMATS.has(format)) {
    return pseudolocalizeValue(entry.value);
  }
  return splitPluralForms(entry.value).map(pseudolocalizeSegment).join("|");
}

function pseudolocalizeEntries(
  source: ReadonlyMap<string, TranslationEntry>,
  adapter: FormatAdapter,
  format: SupportedFormat,
): PseudoEntries {
  const entries = new Map<string, TranslationEntry>();
  const copied: string[] = [];
  for (const [key, entry] of source) {
    const candidate = pseudolocalizeEntryValue(entry, format);
    const accepted = gateCandidateValue(entry, candidate, adapter).accepted;
    if (!accepted) {
      copied.push(key);
    }
    entries.set(key, { ...entry, value: accepted ? candidate : entry.value });
  }
  return { entries, copied };
}

function retargetSeed(content: string, format: SupportedFormat, locale: string): string {
  if (format !== "xliff") {
    return content;
  }
  return content.replaceAll(
    XLIFF_TARGET_LANGUAGE,
    (_match, attribute: string, quote: string) => `${attribute}=${quote}${locale}${quote}`,
  );
}

interface SeedRequest {
  readonly config: VerbatraConfig;
  readonly locale: string;
  readonly sourcePath: string;
  readonly outputPath: string;
  readonly cwd: string;
  readonly fs: SdkFs;
}

async function seedFromSource(request: SeedRequest): Promise<void> {
  if (!SEEDED_FROM_SOURCE.has(request.config.format)) {
    return;
  }
  const read = await request.fs.readFileBounded(request.sourcePath, MAX_SEED_BYTES);
  if (read.kind !== "ok") {
    throw new SdkError(
      "SOURCE_INVALID",
      `The file at ${request.sourcePath} could not be copied to ${request.outputPath} to seed the pseudolocale.`,
    );
  }
  const seeded = retargetSeed(read.content, request.config.format, request.locale);
  try {
    await request.fs.mkdir?.(dirname(request.outputPath));
    await request.fs.writeFile(request.outputPath, seeded);
  } catch (error) {
    throw new SdkError(
      "TARGET_UNWRITABLE",
      targetUnwritableMessage(request.outputPath, request.cwd, error),
    );
  }
}

async function readWrittenValues(
  adapter: FormatAdapter,
  outputPath: string,
  locale: string,
  fs: SdkFs,
): Promise<ReadonlyMap<string, TranslationEntry> | undefined> {
  if (!(await fs.fileExists(outputPath))) {
    return undefined;
  }
  try {
    return (await adapter.read(outputPath, locale)).resource.entries;
  } catch {
    return undefined;
  }
}

function sameValues(
  candidate: ReadonlyMap<string, TranslationEntry>,
  existing: ReadonlyMap<string, TranslationEntry> | undefined,
): boolean {
  if (existing === undefined || existing.size !== candidate.size) {
    return false;
  }
  for (const [key, entry] of candidate) {
    if (existing.get(key)?.value !== entry.value) {
      return false;
    }
  }
  return true;
}

/**
 * Generates a pseudolocale from the source strings alone: every value is accented, expanded by
 * roughly a third of its translatable length, and wrapped in `[` and `]` boundary markers, so a
 * truncated or concatenated string is obvious on screen and an untranslated hardcoded string stands
 * out for having escaped the transform.
 *
 * It constructs no provider, reads no API key and makes no network request, so it runs on a fresh
 * checkout before any key exists or any budget is approved.
 *
 * Placeholders survive untouched in every syntax the shipped adapters recognise, and every
 * generated value is held to the same integrity gate a provider's translation must pass. A value
 * that would not pass it is copied from the source verbatim and reported in
 * {@link PseudolocalizeResult.copied} rather than written in a broken form.
 *
 * The output is deliberately kept out of the project's real locale files: it is written under
 * `.verbatra-local/pseudo` by default, which `verbatra init` already adds to `.gitignore`, and the
 * pseudolocale is refused when it names a configured locale, when the output directory already
 * holds a configured locale file, and when it is directed at the project root or outside the
 * working directory. Because it lives outside `files.pattern`, {@link translate} never spends on it and
 * {@link check} and {@link diff} never report it as drifted.
 *
 * The transform is deterministic, so a second run over unchanged source rewrites nothing and
 * reports {@link PseudolocalizeResult.written} as false. For `xliff` and `apple-xcstrings`, whose
 * writers only patch units already present in the destination, the output is re-copied from the
 * source on every write, so a key added to the source after the first run still reaches the
 * pseudolocale; a copied XLIFF has its target-language attribute rewritten to the pseudolocale, so
 * the file never misdescribes what it holds.
 *
 * @param input - The config, the pseudolocale code, and the output directory.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns Where the pseudolocale landed, how many entries it carries, and whether it changed.
 *
 * @example
 * ```ts
 * const result = await pseudolocalize({ config });
 * console.log(`${result.transformed} of ${result.entries} entries in ${result.path}`);
 * ```
 *
 * @throws {@link SdkError} `PSEUDO_OUTPUT_CONFLICT`: the pseudolocale names a configured locale, the
 * output directory already holds a configured locale file, or it is not a relative path naming a
 * directory inside `cwd`.
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or the pseudolocale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the source locale file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: the source locale file could not be parsed, or, for a
 * format whose writer only patches an existing document (`xliff` and `apple-xcstrings`), the
 * source file could not be copied to seed the output.
 * @throws {@link SdkError} `TARGET_UNWRITABLE`: the pseudolocale file could not be written.
 */
export async function pseudolocalize(
  input: PseudolocalizeInput,
  deps: PseudolocalizeDeps = {},
): Promise<PseudolocalizeResult> {
  const { config } = input;
  const cwd = input.cwd ?? process.cwd();
  const locale = input.locale ?? DEFAULT_PSEUDO_LOCALE;
  const fs = deps.fs ?? defaultFs;
  assertPseudoLocaleIsNotConfigured(config, locale);

  const adapter = selectAdapter(config.format, deps.adapterRegistry, deps.fs);
  const resolver = createLocalePathResolver(cwd, config);
  const outputPath = createLocalePathResolver(resolveOutputRoot(cwd, input.out), {
    ...config,
    targetLocales: [locale],
  }).pathFor(locale);
  assertOutputIsAwayFromTheLocaleFiles(config, resolver, outputPath);

  const source = await readSourceResource(config, resolver, fs, adapter);
  const { entries, copied } = pseudolocalizeEntries(
    source.resource.entries,
    adapter,
    config.format,
  );
  const summary = {
    locale,
    path: outputPath,
    entries: entries.size,
    transformed: entries.size - copied.length,
    copied,
  };

  if (sameValues(entries, await readWrittenValues(adapter, outputPath, locale, fs))) {
    return { ...summary, written: false };
  }
  await seedFromSource({
    config,
    locale,
    sourcePath: resolver.pathFor(config.sourceLocale),
    outputPath,
    cwd,
    fs,
  });
  const resource: LocaleResource = {
    locale,
    namespace: source.resource.namespace,
    format: config.format,
    entries,
  };
  await writeTargetResource(adapter, resource, outputPath, cwd);
  return { ...summary, written: true };
}
