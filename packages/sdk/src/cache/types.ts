/**
 * The on-disk translation memory, read from and written to `verbatra.cache.json` (see
 * {@link CACHE_FILE_NAME}). A run consults it before calling the provider, so a string that was
 * already translated under the same configuration is reused instead of paid for again.
 *
 * Entries are keyed by configuration fingerprint, then locale, then source-content hash. The
 * fingerprint layer means that changing the provider, model, tone, or glossary does not silently
 * reuse translations produced under the old settings; those entries simply stop matching.
 *
 * `sources` sits beside them as a flat hash-to-text index. A hash cannot be compared for
 * similarity, so the source text itself has to be on file for a fuzzy match to have anything to
 * measure a changed string against. It is deliberately outside the fingerprint layer: the source
 * text a hash stands for does not depend on which provider translated it.
 */
export interface TranslationMemory {
  /** The cache schema version. A file from a newer version is ignored rather than trusted. */
  readonly version: number;
  /** Cached values, nested as configuration fingerprint, then locale, then source-content hash. */
  readonly entries: Readonly<
    Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>
  >;
  /**
   * The source text each content hash stands for. Empty for a cache carried forward from schema
   * version 1, which stored no source text; it fills in as later runs touch those hashes again.
   */
  readonly sources: Readonly<Record<string, string>>;
}

export interface CacheAddition {
  readonly contentHash: string;
  readonly value: string;
  readonly source: string;
}
