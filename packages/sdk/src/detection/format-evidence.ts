import { join } from "node:path";
import type { FormatId, SupportedFormat } from "@verbatra/core";
import type { AdapterRegistry, AdapterResolution, ResolveOptions } from "@verbatra/format-adapters";
import type { SdkFs } from "../fs.js";

export const MAX_SAMPLED_FILES = 20;

export const MAX_SAMPLE_BYTES = 2 * 1024 * 1024;

const MAX_MANIFEST_BYTES = 1024 * 1024;

const FORMAT_BY_DEPENDENCY: ReadonlyArray<readonly [string, SupportedFormat]> = [
  ["i18next", "i18next-json"],
  ["vue-i18n", "vue-i18n-json"],
  ["next-intl", "next-intl-json"],
  ["@ngx-translate/core", "ngx-translate-json"],
];

export interface DependencyEvidence {
  readonly dependency: string;
  readonly format: SupportedFormat;
}

function dependencyNames(manifest: unknown): ReadonlySet<string> {
  if (typeof manifest !== "object" || manifest === null) {
    return new Set();
  }
  const { dependencies, devDependencies } = manifest as {
    dependencies?: unknown;
    devDependencies?: unknown;
  };
  const names = [dependencies, devDependencies].flatMap((block) =>
    typeof block === "object" && block !== null ? Object.keys(block) : [],
  );
  return new Set(names);
}

function parseManifest(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

export async function readDependencyEvidence(
  cwd: string,
  fs: SdkFs,
): Promise<readonly DependencyEvidence[]> {
  const content = await readTextSafely(join(cwd, "package.json"), fs, MAX_MANIFEST_BYTES);
  if (content === undefined) {
    return [];
  }
  const names = dependencyNames(parseManifest(content));
  return FORMAT_BY_DEPENDENCY.filter(([dependency]) => names.has(dependency)).map(
    ([dependency, format]) => ({ dependency, format }),
  );
}

export function safeResolve(
  registry: AdapterRegistry,
  path: string,
  options: ResolveOptions = {},
): AdapterResolution | undefined {
  try {
    return registry.resolve(path, options);
  } catch {
    return undefined;
  }
}

export async function readTextSafely(
  path: string,
  fs: SdkFs,
  maxBytes: number,
): Promise<string | undefined> {
  try {
    const read = await fs.readFileBounded(path, maxBytes);
    return read.kind === "ok" ? read.content : undefined;
  } catch {
    return undefined;
  }
}

function claimedFormats(registry: AdapterRegistry, path: string, sample?: string): FormatId[] {
  const resolution = safeResolve(registry, path, sample === undefined ? {} : { sample });
  if (resolution === undefined) {
    return [];
  }
  if (resolution.status === "resolved") {
    return [resolution.adapter.format];
  }
  return resolution.status === "ambiguous" ? [...resolution.candidates] : [];
}

export async function formatsClaimingEveryFile(
  cwd: string,
  files: readonly string[],
  registry: AdapterRegistry,
  fs: SdkFs,
): Promise<readonly FormatId[]> {
  let common: FormatId[] | undefined;
  for (const file of files.slice(0, MAX_SAMPLED_FILES)) {
    const path = join(cwd, file);
    const claimed = claimedFormats(
      registry,
      path,
      await readTextSafely(path, fs, MAX_SAMPLE_BYTES),
    );
    common = common === undefined ? claimed : common.filter((format) => claimed.includes(format));
  }
  return common ?? [];
}
