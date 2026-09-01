import type { SupportedFormat } from "@verbatra/core";

const SHARED_CATALOGUE_FORMATS: ReadonlySet<SupportedFormat> = new Set<SupportedFormat>([
  "apple-xcstrings",
]);

export function isSharedCatalogueFormat(format: SupportedFormat): boolean {
  return SHARED_CATALOGUE_FORMATS.has(format);
}
