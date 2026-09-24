import {
  CACHE_FILE_NAME,
  cacheFilePath,
  memoryLocalesWithState,
  readTranslationMemory,
  withMemoryLocalesMoved,
  writeTranslationMemory,
} from "../cache/translation-memory.js";
import type { SdkFs } from "../fs.js";
import { withLockFileGuard } from "../lock/locale-write-lock.js";
import {
  LOCK_FILE_NAME,
  lockFilePath,
  lockLocalesWithState,
  readLockFile,
  withLockLocalesMoved,
  writeLockFile,
} from "../lock/lock-file.js";
import {
  PROVENANCE_FILE_NAME,
  provenanceFilePath,
  provenanceLocalesWithState,
  readProvenanceFile,
  serializeProvenanceFile,
  withProvenanceLocalesMoved,
} from "../lock/provenance-file.js";
import type { LocaleSummary, SdkNotice } from "./summary.js";

export type LocaleStateFile =
  | typeof LOCK_FILE_NAME
  | typeof CACHE_FILE_NAME
  | typeof PROVENANCE_FILE_NAME;

export type LocaleMoves = ReadonlyMap<string, string>;

const NO_MOVES: LocaleMoves = new Map();

function posixSpelling(locale: string): string {
  return locale.replaceAll("-", "_").toLowerCase();
}

export function respellingsOf(locale: string, stateLocales: Iterable<string>): readonly string[] {
  const wanted = posixSpelling(locale);
  return [...stateLocales].filter(
    (candidate) =>
      candidate !== locale && candidate.includes("_") && candidate.toLowerCase() === wanted,
  );
}

export function planLocaleMoves(
  targetLocales: readonly string[],
  stateLocales: ReadonlySet<string>,
): LocaleMoves {
  const moves = new Map<string, string>();
  for (const target of targetLocales) {
    const [only, ...others] = stateLocales.has(target) ? [] : respellingsOf(target, stateLocales);
    if (only !== undefined && others.length === 0) {
      moves.set(only, target);
    }
  }
  return moves;
}

export interface LocaleCarryOver {
  readonly from: string;
  readonly to: string;
  readonly files: readonly LocaleStateFile[];
}

export interface LocaleCarryOverPlan {
  readonly lock: LocaleMoves;
  readonly memory: LocaleMoves;
  readonly carried: readonly LocaleCarryOver[];
}

function collectCarried(
  byFile: ReadonlyArray<readonly [LocaleStateFile, LocaleMoves]>,
): LocaleCarryOver[] {
  const carried = new Map<string, { from: string; to: string; files: LocaleStateFile[] }>();
  for (const [file, moves] of byFile) {
    for (const [from, to] of moves) {
      const entry = carried.get(from) ?? { from, to, files: [] };
      entry.files.push(file);
      carried.set(from, entry);
    }
  }
  return [...carried.values()];
}

async function carryLockAndProvenance(
  cwd: string,
  fs: SdkFs,
  targetLocales: readonly string[],
): Promise<readonly [LocaleMoves, LocaleMoves]> {
  return withLockFileGuard(cwd, fs, async () => {
    const lockPath = lockFilePath(cwd);
    const lock = await readLockFile(lockPath, fs);
    const provenancePath = provenanceFilePath(cwd);
    const provenance = await readProvenanceFile(provenancePath, fs);
    const provenanceMoves = provenance.writable
      ? planLocaleMoves(targetLocales, provenanceLocalesWithState(provenance.file))
      : NO_MOVES;
    if (provenanceMoves.size > 0) {
      await fs.writeFile(
        provenancePath,
        serializeProvenanceFile(withProvenanceLocalesMoved(provenance.file, provenanceMoves)),
      );
    }
    const lockMoves = planLocaleMoves(targetLocales, lockLocalesWithState(lock));
    if (lockMoves.size > 0) {
      await writeLockFile(lockPath, withLockLocalesMoved(lock, lockMoves), fs);
    }
    return [lockMoves, provenanceMoves] as const;
  });
}

async function planLockOnly(
  cwd: string,
  fs: SdkFs,
  targetLocales: readonly string[],
): Promise<readonly [LocaleMoves, LocaleMoves]> {
  const lock = await readLockFile(lockFilePath(cwd), fs);
  return [planLocaleMoves(targetLocales, lockLocalesWithState(lock)), NO_MOVES] as const;
}

async function carryMemory(
  cwd: string,
  fs: SdkFs,
  targetLocales: readonly string[],
  write: boolean,
): Promise<LocaleMoves> {
  try {
    const path = cacheFilePath(cwd);
    const { memory, writable } = await readTranslationMemory(path, fs);
    const moves = writable
      ? planLocaleMoves(targetLocales, memoryLocalesWithState(memory))
      : NO_MOVES;
    if (write && moves.size > 0) {
      await writeTranslationMemory(path, withMemoryLocalesMoved(memory, moves), fs);
    }
    return moves;
  } catch {
    return NO_MOVES;
  }
}

export interface LocaleCarryOverOptions {
  readonly dryRun: boolean;
  readonly memory: boolean;
}

export async function carryOverRespelledLocales(
  cwd: string,
  fs: SdkFs,
  targetLocales: readonly string[],
  options: LocaleCarryOverOptions,
): Promise<LocaleCarryOverPlan> {
  const [lock, provenance] = options.dryRun
    ? await planLockOnly(cwd, fs, targetLocales)
    : await carryLockAndProvenance(cwd, fs, targetLocales);
  const memory = options.memory
    ? await carryMemory(cwd, fs, targetLocales, !options.dryRun)
    : NO_MOVES;
  return {
    lock,
    memory,
    carried: collectCarried([
      [LOCK_FILE_NAME, lock],
      [CACHE_FILE_NAME, memory],
      [PROVENANCE_FILE_NAME, provenance],
    ]),
  };
}

function carryOverNotice(carry: LocaleCarryOver, dryRun: boolean): SdkNotice {
  const moved = dryRun
    ? `would be moved to "${carry.to}" on a live run`
    : `was moved to "${carry.to}"`;
  return {
    code: "LOCALE_STATE_CARRIED_OVER",
    message:
      `The state recorded under "${carry.from}" in ${carry.files.join(", ")} ${moved}, the ` +
      "configured spelling of the same locale, so its lock-file baseline and cached translations " +
      "apply to it again.",
  };
}

export function withCarryOverNotices(
  summaries: readonly LocaleSummary[],
  carried: readonly LocaleCarryOver[],
  dryRun: boolean,
): LocaleSummary[] {
  return summaries.map((summary) => {
    const notices = carried
      .filter((carry) => carry.to === summary.locale)
      .map((carry) => carryOverNotice(carry, dryRun));
    return notices.length === 0
      ? summary
      : { ...summary, notices: [...summary.notices, ...notices] };
  });
}
