import { dirname, resolve } from "node:path";
import { type LocaleResource, pseudolocalizeValue, type TranslationEntry } from "@verbatra/core";
import type { AdapterRegistry, FormatAdapter } from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { createLocalePathResolver, type LocalePathResolver } from "../locale-path/resolver.js";
import { isSharedCatalogueFormat } from "../locale-path/shared-catalogue-format.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { gateCandidateValue } from "./integrity-gate.js";
import { readSourceResource } from "./source.js";
import { writeTargetResource } from "./write-target.js";

const DEFAULT_PSEUDO_LOCALE = "en-XA";

const DEFAULT_PSEUDO_DIRECTORY = ".verbatra-local/pseudo";

const MAX_CATALOGUE_BYTES = 16 * 1024 * 1024;

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

function assertOutputIsNotALocaleFile(
  config: VerbatraConfig,
  resolver: LocalePathResolver,
  outputPath: string,
): void {
  for (const locale of configuredLocales(config)) {
    if (resolver.pathFor(locale) === outputPath) {
      throw new SdkError(
        "PSEUDO_OUTPUT_CONFLICT",
        `The pseudolocale would be written to ${outputPath}, which is the locale file for "${locale}". Choose a different output directory.`,
      );
    }
  }
}

interface PseudoEntries {
  readonly entries: Map<string, TranslationEntry>;
  readonly copied: readonly string[];
}

function pseudolocalizeEntries(
  source: ReadonlyMap<string, TranslationEntry>,
  adapter: FormatAdapter,
): PseudoEntries {
  const entries = new Map<string, TranslationEntry>();
  const copied: string[] = [];
  for (const [key, entry] of source) {
    const candidate = pseudolocalizeValue(entry.value);
    const accepted = gateCandidateValue(entry, candidate, adapter).accepted;
    if (!accepted) {
      copied.push(key);
    }
    entries.set(key, { ...entry, value: accepted ? candidate : entry.value });
  }
  return { entries, copied };
}

async function seedSharedCatalogue(
  config: VerbatraConfig,
  sourcePath: string,
  outputPath: string,
  fs: SdkFs,
): Promise<void> {
  if (!isSharedCatalogueFormat(config.format) || (await fs.fileExists(outputPath))) {
    return;
  }
  const read = await fs.readFileBounded(sourcePath, MAX_CATALOGUE_BYTES);
  if (read.kind !== "ok") {
    throw new SdkError(
      "SOURCE_INVALID",
      `The catalogue at ${sourcePath} could not be copied to ${outputPath} to seed the pseudolocale.`,
    );
  }
  await fs.mkdir?.(dirname(outputPath));
  await fs.writeFile(outputPath, read.content);
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
 * pseudolocale is refused when it names a configured locale or resolves onto a configured locale
 * file. Because it lives outside `files.pattern`, {@link translate} never spends on it and
 * {@link check} and {@link diff} never report it as drifted.
 *
 * The transform is deterministic, so a second run over unchanged source rewrites nothing and
 * reports {@link PseudolocalizeResult.written} as false.
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
 * @throws {@link SdkError} `PSEUDO_OUTPUT_CONFLICT`: the pseudolocale names a configured locale, or
 * the output directory would place it on top of a configured locale file.
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or the pseudolocale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the source locale file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: the source locale file could not be parsed, or a
 * shared-catalogue source could not be copied to seed the output catalogue.
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
  const outputRoot = resolve(cwd, input.out ?? DEFAULT_PSEUDO_DIRECTORY);
  const outputPath = createLocalePathResolver(outputRoot, {
    ...config,
    targetLocales: [locale],
  }).pathFor(locale);
  assertOutputIsNotALocaleFile(config, resolver, outputPath);

  const source = await readSourceResource(config, resolver, fs, adapter);
  await seedSharedCatalogue(config, resolver.pathFor(config.sourceLocale), outputPath, fs);
  const { entries, copied } = pseudolocalizeEntries(source.resource.entries, adapter);
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
  const resource: LocaleResource = {
    locale,
    namespace: source.resource.namespace,
    format: config.format,
    entries,
  };
  await writeTargetResource(adapter, resource, outputPath, cwd);
  return { ...summary, written: true };
}
