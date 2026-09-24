import type { KeyProvenance, LocaleGlossary } from "@verbatra/sdk";
import { z } from "zod";

export const KEY_CONTEXT_METHOD = "key.context";

export const keyContextParamsSchema = z.strictObject({
  locale: z.string().min(1),
  key: z.string().min(1),
});

export type KeyContextParams = z.infer<typeof keyContextParamsSchema>;

export interface KeyContextResult {
  readonly source: string;
  readonly target?: string;
  readonly description?: string;
  readonly provenance?: KeyProvenance;
  readonly glossary: LocaleGlossary;
}
