import { supportedFormatSchema } from "@verbatra/core";
import { z } from "zod";
import { LOCALE_TOKEN } from "../locale-path/pattern.js";
import { LOCALE_STYLES } from "../locale-path/style.js";
import { providerConfigSchema } from "./provider-config.js";

export const DEFAULT_MAX_BATCH_SIZE = 50;

export const DEFAULT_BUDGET_BEHAVIOR = "warn" as const;

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
 * Beyond the per-field checks, two whole-config rules are enforced: `targetLocales` must not
 * contain the source locale, and it must not contain two locales that differ only in case (they
 * would collide on a case-insensitive file system). The `{locale}` token requirement is a
 * per-field check on `files.pattern`.
 */
export const verbatraConfigSchema = z
  .strictObject({
    $schema: z.string().optional(),
    sourceLocale: z.string().min(1),
    targetLocales: z.array(z.string().min(1)).min(1),
    format: supportedFormatSchema,
    files: z.strictObject({
      pattern: z
        .string()
        .min(1)
        .regex(/\{locale\}/, { message: `files.pattern must contain the ${LOCALE_TOKEN} token` }),
      localeStyle: z.enum(LOCALE_STYLES).optional(),
    }),
    provider: providerConfigSchema,
    glossary: z.union([z.record(z.string(), z.string()), z.string().min(1)]).optional(),
    tone: z.enum(["formal", "informal", "neutral"]).optional(),
    prune: z.boolean().optional(),
    generatePlurals: z.boolean().optional(),
    maxBatchSize: z.number().int().positive().optional(),
    maxTokens: z.number().int().positive().optional(),
    budgetBehavior: z.enum(["warn", "stop"]).optional(),
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
  });

/**
 * A config exactly as it is written in a `verbatra.config.ts` file, before the SDK resolves
 * anything. Its `glossary` may still be a path string pointing at a JSON file.
 *
 * This is what {@link defineConfig} returns and what {@link verbatraConfigSchema} parses. Use
 * {@link VerbatraConfig} for the resolved shape the flows actually consume.
 */
export type VerbatraConfigInput = z.infer<typeof verbatraConfigSchema>;

/**
 * A fully resolved config, ready to pass to any SDK entry point. It differs from
 * {@link VerbatraConfigInput} in one respect: `glossary` is always an in-memory term map, because
 * {@link loadConfig} has already read and validated any glossary file the config pointed at.
 *
 * Every entry point takes this shape, so a caller that builds a config by hand rather than loading
 * one from disk must supply the glossary already resolved.
 */
export type VerbatraConfig = Omit<VerbatraConfigInput, "glossary"> & {
  /**
   * Terms that must be translated a fixed way, already resolved to an in-memory map. A config that
   * named a glossary file has had it read by {@link loadConfig} before it reaches here.
   */
  glossary?: Readonly<Record<string, string>>;
};
