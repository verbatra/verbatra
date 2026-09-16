import { resolve } from "node:path";
import { contentHash, type TranslationEntry } from "@verbatra/core";
import { DEFAULT_TMX_LIMITS, readTmx, type TmxUnit } from "@verbatra/exchange";
import type { AdapterRegistry, FormatAdapter } from "@verbatra/format-adapters";
import { computeFingerprint } from "../../cache/fingerprint.js";
import {
  applyAdditions,
  cacheFilePath,
  readTranslationMemory,
  writeTranslationMemory,
} from "../../cache/translation-memory.js";
import type { CacheAddition, TranslationMemory } from "../../cache/types.js";
import type { VerbatraConfig } from "../../config/schema.js";
import { errorMessage, SdkError } from "../../errors.js";
import { defaultFs, type SdkFs } from "../../fs.js";
import { selectAdapter } from "../../selection/select-adapter.js";
import { gateCandidateValue, type IntegrityGateReason } from "../integrity-gate.js";
import { selectLocales } from "../select-locales.js";
import { assertDistinctLocales, matchLanguageTag } from "./locale-match.js";

/**
 * Why one translation unit in an imported TMX file was refused. The first four are the shared
 * integrity gate's own reasons, so an imported unit is held to exactly the standard a provider's
 * output and a filled translator handoff already face. `sourceBlank` is the one reason particular
 * to interchange: a unit whose source segment is blank identifies no string, so it could never be
 * matched and is never stored.
 */
export type TmxRejectionReason = IntegrityGateReason | "sourceBlank";

/** How many units were refused, by reason. See {@link TmxRejectionReason}. */
export type TmxRejectionCounts = Readonly<Record<TmxRejectionReason, number>>;

/** What an import did to the memory for one target locale. */
export interface ImportTmxLocaleResult {
  /** The configured target locale, spelled as the config spells it. */
  readonly locale: string;
  /** Units stored for the first time. */
  readonly added: number;
  /** Units the memory already held with the same translation, so nothing changed. */
  readonly unchanged: number;
  /** Units that replaced a different existing translation, which needs `overwrite`. */
  readonly overwritten: number;
  /** Units refused because the memory already held a different translation and `overwrite` was off. */
  readonly kept: number;
  /** Later units in the same file repeating a source the file had already translated. */
  readonly duplicates: number;
  /**
   * Units carrying two segments of equal standing for this locale with different values, such as
   * `de-CH` and `de-AT` in a project configured for `de`. Which one is right cannot be known, so
   * neither is stored. An exact tag always outranks one that only reaches the locale by subtag
   * prefix, and two segments carrying the same value are not a conflict.
   */
  readonly conflicting: number;
  /** Units refused before they could be stored, by reason. */
  readonly rejected: TmxRejectionCounts;
}

/** A language tag in the file that no configured locale could be resolved to. */
export interface TmxLanguageReport {
  /** The tag exactly as the file spelled it. */
  readonly language: string;
  /** How many units carried a segment in it. */
  readonly units: number;
}

