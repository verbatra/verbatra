import { z } from "zod";

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
] as const;

const REVIEW_STATES = ["unreviewed", "approved", "rejected"] as const;

const countsOf = <const T extends readonly string[]>(names: T) =>
  z.object(
    Object.fromEntries(names.map((name) => [name, z.number()])) as {
      [K in T[number]]: z.ZodNumber;
    },
  );

export const keyOriginSchema = z.enum(KEY_ORIGINS);

export const keyProvenanceSchema = z.object({
  origin: keyOriginSchema,
  provider: z.string().optional(),
  model: z.string().optional(),
  reviewState: z.enum(REVIEW_STATES),
  reviewer: z.string().optional(),
});

export const provenanceSummarySchema = z.object({
  byOrigin: countsOf(KEY_ORIGINS),
  byReviewState: countsOf(REVIEW_STATES),
});
