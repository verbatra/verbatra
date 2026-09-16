import { resolve } from "node:path";
import { z } from "zod";
import type { BoundedFileRead, SdkFs } from "../fs.js";
import { sortRecordKeys } from "../record-utils.js";
import type { CacheAddition, TranslationMemory } from "./types.js";

/**
 * The file name of the project's translation memory, resolved against the run's working directory.
 * Commit it to reuse translations across machines and CI runs, or add it to `.gitignore` to treat
 * the cache as purely local. Deleting it is always safe: the next run simply repays for the strings
 * it would have reused.
 */
export const CACHE_FILE_NAME = "verbatra.cache.json";

export const CURRENT_CACHE_VERSION = 2;

const EMPTY_MEMORY: TranslationMemory = {
  version: CURRENT_CACHE_VERSION,
  entries: {},
  sources: {},
};

const MAX_CACHE_FILE_BYTES = 64 * 1024 * 1024;

const translationMemorySchema = z.object({
  version: z.number().int().positive(),
  entries: z.record(z.string(), z.record(z.string(), z.record(z.string(), z.string()))),
  sources: z.record(z.string(), z.string()).optional(),
});

export function cacheFilePath(cwd: string): string {
  return resolve(cwd, CACHE_FILE_NAME);
}

export interface TranslationMemoryRead {
  readonly memory: TranslationMemory;
  readonly writable: boolean;
}

const UNUSABLE: TranslationMemoryRead = { memory: EMPTY_MEMORY, writable: true };

export async function readTranslationMemory(
  path: string,
  fs: SdkFs,
): Promise<TranslationMemoryRead> {
  let read: BoundedFileRead;
  try {
    read = await fs.readFileBounded(path, MAX_CACHE_FILE_BYTES);
  } catch {
    return UNUSABLE;
  }
  if (read.kind !== "ok") {
    return UNUSABLE;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.content);
  } catch {
    return UNUSABLE;
  }
  const result = translationMemorySchema.safeParse(parsed);
  if (!result.success) {
    return UNUSABLE;
  }
  if (result.data.version > CURRENT_CACHE_VERSION) {
    return { memory: EMPTY_MEMORY, writable: false };
  }
  return {
    memory: {
      version: CURRENT_CACHE_VERSION,
      entries: result.data.entries,
      sources: result.data.sources ?? {},
    },
    writable: true,
  };
}

export function lookupMemory(
  memory: TranslationMemory,
  fingerprint: string,
  locale: string,
  contentHash: string,
): string | undefined {
  return memory.entries[fingerprint]?.[locale]?.[contentHash];
}

export function lookupSource(memory: TranslationMemory, contentHash: string): string | undefined {
  return memory.sources[contentHash];
}

type LocaleAdditions = ReadonlyMap<string, Readonly<Record<string, CacheAddition>>>;

export function applyAdditions(
  base: TranslationMemory,
  fingerprint: string,
  additionsByLocale: LocaleAdditions,
): TranslationMemory {
  if (additionsByLocale.size === 0) {
    return base;
  }
  const fingerprintEntries: Record<string, Record<string, string>> = {};
  for (const [locale, hashes] of Object.entries(base.entries[fingerprint] ?? {})) {
    fingerprintEntries[locale] = { ...hashes };
  }
  const sources: Record<string, string> = { ...base.sources };
  for (const [locale, additions] of additionsByLocale) {
    const values: Record<string, string> = { ...fingerprintEntries[locale] };
    for (const addition of Object.values(additions)) {
      values[addition.contentHash] = addition.value;
      sources[addition.contentHash] = addition.source;
    }
    fingerprintEntries[locale] = values;
  }
  return {
    version: CURRENT_CACHE_VERSION,
    entries: { ...base.entries, [fingerprint]: fingerprintEntries },
    sources,
  };
}

export function additionsToRecord(
  additions: readonly CacheAddition[],
): Record<string, CacheAddition> {
  const record: Record<string, CacheAddition> = {};
  for (const addition of additions) {
    record[addition.contentHash] = addition;
  }
  return record;
}

function serialize(memory: TranslationMemory): string {
  const entries: Record<string, Record<string, Record<string, string>>> = {};
  for (const [fingerprint, locales] of Object.entries(sortRecordKeys(memory.entries))) {
    const localeMap: Record<string, Record<string, string>> = {};
    for (const [locale, hashes] of Object.entries(sortRecordKeys(locales))) {
      localeMap[locale] = sortRecordKeys(hashes);
    }
    entries[fingerprint] = localeMap;
  }
  const document = {
    version: CURRENT_CACHE_VERSION,
    entries,
    sources: sortRecordKeys(memory.sources),
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

export async function writeTranslationMemory(
  path: string,
  memory: TranslationMemory,
  fs: SdkFs,
): Promise<void> {
  await fs.writeFile(path, serialize(memory));
}

export async function feedTranslationMemory(
  cwd: string,
  fs: SdkFs,
  fingerprint: string,
  additionsByLocale: LocaleAdditions,
): Promise<void> {
  if (additionsByLocale.size === 0) {
    return;
  }
  try {
    const path = cacheFilePath(cwd);
    const { memory, writable } = await readTranslationMemory(path, fs);
    if (!writable) {
      return;
    }
    await writeTranslationMemory(path, applyAdditions(memory, fingerprint, additionsByLocale), fs);
  } catch {}
}
