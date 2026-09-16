import { type DiffResult, diffResources, type LocaleResource } from "@verbatra/core";
import type { AdapterRegistry, FormatAdapter } from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { baselineFor, lockFilePath, readLockFile } from "../lock/lock-file.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { readTargetResource } from "./read-target.js";
import { selectLocales } from "./select-locales.js";
import { readSourceResource } from "./source.js";

export interface LocaleDiffResult {
  readonly locale: string;
  readonly diff: DiffResult;
  readonly source: LocaleResource;
  readonly target: LocaleResource;
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

export async function diffLocales(
  input: DiffLocalesInput,
  deps: DiffLocalesDeps = {},
): Promise<readonly LocaleDiffResult[]> {
  const config = input.config;
  const cwd = input.cwd ?? process.cwd();
  const fs = deps.fs ?? defaultFs;
  const adapter = selectAdapter(config.format, deps.adapterRegistry, deps.fs);
  const resolver = createLocalePathResolver(cwd, config);

  const source = await readSourceResource(config, resolver, fs, adapter);
  const lock = await readLockFile(lockFilePath(cwd), fs);

  return Promise.all(
    selectLocales(config, input.locales).map(async (locale) => {
      const target = await readTargetResource({
        resolver,
        format: config.format,
        locale,
        adapter,
        fs,
      });
      const diff = diffResources(source.resource, target, { baseline: baselineFor(lock, locale) });
      return { locale, diff, source: source.resource, target };
    }),
  );
}
