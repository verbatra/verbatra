import { join } from "node:path";
import type { FormatId } from "@verbatra/core";
import { type AdapterRegistry, createDefaultRegistry } from "@verbatra/format-adapters";
import { defaultFs, type SdkFs } from "../fs.js";
import { isSharedCatalogueFormat } from "../locale-path/shared-catalogue-format.js";
import type { LocaleStyle } from "../locale-path/style.js";
import { toAdapterFs } from "../selection/adapter-fs.js";
import { readCatalogueLocales } from "./catalogue-locales.js";
import {
  formatsClaimingEveryFile,
  MAX_SAMPLED_FILES,
  readDependencyEvidence,
  safeResolve,
} from "./format-evidence.js";
import {
  buildLayoutGroups,
  type ConsistentLayout,
  chooseLayout,
  groupForPattern,
  type IsSharedCatalogueFile,
  type LayoutChoice,
  localeStyleOf,
} from "./layout-candidates.js";
import { MAX_SCAN_DEPTH, MAX_SCAN_ENTRIES, scanLocaleFiles } from "./locale-file-scan.js";

/**
 * How far a {@link ProjectDetection} can be trusted. `high` means the files alone decided it,
 * `medium` that a tie-break or a convention filled a gap, and `low` that no locale file backed it.
 */
export type DetectionConfidence = "high" | "medium" | "low";

/**
 * Where a detected format came from: the caller's own `format` input, the locale files themselves
 * (exactly one adapter reads all of them), or the project's `package.json` dependencies.
 */
export type DetectedFormatSource = "input" | "files" | "dependencies";

/** The format a {@link ProjectDetection} settled on, and what decided it. */
export interface DetectedFormat {
  /** The format identifier, ready for a config's `format` key. */
  readonly id: FormatId;
  /** What decided the format. */
  readonly from: DetectedFormatSource;
}

/** The locale file layout a {@link ProjectDetection} found. */
export interface DetectedLocaleLayout {
  /**
   * The file pattern with its `{locale}` token, relative to the scanned directory and written with
   * forward slashes, ready for a config's `files.pattern`.
   */
  readonly pattern: string;
  /** How the files spell their locales, ready for a config's `files.localeStyle`. */
  readonly localeStyle: LocaleStyle;
  /**
   * Every locale a file was found for, as a BCP 47 code and sorted. Under the `android` style the
   * unqualified `values` directory adds none, since its name spells no locale.
   */
  readonly locales: readonly string[];
  /**
   * The source locale: the `sourceLocale` input when given, otherwise the catalogue's own source
   * language for a shared catalogue, otherwise `en` or the single `en-*` locale when one was found,
   * otherwise the only locale found. Absent when none of those applies.
   */
  readonly sourceLocale: string | undefined;
  /** The matching files, relative to the scanned directory, sorted. */
  readonly files: readonly string[];
}

/** A question detection could not answer on its own, with the answers it found. */
export interface DetectionAmbiguity {
  /** `format` when several formats fit the files, `layout` when several file patterns tie. */
  readonly subject: "format" | "layout";
  /** The competing format identifiers or file patterns. Name one of them explicitly to resolve it. */
  readonly candidates: readonly string[];
}

/** What {@link detectProject} found about a project's locale files. */
export interface ProjectDetection {
  /** The format, or absent when none was found or several fit (see `ambiguities`). */
  readonly format: DetectedFormat | undefined;
  /** The file layout, or absent when no locale file was found or several patterns tie. */
  readonly layout: DetectedLocaleLayout | undefined;
  /** Every question that has several answers. Empty when detection was unambiguous. */
  readonly ambiguities: readonly DetectionAmbiguity[];
  /** How far the result can be trusted, or `none` when nothing was detected. */
  readonly confidence: DetectionConfidence | "none";
  /** One readable sentence per decision or doubt, in the order they arose. */
  readonly reasons: readonly string[];
}

/** Input for {@link detectProject}. Every field narrows the search; none is required. */
export interface DetectProjectInput {
  /** The directory to scan. Defaults to the process working directory. */
  readonly cwd?: string;
  /** A format already chosen. Only files this format's adapter claims are considered. */
  readonly format?: FormatId;
  /**
   * A file pattern already chosen, containing the `{locale}` token. Only files matching it are
   * considered, and no other layout is searched for.
   */
  readonly pattern?: string;
  /** A source locale already chosen. It is reported as the layout's source locale unchanged. */
  readonly sourceLocale?: string;
}

