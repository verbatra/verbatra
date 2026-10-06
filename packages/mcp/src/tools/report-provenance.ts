import {
  PAGE_LIMIT_CAP,
  PAGE_LIMIT_DEFAULT,
  PROVENANCE_BUCKETS,
  type ProvenanceBucket,
  type ProvenanceReportDeps,
  type ProvenanceReportInput,
  provenanceReport,
  provenanceReportPage,
} from "@verbatra/sdk";
import { z } from "zod";
import { readSdkManifest } from "../package-manifest.js";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";
import { asInvalidCursor, pageCursorSchema, pageLimitSchema } from "./page-cursor.js";
import { keyProvenanceSchema } from "./sdk-result-schemas.js";
import { withoutReviewer } from "./value-redaction.js";

const bucketSchema = z.enum(PROVENANCE_BUCKETS);

const paramsSchema = z
  .strictObject({
    locales: z.array(z.string().min(1)).min(1).optional(),
    buckets: z.array(bucketSchema).min(1).optional(),
    includeEntries: z.boolean().optional(),
    limit: pageLimitSchema,
    cursor: pageCursorSchema,
  })
  .refine((params) => params.includeEntries === true || params.cursor === undefined, {
    message: "A cursor pages entries; pass includeEntries: true with it.",
    path: ["cursor"],
  });

type Params = z.infer<typeof paramsSchema>;

const countsSchema = z.object(
  Object.fromEntries(PROVENANCE_BUCKETS.map((bucket) => [bucket, z.number()])) as {
    [K in ProvenanceBucket]: z.ZodNumber;
  },
);

const reportEntrySchema = keyProvenanceSchema.extend({ key: z.string(), bucket: bucketSchema });

const reportProvenanceResultSchema = z.object({
  available: z.boolean(),
  reason: z.literal("provenance-unreadable").optional(),
  generatedAt: z.string().optional(),
  toolVersion: z.string().optional(),
  sourceLocale: z.string().optional(),
  locales: z
    .array(
      z.object({
        locale: z.string(),
        total: z.number(),
        counts: countsSchema,
        entries: z.array(reportEntrySchema).readonly().optional(),
      }),
    )
    .optional(),
  nextCursor: z.string().optional(),
});

export type ReportProvenanceResult = z.infer<typeof reportProvenanceResultSchema>;

function reportInput(params: Params, context: McpToolContext): ProvenanceReportInput {
  return {
    config: context.config.config,
    cwd: context.cwd,
    toolVersion: readSdkManifest().version,
    ...(params.locales !== undefined ? { locales: params.locales } : {}),
  };
}

function reportDeps(context: McpToolContext): ProvenanceReportDeps {
  return {
    ...(context.fs !== undefined ? { fs: context.fs } : {}),
    ...(context.adapterRegistry !== undefined ? { adapterRegistry: context.adapterRegistry } : {}),
  };
}

async function readEntryPage(
  params: Params,
  context: McpToolContext,
): Promise<ReportProvenanceResult> {
  const page = await asInvalidCursor(() =>
    provenanceReportPage(
      {
        ...reportInput(params, context),
        ...(params.buckets !== undefined ? { buckets: params.buckets } : {}),
        ...(params.limit !== undefined ? { limit: params.limit } : {}),
        ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
      },
      reportDeps(context),
    ),
  );
  return page.available ? { ...page, locales: [...page.locales] } : page;
}

async function readProvenanceReport(
  params: Params,
  context: McpToolContext,
): Promise<ReportProvenanceResult> {
  if (params.includeEntries === true) {
    return readEntryPage(params, context);
  }
  const report = await provenanceReport(reportInput(params, context), reportDeps(context));
  if (!report.available) {
    return report;
  }
  return {
    ...report,
    locales: report.locales.map(({ entries: _entries, ...locale }) => locale),
  };
}

export const reportProvenanceTool = defineTool({
  name: "report.provenance",
  values: {
    redact: (result) =>
      result.locales === undefined
        ? result
        : {
            ...result,
            locales: result.locales.map(({ entries, ...locale }) => ({
              ...locale,
              ...(entries !== undefined
                ? { entries: entries.map((entry) => withoutReviewer(entry)) }
                : {}),
            })),
          },
  },
  description:
    "Reports, per target locale, where each current translation came from and whether a person " +
    "reviewed it, as verbatra report provenance does: counts per bucket (machine-unreviewed, " +
    "machine-reviewed, human, import, external for a value edited outside verbatra, unrecorded, " +
    "unknown) over the keys with a value in both the source and that locale. Use it to answer " +
    "audit questions such as which values a person wrote or which were edited outside verbatra. " +
    "Counts are always complete. Set includeEntries to true to also list keys with their " +
    "origin, reviewState, provider, model, and reviewer, optionally only for some buckets; " +
    `entries come in pages of at most limit (default ${PAGE_LIMIT_DEFAULT}, at most ` +
    `${PAGE_LIMIT_CAP}), in source key order per locale; a locale carries entries only in the ` +
    "pages that hold at least one of them, and keeps its counts on every page. When nextCursor " +
    "is present, call again " +
    "with the same parameters and cursor set to it; a cursor that no longer matches is rejected " +
    "as invalid input. The optional locales parameter narrows the report. toolVersion is the " +
    "version of the verbatra SDK that produced the report, as the CLI reports it. " +
    "available: false with reason provenance-unreadable means " +
    "verbatra.provenance.json is corrupt or from a newer verbatra. Read-only: it calls no " +
    "provider and writes nothing.",
  paramsSchema,
  outputSchema: reportProvenanceResultSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: readProvenanceReport,
});
