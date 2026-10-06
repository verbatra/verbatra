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

export const keyOriginSchema = z.enum(KEY_ORIGINS);

export const keyReviewStateSchema = z.enum(KEY_REVIEW_STATES);

export const keyProvenanceSchema = z.object({
  origin: keyOriginSchema,
  provider: z.string().exactOptional(),
  model: z.string().exactOptional(),
  reviewState: keyReviewStateSchema,
  reviewer: z.string().exactOptional(),
});

export const provenanceSummarySchema = z.object({
  byOrigin: z.record(keyOriginSchema, z.number()),
  byReviewState: z.record(keyReviewStateSchema, z.number()),
});
