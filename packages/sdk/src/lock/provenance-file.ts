import { Buffer } from "node:buffer";
import { resolve } from "node:path";
import { type LocaleResource, normalizeText, stableStringHash } from "@verbatra/core";
import { SdkError } from "../errors.js";
import type { BoundedFileRead, SdkFs } from "../fs.js";
import { ownValue, sortRecordKeys } from "../record-utils.js";

/**
 * The file name of the project's provenance record, resolved against the run's working directory.
 * Commit it alongside the lock file and the locale files. See {@link ProvenanceFile} for its
 * contents.
 */
export const PROVENANCE_FILE_NAME = "verbatra.provenance.json";

/**
 * The write path that produced a target value, as stored in {@link PROVENANCE_FILE_NAME}.
 *
 * - `machine`: a provider response, from a translate or watch run, a single-key retranslate, or
 *   plural-form generation.
 * - `memory`: an exact translation-memory hit, including every value a human-only run (provider
 *   `none`) fills.
 * - `fuzzy`: a fuzzy translation-memory hit, a value reused from a similar source string.
 * - `agent`: a value an AI agent wrote through {@link editEntry}.
 * - `human`: a value a person wrote through {@link editEntry}.
 * - `import`: a value read from a translator handoff by {@link importWorkbook}.
 * - `unknown`: recorded without a known author, for a value that had no record before.
 */
export type ProvenanceOrigin =
  | "machine"
  | "memory"
  | "fuzzy"
  | "agent"
  | "human"
  | "import"
  | "unknown";

/** A review decision stored on a {@link ProvenanceRecord}. No decision means unreviewed. */
export type ProvenanceReviewState = "approved" | "rejected";

/**
 * One key's record in one locale. The string-typed fields hold whatever the file says: a file
 * written by a newer verbatra may carry an origin or review state this release does not know, and
 * {@link KeyProvenance} is the interpreted view.
 */
export interface ProvenanceRecord {
  /** The write path that produced the value. Normally a {@link ProvenanceOrigin}. */
  readonly origin: string;
  /** The configured provider id, for a `machine` value. */
  readonly provider?: string;
  /** The configured model, for a `machine` value from a provider that has one. */
  readonly model?: string;
  /** A hash of the target value the record describes, used to detect a later outside edit. */
  readonly valueHash: string;
  /** The review decision on this value, normally a {@link ProvenanceReviewState}. */
  readonly reviewState?: string;
  /** Free text naming the reviewer, present only when one was supplied. */
  readonly reviewer?: string;
  /**
   * The lock-file source hash an approval was given against. An approval whose hash no longer
   * matches the key's lock entry reads as unreviewed.
   */
  readonly reviewedSourceHash?: string;
}

/**
 * The contents of `verbatra.provenance.json` (see {@link PROVENANCE_FILE_NAME}): for each locale,
 * which write path produced each key's current value and whether anyone reviewed it. It holds no
 * translated text. Every object in it has no prototype, so a key such as `__proto__` is an own
 * property.
 */
export interface ProvenanceFile {
  /** The provenance file's schema version. */
  readonly version: number;
  /** Per locale, the record for each key. */
  readonly locales: Readonly<Record<string, Readonly<Record<string, ProvenanceRecord>>>>;
}

export interface ProvenanceRead {
  readonly file: ProvenanceFile;
  readonly writable: boolean;
}

export interface ProvenancePatch {
  readonly records: ReadonlyMap<string, ProvenanceRecord>;
  readonly retain?: ReadonlySet<string>;
  readonly replace?: ReadonlySet<string>;
}

const CURRENT_PROVENANCE_VERSION = 1;

export const MAX_PROVENANCE_FILE_BYTES = 32 * 1024 * 1024;

const RECORD_FIELD_ORDER = [
  "origin",
  "provider",
  "model",
  "valueHash",
  "reviewState",
  "reviewer",
  "reviewedSourceHash",
] as const;

const OPTIONAL_STRING_FIELDS = [
  "provider",
  "model",
  "reviewState",
  "reviewer",
  "reviewedSourceHash",
] as const;

export function emptyProvenance(): ProvenanceFile {
  return { version: CURRENT_PROVENANCE_VERSION, locales: Object.create(null) };
}

export function provenanceFilePath(cwd: string): string {
  return resolve(cwd, PROVENANCE_FILE_NAME);
}

