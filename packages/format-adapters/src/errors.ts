/**
 * The stable, secret-free codes an {@link AdapterError} carries.
 *
 * The first seven describe a file verbatra could not handle: `INVALID_JSON`, `INVALID_YAML` and
 * `INVALID_XML` for malformed syntax, `INVALID_STRUCTURE` for a parseable file of the wrong shape,
 * `MAX_DEPTH_EXCEEDED` and `INPUT_TOO_LARGE` for the read caps, and `MIXED_STRUCTURE` for a file
 * that mixes flat and nested keys where the format forbids it.
 *
 * The last three describe an adapter rather than a file. `ADAPTER_FAILED` attributes an unexpected
 * throw to the third-party adapter it came from, so a plugin defect never surfaces as an
 * unattributed verbatra stack trace. `DUPLICATE_FORMAT` rejects registering a second adapter for a
 * format identifier a registry already holds. `INVALID_FORMAT_ID` rejects registering an adapter
 * whose `custom:` identifier is malformed, which would otherwise be registered without the
 * containment wrapper and silently lose its failure attribution.
 *
 * The set is closed. A third-party adapter raises `INVALID_STRUCTURE` (or another member that fits)
 * rather than minting its own code.
 */
export type AdapterErrorCode =
  | "INVALID_JSON"
  | "INVALID_YAML"
  | "INVALID_XML"
  | "INVALID_STRUCTURE"
  | "MAX_DEPTH_EXCEEDED"
  | "INPUT_TOO_LARGE"
  | "MIXED_STRUCTURE"
  | "ADAPTER_FAILED"
  | "DUPLICATE_FORMAT"
  | "INVALID_FORMAT_ID";

/**
 * Where in a file an {@link AdapterError} found malformed syntax, both counted from 1. The column
 * counts UTF-16 code units, the way editors that report a JavaScript string offset do.
 */
export interface SyntaxPosition {
  /** The line, counted from 1. */
  readonly line: number;
  /** The column within that line, counted from 1. */
  readonly column: number;
}

/**
 * A structured, secret-free failure raised by a format adapter or by the adapter registry. Catch it
 * to branch on {@link AdapterErrorCode} instead of matching on message text.
 *
 * @example
 * ```ts
 * try {
 *   await adapter.read("locales/de.json", "de");
 * } catch (error) {
 *   if (error instanceof AdapterError && error.code === "INVALID_JSON") {
 *     console.error(error.message);
 *   }
 * }
 * ```
 */
export class AdapterError extends Error {
  /** The stable code for this failure. */
  readonly code: AdapterErrorCode;

  /**
   * Where the malformed syntax is, when the parser reports it: set for an `INVALID_JSON` or
   * `INVALID_YAML` error a built-in adapter raises and the parser located, `undefined` otherwise.
   * The message then ends with the same line and column in words.
   */
  readonly position: SyntaxPosition | undefined;

  /**
   * @param code - The stable code for this failure.
   * @param message - A human-readable description. Never include a secret or a file's contents.
   * @param options - `cause` carries the error this one wraps. An `ADAPTER_FAILED` error raised for
   * a `custom:` adapter carries the adapter's original throw here, and its message never repeats
   * that throw's message, which can quote the file being parsed. An `INVALID_STRUCTURE` error a
   * built-in adapter raises because its parser threw carries the parser's error here. `position`
   * locates malformed syntax in the file; it is exposed as {@link AdapterError.position}.
   */
  constructor(
    code: AdapterErrorCode,
    message: string,
    options?: { readonly cause?: unknown; readonly position?: SyntaxPosition },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AdapterError";
    this.code = code;
    this.position = options?.position;
  }
}
