import type { LocaleResource } from "@verbatra/core";
import type { AdapterRegistry } from "@verbatra/format-adapters";
import { projectCwd } from "../config/project-root.js";
import type { VerbatraConfig } from "../config/schema.js";
import { describeError, SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { createLocalePathResolver, type LocalePathResolver } from "../locale-path/resolver.js";
import {
  assertLockAcquireTimeout,
  type LockWaitListener,
  withLocaleWriteLock,
  writeLockKeyFor,
  writeLockOptions,
} from "../lock/locale-write-lock.js";
import { baselineFor, lockFilePath, readLockFile } from "../lock/lock-file.js";
import { valueHash } from "../lock/provenance-file.js";
import { assertProvenanceReadable } from "../lock/provenance-notice.js";
import { projectRelativeMessage } from "../project-relative.js";
import { selectAdapter } from "../selection/select-adapter.js";
import {
  applyEntryEdits,
  type EntryEdit,
  type EntryEditOutcome,
  EntryEditsFailure,
  type JudgedEdit,
} from "./apply-entry-edits.js";
import type { EditEntryActor } from "./edit-entry.js";
import type { IntegrityGateReason } from "./integrity-gate.js";
import { isWellFormedText } from "./literal-match.js";
import {
  carryOverBeforeWrite,
  readCarriedOverBaselines,
  readCarriedOverProvenance,
} from "./locale-carry-over.js";
import { protectionPolicy, readProvenanceView } from "./protection.js";
import { readTargetResource } from "./read-target.js";
import { selectLocales } from "./select-locales.js";
import { readSourceResource } from "./source.js";
import {
  evaluateBeforeGate,
  excerptAround,
  judgeReplacement,
  type LocaleFacts,
  MAX_REPLACE_VALUE_LENGTH,
  type PreGate,
  type ReplaceAllowance,
  type ReplaceCriteria,
  staleKeysOf,
  structureRefusal,
} from "./value-replace-evaluate.js";

const PREVIEW_ENTRY_CAP = 1_000;

/**
 * What {@link previewValueReplace} says about one value. `ready` and `stale-source` can be applied.
 * `stale-source` marks a key whose source text changed since its translation was recorded: a
 * replacement still applies, but the key stays reported as out of date. `gate-refused` carries the
 * integrity rule the replaced value would break. `pinned` is a key matching the config's
 * `pinnedKeys`. `protected` is a value a person wrote, imported, or changed outside verbatra, or
 * any value when the provenance file cannot be read. `no-source-entry` is a key with no source
 * text to check the new value against, such as an orphan or a generated plural form. `unchanged`
 * is a value the replacement would leave as it is. `too-long` is a value the replacement would
 * grow past 20,000 characters; it is not an integrity refusal and carries no `reason`.
 */
export type ValueReplaceStatus =
  | "ready"
  | "stale-source"
  | "gate-refused"
  | "pinned"
  | "protected"
  | "no-source-entry"
  | "unchanged"
  | "too-long";

/** One matched value in a {@link ValueReplacePreview}. */
export interface ValueReplacePreviewEntry {
  /** The target locale the value is in. */
  readonly locale: string;
  /** The key. */
  readonly key: string;
  /** Whether and how the replacement would apply. */
  readonly status: ValueReplaceStatus;
  /**
   * Present, and `true`, only on a `pinned` entry whose value is also protected (a person wrote,
   * imported, or changed it outside verbatra, or the provenance file cannot be read). Such a key is
   * applied only when both `includePinned` and `includeProtected` are set. Absent otherwise.
   */
  readonly protected?: true;
  /** The integrity rule the replaced value would break. Present only for `gate-refused`. */
  readonly reason?: IntegrityGateReason;
  /** What is behind a `gate-refused` reason, as {@link EditEntryResult} reports it. Absent otherwise. */
  readonly details?: readonly string[];
  /**
   * The hash of the current value, the one the provenance record stores. Pass it back in
   * {@link ApplyValueReplaceInput.entries} so {@link applyValueReplace} can tell whether the value
   * changed since this preview. It is not the salted marker {@link approveEntry} takes, and it is
   * blind to a change that only differs in Unicode normalization or line endings.
   */
  readonly valueHash: string;
  /** Up to 200 characters of the current value around the first match. */
  readonly before: string;
  /** Up to 200 characters of the replaced value from the same position. Empty when the replaced value would exceed 20,000 characters. */
  readonly after: string;
  /** True when `before` or `after` is shorter than the value it comes from. */
  readonly excerptCut: boolean;
}

/** The result of {@link previewValueReplace}. */
export interface ValueReplacePreview {
  /** Matched values, by locale in the config's `targetLocales` order whatever order `locales` names them in, and by key in file order, at most 1,000. */
  readonly entries: readonly ValueReplacePreviewEntry[];
  /** True when more values matched than the 1,000 listed. */
  readonly truncated: boolean;
  /** How many of {@link ValueReplacePreview.entries} have each status. */
  readonly counts: Readonly<Record<ValueReplaceStatus, number>>;
  /**
   * True when the lock file is corrupt, oversized, or from a newer verbatra, so no value could be
   * compared with its recorded source text and none is reported as `stale-source`. Absent
   * otherwise, including when there is no lock file.
   */
  readonly baselineUnavailable?: true;
}

interface ValueReplaceFindInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against. Defaults to the project root of the config object {@link loadConfig} returned, else the process working directory; a copied or rebuilt config loses that root, so pass `cwd` from {@link resolveProjectRoot}. */
  readonly cwd?: string;
  /** The text to find, matched literally in target values only: 1 to 20,000 characters, with no unpaired surrogate. */
  readonly find: string;
  /** The text to put in its place, inserted exactly as given, with no unpaired surrogate. `$&`, `$1` and the like have no special meaning. */
  readonly replace: string;
  /** Whether letter case must match. Defaults to `true`. */
  readonly caseSensitive?: boolean;
}

