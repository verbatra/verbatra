import { z } from "zod";

/** Every {@link HumanEditsPolicy}, in the order the config schema lists them. */
export const HUMAN_EDITS_POLICIES = ["protect", "suggest", "overwrite"] as const;

/**
 * What a run does with a stale key whose current value a person wrote: a value from the Studio edit
 * dialog or an SDK edit (`human`), from an imported handoff (`import`), or changed outside verbatra
 * (`external`), as recorded in the provenance file.
 *
 * - `protect`, the default: the value is kept, the key stays stale, and it is reported in
 *   {@link LocaleSummary.protected} for a person to review. Nothing is sent to the provider.
 * - `suggest`: as `protect`, but the key is also sent to the provider and the answer is returned as
 *   {@link ProtectedKey.suggestion} and kept in the translation memory. It is never written to the
 *   locale file.
 * - `overwrite`: no protection. The key is retranslated like any other stale key, which is how
 *   verbatra behaved before this setting existed.
 */
export type HumanEditsPolicy = (typeof HUMAN_EDITS_POLICIES)[number];

export const DEFAULT_HUMAN_EDITS: HumanEditsPolicy = "protect";

export const humanEditsSchema = z.enum(HUMAN_EDITS_POLICIES);

export const pinnedKeysSchema = z.array(z.string().min(1));