/** What {@link importTmx} read and what it wrote. */
export interface ImportTmxResult {
  /** Whether the run was a dry run, in which case the memory file was not written. */
  readonly dryRun: boolean;
  /** The resolved path the file was read from. */
  readonly file: string;
  /** The `srclang` the file's header declared, or undefined if it declared none. */
  readonly sourceLanguage: string | undefined;
  /** How many translation units the file held. */
  readonly units: number;
  /** Per-target-locale account of what was stored. */
  readonly locales: readonly ImportTmxLocaleResult[];
  /** Units the reader could not use at all, such as a unit with no segment. */
  readonly skippedUnits: number;
  /** `tu` elements outside the file's first `body`, which the reader never walked. */
  readonly unreachableUnits: number;
  /**
   * The header's `srclang` when it does not resolve to the configured source locale, so a file
   * exported from a project with a different source language is visible rather than silently
   * yielding nothing. Undefined when it matches, when the header declares none, or when it is the
   * TMX `*all*` wildcard, which declares that the source varies per unit.
   */
  readonly sourceLanguageMismatch: string | undefined;
  /** Units carrying no segment in the configured source locale, so nothing could be keyed. */
  readonly unmatchedSourceUnits: number;
  /**
   * Units carrying two or more segments that both resolve to the configured source locale, such as
   * a `en` and a `en-US` segment in a project configured for `en`. Which one the translations belong
   * to cannot be known, so the unit is refused rather than attributed to whichever came last.
   */
  readonly conflictingSourceUnits: number;
  /** Units whose segments carried inline markup, which is flattened to its text. */
  readonly markupStrippedUnits: number;
  /** Language tags that resolved to no configured locale, with how many units carried each. */
  readonly unmatchedLanguages: readonly TmxLanguageReport[];
  /** Language tags that two or more configured locales could claim, so none was chosen. */
  readonly ambiguousLanguages: readonly TmxLanguageReport[];
  /**
   * Segments that resolved cleanly to a configured target locale this run left out, because
   * {@link ImportTmxInput.locales} narrowed it. Nothing is wrong with them; they are reported so a
   * narrowed run does not look like a file that held less than it did.
   */
  readonly notImported: readonly TmxLanguageReport[];
  /**
   * Whether the memory file could be written. False when the project's cache was written by a newer
   * build, which is left untouched rather than downgraded.
   */
  readonly memoryWritable: boolean;
}

/** Input for {@link importTmx}. */
export interface ImportTmxInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Path to the TMX file, resolved against `cwd`. */
  readonly file: string;
  /** Directory the file and the memory are resolved against. Defaults to the process working directory. */
  readonly cwd?: string;
  /** Read and validate the file but write nothing. Defaults to false. */
  readonly dryRun?: boolean;
  /**
   * Let an imported unit replace a translation the memory already holds for the same source and
   * locale. Off by default, so the project's own memory wins a collision.
   */
  readonly overwrite?: boolean;
  /** Subset of configured target locales to import. Defaults to all of them. */
  readonly locales?: readonly string[];
}

