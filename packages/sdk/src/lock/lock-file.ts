import { resolve } from "node:path";
import { z } from "zod";
import { SdkError } from "../errors.js";
import type { BoundedFileRead, SdkFs } from "../fs.js";
import { ownValue, renameRecordKeys, sortRecordKeys } from "../record-utils.js";
import { withLockFileGuard } from "./locale-write-lock.js";
import {
  type ProvenancePatch,
  type ProvenanceWriteOutcome,
  writeProvenanceLocale,
} from "./provenance-file.js";
import type { LockEntries, LockFile } from "./types.js";

/**
 * The file name of the project's lock-file, resolved against the run's working directory. Commit it
 * alongside the locale files: it is the baseline that lets verbatra tell a stale translation from a
 * current one. See {@link LockFile} for its contents.
 */
export const LOCK_FILE_NAME = "verbatra.lock.json";

const CURRENT_VERSION = 1;
const EMPTY_LOCK: LockFile = { version: CURRENT_VERSION, locales: {} };

const MAX_LOCK_FILE_BYTES = 16 * 1024 * 1024;

function isLockEntries(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((hash) => typeof hash === "string");
}

const lockFileSchema = z.object({
  version: z.number().int().positive(),
  locales: z.record(z.string(), z.custom<LockEntries>(isLockEntries)),
});

export function lockFilePath(cwd: string): string {
  return resolve(cwd, LOCK_FILE_NAME);
}

function parseLockFileRead(read: BoundedFileRead, path: string): LockFile {
  if (read.kind === "missing") {
    return EMPTY_LOCK;
  }
  if (read.kind === "too-large") {
    throw new SdkError(
      "LOCK_FILE_INVALID",
      `The lock-file at ${path} exceeds the maximum allowed size of ${MAX_LOCK_FILE_BYTES} bytes.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.content);
  } catch {
    throw new SdkError("LOCK_FILE_INVALID", `The lock-file at ${path} is not valid JSON.`);
  }
  const result = lockFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new SdkError("LOCK_FILE_INVALID", `The lock-file at ${path} has an unexpected shape.`);
  }
  if (result.data.version !== CURRENT_VERSION) {
    throw new SdkError(
      "LOCK_FILE_INVALID",
      `The lock-file at ${path} has version ${result.data.version}, but this version of verbatra supports version ${CURRENT_VERSION}.`,
    );
  }
  return result.data;
}

export async function readLockFile(path: string, fs: SdkFs): Promise<LockFile> {
  return parseLockFileRead(await fs.readFileBounded(path, MAX_LOCK_FILE_BYTES), path);
}

export function lockLocalesWithState(lock: LockFile): ReadonlySet<string> {
  return new Set(
    Object.entries(lock.locales)
      .filter(([, entries]) => Object.keys(entries).length > 0)
      .map(([locale]) => locale),
  );
}

export function withLockLocalesMoved(lock: LockFile, moves: ReadonlyMap<string, string>): LockFile {
  return { version: lock.version, locales: renameRecordKeys(lock.locales, moves) };
}

export function baselineFor(lock: LockFile, locale: string): ReadonlyMap<string, string> {
  return new Map(Object.entries(lock.locales[locale] ?? {}));
}

function updateLockLocale(lock: LockFile, locale: string, entries: LockEntries): LockFile {
  return {
    version: lock.version,
    locales: { ...lock.locales, [locale]: entries },
  };
}

function serializeLockFile(lock: LockFile): string {
  const locales: Record<string, Record<string, string>> = {};
  for (const [locale, entries] of Object.entries(sortRecordKeys(lock.locales))) {
    locales[locale] = sortRecordKeys(entries);
  }
  const ordered = { version: lock.version, locales };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export async function writeLockFile(path: string, lock: LockFile, fs: SdkFs): Promise<void> {
  await fs.writeFile(path, serializeLockFile(lock));
}

export type LockLocalePatch =
  | { readonly mode: "replace"; readonly entries: LockEntries }
  | { readonly mode: "merge"; readonly entries: LockEntries }
  | { readonly mode: "remove"; readonly keys: readonly string[] };

function withoutKeys(entries: LockEntries | undefined, keys: readonly string[]): LockEntries {
  const removed = new Set(keys);
  return Object.fromEntries(Object.entries(entries ?? {}).filter(([key]) => !removed.has(key)));
}

function applyLockLocalePatch(
  currentEntries: LockEntries | undefined,
  patch: LockLocalePatch,
): LockEntries {
  if (patch.mode === "replace") {
    return patch.entries;
  }
  if (patch.mode === "remove") {
    return withoutKeys(currentEntries, patch.keys);
  }
  return { ...currentEntries, ...patch.entries };
}

export interface LockLocaleUpdate {
  readonly lock: LockFile;
  readonly provenance: ProvenanceWriteOutcome;
}

export interface LockLocaleUpdateOptions {
  readonly requireProvenance?: boolean;
}

function unrecordedProvenance(outcome: ProvenanceWriteOutcome): SdkError {
  return new SdkError(
    "PROVENANCE_FILE_UNWRITABLE",
    outcome === "newer-version"
      ? "verbatra.provenance.json was written by a newer verbatra, so the record could not be written."
      : "Recording this change would grow verbatra.provenance.json past the size verbatra reads back.",
  );
}

export async function updateLockFileLocaleUnguarded(
  cwd: string,
  fs: SdkFs,
  locale: string,
  patch: LockLocalePatch,
  provenance: ProvenancePatch,
  options: LockLocaleUpdateOptions = {},
): Promise<LockLocaleUpdate> {
  const path = lockFilePath(cwd);
  const lock = parseLockFileRead(await fs.readFileBounded(path, MAX_LOCK_FILE_BYTES), path);
  const priorEntries = ownValue(lock.locales, locale);
  const nextEntries = applyLockLocalePatch(priorEntries, patch);
  const outcome = await writeProvenanceLocale(
    cwd,
    fs,
    locale,
    provenance,
    (key) => ownValue(priorEntries, key) === ownValue(nextEntries, key),
  );
  if (
    options.requireProvenance === true &&
    (outcome === "newer-version" || outcome === "too-large")
  ) {
    throw unrecordedProvenance(outcome);
  }
  const next = updateLockLocale(lock, locale, nextEntries);
  await fs.writeFile(path, serializeLockFile(next));
  return { lock: next, provenance: outcome };
}

export async function updateLockFileLocale(
  cwd: string,
  fs: SdkFs,
  locale: string,
  patch: LockLocalePatch,
  provenance: ProvenancePatch,
): Promise<LockLocaleUpdate> {
  return withLockFileGuard(cwd, fs, () =>
    updateLockFileLocaleUnguarded(cwd, fs, locale, patch, provenance),
  );
}
