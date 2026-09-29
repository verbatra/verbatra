import type { TmxProperty } from "@verbatra/exchange";
import { SdkError } from "../../errors.js";
import type { SdkFs } from "../../fs.js";
import {
  isMachineClassOrigin,
  type KeyProvenance,
  keyProvenance,
  type LocaleProvenance,
} from "../../lock/key-provenance.js";
import { baselineFor } from "../../lock/lock-file.js";
import type { ProvenanceRecord } from "../../lock/provenance-file.js";
import { readCarriedOverLock, readCarriedOverProvenance } from "../locale-carry-over.js";

/**
 * The `x-origin` value a TMX export writes on a target segment: `machine` for a text a provider,
 * the translation memory, a fuzzy match, or an AI agent produced, `human` for one a person wrote
 * through verbatra, `import` for one read from a translator handoff, and `unknown` when no
 * provenance record describes that exact text.
 */
export type TmxOrigin = "machine" | "human" | "import" | "unknown";

/** The `x-review` value a TMX export writes next to `x-origin="machine"`. */
export type TmxReview = "approved" | "unreviewed" | "rejected";

const TMX_ORIGIN_PROPERTY = "x-origin";

const TMX_REVIEW_PROPERTY = "x-review";

export type TmxOriginLookup = (
  locale: string,
  sourceHash: string,
  text: string,
) => readonly TmxProperty[];

type KeysByHash = ReadonlyMap<string, readonly string[]>;

function keysByHash(baseline: ReadonlyMap<string, string>): KeysByHash {
  const index = new Map<string, string[]>();
  for (const [key, hash] of baseline) {
    const keys = index.get(hash);
    if (keys === undefined) {
      index.set(hash, [key]);
    } else {
      keys.push(key);
    }
  }
  return index;
}

function describing(
  keys: readonly string[],
  records: ReadonlyMap<string, ProvenanceRecord>,
  text: string,
  sourceHash: string,
): KeyProvenance[] {
  const matches: KeyProvenance[] = [];
  for (const key of keys) {
    const record = records.get(key);
    const provenance = record === undefined ? undefined : keyProvenance(record, text, sourceHash);
    if (provenance !== undefined && provenance.origin !== "external") {
      matches.push(provenance);
    }
  }
  return matches;
}

function originOf(matches: readonly KeyProvenance[]): TmxOrigin {
  const origins = new Set(matches.map((match) => match.origin));
  if ([...origins].some(isMachineClassOrigin)) {
    return "machine";
  }
  if (origins.has("import")) {
    return "import";
  }
  return origins.has("human") ? "human" : "unknown";
}

function reviewOf(matches: readonly KeyProvenance[]): TmxReview {
  const states = matches
    .filter((match) => isMachineClassOrigin(match.origin))
    .map((match) => match.reviewState);
  if (states.includes("rejected")) {
    return "rejected";
  }
  return states.every((state) => state === "approved") ? "approved" : "unreviewed";
}

export function tmxOriginProperties(matches: readonly KeyProvenance[]): readonly TmxProperty[] {
  const origin = originOf(matches);
  const properties: TmxProperty[] = [{ type: TMX_ORIGIN_PROPERTY, value: origin }];
  if (origin === "machine") {
    properties.push({ type: TMX_REVIEW_PROPERTY, value: reviewOf(matches) });
  }
  return properties;
}

function lookupFrom(
  baselineOf: (locale: string) => ReadonlyMap<string, string>,
  provenance: LocaleProvenance,
): TmxOriginLookup {
  const indexes = new Map<string, KeysByHash>();
  const indexFor = (locale: string): KeysByHash => {
    const cached = indexes.get(locale);
    if (cached !== undefined) {
      return cached;
    }
    const index = keysByHash(baselineOf(locale));
    indexes.set(locale, index);
    return index;
  };
  return (locale, sourceHash, text) =>
    tmxOriginProperties(
      describing(indexFor(locale).get(sourceHash) ?? [], provenance(locale), text, sourceHash),
    );
}

export async function readTmxOriginLookup(
  cwd: string,
  fs: SdkFs,
  locales: readonly string[],
): Promise<TmxOriginLookup | undefined> {
  const provenance = await readCarriedOverProvenance(cwd, fs, locales);
  if (provenance === undefined) {
    return undefined;
  }
  try {
    const lock = await readCarriedOverLock(cwd, fs, locales);
    return lookupFrom((locale) => baselineFor(lock, locale), provenance);
  } catch (error) {
    if (error instanceof SdkError && error.code === "LOCK_FILE_INVALID") {
      return undefined;
    }
    throw error;
  }
}
