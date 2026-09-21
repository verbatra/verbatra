import { z } from "zod";

export const KEY_INTEGRITY_METHOD = "key.integrity";

export const keyIntegrityParamsSchema = z.strictObject({
  key: z.string().min(1),
  locales: z.array(z.string().min(1)).min(1).optional(),
});

export type KeyIntegrityParams = z.infer<typeof keyIntegrityParamsSchema>;

export interface KeyIntegrityLocaleResult {
  readonly locale: string;
  readonly hasPlaceholders: boolean;
  readonly matches: boolean;
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  readonly icuValid: boolean;
  readonly markupMatches: boolean;
  readonly markupDetails: readonly string[];
}

export interface KeyIntegrityResult {
  readonly locales: readonly KeyIntegrityLocaleResult[];
}
