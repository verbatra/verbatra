import type { FormatId, LocaleResource } from "@verbatra/core";
import { AdapterError, type FormatAdapter } from "@verbatra/format-adapters";
import type { SdkFs } from "../fs.js";
import type { LocalePathResolver } from "../locale-path/resolver.js";

export interface ReadTargetResourceInput {
  readonly resolver: LocalePathResolver;
  readonly format: FormatId;
  readonly locale: string;
  readonly adapter: FormatAdapter;
  readonly fs: SdkFs;
}

function attributeTargetRead(error: unknown, locale: string, path: string): unknown {
  if (!(error instanceof AdapterError)) {
    return error;
  }
  return new AdapterError(
    error.code,
    `The ${locale} locale file at ${path} could not be read: ${error.message}`,
  );
}

export async function readTargetResource(input: ReadTargetResourceInput): Promise<LocaleResource> {
  const path = input.resolver.pathFor(input.locale);
  if (!(await input.fs.fileExists(path))) {
    return { locale: input.locale, namespace: "", format: input.format, entries: new Map() };
  }
  try {
    return (await input.adapter.read(path, input.locale)).resource;
  } catch (error) {
    throw attributeTargetRead(error, input.locale, path);
  }
}
