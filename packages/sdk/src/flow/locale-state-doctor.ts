import {
  CACHE_FILE_NAME,
  cacheFilePath,
  memoryLocalesWithState,
  readTranslationMemory,
} from "../cache/translation-memory.js";
import type { VerbatraConfig } from "../config/schema.js";
import { errorMessage } from "../errors.js";
import type { SdkFs } from "../fs.js";
import {
  LOCK_FILE_NAME,
  lockFilePath,
  lockLocalesWithState,
  readLockFile,
} from "../lock/lock-file.js";
import {
  PROVENANCE_FILE_NAME,
  provenanceFilePath,
  provenanceLocalesWithState,
  readProvenanceFile,
} from "../lock/provenance-file.js";
import { type LocaleStateFile, planLocaleMoves, respellingsOf } from "./locale-carry-over.js";

async function stateLocalesByFile(
  cwd: string,
  fs: SdkFs,
): Promise<ReadonlyArray<readonly [LocaleStateFile, ReadonlySet<string>]>> {
  const lock = await readLockFile(lockFilePath(cwd), fs);
  const memory = await readTranslationMemory(cacheFilePath(cwd), fs);
  const provenance = await readProvenanceFile(provenanceFilePath(cwd), fs);
  return [
    [LOCK_FILE_NAME, lockLocalesWithState(lock)],
    [CACHE_FILE_NAME, memoryLocalesWithState(memory.memory)],
    [PROVENANCE_FILE_NAME, provenanceLocalesWithState(provenance.file)],
  ];
}

function describeOrphan(
  orphan: string,
  targetLocales: readonly string[],
  stateLocales: ReadonlySet<string>,
): string {
  const carriedTo = planLocaleMoves(targetLocales, stateLocales).get(orphan);
  if (carriedTo !== undefined) {
    return `"${orphan}" (carried over to "${carriedTo}" by the next translate run)`;
  }
  const respelled = targetLocales.find((target) => respellingsOf(target, [orphan]).length > 0);
  if (respelled === undefined) {
    return `"${orphan}" (not a configured locale)`;
  }
  return stateLocales.has(respelled)
    ? `"${orphan}" (a spelling of "${respelled}", which already has its own state)`
    : `"${orphan}" (one of several spellings of "${respelled}", so none is carried over)`;
}

function describeFile(
  file: LocaleStateFile,
  stateLocales: ReadonlySet<string>,
  config: VerbatraConfig,
): string | undefined {
  const configured = new Set([config.sourceLocale, ...config.targetLocales]);
  const orphans = [...stateLocales].filter((locale) => !configured.has(locale)).sort();
  if (orphans.length === 0) {
    return undefined;
  }
  const described = orphans.map((orphan) =>
    describeOrphan(orphan, config.targetLocales, stateLocales),
  );
  return `${file}: ${described.join(", ")}.`;
}

const ALL_CONFIGURED =
  `Every locale with state in ${LOCK_FILE_NAME}, ${CACHE_FILE_NAME}, and ${PROVENANCE_FILE_NAME} ` +
  "is configured.";

const REMEDY =
  "Remove the state of a locale you no longer translate, or respell the configured locale to " +
  "match it.";

export async function describeLocaleState(
  config: VerbatraConfig,
  cwd: string,
  fs: SdkFs,
): Promise<string> {
  let byFile: Awaited<ReturnType<typeof stateLocalesByFile>>;
  try {
    byFile = await stateLocalesByFile(cwd, fs);
  } catch (error) {
    return `The locale state could not be read: ${errorMessage(error)}`;
  }
  const lines = byFile
    .map(([file, locales]) => describeFile(file, locales, config))
    .filter((line): line is string => line !== undefined);
  return lines.length === 0
    ? ALL_CONFIGURED
    : `State recorded for locales that are not configured. ${lines.join(" ")} ${REMEDY}`;
}
