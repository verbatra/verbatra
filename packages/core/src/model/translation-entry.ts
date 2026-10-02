import { z } from "zod";

/**
 * A single, format-neutral translation unit. Placeholders are supplied already extracted; core never
 * derives them from the value, so an adapter that reads a file is the one authority on what counts as
 * a placeholder in that format.
 *
 * The fields are: `key`, the entry's identifier within its namespace, non-empty and already flattened
 * to the dotted path an adapter produced; `namespace`, the namespace the entry belongs to, empty when
 * the format has no namespacing; `value`, the translatable string itself, which is untrusted input and
 * may be empty; `description` and `meaning`, both optional free-form context that a provider is told to
 * use only for disambiguation and never to translate or echo back; `placeholders`, the format's
 * placeholder tokens in document order, used for the output integrity check and to decide which entries
 * a placeholder-blind provider must withhold; and `isPlural`, whether the entry carries plural forms
 * (an i18next plural key suffix, a vue-i18n pipe-separated value, or an ICU plural), which the adapter
 * decides and which feeds the content hash.
 */
export const translationEntrySchema = z.object({
  key: z.string().min(1),
  namespace: z.string(),
  value: z.string(),
  description: z.string().optional(),
  meaning: z.string().optional(),
  placeholders: z.array(z.string()).readonly(),
  isPlural: z.boolean(),
});

/**
 * One validated, deeply readonly translation unit: its `key` and `namespace`, the untrusted `value`,
 * optional `description` and `meaning` context, the format's `placeholders` in document order, and
 * whether it `isPlural`.
 */
export type TranslationEntry = Readonly<z.infer<typeof translationEntrySchema>>;
