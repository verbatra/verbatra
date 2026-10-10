export interface DiffResult {
  readonly missing: readonly string[];
  readonly changed: readonly string[];
  readonly orphaned: readonly string[];
  readonly unchanged: readonly string[];
  readonly emptySource: readonly string[];
}

export interface DiffOptions {
  readonly baseline?: ReadonlyMap<string, string>;
}
