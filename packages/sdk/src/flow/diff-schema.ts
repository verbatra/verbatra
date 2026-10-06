import { z } from "zod";
import { keyOriginSchema } from "../lock/key-provenance-schema.js";
import { sourceLocationSchema } from "./extract-schema.js";
import type { UnusedKeysNotRunReason, UnusedKeysUnreliableReason } from "./unused-keys.js";

const NOT_RUN_REASONS = [
  "EXTRACT_NOT_CONFIGURED",
  "EXTRACT_FS_UNSUPPORTED",
  "FRAMEWORK_NOT_MODELED",
  "NO_SOURCE_FILES",
  "NO_REFERENCES_FOUND",
] as const satisfies readonly UnusedKeysNotRunReason[];

const UNRELIABLE_REASONS = [
  "dynamic-keys",
  "dynamic-key-prefix",
  "trans-without-key",
  "aliased-translate-function",
  "translate-function-escapes",
  "unrecognised-translate-source",
  "template-files-not-scanned",
  "incomplete-scan",
] as const satisfies readonly UnusedKeysUnreliableReason[];

const keyListSchema = z.array(z.string()).readonly();
const unusedKeySchema = z.object({ key: z.string(), catalogKey: z.string() });

const unusedKeysReportSchema = z.union([
  z.object({
    status: z.literal("not-run"),
    reason: z.enum(NOT_RUN_REASONS),
    message: z.string(),
  }),
  z.object({
    status: z.enum(["complete", "unreliable"]),
    unreliableBecause: z
      .array(
        z.object({
          reason: z.enum(UNRELIABLE_REASONS),
          count: z.number(),
          sites: z
            .array(
              z.object({
                file: z.string(),
                line: z.number().exactOptional(),
                detail: z.string().exactOptional(),
              }),
            )
            .readonly(),
        }),
      )
      .readonly(),
    scannedFiles: z.number(),
    unused: z.array(unusedKeySchema).readonly(),
    possiblyDynamic: z.array(unusedKeySchema.extend({ prefix: z.string() })).readonly(),
    ignored: z.array(unusedKeySchema).readonly(),
    dynamicPrefixes: z.array(sourceLocationSchema.extend({ prefix: z.string() })).readonly(),
  }),
]);

/**
 * The zod schema for a {@link DiffSummary}, the `result` of `verbatra diff --json`. It allows
 * fields it does not list.
 */
export const diffSummarySchema = z.object({
  hasPendingChanges: z.boolean(),
  locales: z
    .array(
      z.object({
        locale: z.string(),
        missing: keyListSchema,
        changed: keyListSchema,
        orphaned: keyListSchema,
        hasPendingChanges: z.boolean(),
        emptySource: keyListSchema.exactOptional(),
        changedOrigins: z.record(z.string(), keyOriginSchema).exactOptional(),
        protected: keyListSchema.exactOptional(),
      }),
    )
    .readonly(),
  unused: unusedKeysReportSchema.exactOptional(),
});