/** Injectable dependencies for {@link detectProject}. Every field has a working default. */
export interface DetectProjectDeps {
  /**
   * File-system port. Defaults to the real file system. Scanning needs its `readDirectory`; one that
   * implements none makes detection fall back to `package.json` alone.
   */
  readonly fs?: SdkFs;
  /**
   * Format-adapter registry whose `canHandle` decides which files are locale files and which format
   * reads them. Defaults to the built-in registry.
   */
  readonly adapterRegistry?: AdapterRegistry;
}

const CONFIDENCE_ORDER: readonly DetectionConfidence[] = ["high", "medium", "low"];

class Findings {
  readonly reasons: string[] = [];
  readonly ambiguities: DetectionAmbiguity[] = [];
  private level = 0;

  note(reason: string): void {
    this.reasons.push(reason);
  }

  doubt(confidence: DetectionConfidence, reason: string): void {
    this.level = Math.max(this.level, CONFIDENCE_ORDER.indexOf(confidence));
    this.reasons.push(reason);
  }

  ambiguous(subject: DetectionAmbiguity["subject"], candidates: readonly string[]): void {
    this.ambiguities.push({ subject, candidates });
  }

  get confidence(): DetectionConfidence {
    return CONFIDENCE_ORDER[this.level] ?? "low";
  }
}

interface ScanContext {
  readonly cwd: string;
  readonly fs: SdkFs;
  readonly registry: AdapterRegistry;
  readonly input: DetectProjectInput;
  readonly findings: Findings;
}

function list(values: readonly string[]): string {
  return values.join(", ");
}

function sharedCataloguePredicate(context: ScanContext): IsSharedCatalogueFile {
  const format = context.input.format;
  if (format !== undefined) {
    return () => isSharedCatalogueFormat(format);
  }
  return (file) => {
    const resolution = safeResolve(context.registry, file);
    return resolution?.status === "resolved" && isSharedCatalogueFormat(resolution.adapter.format);
  };
}

function fitsFormat(registry: AdapterRegistry, file: string, format: FormatId): boolean {
  const resolution = safeResolve(registry, file, { format });
  if (resolution?.status !== "resolved") {
    return false;
  }
  try {
    return resolution.adapter.canHandle(file);
  } catch {
    return false;
  }
}

async function candidateFiles(context: ScanContext): Promise<readonly string[]> {
  const scan = await scanLocaleFiles(context.cwd, context.fs, context.registry);
  if (scan === undefined) {
    context.findings.doubt(
      "low",
      "The file system lists no directories, so no locale file was looked for.",
    );
    return [];
  }
  if (scan.truncated) {
    context.findings.doubt(
      "medium",
      `The scan stopped at ${MAX_SCAN_ENTRIES} entries or ${MAX_SCAN_DEPTH} directory levels, so a locale file further in was not seen.`,
    );
  }
  const format = context.input.format;
  return format === undefined
    ? scan.files
    : scan.files.filter((file) => fitsFormat(context.registry, file, format));
}

function layoutForPattern(
  pattern: string,
  files: readonly string[],
  context: ScanContext,
): LayoutChoice {
  const group = groupForPattern(pattern, files, sharedCataloguePredicate(context));
  if (group.members.size === 0) {
    context.findings.note(`No locale file matches the pattern ${group.pattern}.`);
    return { kind: "none" };
  }
  const localeStyle = localeStyleOf(group);
  if (localeStyle === undefined) {
    context.findings.note(
      `The files matching ${group.pattern} spell their locales in more than one way.`,
    );
    return { kind: "none" };
  }
  return { kind: "found", layout: { group, localeStyle } };
}

function chooseLayoutFor(files: readonly string[], context: ScanContext): LayoutChoice {
  const pattern = context.input.pattern;
  if (pattern !== undefined) {
    return layoutForPattern(pattern, files, context);
  }
  const choice = chooseLayout(buildLayoutGroups(files, sharedCataloguePredicate(context)));
  if (choice.kind === "ambiguous") {
    context.findings.note(
      `Several file patterns fit equally well (${list(choice.candidates)}); verbatra reads one pattern per config.`,
    );
    context.findings.ambiguous("layout", choice.candidates);
  } else if (choice.kind === "none") {
    context.findings.note("No locale file was found.");
  }
  return choice;
}

