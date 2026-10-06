import { z } from "zod";
import type { KeyOrigin, KeyReviewState } from "./key-provenance.js";

const KEY_ORIGINS = [
  "machine",
  "memory",
  "fuzzy",
  "agent",
  "human",
  "import",
  "unknown",
  "unrecorded",
  "external",
] as const satisfies readonly KeyOrigin[];

const KEY_REVIEW_STATES = [
  "unreviewed",
  "approved",
  "rejected",
] as const satisfies readonly KeyReviewState[];

/** The zod 4 schema for a {@link KeyOrigin}: who or what wrote a key's current value. */
export const keyOriginSchema = z.enum(KEY_ORIGINS);

export const keyReviewStateSchema = z.enum(KEY_REVIEW_STATES);

/**
 * The zod 4 schema for a {@link KeyProvenance}, the recorded origin and review state of one key.
 * `parse` accepts fields it does not list and strips them from its result.
 */
export const keyProvenanceSchema = z.object({
  origin: keyOriginSchema,
  provider: z.string().exactOptional(),
  model: z.string().exactOptional(),
  reviewState: keyReviewStateSchema,
  reviewer: z.string().exactOptional(),
});

/**
 * The zod 4 schema for a {@link ProvenanceSummary}: key counts per origin and per review state.
 * `parse` accepts fields it does not list and strips them from its result.
 */
export const provenanceSummarySchema = z.object({
  byOrigin: z.record(keyOriginSchema, z.number()),
  byReviewState: z.record(keyReviewStateSchema, z.number()),
});
