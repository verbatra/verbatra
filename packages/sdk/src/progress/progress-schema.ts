import { z } from "zod";
import { usageSummarySchema } from "../flow/summary-schema.js";

/**
 * The zod schema for a {@link ProgressEvent}, one record of a run's progress. `verbatra translate`
 * and `watch` print the `locale-started`, `sub-batch`, `locale-finished` and `run-finished` events
 * to stderr as JSON lines under `--json`. It allows fields it does not list.
 */
export const progressEventSchema = z.union([
  z.object({
    type: z.literal("locale-started"),
    locale: z.string(),
    localeIndex: z.number(),
    totalLocales: z.number(),
  }),
  z.object({
    type: z.literal("locale-planned"),
    locale: z.string(),
    keys: z.number(),
    batches: z.number(),
    cacheHits: z.number(),
  }),
  z.object({
    type: z.literal("sub-batch"),
    locale: z.string(),
    batchIndex: z.number(),
    totalBatches: z.number(),
  }),
  z.object({
    type: z.literal("batch-finished"),
    locale: z.string(),
    batchIndex: z.number(),
    totalBatches: z.number(),
    durationMs: z.number(),
    usage: usageSummarySchema.exactOptional(),
  }),
  z.object({
    type: z.literal("provider-retry"),
    attempt: z.number(),
    delayMs: z.number().exactOptional(),
    status: z.number().exactOptional(),
  }),
  z.object({ type: z.literal("repair"), locale: z.string(), keys: z.number() }),
  z.object({ type: z.literal("split-retry"), locale: z.string(), keys: z.number() }),
  z.object({ type: z.literal("writing"), locale: z.string() }),
  z.object({
    type: z.literal("locale-finished"),
    locale: z.string(),
    status: z.enum(["succeeded", "partial", "failed"]),
    translated: z.number(),
    localeIndex: z.number(),
    totalLocales: z.number(),
  }),
  z.object({
    type: z.literal("run-finished"),
    localesCompleted: z.number(),
    localesFailed: z.number(),
  }),
  z.object({ type: z.literal("change-detected"), paths: z.array(z.string()).readonly() }),
  z.object({ type: z.literal("idle") }),
]);