async function formatFromDependencies(
  context: ScanContext,
  among: readonly FormatId[] | undefined,
): Promise<readonly FormatId[]> {
  const evidence = await readDependencyEvidence(context.cwd, context.fs);
  const fitting = evidence.filter(({ format }) => among === undefined || among.includes(format));
  if (fitting.length === 1 && fitting[0] !== undefined) {
    const { dependency, format } = fitting[0];
    context.findings.doubt(
      among === undefined ? "low" : "medium",
      `Chose ${format} because package.json depends on ${dependency}.`,
    );
  }
  return fitting.map(({ format }) => format);
}

async function formatWithoutFiles(context: ScanContext): Promise<DetectedFormat | undefined> {
  const formats = await formatFromDependencies(context, undefined);
  const [only] = formats;
  if (formats.length === 1 && only !== undefined) {
    return { id: only, from: "dependencies" };
  }
  if (formats.length > 1) {
    context.findings.note(`package.json depends on several i18n libraries (${list(formats)}).`);
    context.findings.ambiguous("format", formats);
  }
  return undefined;
}

async function formatForFiles(
  files: readonly string[],
  context: ScanContext,
): Promise<DetectedFormat | undefined> {
  const claimed = await formatsClaimingEveryFile(context.cwd, files, context.registry, context.fs);
  const [only] = claimed;
  if (claimed.length === 1 && only !== undefined) {
    const sampled = files.length > MAX_SAMPLED_FILES ? ` (the first ${MAX_SAMPLED_FILES})` : "";
    context.findings.note(`Only the ${only} adapter reads every locale file found${sampled}.`);
    return { id: only, from: "files" };
  }
  if (claimed.length === 0) {
    context.findings.note("No single adapter reads every locale file found.");
    return formatWithoutFiles(context);
  }
  context.findings.note(`Several adapters read these files (${list(claimed)}).`);
  const fromDependencies = await formatFromDependencies(context, claimed);
  const [chosen] = fromDependencies;
  if (fromDependencies.length === 1 && chosen !== undefined) {
    return { id: chosen, from: "dependencies" };
  }
  context.findings.ambiguous("format", claimed);
  return undefined;
}

function isEnglish(locale: string): boolean {
  return locale === "en" || locale.startsWith("en-");
}

function inferSourceLocale(
  locales: readonly string[],
  hasUnspelledSource: boolean,
  findings: Findings,
): string | undefined {
  if (hasUnspelledSource) {
    findings.note("The unqualified values directory holds the source locale but names none.");
    return undefined;
  }
  const english = locales.includes("en") ? ["en"] : locales.filter(isEnglish);
  const [onlyEnglish] = english;
  if (english.length === 1 && onlyEnglish !== undefined) {
    findings.doubt("medium", `Took ${onlyEnglish} as the source locale, by convention.`);
    return onlyEnglish;
  }
  const [onlyLocale] = locales;
  if (locales.length === 1 && onlyLocale !== undefined) {
    findings.doubt("medium", `Took ${onlyLocale}, the only locale found, as the source locale.`);
    return onlyLocale;
  }
  findings.note("Could not tell which locale is the source.");
  return undefined;
}

interface LocaleEvidence {
  readonly locales: readonly string[];
  readonly catalogueSource: string | undefined;
  readonly hasUnspelledSource: boolean;
}

async function localeEvidence(
  layout: ConsistentLayout,
  files: readonly string[],
  context: ScanContext,
): Promise<LocaleEvidence> {
  const [catalogue] = files;
  if (layout.group.sharedCatalogue && catalogue !== undefined) {
    const read = await readCatalogueLocales(join(context.cwd, catalogue), context.fs);
    return { locales: read.locales, catalogueSource: read.sourceLocale, hasUnspelledSource: false };
  }
  const spelled = [...layout.group.members.values()];
  const locales = spelled.flatMap((entry) => (entry.locale === undefined ? [] : [entry.locale]));
  return {
    locales: [...new Set(locales)].sort(),
    catalogueSource: undefined,
    hasUnspelledSource: spelled.some((entry) => entry.kind === "android-source"),
  };
}

