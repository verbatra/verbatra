import {
  PROVENANCE_BUCKETS,
  type ProvenanceBucket,
  type ProvenanceReport,
  type ProvenanceReportEntry,
  provenanceReport,
} from "@verbatra/sdk";
import { z } from "zod";
import { readPackageManifest } from "../package-manifest.js";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";
import {
  PAGE_LIMIT_CAP,
  PAGE_LIMIT_DEFAULT,
  pageAcrossLocales,
  pageCursorSchema,
  pageLimitSchema,
} from "./page-cursor.js";
import { keyProvenanceSchema } from "./provenance-schema.js";
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

function pagedEntries(
  report: ProvenanceReport,
  params: Params,
): {
  readonly entriesByLocale: ReadonlyMap<string, readonly ProvenanceReportEntry[]>;
  readonly nextCursor?: string;
} {
  const wanted = params.buckets === undefined ? undefined : new Set(params.buckets);
  const page = pageAcrossLocales(
    report.locales.map((locale) => ({
      locale: locale.locale,
      items: locale.entries.filter((entry) => wanted === undefined || wanted.has(entry.bucket)),
    })),
    {
      filters: {
        locales: params.locales ?? null,
        buckets: params.buckets === undefined ? null : [...new Set(params.buckets)].sort(),
      },
      limit: params.limit ?? PAGE_LIMIT_DEFAULT,
      ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
    },
  );
  return {
    entriesByLocale: new Map(page.locales.map((entry) => [entry.locale, entry.items])),
    ...(page.nextCursor !== undefined ? { nextCursor: page.nextCursor } : {}),
  };
}

function withEntries(report: ProvenanceReport, params: Params): ReportProvenanceResult {
  const { entriesByLocale, nextCursor } = pagedEntries(report, params);
  return {
    ...report,
    locales: report.locales.map(({ entries: _all, ...locale }) => {
      const entries = entriesByLocale.get(locale.locale);
      return entries === undefined ? locale : { ...locale, entries };
    }),
    ...(nextCursor !== undefined ? { nextCursor } : {}),
  };
}

async function readProvenanceReport(
  params: Params,
  context: McpToolContext,
): Promise<ReportProvenanceResult> {
  const report = await provenanceReport(
    {
      config: context.config.config,
      cwd: context.cwd,
      toolVersion: readPackageManifest().version,
      ...(params.locales !== undefined ? { locales: params.locales } : {}),
    },
    {
      ...(context.fs !== undefined ? { fs: context.fs } : {}),
      ...(context.adapterRegistry !== undefined
        ? { adapterRegistry: context.adapterRegistry }
        : {}),
    },
  );
  if (!report.available) {
    return report;
  }
  if (params.includeEntries !== true) {
    return {
      ...report,
      locales: report.locales.map(({ entries: _entries, ...locale }) => locale),
    };
  }
  return withEntries(report, params);
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
    "as invalid input. The optional locales parameter narrows the report. toolVersion is this " +
    "server's version. available: false with reason provenance-unreadable means " +
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
