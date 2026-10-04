import { dirname, resolve } from "node:path";
import {
  type BuildTmxInput,
  buildTmx,
  removedCharacterCount,
  type TmxExportUnit,
  type TmxTranslation,
} from "@verbatra/exchange";
import { type FingerprintFor, fingerprintsFor } from "../../cache/fingerprint.js";
import type { TranslationMemory } from "../../cache/types.js";
import type { VerbatraConfig } from "../../config/schema.js";
import { SdkError } from "../../errors.js";
import { defaultFs, type SdkFs } from "../../fs.js";
import { createLocalePathResolver } from "../../locale-path/resolver.js";
import type { ProvenanceMarkers } from "../../lock/key-provenance.js";
import { readCarriedOverMemory } from "../locale-carry-over.js";
import {
  createOutputPathGuard,
  namesNoFile,
  outputRefusalReason,
  type ReservedPath,
  reservedProjectPaths,
} from "../reserved-output.js";
import { selectLocales } from "../select-locales.js";
import { unwritableFileMessage } from "../write-target.js";
import { assertDistinctLocales } from "./locale-match.js";
import { readTmxOriginLookup, type TmxOriginLookup } from "./tmx-origin.js";

/** Default output path for a TMX export, used when {@link ExportTmxInput.out} is omitted. */
export const DEFAULT_TMX_PATH = "verbatra-memory.tmx";

/**
 * How many target segments one locale contributed to the exported file. A `tu` element carries one
 * segment per locale that translated its source string, so these counts add up to more than
 * {@link ExportTmxResult.units} whenever a source string is translated into several locales.
 */
export interface ExportTmxLocaleCount {
  /** The configured target locale. */
  readonly locale: string;
  /** How many of its memory entries were written, one target segment each. */
  readonly units: number;
}

/** What {@link exportTmx} wrote. */
export interface ExportTmxResult {
  /** The resolved path the file was written to. */
  readonly path: string;
  /** How many `tu` elements the file holds, one per distinct source string. */
  readonly units: number;
  /** Per-locale target segment counts, not a breakdown of `units`. */
  readonly locales: readonly ExportTmxLocaleCount[];
  /**
   * Translations left out because the memory holds no source text for their content hash, counted
   * once per locale and hash rather than once per distinct source string. A cache carried forward
   * from an older schema stores translations without their source, and TMX cannot represent a unit
   * with no source segment. Those entries fill in as later runs touch the same strings.
   */
  readonly withoutSource: number;
  /**
   * Characters removed from segment text because XML 1.0 cannot represent them at all, such as a
   * control character, a lone surrogate or a noncharacter, counted across every written segment.
   * Writing them would produce a file no conformant parser accepts, so they are left out and counted
   * rather than dropped silently.
   */
  readonly illegalCharactersRemoved: number;
  /**
   * Whether each target segment carries its `x-origin` property (and `x-review` next to
   * `x-origin="machine"`): `written` when it does, `unavailable` when `verbatra.provenance.json` or
   * `verbatra.lock.json` could not be read, in which case no segment carries one.
   */
  readonly provenanceMarkers: ProvenanceMarkers;
}

/** Input for {@link exportTmx}. */
export interface ExportTmxInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /**
   * Where to write the file. Defaults to {@link DEFAULT_TMX_PATH}, resolved against `cwd`. Refused
   * with `TMX_OUTPUT_CONFLICT`, before anything is read or written, when it names no file, resolves
   * outside `cwd` or to `cwd` itself, or names a configured locale file, the lock file, the
   * translation-memory cache, a file verbatra searches for its configuration, the
   * {@link ExportTmxInput.configPath} file, or the {@link ExportTmxInput.glossaryPath} file. Names
   * are compared case-insensitively, and, when the file-system port implements `realpath`, again
   * after symbolic links are resolved, so a link cannot carry the file anywhere a plain path could
   * not.
   */
  readonly out?: string;
  /**
   * The configuration file `config` was loaded from, absolute or relative to `cwd`. It is refused
   * as the output path even when its name is not one verbatra searches for.
   */
  readonly configPath?: string;
  /**
   * The glossary file the config names, absolute or relative to `cwd`, normally the `path` of a
   * file-backed {@link LoadedConfig.glossary}. It is refused as the output path.
   */
  readonly glossaryPath?: string;
  /** Directory the output path and the memory are resolved against. Defaults to the process working directory. */
  readonly cwd?: string;
  /** Subset of configured target locales to export. Defaults to all of them. */
  readonly locales?: readonly string[];
  /** Value for the TMX header's `creationtoolversion`. Defaults to `unknown`. */
  readonly toolVersion?: string;
}

