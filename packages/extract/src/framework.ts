import { z } from "zod";

export const SOURCE_FRAMEWORKS = ["i18next"] as const;

/**
 * The translation framework whose call sites a source scan looks for. The set is closed: a
 * framework is only nameable here once an extractor ships for it, so a configured value that
 * resolves to nothing cannot exist.
 *
 * `i18next` covers the `t(...)`, `$t(...)`, and `<object>.t(...)` shapes, each also through an
 * optional call (`t?.(...)`) and an explicit type-argument list (`t<string>(...)`), with the key as
 * the first argument and an optional default as either the second argument or a `defaultValue`
 * field on the options object. A namespace-qualified key such as `t("common:nav.home")` is
 * reported as a dynamic call site rather than extracted, because one configuration addresses one
 * catalog file.
 */
export type SourceFramework = (typeof SOURCE_FRAMEWORKS)[number];

export const sourceFrameworkSchema = z.enum(SOURCE_FRAMEWORKS);
