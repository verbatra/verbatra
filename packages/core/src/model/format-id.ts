import { z } from "zod";
import { type SupportedFormat, supportedFormatSchema } from "./supported-format.js";

export const CUSTOM_FORMAT_PREFIX = "custom:";

const CUSTOM_FORMAT_NAME_SOURCE = "[a-z0-9]+(?:-[a-z0-9]+)*";

const customFormatNameFragment = (): RegExp => new RegExp(CUSTOM_FORMAT_NAME_SOURCE);

const CUSTOM_FORMAT_ID_PATTERN = new RegExp(
  `^${CUSTOM_FORMAT_PREFIX}${CUSTOM_FORMAT_NAME_SOURCE}$`,
);

/**
 * A format identifier claimed by an adapter that ships outside verbatra: the reserved
 * `custom:` prefix followed by a name of lowercase ASCII letters and digits in hyphen-separated
 * segments, for example `custom:my-format`. The type itself accepts any text after the prefix;
 * {@link isCustomFormatId} and adapter registration enforce the name's shape at runtime.
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
 *   name always returns false, and so does a `custom:` identifier whose name is empty, holds any
 *   character other than a lowercase ASCII letter, a digit, or a hyphen, or has a leading,
 *   trailing, or doubled hyphen.
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

export const customFormatIdSchema = z.templateLiteral(
  [CUSTOM_FORMAT_PREFIX, z.string().regex(customFormatNameFragment())],
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

export const formatIdSchema = z.union([supportedFormatSchema, customFormatIdSchema]);
