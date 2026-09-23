import type { LocaleResource } from "@verbatra/core";
import { DEFAULT_HUMAN_EDITS, type HumanEditsPolicy } from "../config/human-edits.js";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import type { SdkFs } from "../fs.js";
import { keyProvenance } from "../lock/key-provenance.js";
import {
  localeRecords,
  type ProvenanceRecord,
  provenanceFilePath,
  readProvenanceFile,
} from "../lock/provenance-file.js";
import type { LocaleDiffResult } from "./diff-locales.js";
import { matchesKeyGlob } from "./key-glob.js";
import type { ProtectionReason } from "./summary.js";

export type ProvenanceView = ReadonlyMap<string, ProvenanceRecord> | "unreadable";

export interface ProtectionPolicy {
  readonly humanEdits: HumanEditsPolicy;
  readonly pinnedKeys: readonly string[];
}

export function protectionPolicy(
  config: VerbatraConfig,
  override?: HumanEditsPolicy,
): ProtectionPolicy {
  return {
    humanEdits: override ?? config.humanEdits ?? DEFAULT_HUMAN_EDITS,
    pinnedKeys: config.pinnedKeys ?? [],
  };
}

export function needsProvenance(policy: ProtectionPolicy): boolean {
  return policy.humanEdits !== "overwrite";
}

export function isPinned(policy: ProtectionPolicy, key: string): boolean {
  return policy.pinnedKeys.some((pattern) => matchesKeyGlob(pattern, key));
}

function originProtection(
  provenance: ProvenanceView,
  key: string,
  value: string,
): ProtectionReason | undefined {
  if (provenance === "unreadable") {
    return "external";
  }
  const view = keyProvenance(provenance.get(key), value);
  if (view.reviewState === "rejected") {
    return undefined;
  }
  return view.origin === "human" || view.origin === "import" || view.origin === "external"
    ? view.origin
    : undefined;
}

export function protectionFor(
  policy: ProtectionPolicy,
  provenance: ProvenanceView,
  key: string,
  value: string | undefined,
): ProtectionReason | undefined {
  if (isPinned(policy, key)) {
    return "pinned";
  }
  if (!needsProvenance(policy) || value === undefined) {
    return undefined;
  }
  return originProtection(provenance, key, value);
}

export function protectedKeys(
  policy: ProtectionPolicy,
  provenance: ProvenanceView,
  target: LocaleResource,
  keys: Iterable<string>,
): Map<string, ProtectionReason> {
  const reasons = new Map<string, ProtectionReason>();
  for (const key of keys) {
    const reason = protectionFor(policy, provenance, key, target.entries.get(key)?.value);
    if (reason !== undefined) {
      reasons.set(key, reason);
    }
  }
  return reasons;
}

export async function readProvenanceView(
  policy: ProtectionPolicy,
  cwd: string,
  fs: SdkFs,
  locale: string,
): Promise<ProvenanceView> {
  if (!needsProvenance(policy)) {
    return new Map();
  }
  const { file, writable } = await readProvenanceFile(provenanceFilePath(cwd), fs);
  return writable ? localeRecords(file, locale) : "unreadable";
}

const REASON_DESCRIPTIONS: Readonly<Record<Exclude<ProtectionReason, "pinned">, string>> = {
  human: "a value a person wrote",
  import: "an imported value",
  external: "a value changed outside verbatra",
};

export function assertNotPinned(policy: ProtectionPolicy, key: string): void {
  if (isPinned(policy, key)) {
    throw new SdkError(
      "KEY_PINNED",
      `The key "${key}" matches the config's pinnedKeys, so no machine write may change it.`,
    );
  }
}

export function assertNotProtected(
  reason: ProtectionReason | undefined,
  key: string,
  locale: string,
): void {
  if (reason === undefined || reason === "pinned") {
    return;
  }
  throw new SdkError(
    "KEY_PROTECTED",
    `The key "${key}" in locale "${locale}" holds ${REASON_DESCRIPTIONS[reason]}, so it is not ` +
      "retranslated without an explicit override.",
  );
}

export function reportedProtectedKeys(
  config: VerbatraConfig,
  result: LocaleDiffResult,
): readonly string[] | undefined {
  if (result.provenance === undefined) {
    return undefined;
  }
  const keys = [...result.diff.missing, ...result.diff.changed];
  return [
    ...protectedKeys(protectionPolicy(config), result.provenance, result.target, keys).keys(),
  ].sort();
}
