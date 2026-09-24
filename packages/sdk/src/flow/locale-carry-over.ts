import {
  CACHE_FILE_NAME,
  cacheFilePath,
  memoryLocalesWithState,
  readTranslationMemory,
  withMemoryLocalesMoved,
  writeTranslationMemory,
} from "../cache/translation-memory.js";
import { errorMessage, SdkError } from "../errors.js";
import type { SdkFs } from "../fs.js";
import type { LivenessContext } from "../lock/holder-liveness.js";
import {
  isLockHeld,
  type LocaleWriteLockOptions,
  lockFileGuardPath,
  withLockFileGuard,
} from "../lock/locale-write-lock.js";
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
  type ProvenanceRead,
  provenanceFilePath,
  provenanceLocalesWithState,
  readProvenanceFile,
  serializeProvenanceFile,
  withProvenanceLocalesMoved,
} from "../lock/provenance-file.js";
import type { LockFile } from "../lock/types.js";
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

export interface LocaleCarryOverSkip extends LocaleCarryOver {
  readonly reason: string;
}

export interface LocaleCarryOverPlan {
  readonly lock: LocaleMoves;
  readonly memory: LocaleMoves;
  readonly provenance: LocaleMoves;
  readonly carried: readonly LocaleCarryOver[];
  readonly skipped: readonly LocaleCarryOverSkip[];
}

interface FileCarry {
  readonly file: LocaleStateFile;
  readonly moved: LocaleMoves;
  readonly failed?: { readonly moves: LocaleMoves; readonly reason: string };
}

export function movedFrom(moves: LocaleMoves, locale: string): string {
  return [...moves].find(([, to]) => to === locale)?.[0] ?? locale;
}

function collectCarried(carries: readonly FileCarry[]): LocaleCarryOver[] {
  const carried = new Map<string, { from: string; to: string; files: LocaleStateFile[] }>();
  for (const { file, moved } of carries) {
    for (const [from, to] of moved) {
      const entry = carried.get(from) ?? { from, to, files: [] };
      entry.files.push(file);
      carried.set(from, entry);
    }
  }
  return [...carried.values()];
}

function collectSkipped(carries: readonly FileCarry[]): LocaleCarryOverSkip[] {
  const skipped = new Map<string, LocaleCarryOverSkip & { files: LocaleStateFile[] }>();
  for (const { file, failed } of carries) {
    if (failed === undefined) {
      continue;
    }
    for (const [from, to] of failed.moves) {
      const id = JSON.stringify([from, failed.reason]);
      const entry = skipped.get(id) ?? { from, to, files: [], reason: failed.reason };
      entry.files.push(file);
      skipped.set(id, entry);
    }
  }
  return [...skipped.values()];
}

function skippedCarry(file: LocaleStateFile, moves: LocaleMoves, error: unknown): FileCarry {
  return moves.size === 0
    ? { file, moved: NO_MOVES }
    : { file, moved: NO_MOVES, failed: { moves, reason: errorMessage(error) } };
}

async function attemptWrite(
  file: LocaleStateFile,
  moves: LocaleMoves,
  write: () => Promise<void>,
): Promise<FileCarry> {
  if (moves.size === 0) {
    return { file, moved: NO_MOVES };
  }
  try {
    await write();
    return { file, moved: moves };
  } catch (error) {
    return skippedCarry(file, moves, error);
  }
}

interface StateFiles {
  readonly lock: LockFile;
  readonly provenance: ProvenanceRead;
  readonly lockMoves: LocaleMoves;
  readonly provenanceMoves: LocaleMoves;
}

async function readStateFiles(
  cwd: string,
  fs: SdkFs,
  targetLocales: readonly string[],
): Promise<StateFiles> {
  const lock = await readLockFile(lockFilePath(cwd), fs);
  const provenance = await readProvenanceFile(provenanceFilePath(cwd), fs);
  return {
    lock,
    provenance,
    lockMoves: planLocaleMoves(targetLocales, lockLocalesWithState(lock)),
    provenanceMoves: provenance.writable
      ? planLocaleMoves(targetLocales, provenanceLocalesWithState(provenance.file))
      : NO_MOVES,
  };
}