/** Input for {@link previewValueReplace}. */
export interface PreviewValueReplaceInput extends ValueReplaceFindInput {
  /** The target locales to search. Defaults to every configured target locale. */
  readonly locales?: readonly string[];
}

/** One value to change in {@link ApplyValueReplaceInput.entries}. */
export interface ValueReplaceEntryRef {
  /** The target locale the value is in. */
  readonly locale: string;
  /** The key. */
  readonly key: string;
  /** The `valueHash` {@link previewValueReplace} returned for the value. */
  readonly valueHash: string;
}

/** Input for {@link applyValueReplace}. */
export interface ApplyValueReplaceInput extends ValueReplaceFindInput {
  /** The values to change, as {@link previewValueReplace} listed them. Their locales must be configured target locales. */
  readonly entries: readonly ValueReplaceEntryRef[];
  /** Also change keys that match the config's `pinnedKeys`. Ignored when `actor` is `agent`. Defaults to `false`. */
  readonly includePinned?: boolean;
  /** Also change values a person wrote, imported, or changed outside verbatra. Defaults to `false`. */
  readonly includeProtected?: boolean;
  /**
   * Who is making the change, recorded as the origin of every changed value in the provenance
   * file. The calling surface asserts it; nothing verifies it.
   */
  readonly actor: EditEntryActor;
  /** Called while waiting on another process's write lock for a locale. */
  readonly onLockWait?: LockWaitListener;
  /** How long, in milliseconds, to wait for each locale's write lock before failing with `LOCK_CONTENDED`. Defaults to ten minutes. */
  readonly lockAcquireTimeoutMs?: number;
}

/** Injectable dependencies for {@link previewValueReplace} and {@link applyValueReplace}. Every field has a working default. */
export interface ValueReplaceDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

/** Why {@link applyValueReplace} left a value alone. */
export type ValueReplaceSkipReason =
  | "pinned"
  | "protected"
  | "no-source-entry"
  | "unchanged"
  | "duplicate-entry"
  | "locale-failed";

