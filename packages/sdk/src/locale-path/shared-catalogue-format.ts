import type { FormatId } from "@verbatra/core";

const SHARED_CATALOGUE_FORMATS: ReadonlySet<FormatId> = new Set<FormatId>(["apple-xcstrings"]);

export function isSharedCatalogueFormat(format: FormatId): boolean {
  return SHARED_CATALOGUE_FORMATS.has(format);
}