async function writeStateFiles(
  cwd: string,
  fs: SdkFs,
  targetLocales: readonly string[],
): Promise<readonly [FileCarry, FileCarry]> {
  const current = await readStateFiles(cwd, fs, targetLocales);
  const provenance = await attemptWrite(PROVENANCE_FILE_NAME, current.provenanceMoves, () =>
    fs.writeFile(
      provenanceFilePath(cwd),
      serializeProvenanceFile(
        withProvenanceLocalesMoved(current.provenance.file, current.provenanceMoves),
      ),
    ),
  );
  const lock = await attemptWrite(LOCK_FILE_NAME, current.lockMoves, () =>
    writeLockFile(lockFilePath(cwd), withLockLocalesMoved(current.lock, current.lockMoves), fs),
  );
  return [lock, provenance];
}

function isStateFileInvalid(error: unknown): boolean {
  return (
    error instanceof SdkError &&
    (error.code === "LOCK_FILE_INVALID" || error.code === "PROVENANCE_FILE_INVALID")
  );
}

async function carryLockAndProvenance(
  cwd: string,
  fs: SdkFs,
  targetLocales: readonly string[],
  lockOptions: LocaleWriteLockOptions,
): Promise<readonly [FileCarry, FileCarry]> {
  const planned = await readStateFiles(cwd, fs, targetLocales);
  if (planned.lockMoves.size === 0 && planned.provenanceMoves.size === 0) {
    return [
      { file: LOCK_FILE_NAME, moved: NO_MOVES },
      { file: PROVENANCE_FILE_NAME, moved: NO_MOVES },
    ];
  }
  const outcome: { written?: readonly [FileCarry, FileCarry] } = {};
  try {
    return await withLockFileGuard(
      cwd,
      fs,
      async () => {
        outcome.written = await writeStateFiles(cwd, fs, targetLocales);
        return outcome.written;
      },
      lockOptions,
    );
  } catch (error) {
    if (isStateFileInvalid(error)) {
      throw error;
    }
    return (
      outcome.written ?? [
        skippedCarry(LOCK_FILE_NAME, planned.lockMoves, error),
        skippedCarry(PROVENANCE_FILE_NAME, planned.provenanceMoves, error),
      ]
    );
  }
}

async function planProvenanceLeniently(
  cwd: string,
  fs: SdkFs,
  targetLocales: readonly string[],
): Promise<LocaleMoves> {
  try {
    const { file, writable } = await readProvenanceFile(provenanceFilePath(cwd), fs);
    return writable ? planLocaleMoves(targetLocales, provenanceLocalesWithState(file)) : NO_MOVES;
  } catch (error) {
    if (error instanceof SdkError && error.code === "PROVENANCE_FILE_INVALID") {
      return NO_MOVES;
    }
    throw error;
  }
}

async function planLockAndProvenance(
  cwd: string,
  fs: SdkFs,
  targetLocales: readonly string[],
  liveness: LivenessContext | undefined,
): Promise<readonly [FileCarry, FileCarry]> {
  const lock = await readLockFile(lockFilePath(cwd), fs);
  const lockMoves = planLocaleMoves(targetLocales, lockLocalesWithState(lock));
  const provenanceMoves = await planProvenanceLeniently(cwd, fs, targetLocales);
  const guard = lockFileGuardPath(cwd);
  if (
    (lockMoves.size === 0 && provenanceMoves.size === 0) ||
    !(await isLockHeld(guard, fs, liveness))
  ) {
    return [
      { file: LOCK_FILE_NAME, moved: lockMoves },
      { file: PROVENANCE_FILE_NAME, moved: provenanceMoves },
    ];
  }
  const reason = `another process holds the lock-file guard at ${guard}`;
  return [
    skippedCarry(LOCK_FILE_NAME, lockMoves, reason),
    skippedCarry(PROVENANCE_FILE_NAME, provenanceMoves, reason),
  ];
}

function withheldTargets(carries: readonly FileCarry[]): ReadonlySet<string> {
  return new Set(carries.flatMap(({ failed }) => [...(failed?.moves.values() ?? [])]));
}