/** A locale {@link applyValueReplace} could not finish. */
export interface ValueReplaceLocaleFailure {
  /** The locale that failed. */
  readonly locale: string;
  /** The failure's own code where it has one, and `LOCALE_FAILED` otherwise. */
  readonly code: string;
  /** What went wrong, with file paths relative to the project. Never carries a translation value. */
  readonly message: string;
  /**
   * True when the failure came after the locale file was written, while the lock file or the
   * provenance file was updated or the write lock was released. The accepted values are then on disk
   * and reported `applied`, and the lock file or provenance record may lag behind them, so review the
   * locale before any retry. Absent when nothing was written for the locale.
   */
  readonly fileWritten?: true;
}

/** What {@link applyValueReplace} did with one entry. */
export type ValueReplaceOutcome =
  | {
      readonly locale: string;
      readonly key: string;
      readonly status: "applied";
      /** True when the key's source text had changed since its translation was recorded, so it still reads as out of date. */
      readonly staleSource: boolean;
    }
  | {
      readonly locale: string;
      readonly key: string;
      readonly status: "skipped";
      readonly reason: ValueReplaceSkipReason;
    }
  | {
      readonly locale: string;
      readonly key: string;
      readonly status: "refused";
      /** The integrity rule the replaced value broke. */
      readonly reason: IntegrityGateReason;
      readonly details?: readonly string[];
    }
  | {
      readonly locale: string;
      readonly key: string;
      /** The value no longer matches the `valueHash`, no longer contains the text, or is gone. Nothing was written. */
      readonly status: "changed";
    }
  | {
      readonly locale: string;
      readonly key: string;
      /** The replaced value would be longer than 20,000 characters. Nothing was written. */
      readonly status: "too-long";
    };

/** The result of {@link applyValueReplace}. */
export interface ApplyValueReplaceResult {
  /** One outcome per entry passed, in the same order. */
  readonly outcomes: readonly ValueReplaceOutcome[];
  /** How many outcomes have each status. */
  readonly counts: Readonly<Record<ValueReplaceOutcome["status"], number>>;
  /** The locales that failed, in the order they were processed. Empty when every locale finished. */
  readonly localeFailures: readonly ValueReplaceLocaleFailure[];
}

function assertFindText(input: ValueReplaceFindInput): void {
  const { find, replace } = input;
  if (find.length === 0 || find.length > MAX_REPLACE_VALUE_LENGTH) {
    throw new SdkError(
      "FIND_TEXT_INVALID",
      `The find text must be 1 to ${MAX_REPLACE_VALUE_LENGTH} characters, got ${find.length}.`,
    );
  }
  if (!isWellFormedText(find)) {
    throw new SdkError(
      "FIND_TEXT_INVALID",
      "The find text must not contain an unpaired surrogate code unit.",
    );
  }
  if (!isWellFormedText(replace)) {
    throw new SdkError(
      "FIND_TEXT_INVALID",
      "The replace text must not contain an unpaired surrogate code unit.",
    );
  }
}

function criteriaOf(input: ValueReplaceFindInput): ReplaceCriteria {
  return { find: input.find, replace: input.replace, caseSensitive: input.caseSensitive ?? true };
}

function emptyPreviewCounts(): Record<ValueReplaceStatus, number> {
  return {
    ready: 0,
    "stale-source": 0,
    "gate-refused": 0,
    pinned: 0,
    protected: 0,
    "no-source-entry": 0,
    unchanged: 0,
    "too-long": 0,
  };
}

