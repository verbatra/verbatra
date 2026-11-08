import { resolve } from "node:path";
import { z } from "zod";
import type { SdkFs } from "../fs.js";
import { maxLengthValueSchema } from "./max-length.js";

export const LIMITS_FILE_NAME = "verbatra.limits.json";

export const LIMITS_FILE_VERSION = 1;

export const MAX_LIMITS_FILE_BYTES = 1024 * 1024;

export const MAX_LIMITS_ENTRIES = 10_000;

export const MAX_LIMITS_KEY_LENGTH = 1024;

export function limitsFilePath(cwd: string): string {
  return resolve(cwd, LIMITS_FILE_NAME);
}

const BOM = "﻿";
const REPLACEMENT_CHARACTER = String.fromCodePoint(0xfffd);
const NUL = "\u0000";

export type LimitsUnusableReason =
  | "unreadable"
  | "too-large"
  | "not-utf8"
  | "not-json"
  | "unsupported-version"
  | "invalid"
  | "too-many-entries";

export interface LimitsUnusable {
  readonly reason: LimitsUnusableReason;
  readonly message: string;
}

export type LimitsFileRead =
  | { readonly kind: "ok"; readonly limits: ReadonlyMap<string, number> }
  | { readonly kind: "unusable"; readonly unusable: LimitsUnusable };

const envelopeSchema = z.strictObject({
  version: z.literal(LIMITS_FILE_VERSION),
  maxLength: z.custom<Readonly<Record<string, unknown>>>(isPlainObject),
});

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unusable(reason: LimitsUnusableReason, detail: string): LimitsFileRead {
  return { kind: "unusable", unusable: { reason, message: `${LIMITS_FILE_NAME} ${detail}` } };
}

function declaredNewerVersion(parsed: unknown): number | undefined {
  if (!isPlainObject(parsed)) {
    return undefined;
  }
  const { version } = parsed;
  return typeof version === "number" && Number.isInteger(version) && version > LIMITS_FILE_VERSION
    ? version
    : undefined;
}

function entriesOf(maxLength: Readonly<Record<string, unknown>>): LimitsFileRead {
  const raw = Object.entries(maxLength);
  if (raw.length > MAX_LIMITS_ENTRIES) {
    return unusable(
      "too-many-entries",
      `holds ${raw.length} entries, more than the ${MAX_LIMITS_ENTRIES} verbatra reads`,
    );
  }
  const limits = new Map<string, number>();
  for (const [key, value] of raw) {
    if (key.length === 0 || key.length > MAX_LIMITS_KEY_LENGTH) {
      return unusable(
        "invalid",
        `names a key that is empty or longer than ${MAX_LIMITS_KEY_LENGTH} characters`,
      );
    }
    const parsed = maxLengthValueSchema.safeParse(value);
    if (!parsed.success) {
      return unusable("invalid", "holds a limit that is not a whole number of at least 1");
    }
    limits.set(key, parsed.data);
  }
  return { kind: "ok", limits };
}

export function parseLimitsContent(content: string): LimitsFileRead {
  const text = content.startsWith(BOM) ? content.slice(BOM.length) : content;
  if (text.includes(REPLACEMENT_CHARACTER) || text.includes(NUL)) {
    return unusable(
      "not-utf8",
      "is not UTF-8 text, or holds a literal U+FFFD (write it as the escape \\ufffd)",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return unusable("not-json", "is not valid JSON");
  }
  const newer = declaredNewerVersion(parsed);
  if (newer !== undefined) {
    return unusable(
      "unsupported-version",
      `declares version ${newer}, which this verbatra does not support`,
    );
  }
  const envelope = envelopeSchema.safeParse(parsed);
  if (!envelope.success) {
    return unusable(
      "invalid",
      `must be {"version": ${LIMITS_FILE_VERSION}, "maxLength": {"<key>": <whole number of at least 1>}}`,
    );
  }
  return entriesOf(envelope.data.maxLength);
}

export async function readLimitsFile(path: string, fs: SdkFs): Promise<LimitsFileRead> {
  const read = await fs.readFileBounded(path, MAX_LIMITS_FILE_BYTES);
  if (read.kind === "too-large") {
    return unusable(
      "too-large",
      `exceeds the maximum allowed size of ${MAX_LIMITS_FILE_BYTES} bytes`,
    );
  }
  if (read.kind === "missing") {
    return read.unreadable === true
      ? unusable("unreadable", "exists but could not be read as a file")
      : { kind: "ok", limits: new Map() };
  }
  return parseLimitsContent(read.content);
}

export function serializeLimits(limits: ReadonlyMap<string, number>): string {
  const sorted = [...limits.entries()].sort(([left], [right]) => (left < right ? -1 : 1));
  const document = { version: LIMITS_FILE_VERSION, maxLength: Object.fromEntries(sorted) };
  return `${JSON.stringify(document, null, 2).replaceAll(REPLACEMENT_CHARACTER, "\\ufffd")}\n`;
}
