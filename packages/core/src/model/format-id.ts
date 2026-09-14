import { z } from "zod";
import { type SupportedFormat, supportedFormatSchema } from "./supported-format.js";

/** The reserved prefix every third-party format identifier carries. */
export const CUSTOM_FORMAT_PREFIX = "custom:";

const CUSTOM_FORMAT_NAME = /[a-z0-9]+(?:-[a-z0-9]+)*/;

const CUSTOM_FORMAT_ID_PATTERN = /^custom:[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * A format identifier claimed by an adapter that ships outside verbatra: the reserved
 * `custom:` prefix followed by a lowercase, hyphen-separated name, for example
 * `custom:my-format`.
 *
 * No built-in format name contains a colon, so a third-party identifier can never shadow a
 * built-in one.
 */
export type CustomFormatId = `custom:${string}`;

/**
 * Narrow a format identifier to a third-party one.
 *
 * @param format - The identifier to classify.
 * @returns True when the identifier is a well-formed `custom:` identifier. A built-in format
 *   name always returns false.
 *
 * @example
 * ```ts
 * isCustomFormatId("custom:toml"); // true
 * isCustomFormatId("i18next-json"); // false
 * ```
 */
export function isCustomFormatId(format: string): format is CustomFormatId {
  return CUSTOM_FORMAT_ID_PATTERN.test(format);
}

/**
 * Zod schema accepting a third-party format identifier and nothing else. Use
 * {@link formatIdSchema} to accept a built-in format as well.
 *
 * Expressed as a template literal rather than a refinement, so the shape survives into the JSON
 * Schema document verbatra ships for editors instead of becoming an invisible custom check.
 */
export const customFormatIdSchema = z.templateLiteral(
  [CUSTOM_FORMAT_PREFIX, z.string().regex(CUSTOM_FORMAT_NAME)],
  {
    error:
      'a format outside verbatra must be named "custom:" followed by a lowercase, hyphen-separated name',
  },
);

/**
 * Any format verbatra can be asked to handle: one of the built-in {@link SupportedFormat}
 * members, or a third-party {@link CustomFormatId}.
 *
 * A built-in name is checked against the closed set at compile time. A `custom:` identifier is
 * only checked for shape, because the adapter behind it lives outside this package; if no
 * registered adapter claims it, the run fails with a structured error naming the format.
 */
export type FormatId = SupportedFormat | CustomFormatId;

/** Zod schema accepting either a built-in format name or a third-party format identifier. */
export const formatIdSchema = z.union([supportedFormatSchema, customFormatIdSchema]);