export function valueHash(value: string): string {
  return stableStringHash(normalizeText(value));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecord(value: unknown): value is ProvenanceRecord {
  if (!isPlainObject(value)) {
    return false;
  }
  if (typeof value.origin !== "string" || typeof value.valueHash !== "string") {
    return false;
  }
  return OPTIONAL_STRING_FIELDS.every(
    (field) => value[field] === undefined || typeof value[field] === "string",
  );
}

function nullPrototypeCopy<T>(
  source: Record<string, unknown>,
  accept: (value: unknown) => T,
): Record<string, T> {
  const copy: Record<string, T> = Object.create(null);
  for (const [key, value] of Object.entries(source)) {
    Object.defineProperty(copy, key, {
      value: accept(value),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return copy;
}

function invalid(path: string, detail: string): SdkError {
  return new SdkError("PROVENANCE_FILE_INVALID", `The provenance file at ${path} ${detail}.`);
}

function parseLocales(
  locales: Record<string, unknown>,
  path: string,
): Record<string, Record<string, ProvenanceRecord>> {
  return nullPrototypeCopy(locales, (entries) => {
    if (!isPlainObject(entries)) {
      throw invalid(path, "has an unexpected shape");
    }
    return nullPrototypeCopy(entries, (record) => {
      if (!isRecord(record)) {
        throw invalid(path, "has an unexpected shape");
      }
      return { ...record };
    });
  });
}

function parseProvenanceRead(read: BoundedFileRead, path: string): ProvenanceRead {
  if (read.kind === "missing") {
    return { file: emptyProvenance(), writable: true };
  }
  if (read.kind === "too-large") {
    throw invalid(path, `exceeds the maximum allowed size of ${MAX_PROVENANCE_FILE_BYTES} bytes`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.content);
  } catch {
    throw invalid(path, "is not valid JSON");
  }
  if (
    !isPlainObject(parsed) ||
    typeof parsed.version !== "number" ||
    !Number.isInteger(parsed.version) ||
    parsed.version < 1 ||
    !isPlainObject(parsed.locales)
  ) {
    throw invalid(path, "has an unexpected shape");
  }
  if (parsed.version > CURRENT_PROVENANCE_VERSION) {
    return { file: emptyProvenance(), writable: false };
  }
  return {
    file: { version: CURRENT_PROVENANCE_VERSION, locales: parseLocales(parsed.locales, path) },
    writable: true,
  };
}

export async function readProvenanceFile(path: string, fs: SdkFs): Promise<ProvenanceRead> {
  return parseProvenanceRead(await fs.readFileBounded(path, MAX_PROVENANCE_FILE_BYTES), path);
}

function sortedEntries<T>(record: Readonly<Record<string, T>>): [string, T][] {
  return Object.entries(sortRecordKeys(record));
}

function serializeRecord(record: ProvenanceRecord): string {
  const known = new Set<string>(RECORD_FIELD_ORDER);
  const fields: [string, unknown][] = [];
  const raw = record as unknown as Record<string, unknown>;
  for (const field of RECORD_FIELD_ORDER) {
    if (raw[field] !== undefined) {
      fields.push([field, raw[field]]);
    }
  }
  for (const [field, value] of sortedEntries(raw)) {
    if (!known.has(field) && value !== undefined) {
      fields.push([field, value]);
    }
  }
  return `{${fields.map(([field, value]) => `${JSON.stringify(field)}:${JSON.stringify(value)}`).join(",")}}`;
}

export function serializeProvenanceFile(file: ProvenanceFile): string {
  const locales = sortedEntries(file.locales).filter(
    ([, entries]) => Object.keys(entries).length > 0,
  );
  if (locales.length === 0) {
    return `{\n  "version": ${file.version},\n  "locales": {}\n}\n`;
  }
  const blocks = locales.map(([locale, entries]) => {
    const lines = sortedEntries(entries).map(
      ([key, record]) => `      ${JSON.stringify(key)}: ${serializeRecord(record)}`,
    );
    return `    ${JSON.stringify(locale)}: {\n${lines.join(",\n")}\n    }`;
  });
  return `{\n  "version": ${file.version},\n  "locales": {\n${blocks.join(",\n")}\n  }\n}\n`;
}

function keepsPrior(
  prior: ProvenanceRecord | undefined,
  next: ProvenanceRecord,
  sourceUnchanged: boolean,
): prior is ProvenanceRecord {
  return prior !== undefined && sourceUnchanged && prior.valueHash === next.valueHash;
}

export function applyProvenancePatch(
  current: Readonly<Record<string, ProvenanceRecord>> | undefined,
  patch: ProvenancePatch,
  sourceUnchanged: (key: string) => boolean,
): Record<string, ProvenanceRecord> {
  const next = new Map<string, ProvenanceRecord>();
  for (const [key, record] of Object.entries(current ?? {})) {
    if (patch.retain === undefined || patch.retain.has(key) || record.reviewState === "rejected") {
      next.set(key, record);
    }
  }
  for (const [key, record] of patch.records) {
    const prior = ownValue(current, key);
    const replaced = patch.replace?.has(key) === true;
    next.set(key, !replaced && keepsPrior(prior, record, sourceUnchanged(key)) ? prior : record);
  }
  return nullPrototypeCopy(Object.fromEntries(next), (record) => record as ProvenanceRecord);
}

export function withLocaleRecords(
  file: ProvenanceFile,
  locale: string,
  entries: Record<string, ProvenanceRecord>,
): ProvenanceFile {
  const locales: Record<string, Readonly<Record<string, ProvenanceRecord>>> = nullPrototypeCopy(
    file.locales,
    (value) => value as Readonly<Record<string, ProvenanceRecord>>,
  );
  Object.defineProperty(locales, locale, {
    value: entries,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  return { version: file.version, locales };
}

export function localeRecords(
  file: ProvenanceFile,
  locale: string,
): ReadonlyMap<string, ProvenanceRecord> {
  return new Map(Object.entries(ownValue(file.locales, locale) ?? {}));
}

export type ProvenanceWriteOutcome = "written" | "unchanged" | "newer-version" | "too-large";

function withRecord(
  file: ProvenanceFile,
  locale: string,
  key: string,
  record: ProvenanceRecord,
): ProvenanceFile {
  const entries = nullPrototypeCopy(
    { ...ownValue(file.locales, locale) },
    (value) => value as ProvenanceRecord,
  );
  Object.defineProperty(entries, key, {
    value: record,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  return withLocaleRecords(file, locale, entries);
}

export type ProvenanceRecordPlan =
  | {
      readonly kind: "write";
      readonly path: string;
      readonly content: string;
      readonly record: ProvenanceRecord;
    }
  | { readonly kind: "unchanged"; readonly record: ProvenanceRecord }
  | { readonly kind: "newer-version" }
  | { readonly kind: "too-large" };

export async function planProvenanceRecord(
  cwd: string,
  fs: SdkFs,
  locale: string,
  key: string,
  build: (prior: ProvenanceRecord | undefined) => ProvenanceRecord,
  maxBytes: number = MAX_PROVENANCE_FILE_BYTES,
): Promise<ProvenanceRecordPlan> {
  const path = provenanceFilePath(cwd);
  const { file, writable } = await readProvenanceFile(path, fs);
  if (!writable) {
    return { kind: "newer-version" };
  }
  const record = build(ownValue(ownValue(file.locales, locale), key));
  const content = serializeProvenanceFile(withRecord(file, locale, key, record));
  if (content === serializeProvenanceFile(file)) {
    return { kind: "unchanged", record };
  }
  if (Buffer.byteLength(content, "utf8") > maxBytes) {
    return { kind: "too-large" };
  }
  return { kind: "write", path, content, record };
}

export async function writeProvenanceLocale(
  cwd: string,
  fs: SdkFs,
  locale: string,
  patch: ProvenancePatch,
  sourceUnchanged: (key: string) => boolean,
  maxBytes: number = MAX_PROVENANCE_FILE_BYTES,
): Promise<ProvenanceWriteOutcome> {
  const path = provenanceFilePath(cwd);
  const { file, writable } = await readProvenanceFile(path, fs);
  if (!writable) {
    return "newer-version";
  }
  const next = withLocaleRecords(
    file,
    locale,
    applyProvenancePatch(ownValue(file.locales, locale), patch, sourceUnchanged),
  );
  const serialized = serializeProvenanceFile(next);
  if (serialized === serializeProvenanceFile(file)) {
    return "unchanged";
  }
  if (Buffer.byteLength(serialized, "utf8") > maxBytes) {
    return "too-large";
  }
  await fs.writeFile(path, serialized);
  return "written";
}

export interface MachineAttribution {
  readonly provider: string;
  readonly model?: string;
}

function provenanceRecord(
  origin: ProvenanceOrigin,
  value: string,
  attribution?: MachineAttribution,
): ProvenanceRecord {
  return {
    origin,
    ...(attribution !== undefined ? attribution : {}),
    valueHash: valueHash(value),
  };
}

export interface PendingProvenance {
  readonly origin: ProvenanceOrigin;
  readonly value: string;
  readonly attribution?: MachineAttribution;
}

export function settleProvenance(
  pending: ReadonlyMap<string, PendingProvenance>,
  written: LocaleResource,
  retain?: ReadonlySet<string>,
): ProvenancePatch {
  const records = new Map<string, ProvenanceRecord>();
  for (const [key, { origin, value, attribution }] of pending) {
    records.set(
      key,
      provenanceRecord(origin, written.entries.get(key)?.value ?? value, attribution),
    );
  }
  return retain === undefined ? { records } : { records, retain };
}
