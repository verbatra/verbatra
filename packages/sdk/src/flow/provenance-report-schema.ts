import { z } from "zod";
import { keyProvenanceSchema } from "../lock/key-provenance-schema.js";
import { PROVENANCE_BUCKETS } from "./provenance-report.js";

const bucketSchema = z.enum(PROVENANCE_BUCKETS);

/**
 * The zod schema for a {@link ProvenanceReportResult}, the `result` of `verbatra report --json`:
 * the report, or `available: false` when the provenance record could not be read.
 * A zod 4 schema: `parse` accepts fields it does not list and strips them from its result.
 */
export const provenanceReportResultSchema = z.union([
  z.object({
    available: z.literal(true),
    generatedAt: z.string(),
    toolVersion: z.string(),
    sourceLocale: z.string(),
    locales: z
      .array(
        z.object({
          locale: z.string(),
          total: z.number(),
          counts: z.record(bucketSchema, z.number()),
          entries: z
            .array(keyProvenanceSchema.extend({ key: z.string(), bucket: bucketSchema }))
            .readonly(),
        }),
      )
      .readonly(),
  }),
  z.object({ available: z.literal(false), reason: z.literal("provenance-unreadable") }),
]);
