import type { LocaleKeyIntegrity } from "@verbatra/sdk";
import { z } from "zod";

export const LOCALE_INTEGRITY_METHOD = "locale.integrity";

export const localeIntegrityParamsSchema = z.strictObject({
  locales: z.array(z.string().min(1)).min(1).optional(),
});

export type LocaleIntegrityParams = z.infer<typeof localeIntegrityParamsSchema>;

export interface LocaleIntegrityResult {
  readonly locales: readonly LocaleKeyIntegrity[];
}