async function carryMemory(
  cwd: string,
  fs: SdkFs,
  targetLocales: readonly string[],
  write: boolean,
): Promise<FileCarry> {
  const path = cacheFilePath(cwd);
  const { memory, writable } = await readTranslationMemory(path, fs);
  const moves = writable
    ? planLocaleMoves(targetLocales, memoryLocalesWithState(memory))
    : NO_MOVES;
  if (!write) {
    return { file: CACHE_FILE_NAME, moved: moves };
  }
  return attemptWrite(CACHE_FILE_NAME, moves, () =>
    writeTranslationMemory(path, withMemoryLocalesMoved(memory, moves), fs),
  );
}

export interface LocaleCarryOverOptions {
  readonly dryRun: boolean;
  readonly memory: boolean;
  readonly lock?: LocaleWriteLockOptions;
}

export async function carryOverRespelledLocales(
  cwd: string,
  fs: SdkFs,
  targetLocales: readonly string[],
  options: LocaleCarryOverOptions,
): Promise<LocaleCarryOverPlan> {
  const [lock, provenance] = options.dryRun
    ? await planLockAndProvenance(cwd, fs, targetLocales, options.lock?.liveness)
    : await carryLockAndProvenance(cwd, fs, targetLocales, options.lock ?? {});
  const withheld = withheldTargets([lock, provenance]);
  const memory: FileCarry = options.memory
    ? await carryMemory(
        cwd,
        fs,
        targetLocales.filter((target) => !withheld.has(target)),
        !options.dryRun,
      )
    : { file: CACHE_FILE_NAME, moved: NO_MOVES };
  const carries = [lock, memory, provenance];
  return {
    lock: lock.moved,
    memory: memory.moved,
    provenance: provenance.moved,
    carried: collectCarried(carries),
    skipped: collectSkipped(carries),
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

function asSentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

function withholdsLocale(skip: LocaleCarryOverSkip): boolean {
  return skip.files.some((file) => file !== CACHE_FILE_NAME);
}

function skipOutcome(skip: LocaleCarryOverSkip, dryRun: boolean): string {
  if (!withholdsLocale(skip)) {
    return (
      "The translation memory is only a cache, so the locale ran without those cached " +
      "translations, and the locale-state check of doctor lists what stays behind."
    );
  }
  return dryRun
    ? "A live run would not run the locale while that holds."
    : "The locale did not run, and the next run tries the move again.";
}

function carryOverSkippedNotice(skip: LocaleCarryOverSkip, dryRun: boolean): SdkNotice {
  return {
    code: "LOCALE_STATE_CARRY_OVER_SKIPPED",
    message:
      `The state recorded under "${skip.from}" in ${skip.files.join(", ")} was not moved to ` +
      `"${skip.to}": ${asSentence(skip.reason)} ${skipOutcome(skip, dryRun)}`,
  };
}

export function carryOverRefusal(
  plan: Pick<LocaleCarryOverPlan, "skipped">,
  locale: string,
  dryRun: boolean,
): SdkError | undefined {
  const skip = plan.skipped.find((entry) => entry.to === locale && withholdsLocale(entry));
  if (skip === undefined) {
    return undefined;
  }
  const outcome = dryRun
    ? "A live run would not run it while that holds"
    : "It did not run, and the next run tries the move again";
  return new SdkError(
    "LOCALE_STATE_NOT_CARRIED_OVER",
    `The state recorded under "${skip.from}" in ${skip.files.join(", ")} could not be moved to ` +
      `"${locale}": ${asSentence(skip.reason)} ${outcome}, because recording its results under ` +
      `"${locale}" would leave the protection and rejection records under "${skip.from}" unapplied.`,
  );
}

export function withCarryOverNotices(
  summaries: readonly LocaleSummary[],
  plan: Pick<LocaleCarryOverPlan, "carried" | "skipped">,
  dryRun: boolean,
): LocaleSummary[] {
  return summaries.map((summary) => {
    const notices = [
      ...plan.carried
        .filter((carry) => carry.to === summary.locale)
        .map((carry) => carryOverNotice(carry, dryRun)),
      ...plan.skipped
        .filter((skip) => skip.to === summary.locale)
        .map((skip) => carryOverSkippedNotice(skip, dryRun)),
    ];
    return notices.length === 0
      ? summary
      : { ...summary, notices: [...summary.notices, ...notices] };
  });
}