/** Injectable dependencies for {@link importTmx}. Every field has a working default. */
export interface ImportTmxDeps {
  /** Format-adapter registry, used for placeholder extraction and ICU validation. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

const NO_REJECTIONS: TmxRejectionCounts = {
  placeholder: 0,
  icu: 0,
  degenerate: 0,
  empty: 0,
  sourceBlank: 0,
};

interface LocaleTally {
  added: number;
  unchanged: number;
  overwritten: number;
  kept: number;
  duplicates: number;
  conflicting: number;
  rejected: Record<TmxRejectionReason, number>;
  additions: Record<string, CacheAddition>;
  seenHashes: Set<string>;
}

function emptyTally(): LocaleTally {
  return {
    added: 0,
    unchanged: 0,
    overwritten: 0,
    kept: 0,
    duplicates: 0,
    conflicting: 0,
    rejected: { ...NO_REJECTIONS },
    additions: {},
    seenHashes: new Set<string>(),
  };
}

function sourceEntryFor(sourceText: string, adapter: FormatAdapter): TranslationEntry {
  return {
    key: "tmx",
    namespace: "",
    value: sourceText,
    placeholders: adapter.extractPlaceholders(sourceText),
    isPlural: false,
  };
}

async function readTmxText(path: string, fs: SdkFs): Promise<string> {
  const read = await fs.readFileBounded(path, DEFAULT_TMX_LIMITS.maxInputBytes);
  if (read.kind === "missing") {
    throw new SdkError("SOURCE_UNREADABLE", `No TMX file was found at ${path}.`);
  }
  if (read.kind === "too-large") {
    throw new SdkError(
      "SOURCE_INVALID",
      `The TMX file at ${path} exceeds the maximum allowed size of ${DEFAULT_TMX_LIMITS.maxInputBytes} bytes.`,
    );
  }
  return read.content;
}

function parse(text: string, path: string): ReturnType<typeof readTmx> {
  try {
    return readTmx(text);
  } catch (error) {
    throw new SdkError("SOURCE_INVALID", `${path}: ${errorMessage(error)}`);
  }
}

type CensusKind = "unmatched" | "ambiguous" | "filtered";

class LanguageCensus {
  private readonly counts = new Map<CensusKind, Map<string, number>>();

  record(language: string, kind: CensusKind): void {
    const into = this.counts.get(kind) ?? new Map<string, number>();
    into.set(language, (into.get(language) ?? 0) + 1);
    this.counts.set(kind, into);
  }

  report(kind: CensusKind): readonly TmxLanguageReport[] {
    return [...(this.counts.get(kind) ?? new Map<string, number>()).entries()]
      .map(([language, units]) => ({ language, units }))
      .sort((left, right) => left.language.localeCompare(right.language));
  }
}

interface TargetPick {
  readonly text: string;
  readonly exact: boolean;
  readonly conflicted: boolean;
}

function pickTarget(current: TargetPick | undefined, text: string, exact: boolean): TargetPick {
  if (current === undefined || (exact && !current.exact)) {
    return { text, exact, conflicted: false };
  }
  if (current.exact && !exact) {
    return current;
  }
  return current.text === text ? current : { ...current, conflicted: true };
}

type UnitPlan =
  | {
      readonly kind: "ok";
      readonly sourceText: string;
      readonly targets: ReadonlyMap<string, TargetPick>;
    }
  | { readonly kind: "no-source" }
  | { readonly kind: "conflicting-source"; readonly targets: ReadonlyMap<string, TargetPick> };

function planUnit(
  unit: TmxUnit,
  sourceLocale: string,
  configuredTargets: readonly string[],
  census: LanguageCensus,
): UnitPlan {
  const universe = [sourceLocale, ...configuredTargets];
  const targets = new Map<string, TargetPick>();
  let sourceText: string | undefined;
  let sourceSegments = 0;
  for (const segment of unit.segments) {
    const match = matchLanguageTag(segment.language, universe);
    if (match.kind !== "matched") {
      census.record(segment.language, match.kind);
      continue;
    }
    if (match.locale === sourceLocale) {
      sourceSegments += 1;
      sourceText = segment.text;
      continue;
    }
    targets.set(match.locale, pickTarget(targets.get(match.locale), segment.text, match.exact));
  }
  if (sourceSegments > 1) {
    return { kind: "conflicting-source", targets };
  }
  return sourceText === undefined ? { kind: "no-source" } : { kind: "ok", sourceText, targets };
}

type Decision = "duplicates" | "unchanged" | "kept" | "added" | "overwritten";

function decide(
  tally: LocaleTally,
  existing: string | undefined,
  hash: string,
  candidate: string,
  overwrite: boolean,
): Decision {
  if (tally.seenHashes.has(hash)) {
    return "duplicates";
  }
  tally.seenHashes.add(hash);
  if (existing === candidate) {
    return "unchanged";
  }
  if (existing === undefined) {
    return "added";
  }
  return overwrite ? "overwritten" : "kept";
}

interface ApplyContext {
  readonly memory: TranslationMemory;
  readonly fingerprint: string;
  readonly adapter: FormatAdapter;
  readonly overwrite: boolean;
}

const STAGED: ReadonlySet<Decision> = new Set<Decision>(["added", "overwritten"]);

function applyTranslation(
  ctx: ApplyContext,
  tally: LocaleTally,
  locale: string,
  sourceEntry: TranslationEntry,
  candidate: string,
): void {
  const gate = gateCandidateValue(sourceEntry, candidate, ctx.adapter);
  if (!gate.accepted) {
    tally.rejected[gate.reason] += 1;
    return;
  }
  const hash = contentHash(sourceEntry);
  const existing = ctx.memory.entries[ctx.fingerprint]?.[locale]?.[hash];
  const decision = decide(tally, existing, hash, candidate, ctx.overwrite);
  tally[decision] += 1;
  if (STAGED.has(decision)) {
    tally.additions[hash] = { contentHash: hash, value: candidate, source: sourceEntry.value };
  }
}

interface ScanTotals {
  readonly unmatchedSourceUnits: number;
  readonly conflictingSourceUnits: number;
  readonly markupStrippedUnits: number;
}

function importUnit(
  ctx: ApplyContext,
  plan: UnitPlan,
  tallies: ReadonlyMap<string, LocaleTally>,
  census: LanguageCensus,
): UnitPlan["kind"] {
  if (plan.kind === "no-source") {
    return plan.kind;
  }
  const refused = plan.kind === "conflicting-source";
  const blankSource = plan.kind === "ok" && plan.sourceText.trim() === "";
  const sourceEntry =
    plan.kind === "ok" && !blankSource ? sourceEntryFor(plan.sourceText, ctx.adapter) : undefined;
  for (const [locale, pick] of plan.targets) {
    const tally = tallies.get(locale);
    if (tally === undefined) {
      census.record(locale, "filtered");
    } else if (blankSource) {
      tally.rejected.sourceBlank += 1;
    } else if (!refused && pick.conflicted) {
      tally.conflicting += 1;
    } else if (sourceEntry !== undefined) {
      applyTranslation(ctx, tally, locale, sourceEntry, pick.text);
    }
  }
  return plan.kind;
}

function scanUnits(
  ctx: ApplyContext,
  units: readonly TmxUnit[],
  sourceLocale: string,
  configuredTargets: readonly string[],
  census: LanguageCensus,
  tallies: ReadonlyMap<string, LocaleTally>,
): ScanTotals {
  let unmatchedSourceUnits = 0;
  let conflictingSourceUnits = 0;
  let markupStrippedUnits = 0;
  for (const unit of units) {
    if (unit.markupStripped) {
      markupStrippedUnits += 1;
    }
    const outcome = importUnit(
      ctx,
      planUnit(unit, sourceLocale, configuredTargets, census),
      tallies,
      census,
    );
    if (outcome === "no-source") {
      unmatchedSourceUnits += 1;
    }
    if (outcome === "conflicting-source") {
      conflictingSourceUnits += 1;
    }
  }
  return { unmatchedSourceUnits, conflictingSourceUnits, markupStrippedUnits };
}

const SOURCE_LANGUAGE_WILDCARD = "*all*";

function sourceLanguageMismatch(
  declared: string | undefined,
  config: VerbatraConfig,
): string | undefined {
  if (declared === undefined || declared.toLowerCase() === SOURCE_LANGUAGE_WILDCARD) {
    return undefined;
  }
  const match = matchLanguageTag(declared, [config.sourceLocale, ...config.targetLocales]);
  const matchesSource = match.kind === "matched" && match.locale === config.sourceLocale;
  return matchesSource ? undefined : declared;
}

function toLocaleResult(locale: string, tally: LocaleTally): ImportTmxLocaleResult {
  return {
    locale,
    added: tally.added,
    unchanged: tally.unchanged,
    overwritten: tally.overwritten,
    kept: tally.kept,
    duplicates: tally.duplicates,
    conflicting: tally.conflicting,
    rejected: { ...tally.rejected },
  };
}

function additionsByLocale(
  tallies: ReadonlyMap<string, LocaleTally>,
): Map<string, Record<string, CacheAddition>> {
  const byLocale = new Map<string, Record<string, CacheAddition>>();
  for (const [locale, tally] of tallies) {
    if (Object.keys(tally.additions).length > 0) {
      byLocale.set(locale, tally.additions);
    }
  }
  return byLocale;
}

/**
 * Reads a TMX translation memory into the project's own memory, so a team arriving with years of
 * accumulated translations does not start cold. It calls no provider and needs no API key: every
 * value comes from the file.
 *
 * Nothing from the file is trusted. The XML is parsed under the interchange package's hardening
 * (entity declarations refused, size and unit bounds enforced), a language tag is resolved to a
 * configured locale by an explicit rule rather than guessed at, and every candidate translation
 * must pass the same placeholder, ICU, degeneracy and emptiness gate that a provider's output and a
 * filled translator handoff already face before it is stored. A unit that fails is counted, never
 * written, so it can never later be served as a cache hit that was never validated.
 *
 * Units are stored under the project's current configuration fingerprint, the same key a real run
 * writes. That is deliberate: an imported memory is reused exactly when the configuration that
 * would consume it matches, and stops matching when the provider, model, tone or glossary changes,
 * which is the protection the fingerprint layer exists to give. Re-import after such a change.
 *
 * A collision is decided in favour of what the project already has: if the memory already holds a
 * different translation for the same source and locale, the imported one is refused and counted as
 * `kept` unless {@link ImportTmxInput.overwrite} is set. Importing the same file twice therefore
 * changes nothing the second time, and writes no file at all.
 *
 * One consequence is worth stating plainly, because no import-time check can police it. An accepted
 * unit's source text is written into the memory's source index, which is the same index fuzzy reuse
 * scores a changed string against. An imported source that DIFFERS from a string in the project can
 * therefore be served for that string by fuzzy reuse, which is what resemblance means.
 *
 * An imported source that is identical to a project string but hashes differently is not reachable
 * at all. Fuzzy reuse discards any candidate whose normalized source equals the query, so a project
 * entry that carries a description, a meaning, or a plural flag the unit cannot carry falls through
 * to the provider rather than being served: the hashes differ, and the identical text disqualifies
 * the fuzzy candidate.
 *
 * A fuzzy reuse is still held to the integrity gate against the real entry and is reported as a
 * `FUZZY_CACHE_REUSE` review flag on the run summary, so it is visible rather than silent. A project
 * that does not want an imported memory reachable that way should leave `fuzzyCache` out of its
 * config.
 *
 * @param input - The config, the file path, and the dry-run, overwrite and locale-subset switches.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns What was read, what was stored, and everything that was skipped or refused.
 *
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: a requested locale is not a configured target locale.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: no file exists at the given path.
 * @throws {@link SdkError} `SOURCE_INVALID`: the file is oversized, malformed, not a TMX document,
 * or declares an XML entity.
 *
 * @example
 * ```ts
 * const result = await importTmx({ config, file: "legacy-memory.tmx" });
 * for (const locale of result.locales) {
 *   console.log(`${locale.locale}: ${locale.added} added, ${locale.kept} kept`);
 * }
 * ```
 */
export async function importTmx(
  input: ImportTmxInput,
  deps: ImportTmxDeps = {},
): Promise<ImportTmxResult> {
  const cwd = input.cwd ?? process.cwd();
  const fs = deps.fs ?? defaultFs;
  const adapter = selectAdapter(input.config.format, deps.adapterRegistry, deps.fs);
  assertDistinctLocales(input.config.sourceLocale, input.config.targetLocales);
  const locales = selectLocales(input.config, input.locales);
  const file = resolve(cwd, input.file);
  const document = parse(await readTmxText(file, fs), file);

  const { memory, writable } = await readTranslationMemory(cacheFilePath(cwd), fs);
  const fingerprint = computeFingerprint(input.config);
  const ctx: ApplyContext = { memory, fingerprint, adapter, overwrite: input.overwrite ?? false };
  const census = new LanguageCensus();
  const tallies = new Map<string, LocaleTally>(locales.map((locale) => [locale, emptyTally()]));

  const totals = scanUnits(
    ctx,
    document.units,
    input.config.sourceLocale,
    input.config.targetLocales,
    census,
    tallies,
  );

  const dryRun = input.dryRun ?? false;
  const byLocale = additionsByLocale(tallies);
  if (!dryRun && writable && byLocale.size > 0) {
    await writeTranslationMemory(
      cacheFilePath(cwd),
      applyAdditions(memory, fingerprint, byLocale),
      fs,
    );
  }

  return {
    dryRun,
    file,
    sourceLanguage: document.sourceLanguage,
    sourceLanguageMismatch: sourceLanguageMismatch(document.sourceLanguage, input.config),
    units: document.units.length,
    locales: locales.map((locale) => toLocaleResult(locale, tallies.get(locale) ?? emptyTally())),
    skippedUnits: document.skipped.length,
    unreachableUnits: document.unreachableUnits,
    unmatchedSourceUnits: totals.unmatchedSourceUnits,
    conflictingSourceUnits: totals.conflictingSourceUnits,
    markupStrippedUnits: totals.markupStrippedUnits,
    unmatchedLanguages: census.report("unmatched"),
    ambiguousLanguages: census.report("ambiguous"),
    notImported: census.report("filtered"),
    memoryWritable: writable,
  };
}
