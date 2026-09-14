import { z } from "zod";

export const SOURCE_FRAMEWORKS = ["i18next"] as const;

/**
 * The translation framework whose call sites a source scan looks for. The set is closed: a
 * framework is only nameable here once an extractor ships for it, so a configured value that
 * resolves to nothing cannot exist.
 *
 * `i18next` covers the `t(...)`, `$t(...)`, and `<object>.t(...)` shapes, with the key as the first
 * argument and an optional default as either the second argument or a `defaultValue` field on the
 * options object.
 */

export type SourceFramework = (typeof SOURCE_FRAMEWORKS)[number];

/** Zod schema accepting exactly one {@link SourceFramework}. Embedded in the config schema. */
export const sourceFrameworkSchema = z.enum(SOURCE_FRAMEWORKS);
