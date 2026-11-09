import { contentHash, type LocaleResource, type TranslationEntry } from "@verbatra/core";
import type { FormatAdapter } from "@verbatra/format-adapters";
import { fingerprintsFor } from "../cache/fingerprint.js";
import { feedTranslationMemory } from "../cache/translation-memory.js";
import type { VerbatraConfig } from "../config/schema.js";
import type { SdkFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { updateLockFileLocale } from "../lock/lock-file.js";
import { settleProvenance } from "../lock/provenance-file.js";
import { readTarget } from "./diff-locales.js";
import type { EditEntryActor } from "./edit-entry.js";
import {
  gateCandidateValue,
  type IntegrityGateReason,
  type IntegrityGateRejection,
} from "./integrity-gate.js";
import { writeTargetResource } from "./write-target.js";

export interface EntryEdit {
  readonly key: string;
  readonly sourceEntry: TranslationEntry;
  readonly value: string;
  readonly origin: EditEntryActor;
  readonly stale: boolean;
}

export interface EntryEditsContext {
  readonly cwd: string;
  readonly config: VerbatraConfig;
  readonly adapter: FormatAdapter;
  readonly fs: SdkFs;
  readonly locale: string;
  readonly target?: LocaleResource;
}

export interface EntryEditsOptions {
  readonly freshProvenance?: boolean;
  readonly extraGate?: (edit: EntryEdit) => IntegrityGateRejection | undefined;
}

export type EntryEditOutcome =
  | { readonly accepted: true; readonly value: string }
  | {
      readonly accepted: false;
      readonly reason: IntegrityGateReason;
      readonly details?: readonly string[];
      readonly value: string;
    };

function refusalOutcome(
  gate: { readonly reason: IntegrityGateReason; readonly details?: readonly string[] },
  value: string,
): EntryEditOutcome {
  return {
    accepted: false,
    reason: gate.reason,
    ...(gate.details !== undefined ? { details: gate.details } : {}),
    value,
  };
}

function memoryAdditions(
  accepted: readonly EntryEdit[],
): Record<string, TranslationMemoryAddition> {
  const additions: Record<string, TranslationMemoryAddition> = {};
  for (const edit of accepted) {
    const hash = contentHash(edit.sourceEntry);
    additions[hash] = { contentHash: hash, value: edit.value, source: edit.sourceEntry.value };
  }
  return additions;
}

interface TranslationMemoryAddition {
  readonly contentHash: string;
  readonly value: string;
  readonly source: string;
}

export type EntryEditOutcomes<E extends readonly EntryEdit[]> = {
  readonly [K in keyof E]: EntryEditOutcome;
};

export async function applyEntryEdits<const E extends readonly EntryEdit[]>(
  context: EntryEditsContext,
  edits: E,
  options: EntryEditsOptions = {},
): Promise<EntryEditOutcomes<E>> {
  return (await applyEntryEditsInLock(context, edits, options)) as unknown as EntryEditOutcomes<E>;
}

async function applyEntryEditsInLock(
  context: EntryEditsContext,
  edits: readonly EntryEdit[],
  options: EntryEditsOptions,
): Promise<readonly EntryEditOutcome[]> {
  const { cwd, config, adapter, fs, locale } = context;
  const target = context.target ?? (await readTarget(cwd, config, adapter, fs, locale));

  const outcomes: EntryEditOutcome[] = [];
  const accepted: EntryEdit[] = [];
  for (const edit of edits) {
    const gate = gateCandidateValue(edit.sourceEntry, edit.value, adapter, locale);
    const refusal = gate.accepted ? options.extraGate?.(edit) : gate;
    if (refusal === undefined) {
      accepted.push(edit);
      outcomes.push({ accepted: true, value: edit.value });
    } else {
      outcomes.push(refusalOutcome(refusal, edit.value));
    }
  }
  if (accepted.length === 0) {
    return outcomes;
  }

  const merged = new Map(target.entries);
  for (const edit of accepted) {
    merged.set(edit.key, { ...edit.sourceEntry, value: edit.value, namespace: target.namespace });
  }
  const resolver = createLocalePathResolver(cwd, config);
  await writeTargetResource(
    adapter,
    { locale, namespace: target.namespace, format: config.format, entries: merged },
    resolver.pathFor(locale),
    cwd,
    { sourcePath: resolver.pathFor(config.sourceLocale) },
  );

  const current = accepted.filter((edit) => !edit.stale);
  const lockEntries = Object.fromEntries(
    current.map((edit) => [edit.key, contentHash(edit.sourceEntry)]),
  );
  const provenance = settleProvenance(
    new Map(accepted.map((edit) => [edit.key, { origin: edit.origin, value: edit.value }])),
    await readTarget(cwd, config, adapter, fs, locale),
  );
  await updateLockFileLocale(
    cwd,
    fs,
    locale,
    { mode: "merge", entries: lockEntries },
    options.freshProvenance === true
      ? { ...provenance, replace: new Set(accepted.map((edit) => edit.key)) }
      : provenance,
  );

  await feedTranslationMemory(
    cwd,
    fs,
    fingerprintsFor(config),
    new Map(current.length === 0 ? [] : [[locale, memoryAdditions(current)]]),
  );

  return outcomes;
}
