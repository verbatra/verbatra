import { networkConfigSchema } from "@verbatra/ai-providers";
import { formatIdSchema } from "@verbatra/core";
import { z } from "zod";
import { LOCALE_TOKEN } from "../locale-path/pattern.js";
import { LOCALE_STYLES } from "../locale-path/style.js";
import { extractionConfigSchema } from "./extraction-config.js";
import { type GlossaryInput, glossaryDefinitionSchema } from "./glossary.js";
import { humanEditsSchema, pinnedKeysSchema } from "./human-edits.js";
import { localeCodeSchema } from "./locale-code.js";
import { providerConfigSchema } from "./provider-config.js";
import { findUnknownLocaleMapKeys } from "./provider-locale-map.js";
import { rateCardSchema } from "./rate-card.js";
import { sensitiveDataSchema } from "./sensitive-config.js";

export const DEFAULT_MAX_BATCH_SIZE = 50;

export const DEFAULT_BUDGET_BEHAVIOR = "warn" as const;

export const DEFAULT_FUZZY_THRESHOLD = 0.9;

const fuzzyCacheSchema = z.strictObject({
  enabled: z.boolean(),
  threshold: z.number().min(0.5).max(1).optional(),
});

function findCaseInsensitiveDuplicate(locales: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const locale of locales) {
    const key = locale.toLowerCase();
    if (seen.has(key)) {
      return locale;
    }
    seen.add(key);
  }
  return undefined;
}

/**
 * The zod schema every verbatra config is validated against. {@link loadConfig} applies it, so most
 * consumers never call it directly; reach for it when you build a config programmatically and want
 * to validate it before handing it to {@link translate}, or when you surface config errors in your
 * own tooling.
 *
 * The object is strict, so an unrecognized key is an error rather than being silently ignored: a
 * typo in a config file is reported instead of quietly doing nothing. The one exception is the
 * optional `$schema` key, accepted so a JSON or YAML config can point an editor at the JSON Schema
 * document the package ships as `@verbatra/sdk/config-schema.json`.
 *
 * `format` accepts a built-in format name or a `custom:` identifier such as `custom:toml`. A
 * `custom:` identifier is checked for shape only; the adapter behind it is supplied through a
 * flow's `adapterRegistry` dependency, and a run whose registry holds none fails with
 * `UNKNOWN_FORMAT`.
 *
 * `fuzzyCache` is off unless `enabled` is set. With it on, a source string whose earlier form is in
 * the translation memory close enough to clear `threshold` reuses that translation instead of
 * paying the provider for it. `threshold` is a similarity ratio from `0.5` to `1` and defaults to
 * `0.9`.
 *
 * `humanEdits` decides what a run does with a stale key whose value a person wrote (see
 * {@link HumanEditsPolicy}); it defaults to `protect`. `pinnedKeys` lists key patterns, where `*`
 * matches any run of characters, that no machine write ever touches in any target locale: a
 * matching key is never translated, suggested, or retranslated, whatever `humanEdits` says.
 *
 * `sourceLocale` and every entry of `targetLocales` must be a well-formed BCP 47 locale code that
 * `Intl.getCanonicalLocales` accepts, such as `en`, `pt-BR`, `zh-Hant-TW`, or `es-419`. An
 * underscore spelling such as `pt_BR` is rejected: write `pt-BR` and set `files.localeStyle` to
 * `posix` to keep underscores in file names. The language subtag must be two or three letters, so
 * a language name such as `german` and a built-in object property name such as `toString` are
 * rejected even though `Intl` would accept them. A valid code that is not in canonical form, such
 * as `zh-hant-tw` or the deprecated `iw`, is accepted as written and reported by {@link doctor}.
 *
 * `glossary` is a path to a glossary JSON file, a version 1 map from source term to the translation
 * every target locale uses, or a version 2 {@link GlossaryDefinition} with per-locale translations,
 * forbidden renderings, and terms to keep untranslated.
 *
 * `sensitiveData` scans what a run is about to send to a provider for content that looks
 * sensitive, before any request: `mode` is `off` (the default when the block is absent), `warn`
 * (send it and report a notice), `block` (withhold the key), or `redact` (replace the match with a
 * token and restore it in the translation). `detectors` picks from `secret`, `email`, `iban`,
 * `credit-card`, `phone`, `ip` and `private-host`, and defaults to the first four. `patterns` adds
 * regular expressions, compiled with the `u` flag, for your own terms. To keep each scan fast, a
 * pattern is rejected when it repeats more than once a group holding a quantifier or an
 * alternative (`(a+)+`, `(a|aa)*`, `(?:a?){30}`), holds more than one unbounded repeat (`*`, `+`
 * or `{n,}`, lazy forms included), or branches more than 4 ways beside its unbounded repeat (1,024
 * without one), counting `?`, each `{m,n}` and `|` alternatives together. Each pattern reads only
 * the first 2,000 characters of a field, so a match beyond them is not found, and runs for at most
 * 50 ms per field: a pattern that runs out of time counts as a finding named `pattern-timeout-<n>`
 * (its index), so the key is sent under `warn` and withheld under `block` and `redact`. `allow` lists texts that are
 * never reported, where `*` matches any run of characters and case is ignored.
 *
 * Beyond the per-field checks, three whole-config rules are enforced: `targetLocales` must not
 * contain the source locale, it must not contain two locales that differ only in case (they
 * would collide on a case-insensitive file system), and every key of `provider.options.localeMap`
 * must be `sourceLocale` or one of `targetLocales`, spelled exactly as configured. The `{locale}`
 * token requirement is a per-field check on `files.pattern`.
 */