function previewEntry(
  locale: string,
  key: string,
  current: string,
  pre: PreGate,
  facts: LocaleFacts,
): ValueReplacePreviewEntry {
  const before = excerptAround(current, pre.matchStart);
  const after =
    pre.newValue === undefined
      ? { text: "", cut: true }
      : excerptAround(pre.newValue, pre.matchStart);
  const base = {
    locale,
    key,
    valueHash: valueHash(current),
    before: before.text,
    after: after.text,
    excerptCut: before.cut || after.cut,
  };
  if (pre.verdict !== "candidate") {
    return {
      ...base,
      status: pre.verdict,
      ...(pre.verdict === "pinned" && pre.alsoProtected === true
        ? { protected: true as const }
        : {}),
    };
  }
  const refusal = judgeReplacement(facts, pre.sourceEntry, locale, current, pre.newValue);
  if (refusal !== undefined) {
    return {
      ...base,
      status: "gate-refused",
      reason: refusal.reason,
      ...(refusal.details !== undefined ? { details: refusal.details } : {}),
    };
  }
  return { ...base, status: pre.stale ? "stale-source" : "ready" };
}

/**
 * Lists the values that a literal find-and-replace would change, and says for each whether it
 * would apply. It reads target locale values only, never the source locale, writes nothing, and
 * calls no provider.
 *
 * Matching is literal and compares UTF-16 text as it is stored: no pattern syntax, no Unicode
 * normalization, and no line-ending translation, so an NFD `find` does not match an NFC value and
 * `\n` does not match `\r\n`. With `caseSensitive: false` letters are compared by their lower-case
 * form, one character at a time. A match never starts or ends inside a surrogate pair. The
 * replacement is inserted as given.
 *
 * Every candidate value is held to the same integrity gate as an edit, against its current source
 * text, so a replacement that drops a placeholder, breaks markup or ICU syntax, blanks the value,
 * or runs away into a repetition-dominated value is listed as `gate-refused`. For the ICU formats
 * (next-intl and ARB) the replacement is also refused as `gate-refused` with the reason `icu` when
 * it changes what an argument does: an argument's type, a number or date style or skeleton, or how
 * many `#` a plural arm holds, compared with the current value, or with the source text when the
 * current value is not valid ICU. An argument renamed away from the source text is refused as
 * `placeholder`. The `details` list each difference, prefixed `-` for what the compared value had
 * and `+` for what the replaced value has. A replaced value longer than 20,000 characters is listed as `too-long`, which is not an
 * integrity refusal and carries no `reason`. Keys that
 * match `pinnedKeys`, and values a person wrote, imported, or changed outside verbatra, are listed
 * as `pinned` and `protected` whatever the config's `humanEdits` says (a key that is both is
 * listed as `pinned` with `protected: true`), and every value counts as
 * protected when the provenance file cannot be read, which includes a file from a newer verbatra:
 * that file is never rewritten, and a value changed with `includeProtected` gets no record in it. A
 * key whose source text changed since its translation was recorded is `stale-source`, and its
 * replacement is checked against the current source text.
 *
 * At most 1,000 matched values are listed, `truncated` says when there were more, and each
 * excerpt is at most 200 characters. The preview is advisory: {@link applyValueReplace} decides
 * again, under the write lock, from the values on disk at that moment.
 *
 * @param input - The config, locales, and the find and replace text.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns The matched values with a status each, a truncation flag, and counts per status.
 *
 * @throws {@link SdkError} `FIND_TEXT_INVALID`: `find` is empty or longer than 20,000 characters, or
 * `find` or `replace` holds an unpaired surrogate.
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: a requested locale is not a configured target locale.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or a configured locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the source locale file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: the source locale file could not be parsed.
 * @throws `AdapterError`: the adapter refused a target locale file because it is malformed. Its
 * own code is preserved rather than remapped onto an {@link SdkErrorCode}.
 *
 * @example
 * ```ts
 * import { loadConfig, previewValueReplace } from "@verbatra/sdk";
 *
 * const config = await loadConfig();
 * const preview = await previewValueReplace({ config, find: "Colour", replace: "Color" });
 * const ready = preview.entries.filter((entry) => entry.status === "ready");
 * ```
 */
