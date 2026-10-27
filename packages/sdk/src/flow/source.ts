import type { FormatAdapter, ReadResult } from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import { errorMessage, SdkError } from "../errors.js";
import type { SdkFs } from "../fs.js";
import { createLocalePathResolver, type LocalePathResolver } from "../locale-path/resolver.js";

export async function readSourceResource(
  config: VerbatraConfig,
  resolver: LocalePathResolver,
  fs: SdkFs,
  adapter: FormatAdapter,
): Promise<ReadResult> {
  const sourcePath = resolver.pathFor(config.sourceLocale);
  if (!(await fs.fileExists(sourcePath))) {
    throw new SdkError(
      "SOURCE_UNREADABLE",
      `The source locale file was not found at ${sourcePath}.`,
    );
  }
  try {
    return await adapter.read(sourcePath, config.sourceLocale);
  } catch (error) {
    const detail = errorMessage(error);
    throw new SdkError(
      "SOURCE_INVALID",
      `The source locale file at ${sourcePath} could not be read: ${detail}`,
      { cause: error },
    );
  }
}

export async function readSource(
  config: VerbatraConfig,
  cwd: string,
  fs: SdkFs,
  adapter: FormatAdapter,
): Promise<ReadResult> {
  return readSourceResource(config, createLocalePathResolver(cwd, config), fs, adapter);
}