async function describeLayout(
  layout: ConsistentLayout,
  context: ScanContext,
): Promise<DetectedLocaleLayout> {
  const files = [...layout.group.members.keys()].sort();
  const evidence = await localeEvidence(layout, files, context);
  const count = evidence.locales.length;
  context.findings.note(
    `Found ${count} locale${count === 1 ? "" : "s"} matching ${layout.group.pattern}.`,
  );
  if (count < 2 && !evidence.hasUnspelledSource) {
    context.findings.doubt("medium", "Only one locale file backs the pattern.");
  }
  const sourceLocale =
    context.input.sourceLocale ??
    evidence.catalogueSource ??
    inferSourceLocale(evidence.locales, evidence.hasUnspelledSource, context.findings);
  return {
    pattern: layout.group.pattern,
    localeStyle: layout.localeStyle,
    locales: evidence.locales,
    sourceLocale,
    files,
  };
}

async function resolveFormat(
  choice: LayoutChoice,
  context: ScanContext,
): Promise<DetectedFormat | undefined> {
  const format = context.input.format;
  if (format !== undefined) {
    return { id: format, from: "input" };
  }
  if (choice.kind === "found") {
    return formatForFiles([...choice.layout.group.members.keys()].sort(), context);
  }
  return formatWithoutFiles(context);
}

function overallConfidence(
  format: DetectedFormat | undefined,
  layout: DetectedLocaleLayout | undefined,
  findings: Findings,
): DetectionConfidence | "none" {
  const detectedFormat = format !== undefined && format.from !== "input";
  if (layout === undefined && !detectedFormat) {
    return "none";
  }
  if (layout === undefined) {
    findings.doubt("low", "No locale file backs the format.");
  }
  if (findings.ambiguities.length > 0) {
    findings.doubt("medium", "Some of the answers need a choice between candidates.");
  }
  return findings.confidence;
}

/**
 * Detects a project's locale file format and layout by looking at its files, the way a project
 * generator needs to before writing a first config. It writes nothing and calls no provider.
 *
 * It walks the directory (skipping hidden directories, `node_modules`, and common build output, to
 * a bounded depth and entry count) for files some registered adapter claims by extension, finds
 * the path segment that spells a locale in each (a file name such as `de.json`, `messages_pt_BR.po`
 * or `app_en.arb`, a directory such as `locales/de/`, `de.lproj/`, or Android's `values-de/`), and
 * keeps the file pattern that covers the most locales. A tie between patterns is reported as a
 * `layout` ambiguity rather than guessed. The format is the one whose adapter `canHandle` claims
 * every matched file given its content; when several do, as every JSON adapter does for `.json`,
 * a single matching i18n library in `package.json` decides, and otherwise it is reported as a
 * `format` ambiguity listing the candidates. With no locale file at all, the `package.json`
 * dependencies alone decide the format, at `low` confidence.
 *
 * A single-file layout is only accepted when its path looks like a locale directory (such as
 * `locales/`, `i18n/`, `lang/`, or `res/`) or its extension is translation-only (such as `.po` or
 * `.xlf`), so that an unrelated directory such as `src/`, which is also the code for Sardinian, is
 * not mistaken for a locale.
 *
 * @param input - Choices already made, which narrow the search.
 * @param deps - Optional file-system and adapter-registry overrides.
 * @returns What was found, with its confidence, every ambiguity, and the reasons. Detection never
 *   throws for a missing, unreadable, or malformed file; it reports less instead.
 */
export async function detectProject(
  input: DetectProjectInput = {},
  deps: DetectProjectDeps = {},
): Promise<ProjectDetection> {
  const fs = deps.fs ?? defaultFs;
  const context: ScanContext = {
    cwd: input.cwd ?? process.cwd(),
    fs,
    registry: deps.adapterRegistry ?? createDefaultRegistry(toAdapterFs(fs)),
    input,
    findings: new Findings(),
  };
  const files = await candidateFiles(context);
  const choice = chooseLayoutFor(files, context);
  const format = await resolveFormat(choice, context);
  const layout = choice.kind === "found" ? await describeLayout(choice.layout, context) : undefined;
  const confidence = overallConfidence(format, layout, context.findings);
  return {
    format,
    layout,
    ambiguities: context.findings.ambiguities,
    confidence,
    reasons: context.findings.reasons,
  };
}
