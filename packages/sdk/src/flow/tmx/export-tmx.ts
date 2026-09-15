import { dirname, resolve } from "node:path";
import { buildTmx, type TmxExportUnit, type TmxTranslation } from "@verbatra/exchange";
import { computeFingerprint } from "../../cache/fingerprint.js";
import { cacheFilePath, readTranslationMemory } from "../../cache/translation-memory.js";
import type { TranslationMemory } from "../../cache/types.js";
import type { VerbatraConfig } from "../../config/schema.js";
import { defaultFs, type SdkFs } from "../../fs.js";
import { selectLocales } from "../select-locales.js";

/** Default output path for a TMX export, used when {@link ExportTmxInput.out} is omitted. */
export const DEFAULT_TMX_PATH = "verbatra-memory.tmx";

/** How many translation units one locale contributed to the exported file. */
export interface ExportTmxLocaleCount {
  /** The configured target locale. */
  readonly locale: string;
  /** How many of its memory entries were written. */
  readonly units: number;
}

/** What {@link exportTmx} wrote. */
export interface ExportTmxResult {
  /** The resolved path the file was written to. */
  readonly path: string;
  /** How many `tu` elements the file holds, one per distinct source string. */
  readonly units: number;
  /** Per-locale contribution to that total. */
  readonly locales: readonly ExportTmxLocaleCount[];
  /**
   * Memory entries left out because the memory holds no source text for them. A cache carried
   * forward from an older schema stores translations without their source, and TMX cannot represent
   * a unit with no source segment. Those entries fill in as later runs touch the same strings.
   */
  readonly withoutSource: number;
}

/** Input for {@link exportTmx}. */
export interface ExportTmxInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Where to write the file. Defaults to {@link DEFAULT_TMX_PATH}, resolved against `cwd`. */
  readonly out?: string;
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

interface Collected {
  readonly units: readonly TmxExportUnit[];
  readonly counts: readonly ExportTmxLocaleCount[];
  readonly withoutSource: number;
}

function collect(
  memory: TranslationMemory,
  fingerprint: string,
  locales: readonly string[],
): Collected {
  const byHash = new Map<string, TmxExportUnit>();
  const counts: ExportTmxLocaleCount[] = [];
  let withoutSource = 0;
  for (const locale of locales) {
    let kept = 0;
    for (const [hash, value] of Object.entries(memory.entries[fingerprint]?.[locale] ?? {})) {
      const source = memory.sources[hash];
      if (source === undefined) {
        withoutSource += 1;
        continue;
      }
      const unit = byHash.get(hash) ?? { source, translations: [] as TmxTranslation[] };
      (unit.translations as TmxTranslation[]).push({ language: locale, text: value });
      byHash.set(hash, unit);
      kept += 1;
    }
    counts.push({ locale, units: kept });
  }
  const units = [...byHash.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, unit]) => unit);
  return { units, counts, withoutSource };
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
 * An empty memory produces a valid, empty TMX file rather than an error.
 *
 * @param input - The config, the output path, the locale subset, and the tool version to stamp.
 * @param deps - Optional file-system override.
 * @returns The path written, the unit count, and what was left out.
 *
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: a requested locale is not a configured target locale.
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
  const locales = selectLocales(input.config, input.locales);
  const { memory } = await readTranslationMemory(cacheFilePath(cwd), fs);
  const collected = collect(memory, computeFingerprint(input.config), locales);
  const path = resolve(cwd, input.out ?? DEFAULT_TMX_PATH);
  await fs.mkdir?.(dirname(path));
  await fs.writeFile(
    path,
    buildTmx({
      sourceLanguage: input.config.sourceLocale,
      units: collected.units,
      ...(input.toolVersion !== undefined ? { toolVersion: input.toolVersion } : {}),
    }),
  );
  return {
    path,
    units: collected.units.length,
    locales: collected.counts,
    withoutSource: collected.withoutSource,
  };
}