/** Injectable dependencies for {@link exportTmx}. Every field has a working default. */
export interface ExportTmxDeps {
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

interface Collecting {
  readonly source: string;
  readonly translations: TmxTranslation[];
}

function addTranslation(
  into: Map<string, Collecting>,
  hash: string,
  source: string,
  translation: TmxTranslation,
): void {
  const existing = into.get(hash);
  if (existing === undefined) {
    into.set(hash, { source, translations: [translation] });
    return;
  }
  existing.translations.push(translation);
}

interface Collected {
  readonly units: readonly TmxExportUnit[];
  readonly counts: readonly ExportTmxLocaleCount[];
  readonly withoutSource: number;
}

function collect(
  memory: TranslationMemory,
  fingerprintFor: FingerprintFor,
  locales: readonly string[],
  originOf: TmxOriginLookup | undefined,
): Collected {
  const byHash = new Map<string, Collecting>();
  const counts: ExportTmxLocaleCount[] = [];
  let withoutSource = 0;
  for (const locale of locales) {
    let kept = 0;
    for (const [hash, value] of Object.entries(
      memory.entries[fingerprintFor(locale)]?.[locale] ?? {},
    )) {
      const source = memory.sources[hash];
      if (source === undefined) {
        withoutSource += 1;
        continue;
      }
      addTranslation(byHash, hash, source, {
        language: locale,
        text: value,
        ...(originOf !== undefined ? { properties: originOf(locale, hash, value) } : {}),
      });
      kept += 1;
    }
    counts.push({ locale, units: kept });
  }
  const units: TmxExportUnit[] = [...byHash.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, unit]) => ({ source: unit.source, translations: unit.translations }));
  return { units, counts, withoutSource };
}

const OUTPUT_HINT = `Pass a path naming a file inside the working directory, or omit it to use ${DEFAULT_TMX_PATH}.`;

function refuseOutput(requested: string, why: string): never {
  throw new SdkError("TMX_OUTPUT_CONFLICT", `The output path "${requested}" ${why} ${OUTPUT_HINT}`);
}

async function resolveOutputPath(
  fs: SdkFs,
  cwd: string,
  out: string | undefined,
  reserved: ReadonlyMap<string, ReservedPath>,
): Promise<string> {
  const requested = out ?? DEFAULT_TMX_PATH;
  if (namesNoFile(requested)) {
    refuseOutput(requested, "names no file.");
  }
  const outputPath = resolve(cwd, requested);
  const refusal = await createOutputPathGuard(fs, cwd, reserved).refusal(outputPath);
  if (refusal !== undefined) {
    refuseOutput(requested, outputRefusalReason(refusal));
  }
  return outputPath;
}

async function writeTmxFile(fs: SdkFs, path: string, cwd: string, content: string): Promise<void> {
  try {
    await fs.mkdir?.(dirname(path));
    await fs.writeFile(path, content);
  } catch (error) {
    throw new SdkError("TMX_UNWRITABLE", unwritableFileMessage("the TMX file", path, cwd, error));
  }
}

