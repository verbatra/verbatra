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
   * @param code - The stable code for this failure.
   * @param message - A human-readable description. Never include a secret or a file's contents.
   */
  constructor(code: AdapterErrorCode, message: string) {
    super(message);
    this.name = "AdapterError";
    this.code = code;
  }
}
