import type { SourceFramework } from "./framework.js";

/** One application source file, already read, as it is handed to a {@link SourceExtractor}. */
export interface SourceFile {
  /** The file's absolute path, used only for reporting. */
  readonly path: string;
  /** The file's full text. It is untrusted input and is never echoed into a result. */
  readonly content: string;
}

/** One translation call site whose key argument was a static string. */
export interface ExtractedCallSite {
  /** The key exactly as the call site spelled it. */
  readonly key: string;
  /** The default value the call site supplied, if any. Absent when the call named only a key. */
  readonly defaultValue?: string;
  /** The one-based line the call site sits on. */
  readonly line: number;
}

/**
 * One translation call site whose key argument could not be resolved statically: a variable, a
 * member expression, or a template literal carrying an expression. It is reported rather than
 * guessed at, so no invented key ever reaches a catalog.
 */
export interface DynamicCallSite {
  /** The one-based line the call site sits on. */
  readonly line: number;
}

/** Everything one {@link SourceExtractor} found in one file. */
export interface FileExtraction {
  /** Call sites whose key was a static string. */
  readonly calls: readonly ExtractedCallSite[];
  /** Call sites whose key could not be resolved statically. */
  readonly dynamic: readonly DynamicCallSite[];
  /**
   * Whether the file could not be read to its end, so everything above it is partial. An
   * unterminated block comment or template literal abandons the rest of the file. The scan records
   * it as an `unparseable` diagnostic and carries on, rather than reporting a short result as if
   * it were the whole file.
   */
  readonly truncated?: boolean;
}

/**
 * The contract every framework's source extractor implements: given one file's text, report the
 * translation call sites it contains. One implementation per framework, selected by the configured
 * `extract.framework`.
 *
 * It is pure: it reads no file, makes no network call, and holds no state between files. Supplying
 * your own as `deps.createExtractor` is how you teach `extract` a call shape verbatra does not
 * ship yet.
 */
export interface SourceExtractor {
  /** The framework whose call shapes this extractor knows. */
  readonly framework: SourceFramework;
  /** The file extensions this extractor can read, each including its leading dot. */
  readonly extensions: readonly string[];

  /**
   * Find every translation call site in one file.
   *
   * @param file - The file's path and full text.
   * @returns The static and dynamic call sites found, in document order.
   */
  extract(file: SourceFile): FileExtraction;
}
