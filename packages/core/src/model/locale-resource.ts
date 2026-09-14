import { z } from "zod";
import { type FormatId, formatIdSchema } from "./format-id.js";
import { type TranslationEntry, translationEntrySchema } from "./translation-entry.js";

export const localeResourceSchema = z.object({
  locale: z.string().min(1),
  namespace: z.string(),
  format: formatIdSchema,
  entries: z.map(z.string(), translationEntrySchema),
});

/**
 * All translation entries for one locale and namespace, keyed by entry key. This is the neutral
 * intermediate representation every adapter reads into and writes back out of, so nothing downstream
 * of an adapter parses a format's own syntax.
 */
export interface LocaleResource {
  /** The locale these entries belong to (for example, "en" or "de"). */
  readonly locale: string;
  /** The namespace these entries belong to; empty when the format has no namespacing. */
  readonly namespace: string;
  /** The source format the resource came from, retained for round-trip fidelity on write. */
  readonly format: FormatId;
  /** Entries addressable by key, in the order the source file defined them. */
  readonly entries: ReadonlyMap<string, TranslationEntry>;
}