export async function previewValueReplace(
  input: PreviewValueReplaceInput,
  deps: ValueReplaceDeps = {},
): Promise<ValueReplacePreview> {
  assertFindText(input);
  const config = input.config;
  const cwd = projectCwd(input);
  const fs = deps.fs ?? defaultFs;
  const adapter = selectAdapter(config.format, deps.adapterRegistry, deps.fs);
  const resolver = createLocalePathResolver(cwd, config);
  const criteria = criteriaOf(input);
  const none: ReplaceAllowance = { pinned: false, protected: false };

  const source = await readSourceResource(config, resolver, fs, adapter);
  const locales = selectLocales(config, input.locales);
  const provenanceFor = await readCarriedOverProvenance(cwd, fs, locales);
  const baselineOf = await readCarriedOverBaselines(cwd, fs, locales);
  const policy = protectionPolicy(config, "protect");

  const entries: ValueReplacePreviewEntry[] = [];
  let truncated = false;
  for (const locale of locales) {
    const target = await readTargetResource({
      resolver,
      format: config.format,
      locale,
      adapter,
      fs,
    });
    const facts: LocaleFacts = {
      adapter,
      source: source.resource,
      staleKeys: staleKeysOf(source.resource, target, baselineOf?.(locale)),
      policy,
      provenance: provenanceFor === undefined ? "unreadable" : provenanceFor(locale),
    };
    for (const [key, targetEntry] of target.entries) {
      const pre = evaluateBeforeGate(facts, criteria, none, key, targetEntry.value);
      if (pre === undefined) {
        continue;
      }
      if (entries.length >= PREVIEW_ENTRY_CAP) {
        truncated = true;
        break;
      }
      entries.push(previewEntry(locale, key, targetEntry.value, pre, facts));
    }
    if (truncated) {
      break;
    }
  }
  const counts = emptyPreviewCounts();
  for (const entry of entries) {
    counts[entry.status] += 1;
  }
  return {
    entries,
    truncated,
    counts,
    ...baselineFlag(baselineOf),
  };
}

function baselineFlag(baselineOf: unknown): { readonly baselineUnavailable?: true } {
  return baselineOf === undefined ? { baselineUnavailable: true } : {};
}

function emptyApplyCounts(): Record<ValueReplaceOutcome["status"], number> {
  return { applied: 0, skipped: 0, refused: 0, changed: 0, "too-long": 0 };
}

function localeFailureOf(
  locale: string,
  error: unknown,
  cwd: string,
  fileWritten: boolean,
): ValueReplaceLocaleFailure {
  const described = describeError(error, "LOCALE_FAILED");
  return {
    locale,
    code: described.code,
    message: projectRelativeMessage(described.message, cwd),
    ...(fileWritten ? { fileWritten: true as const } : {}),
  };
}

interface IndexedRef {
  readonly index: number;
  readonly ref: ValueReplaceEntryRef;
}

interface ApplyContext {
  readonly input: ApplyValueReplaceInput;
  readonly cwd: string;
  readonly fs: SdkFs;
  readonly adapter: ReturnType<typeof selectAdapter>;
  readonly resolver: LocalePathResolver;
  readonly criteria: ReplaceCriteria;
  readonly allow: ReplaceAllowance;
}

function changed(ref: ValueReplaceEntryRef): ValueReplaceOutcome {
  return { locale: ref.locale, key: ref.key, status: "changed" };
}

function skipped(ref: ValueReplaceEntryRef, reason: ValueReplaceSkipReason): ValueReplaceOutcome {
  return { locale: ref.locale, key: ref.key, status: "skipped", reason };
}

function groupByLocale(entries: readonly ValueReplaceEntryRef[]): Map<string, IndexedRef[]> {
  const groups = new Map<string, IndexedRef[]>();
  const seen = new Set<string>();
  entries.forEach((ref, index) => {
    const identity = JSON.stringify([ref.locale, ref.key]);
    if (seen.has(identity)) {
      return;
    }
    seen.add(identity);
    const group = groups.get(ref.locale);
    if (group === undefined) {
      groups.set(ref.locale, [{ index, ref }]);
    } else {
      group.push({ index, ref });
    }
  });
  return groups;
}

