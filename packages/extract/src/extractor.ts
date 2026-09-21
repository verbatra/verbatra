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

/** A catalog key a file names statically, wherever it names it. */
export interface ReferencedKeySite {
  /** The key as the source can reach it. */
  readonly key: string;
  /** The one-based line it is named on. */
  readonly line: number;
}

/**
 * A key argument with a static head and a dynamic rest, such as the template literal `nav.${page}`.
 */
export interface KeyPrefixSite {
  /** The static head every key this site can reach starts with. */
  readonly prefix: string;
  /** The one-based line the site sits on. */
  readonly line: number;
}

/**
 * Why a place in the source reaches keys a static reading cannot bound.
 *
 * - `dynamic-key-prefix`: a key prefix (a `keyPrefix` option or a `getFixedT` prefix argument) is
 *   not a static string.
 * - `trans-without-key`: a `Trans` element carries no static `i18nKey`, so its key is its children.
 * - `aliased-translate-function`: the translate function is assigned somewhere its calls cannot be
 *   followed, such as an object property.
 * - `translate-function-escapes`: a translate function bound from a recognised source appears
 *   somewhere other than a direct call, its own binding, a local alias, or the `t` attribute of a
 *   `Trans` or `Translation` element (for example as an argument, a property, an export, or a
 *   ternary operand), so other code can call it with keys this file never names.
 * - `unrecognised-translate-source`: a translate source (`useTranslation`, `withTranslation`,
 *   `getFixedT`, a `Translation` render prop, a member `t`, or a `t` import) is used in a shape the
 *   scan does not recognise, so the keys and prefix the resulting function uses are unknown.
 */
export type UnresolvedKeySiteReason =
  | "dynamic-key-prefix"
  | "trans-without-key"
  | "aliased-translate-function"
  | "translate-function-escapes"
  | "unrecognised-translate-source";

/** A place whose reachable keys cannot be bounded statically. */
export interface UnresolvedKeySite {
  /** Why the keys it reaches are unknown. */
  readonly reason: UnresolvedKeySiteReason;
  /** The one-based line it sits on. */
  readonly line: number;
}

/** Everything one file tells a caller about which catalog keys it can reach. */
export interface KeyUsage {
  /** Every static key the file names, including the extracted calls, in line order. */
  readonly references: readonly ReferencedKeySite[];
  /** Key arguments with no static part at all. */
  readonly dynamic: readonly DynamicCallSite[];
  /** Key arguments with a static head. */
  readonly prefixes: readonly KeyPrefixSite[];
  /** Places whose reachable keys cannot be bounded. */
  readonly unresolved: readonly UnresolvedKeySite[];
}

/** Everything one {@link SourceExtractor} found in one file. */
export interface FileExtraction {
  /** Call sites whose key was a static string. */
  readonly calls: readonly ExtractedCallSite[];
  /** Call sites whose key could not be resolved statically. */
  readonly dynamic: readonly DynamicCallSite[];
  /**
   * What the file tells a caller asking which catalog keys the source can reach, beyond the calls
   * above: static keys named some other way, template keys with a static head, and constructs
   * whose keys cannot be bounded. Absent for an extractor that does not report it, in which case
   * the calls and dynamic sites above are all that is known.
   */
  readonly usage?: KeyUsage;
  /**
   * Whether the file could not be read to its end, so everything above it is partial. An
   * unterminated block comment or template literal abandons the rest of the file. In a file read as
   * markup (`.tsx`, `.jsx`, `.js`), so does a JSX element that never closes or is closed by an
   * enclosing element's tag, and a quoted string in code that runs into the end of its line. The
   * scan records it as an `unparseable` diagnostic and carries on, rather than reporting a short
   * result as if it were the whole file.
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
