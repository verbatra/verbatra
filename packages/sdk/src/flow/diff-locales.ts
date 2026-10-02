import { type DiffResult, diffResources, type LocaleResource } from "@verbatra/core";
import type { AdapterRegistry, FormatAdapter } from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { baselineFor } from "../lock/lock-file.js";
import type { ProvenanceRecord } from "../lock/provenance-file.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { readCarriedOverState } from "./locale-carry-over.js";
import { readTargetResource } from "./read-target.js";
import { selectLocales } from "./select-locales.js";
import { readSourceResource } from "./source.js";

export interface LocaleDiffResult {
  readonly locale: string;
  readonly diff: DiffResult;
  readonly source: LocaleResource;
  readonly target: LocaleResource;
  readonly baseline: ReadonlyMap<string, string>;
  readonly provenance: ReadonlyMap<string, ProvenanceRecord> | undefined;
}

export interface DiffLocalesInput {
  readonly config: VerbatraConfig;
  readonly cwd?: string;
  readonly locales?: readonly string[];
}

export interface DiffLocalesDeps {
  readonly adapterRegistry?: AdapterRegistry;
  readonly fs?: SdkFs;
}

export async function readTarget(
  cwd: string,
  config: VerbatraConfig,
  adapter: FormatAdapter,
  fs: SdkFs,
  locale: string,
): Promise<LocaleResource> {
  return readTargetResource({
    resolver: createLocalePathResolver(cwd, config),
    format: config.format,
    locale,
    adapter,
    fs,
  });
}

export interface LocaleDiffsWithSource {
  readonly source: LocaleResource;
  readonly sourceInvalidIcuKeys: readonly string[];
  readonly adapter: FormatAdapter;
  readonly results: readonly LocaleDiffResult[];
}

export async function diffLocalesWithSource(
  input: DiffLocalesInput,
  deps: DiffLocalesDeps = {},
): Promise<LocaleDiffsWithSource> {
  const config = input.config;
  const cwd = input.cwd ?? process.cwd();
  const fs = deps.fs ?? defaultFs;
  const adapter = selectAdapter(config.format, deps.adapterRegistry, deps.fs);
  const resolver = createLocalePathResolver(cwd, config);

  const source = await readSourceResource(config, resolver, fs, adapter);
  const locales = selectLocales(config, input.locales);
  const { lock, provenanceFor } = await readCarriedOverState(cwd, fs, locales);

  const results = await Promise.all(
    locales.map(async (locale) => {
      const target = await readTargetResource({
        resolver,
        format: config.format,
        locale,
        adapter,
        fs,
      });
      const baseline = baselineFor(lock, locale);
      const diff = diffResources(source.resource, target, { baseline });
      return {
        locale,
        diff,
        source: source.resource,
        target,
        baseline,
        provenance: provenanceFor?.(locale),
      };
    }),
  );
  return {
    source: source.resource,
    sourceInvalidIcuKeys: source.invalidIcuKeys,
    adapter,
    results,
  };
}