interface ReplaceEdit extends EntryEdit {
  readonly indexed: IndexedRef;
  readonly current: string;
}

function appliedOutcome(edit: ReplaceEdit, outcome: EntryEditOutcome): ValueReplaceOutcome {
  const { ref } = edit.indexed;
  if (outcome.accepted) {
    return { locale: ref.locale, key: ref.key, status: "applied", staleSource: edit.stale };
  }
  return {
    locale: ref.locale,
    key: ref.key,
    status: "refused",
    reason: outcome.reason,
    ...(outcome.details !== undefined ? { details: outcome.details } : {}),
  };
}

interface LocaleAttemptFailure {
  readonly error: unknown;
  readonly fileWritten: boolean;
}

interface LocaleWriteState {
  fileWritten: boolean;
  postWriteError: { readonly error: unknown } | undefined;
}

async function applyLocale(
  context: ApplyContext,
  locale: string,
  refs: readonly IndexedRef[],
  results: ValueReplaceOutcome[],
): Promise<LocaleAttemptFailure | undefined> {
  const { input, cwd, fs, adapter, resolver } = context;
  const config = input.config;
  const state: LocaleWriteState = { fileWritten: false, postWriteError: undefined };
  try {
    await readSourceResource(config, resolver, fs, adapter);
    await carryOverBeforeWrite(cwd, fs, locale, writeLockOptions(input));
    await withLocaleWriteLock(
      cwd,
      writeLockKeyFor(config.format, locale),
      fs,
      () => applyLocaleInLock(context, locale, refs, results, state),
      writeLockOptions(input),
    );
  } catch (error) {
    return { error: state.postWriteError?.error ?? error, fileWritten: state.fileWritten };
  }
  return state.postWriteError === undefined
    ? undefined
    : { error: state.postWriteError.error, fileWritten: true };
}

async function applyLocaleInLock(
  context: ApplyContext,
  locale: string,
  refs: readonly IndexedRef[],
  results: ValueReplaceOutcome[],
  state: LocaleWriteState,
): Promise<void> {
  const { input, cwd, fs, adapter, resolver, criteria } = context;
  const config = input.config;
  const target = await readTargetResource({ resolver, format: config.format, locale, adapter, fs });
  const source = await readSourceResource(config, resolver, fs, adapter);
  const baseline = baselineFor(await readLockFile(lockFilePath(cwd), fs), locale);
  const policy = protectionPolicy(config, "protect");
  const facts: LocaleFacts = {
    adapter,
    source: source.resource,
    staleKeys: staleKeysOf(source.resource, target, baseline),
    policy,
    provenance: await readProvenanceView(policy, cwd, fs, locale),
  };

  const pending: ReplaceEdit[] = [];
  for (const indexed of refs) {
    const { ref } = indexed;
    const current = target.entries.get(ref.key)?.value;
    const pre =
      current === undefined || valueHash(current) !== ref.valueHash
        ? undefined
        : evaluateBeforeGate(facts, criteria, context.allow, ref.key, current);
    if (pre === undefined) {
      results[indexed.index] = changed(ref);
    } else if (pre.verdict === "too-long") {
      results[indexed.index] = { locale, key: ref.key, status: "too-long" };
    } else if (pre.verdict !== "candidate") {
      results[indexed.index] = skipped(ref, pre.verdict);
    } else {
      pending.push({
        indexed,
        current: pre.current,
        key: ref.key,
        sourceEntry: pre.sourceEntry,
        value: pre.newValue,
        origin: input.actor,
        stale: pre.stale,
      });
    }
  }
  await writeAndSettle(context, { locale, target, pending, results, state });
}

interface SettleRequest {
  readonly locale: string;
  readonly target: LocaleResource;
  readonly pending: readonly ReplaceEdit[];
  readonly results: ValueReplaceOutcome[];
  readonly state: LocaleWriteState;
}