/**
 * Writes the project's translation memory out as a TMX 1.4b file, the format every mainstream
 * translation platform can read. It calls no provider and needs no API key: every value comes from
 * the memory already on disk.
 *
 * Only entries stored under the project's current configuration fingerprint are written, which is
 * the same set a run would reuse, so the file describes the memory as it is actually being used
 * rather than every translation the project has ever produced. One `tu` element is written per
 * distinct source string, carrying the source segment and one target segment per exported locale.
 * An empty memory, including a missing, unparsable or newer-version cache file, produces a valid,
 * empty TMX file rather than an error. An existing file at the output path is replaced.
 *
 * Each target segment carries a `<prop type="x-origin">` naming where that text came from, read
 * from `verbatra.provenance.json`: `machine`, `human`, `import`, or `unknown` (see
 * {@link TmxOrigin}). A `machine` segment also carries `<prop type="x-review">` with `approved`,
 * `unreviewed`, or `rejected` (see {@link TmxReview}). A memory entry is not tied to one key, so
 * the origin comes from every key whose lock entry names the same source hash and whose record
 * describes exactly this text: any machine-class record makes it `machine`, and it counts as
 * `approved` only when every such machine-class record is approved. When the provenance file or
 * the lock file cannot be read, no segment carries a property and
 * {@link ExportTmxResult.provenanceMarkers} is `unavailable`; the export still succeeds.
 *
 * It reads the memory and writes a file; it never changes the memory, which is why the CLI refuses
 * `--dry-run` and `--overwrite` on this direction rather than accepting and ignoring them.
 *
 * @param input - The config, the output path, the config and glossary paths to protect, the locale
 * subset, and the tool version to stamp.
 * @param deps - Optional file-system override.
 * @returns The path written, the unit count, and what was left out.
 *
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: a requested locale is not a configured target locale.
 * @throws {@link SdkError} `CONFIG_INVALID`: the source locale and one of the target locales are the
 * same language tag once case and separators are normalized. Writing that file would produce two
 * language attributes {@link importTmx} could not tell apart, so the file this project exported
 * would be one it refuses to read back.
 * @throws {@link SdkError} `TMX_OUTPUT_CONFLICT`: the output path is refused (see
 * {@link ExportTmxInput.out} for the full set), before the memory is read or anything is written.
 * @throws {@link SdkError} `TMX_UNWRITABLE`: the output directory could not be created or the file
 * could not be written, because the directory is not writable, a directory already sits at that
 * path, or the disk is out of space. The message names the file relative to `cwd` and the
 * underlying file-system code.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, so the locale files the output path must not name cannot be located.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 *
 * @example
 * ```ts
 * const result = await exportTmx({ config, out: "memory.tmx" });
 * console.log(`${result.units} units written to ${result.path}`);
 * ```
 */
export async function exportTmx(
  input: ExportTmxInput,
  deps: ExportTmxDeps = {},
): Promise<ExportTmxResult> {
  const cwd = input.cwd ?? process.cwd();
  const fs = deps.fs ?? defaultFs;
  assertDistinctLocales(input.config.sourceLocale, input.config.targetLocales);
  const locales = selectLocales(input.config, input.locales);
  const reserved = reservedProjectPaths({
    cwd,
    config: input.config,
    resolver: createLocalePathResolver(cwd, input.config),
    ...(input.configPath !== undefined ? { configPath: input.configPath } : {}),
    ...(input.glossaryPath !== undefined ? { glossaryPath: input.glossaryPath } : {}),
  });
  const path = await resolveOutputPath(fs, cwd, input.out, reserved);
  const { memory } = await readCarriedOverMemory(cwd, fs, locales);
  const originOf = await readTmxOriginLookup(cwd, fs, locales);
  const collected = collect(memory, fingerprintsFor(input.config), locales, originOf);
  const build: BuildTmxInput = {
    sourceLanguage: input.config.sourceLocale,
    units: collected.units,
    ...(input.toolVersion !== undefined ? { toolVersion: input.toolVersion } : {}),
  };
  await writeTmxFile(fs, path, cwd, buildTmx(build));
  return {
    path,
    units: collected.units.length,
    locales: collected.counts,
    withoutSource: collected.withoutSource,
    illegalCharactersRemoved: removedCharacterCount(build),
    provenanceMarkers: originOf === undefined ? "unavailable" : "written",
  };
}
