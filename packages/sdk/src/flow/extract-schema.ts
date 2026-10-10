import type { ScanDiagnosticReason } from "@verbatra/extract";
import { z } from "zod";

const SCAN_DIAGNOSTIC_REASONS = [
  "unreadable",
  "too-large",
  "unparseable",
  "unreadable-directory",
] as const satisfies readonly ScanDiagnosticReason[];

export const sourceLocationSchema = z.object({ file: z.string(), line: z.number() });

export const scanDiagnosticSchema = z.object({
  file: z.string(),
  reason: z.enum(SCAN_DIAGNOSTIC_REASONS),
});

/**
 * The zod schema for an {@link ExtractResult}, the `result` of `verbatra extract --json`.
 * A zod 4 schema: `parse` accepts fields it does not list and strips them from its result.
 */
export const extractResultSchema = z.object({
  sourcePath: z.string(),
  scannedFiles: z.number(),
  added: z
    .array(z.object({ key: z.string(), value: z.string(), file: z.string(), line: z.number() }))
    .readonly(),
  existingKeys: z.number(),
  withoutDefault: z.array(z.string()).readonly(),
  dynamic: z.array(sourceLocationSchema).readonly(),
  conflicts: z
    .array(
      z.object({
        key: z.string(),
        values: z.array(z.string()).readonly(),
        locations: z.array(sourceLocationSchema).readonly(),
      }),
    )
    .readonly(),
  diagnostics: z.array(scanDiagnosticSchema).readonly(),
  written: z.boolean(),
  dryRun: z.boolean(),
});
