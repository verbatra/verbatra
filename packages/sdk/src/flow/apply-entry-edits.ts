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

export interface EntryEditsOptions<E extends EntryEdit> {
  readonly freshProvenance?: boolean;
  readonly extraGate?: (edit: E) => IntegrityGateRejection | undefined;
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

export interface JudgedEdit<E extends EntryEdit> {
  readonly edit: E;
  readonly outcome: EntryEditOutcome;
}

export class EntryEditsFailure<E extends EntryEdit> extends Error {
  readonly judged: readonly JudgedEdit<E>[];
  readonly fileWritten: boolean;

  constructor(judged: readonly JudgedEdit<E>[], fileWritten: boolean, cause: unknown) {
    super("The entry edits could not be completed.", { cause });
    this.name = "EntryEditsFailure";
    this.judged = judged;
    this.fileWritten = fileWritten;
  }
}

function judgeEdit<E extends EntryEdit>(
  context: EntryEditsContext,
  edit: E,
  options: EntryEditsOptions<E>,
): EntryEditOutcome {
  const gate = gateCandidateValue(edit.sourceEntry, edit.value, context.adapter, context.locale);
  const refusal = gate.accepted ? options.extraGate?.(edit) : gate;
  return refusal === undefined
    ? { accepted: true, value: edit.value }
    : refusalOutcome(refusal, edit.value);
}

async function readTargetOf(context: EntryEditsContext): Promise<LocaleResource> {
  const { cwd, config, adapter, fs, locale } = context;
  return context.target ?? (await readTarget(cwd, config, adapter, fs, locale));
}

export async function applyEntryEdit(
  context: EntryEditsContext,
  edit: EntryEdit,
): Promise<EntryEditOutcome> {
  const target = await readTargetOf(context);
  const outcome = judgeEdit(context, edit, {});
  if (outcome.accepted) {
    await writeAcceptedEdits(context, target, [edit], false);
  }
  return outcome;
}

export async function applyEntryEdits<E extends EntryEdit>(
  context: EntryEditsContext,
  edits: readonly E[],
  options: EntryEditsOptions<E> = {},
): Promise<readonly JudgedEdit<E>[]> {
  const target = await readTargetOf(context);
  const judged = edits.map((edit) => ({ edit, outcome: judgeEdit(context, edit, options) }));
  const accepted = judged.filter(({ outcome }) => outcome.accepted).map(({ edit }) => edit);
  if (accepted.length === 0) {
    return judged;
  }
  const freshProvenance = options.freshProvenance === true;
  try {
    await writeTargetFile(context, target, accepted);
  } catch (error) {
    throw new EntryEditsFailure(judged, false, error);
  }
  try {
    await recordAcceptedEdits(context, accepted, freshProvenance);
  } catch (error) {
    throw new EntryEditsFailure(judged, true, error);
  }
  return judged;
}

async function writeAcceptedEdits(
  context: EntryEditsContext,
  target: LocaleResource,
  accepted: readonly EntryEdit[],
  freshProvenance: boolean,
): Promise<void> {
  await writeTargetFile(context, target, accepted);
  await recordAcceptedEdits(context, accepted, freshProvenance);
}

async function writeTargetFile(
  context: EntryEditsContext,
  target: LocaleResource,
  accepted: readonly EntryEdit[],
): Promise<void> {
  const { cwd, config, adapter, locale } = context;
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
}

async function recordAcceptedEdits(
  context: EntryEditsContext,
  accepted: readonly EntryEdit[],
  freshProvenance: boolean,
): Promise<void> {
  const { cwd, config, adapter, fs, locale } = context;
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
    freshProvenance
      ? { ...provenance, replace: new Set(accepted.map((edit) => edit.key)) }
      : provenance,
  );

  await feedTranslationMemory(
    cwd,
    fs,
    fingerprintsFor(config),
    new Map(current.length === 0 ? [] : [[locale, memoryAdditions(current)]]),
  );
}