async function writeAndSettle(context: ApplyContext, request: SettleRequest): Promise<void> {
  const { locale, target, pending, results, state } = request;
  const { input, cwd, fs, adapter } = context;
  try {
    const judged = await applyEntryEdits(
      { cwd, config: input.config, adapter, fs, locale, target },
      pending,
      {
        freshProvenance: true,
        extraGate: (edit) => structureRefusal(adapter, edit.current, edit.value, edit.sourceEntry),
      },
    );
    settle(judged, results, true);
    state.fileWritten = judged.some(({ outcome }) => outcome.accepted);
  } catch (error) {
    if (!(error instanceof EntryEditsFailure)) {
      throw error;
    }
    settle(error.judged, results, error.fileWritten);
    if (!error.fileWritten) {
      throw error.cause;
    }
    state.fileWritten = true;
    state.postWriteError = { error: error.cause };
  }
}

function settle(
  judged: readonly JudgedEdit<ReplaceEdit>[],
  results: ValueReplaceOutcome[],
  written: boolean,
): void {
  for (const { edit, outcome } of judged) {
    if (written || !outcome.accepted) {
      results[edit.indexed.index] = appliedOutcome(edit, outcome);
    }
  }
}

function markDuplicates(
  entries: readonly ValueReplaceEntryRef[],
  results: ValueReplaceOutcome[],
  groups: ReadonlyMap<string, readonly IndexedRef[]>,
): void {
  const first = new Set([...groups.values()].flat().map((indexed) => indexed.index));
  entries.forEach((ref, index) => {
    if (!first.has(index)) {
      results[index] = skipped(ref, "duplicate-entry");
    }
  });
}

/**
 * Replaces literal text in the target values the caller picked from a {@link previewValueReplace}
 * result. For each entry the server recomputes the new value from `find` and `replace` over the
 * value currently on disk, inside the locale's write lock; it never takes a computed value from
 * the caller, so a stale or forged preview cannot write anything the replacement would not.
 *
 * Under the lock every entry is decided again. A value whose `valueHash` no longer matches, or
 * that no longer contains the text, or is gone, is `changed` and nothing is written for it. The
 * hash ignores Unicode normalization and line endings, so a value that differs from the preview
 * only that way is replaced when the text still matches, and is `changed` when it no longer does.
 * A key with no source text, and a replacement that leaves the value as it is, are `skipped`. A
 * pinned key is `skipped` unless `includePinned` is set and `actor` is `human`; an agent never
 * changes a pinned key. A value that is protected as {@link previewValueReplace} describes it is
 * `skipped` unless `includeProtected` is set, and this holds whatever `humanEdits` the config
 * sets, so a key that is both pinned and protected needs both options. A value the integrity gate
 * refuses is `refused`, with its reason. Everything else is written.
 *
 * Locales are processed one after another, each under its own write lock, with one write of the
 * locale file, one update of the lock-file and provenance file, and one translation-memory update
 * for all of that locale's values. A key whose source text changed since its translation was
 * recorded keeps its old lock-file hash, so {@link check} still reports it out of date, and its
 * value is not added to the translation memory. Every written value gets a fresh provenance
 * record with `actor` as its origin and no review decision, whatever it had before.
 *
 * A locale that fails does not stop the others. Failures that only one locale's own processing
 * can cause, such as `LOCK_CONTENDED` when its write lock is not free within `lockAcquireTimeoutMs`,
 * `TARGET_UNWRITABLE`, `LOCALE_STATE_NOT_CARRIED_OVER`, `RUN_CANCELLED`, `SOURCE_UNREADABLE` and
 * `SOURCE_INVALID` (the source file is read before any locale is touched and again under each locale's
 * lock), or an `AdapterError` from its file, are recorded in `localeFailures`. An entry the
 * integrity gate refused still comes back `refused`, and one a check had settled before the failure
 * keeps its outcome; the rest come back `skipped` with the reason `locale-failed`, and nothing was
 * written for them. When the failure came after the locale file was written, such as a failed lock
 * file or provenance update or a write lock that could not be released, the failure carries `fileWritten: true` and the
 * accepted entries come back `applied`: their values are on disk and the lock file or provenance may
 * lag, so review the locale before any retry. Do not run a replacement again whose `find` occurs in
 * its `replace` without checking, because it would change the written values a second time. The
 * wait for the lock file's own guard uses the default of ten minutes, not `lockAcquireTimeoutMs`.
 *
 * Entries are grouped by locale in the order each locale first appears in `entries`. When the same
 * `locale` and `key` appear more than once, the first one decides: it is processed whatever its
 * `valueHash` is, and every later one is `skipped` with the reason `duplicate-entry`.
 *
 * @param input - The config, the find and replace text, the entries, and the actor.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns One outcome per entry, in order, counts per status, and the locales that failed.
 *
 * @throws {@link SdkError} `FIND_TEXT_INVALID`: `find` is empty or longer than 20,000 characters, or
 * `find` or `replace` holds an unpaired surrogate.
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: an entry names a locale that is not a configured target
 * locale. Thrown before anything is written.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or a locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `LOCK_TIMEOUT_INVALID`: `lockAcquireTimeoutMs` is not a whole number of
 * milliseconds of at least 0. Thrown before anything is read or locked.
 * @throws {@link SdkError} `LOCK_FILE_INVALID`: the lock-file is corrupt, oversized, or at an
 * unsupported version. Checked before anything is written.
 * @throws {@link SdkError} `PROVENANCE_FILE_INVALID`: the provenance file is corrupt, oversized, or
 * structurally wrong. Checked before anything is written.
 *
 * @example
 * ```ts
 * import { applyValueReplace, loadConfig, previewValueReplace } from "@verbatra/sdk";
 *
 * const config = await loadConfig();
 * const criteria = { config, find: "Colour", replace: "Color" };
 * const preview = await previewValueReplace(criteria);
 * const entries = preview.entries
 *   .filter((entry) => entry.status === "ready")
 *   .map(({ locale, key, valueHash }) => ({ locale, key, valueHash }));
 * const result = await applyValueReplace({ ...criteria, entries, actor: "human" });
 * ```
 */