export const verbatraConfigSchema = z
  .strictObject({
    $schema: z.string().optional(),
    sourceLocale: localeCodeSchema,
    targetLocales: z.array(localeCodeSchema).min(1),
    format: formatIdSchema,
    files: z.strictObject({
      pattern: z
        .string()
        .min(1)
        .regex(/\{locale\}/, { message: `files.pattern must contain the ${LOCALE_TOKEN} token` }),
      localeStyle: z.enum(LOCALE_STYLES).optional(),
    }),
    provider: providerConfigSchema,
    glossary: z
      .union([z.string().min(1), glossaryDefinitionSchema, z.record(z.string(), z.string())])
      .optional(),
    tone: z.enum(["formal", "informal", "neutral"]).optional(),
    prune: z.boolean().optional(),
    generatePlurals: z.boolean().optional(),
    fuzzyCache: fuzzyCacheSchema.optional(),
    maxBatchSize: z.number().int().positive().optional(),
    maxLength: z.record(z.string().min(1), z.number().int().positive()).optional(),
    maxTokens: z.number().int().positive().optional(),
    budgetBehavior: z.enum(["warn", "stop"]).optional(),
    rates: rateCardSchema.optional(),
    extract: extractionConfigSchema.optional(),
    humanEdits: humanEditsSchema.optional(),
    pinnedKeys: pinnedKeysSchema.optional(),
    network: networkConfigSchema.optional(),
    sensitiveData: sensitiveDataSchema.optional(),
  })
  .refine(
    (config) => {
      const sourceKey = config.sourceLocale.toLowerCase();
      return !config.targetLocales.some((locale) => locale.toLowerCase() === sourceKey);
    },
    {
      message: "targetLocales must not include the source locale",
      path: ["targetLocales"],
    },
  )
  .refine((config) => findCaseInsensitiveDuplicate(config.targetLocales) === undefined, {
    error: (issue) => {
      const duplicate = findCaseInsensitiveDuplicate(
        (issue.input as { targetLocales: readonly string[] }).targetLocales,
      );
      return `targetLocales must not contain case-insensitively duplicate locales: "${duplicate}"`;
    },
    path: ["targetLocales"],
  })
  .superRefine((config, ctx) => {
    for (const { key, message } of findUnknownLocaleMapKeys(config)) {
      ctx.addIssue({ code: "custom", message, path: ["provider", "options", "localeMap", key] });
    }
  });

/**
 * A config exactly as it is written in a `verbatra.config.ts` file, before the SDK resolves
 * anything. Its `glossary` may still be a path string pointing at a JSON file.
 *
 * This is what {@link defineConfig} returns and what {@link verbatraConfigSchema} parses. It is the
 * schema's input shape, so a `none` provider may leave out `options`, which parsing fills in as
 * `{}`. Use {@link VerbatraConfig} for the resolved shape the flows actually consume.
 */
export type VerbatraConfigInput = z.input<typeof verbatraConfigSchema>;

/** A config after schema parsing and before glossary resolution, with every default filled in. */
export type ParsedVerbatraConfig = z.infer<typeof verbatraConfigSchema>;

/**
 * A fully resolved config, ready to pass to any SDK entry point. It differs from
 * {@link VerbatraConfigInput} in two respects: `glossary` is always held in memory, as a version 1
 * term map or a version 2 {@link GlossaryDefinition}, because {@link loadConfig} has already read
 * and validated any glossary file the config pointed at, and
 * `provider.options` is always present, `{}` for a `none` provider.
 *
 * Every entry point takes this shape, so a caller that builds a config by hand rather than loading
 * one from disk must supply the glossary already resolved.
 */
export type VerbatraConfig = Omit<ParsedVerbatraConfig, "glossary"> & {
  /**
   * Terms that must be translated a fixed way, forbidden renderings, and terms to keep untranslated,
   * already held in memory in either supported shape. A config that named a glossary file has had
   * it read by {@link loadConfig} before it reaches here. {@link glossaryForLocale} resolves the part
   * that applies to one target locale.
   */
  glossary?: GlossaryInput;
};
