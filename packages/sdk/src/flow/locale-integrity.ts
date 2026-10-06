import type { LocaleResource } from "@verbatra/core";
import type { FormatAdapter } from "@verbatra/format-adapters";
import { projectCwd } from "../config/project-root.js";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { selectAdapter } from "../selection/select-adapter.js";
import {
  checkEntryIntegrity,
  hasIntegrityProblem,
  type KeyIntegrityDeps,
  type KeyIntegrityEntry,
  type LocaleKeyIntegrity,
} from "./key-integrity.js";
import { readTargetResource } from "./read-target.js";
import { selectLocales } from "./select-locales.js";
import { readSourceResource } from "./source.js";

/** Input for {@link localeIntegrity}. */
export interface LocaleIntegrityInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against. Defaults to the project root of a config that {@link loadConfig} returned, else the process working directory. */
  readonly cwd?: string;
  /** Restrict the report to these target locales. Defaults to every configured target locale. */
  readonly locales?: readonly string[];
}

/** Injectable dependencies for {@link localeIntegrity}, the same seams {@link keyIntegrity} takes. */
export type LocaleIntegrityDeps = KeyIntegrityDeps;

function failingEntries(
  locale: string,
  source: LocaleResource,
  target: LocaleResource,
  adapter: FormatAdapter,
): readonly KeyIntegrityEntry[] {
  const failing: KeyIntegrityEntry[] = [];
  for (const [key, targetEntry] of target.entries) {
    const sourceEntry = source.entries.get(key);
    if (sourceEntry === undefined) {
      continue;
    }
    const verdict = checkEntryIntegrity(adapter, locale, sourceEntry, targetEntry);
    if (hasIntegrityProblem(verdict)) {
      failing.push(verdict);
    }
  }
  return failing;
}

/**
 * Finds every translation in the target locales that is broken right now: one that lost or gained
 * a placeholder, dropped or added inline markup, no longer parses as ICU MessageFormat, or carries
 * ICU plural, ordinal, or select arms that do not fit the target language. It writes nothing and
 * calls no provider.
 *
 * Unlike {@link keyIntegrity}, which judges only the keys a source edit changed, this judges every
 * key present in both the source and a target locale, whatever its sync state, so a defect in a
 * translation nobody touched since it was written is still found. Each key is judged by exactly the
 * rules {@link keyIntegrity} and the write-time integrity gate apply, and only failing keys are
 * returned, so an empty `entries` list means every translated key of that locale passed.
 *
 * The cost is one read and parse of the source file and of each requested target file, plus one
 * placeholder, markup, and ICU check per translated key, all bounded by the locale-file read limits.
 * Nothing is cached: every call reads fresh from disk.
 *
 * Note that a malformed target locale file surfaces the adapter's own error and code rather than a
 * wrapped {@link SdkError}, because only source reads are wrapped.
 *
 * @param input - The config and the optional locale filter.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns One entry per requested locale, each holding only its failing keys' verdicts.
 *
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or a configured locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the source locale file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: the source locale file could not be parsed.
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: a requested locale is not a configured target locale.
 */
export async function localeIntegrity(
  input: LocaleIntegrityInput,
  deps: LocaleIntegrityDeps = {},
): Promise<readonly LocaleKeyIntegrity[]> {
  const config = input.config;
  const fs = deps.fs ?? defaultFs;
  const adapter = selectAdapter(config.format, deps.adapterRegistry, deps.fs);
  const resolver = createLocalePathResolver(projectCwd(input), config);
  const source = await readSourceResource(config, resolver, fs, adapter);

  return Promise.all(
    selectLocales(config, input.locales).map(async (locale) => {
      const target = await readTargetResource({
        resolver,
        format: config.format,
        locale,
        adapter,
        fs,
      });
      return { locale, entries: failingEntries(locale, source.resource, target, adapter) };
    }),
  );
}