export async function applyValueReplace(
  input: ApplyValueReplaceInput,
  deps: ValueReplaceDeps = {},
): Promise<ApplyValueReplaceResult> {
  assertFindText(input);
  assertLockAcquireTimeout(input.lockAcquireTimeoutMs);
  const config = input.config;
  const cwd = projectCwd(input);
  const fs = deps.fs ?? defaultFs;
  const adapter = selectAdapter(config.format, deps.adapterRegistry, deps.fs);
  selectLocales(config, [...new Set(input.entries.map((ref) => ref.locale))]);
  if (input.entries.length === 0) {
    return { outcomes: [], counts: emptyApplyCounts(), localeFailures: [] };
  }
  const resolver = createLocalePathResolver(cwd, config);
  const context: ApplyContext = {
    input,
    cwd,
    fs,
    adapter,
    resolver,
    criteria: criteriaOf(input),
    allow: {
      pinned: input.includePinned === true && input.actor === "human",
      protected: input.includeProtected === true,
    },
  };
  await readLockFile(lockFilePath(cwd), fs);
  await assertProvenanceReadable(cwd, fs);

  const groups = groupByLocale(input.entries);
  const results: ValueReplaceOutcome[] = [];
  markDuplicates(input.entries, results, groups);
  const localeFailures: ValueReplaceLocaleFailure[] = [];
  for (const [locale, refs] of groups) {
    const failure = await applyLocale(context, locale, refs, results);
    if (failure !== undefined) {
      localeFailures.push(localeFailureOf(locale, failure.error, cwd, failure.fileWritten));
      for (const { index, ref } of refs) {
        results[index] ??= skipped(ref, "locale-failed");
      }
    }
  }
  const counts = emptyApplyCounts();
  for (const outcome of results) {
    counts[outcome.status] += 1;
  }
  return { outcomes: results, counts, localeFailures };
}
