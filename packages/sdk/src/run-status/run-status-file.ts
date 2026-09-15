import { dirname, resolve } from "node:path";
import { REVIEW_REASON_CODES } from "@verbatra/ai-providers";
import { z } from "zod";
import type { LocaleSummary, RunSummary } from "../flow/summary.js";
import type { BoundedFileRead, SdkFs } from "../fs.js";
import type { RunStatusFile, RunStatusLocale } from "./types.js";

const RUN_STATUS_DIR_NAME = ".verbatra-local";
const RUN_STATUS_FILE_NAME = "run-status.json";

const CURRENT_VERSION = 1;

const MAX_RUN_STATUS_FILE_BYTES = 16 * 1024 * 1024;

const reviewReasonCodeSchema = z.enum(REVIEW_REASON_CODES);

const needsReviewEntrySchema = z.object({
  key: z.string(),
  reasons: z.array(reviewReasonCodeSchema),
});

const usageSummarySchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});

const runBudgetSchema = z.object({
  maxTokens: z.number().int().nonnegative(),
  behavior: z.enum(["warn", "stop"]),
  supported: z.boolean(),
  tokensUsed: z.number().int().nonnegative(),
  exceeded: z.boolean(),
});

const runStatusLocaleSchema = z.object({
  locale: z.string(),
  status: z.enum(["succeeded", "partial", "failed"]),
  needsReview: z.array(needsReviewEntrySchema),
  usage: usageSummarySchema.optional(),
});

const runStatusFileSchema = z.object({
  version: z.number().int().positive(),
  generatedAt: z.string(),
  usage: usageSummarySchema.optional(),
  budget: runBudgetSchema.optional(),
  locales: z.array(runStatusLocaleSchema),
});

export function runStatusFilePath(cwd: string): string {
  return resolve(cwd, RUN_STATUS_DIR_NAME, RUN_STATUS_FILE_NAME);
}

function toRunStatusLocale(locale: LocaleSummary): RunStatusLocale {
  return {
    locale: locale.locale,
    status: locale.status,
    needsReview: locale.needsReview,
    ...(locale.usage !== undefined ? { usage: locale.usage } : {}),
  };
}

export function buildRunStatusFile(
  summary: RunSummary,
  generatedAt: string = new Date().toISOString(),
): RunStatusFile {
  return {
    version: CURRENT_VERSION,
    generatedAt,
    ...(summary.usage !== undefined ? { usage: summary.usage } : {}),
    ...(summary.budget !== undefined ? { budget: summary.budget } : {}),
    locales: summary.locales.map(toRunStatusLocale),
  };
}

function fromParsed(data: z.infer<typeof runStatusFileSchema>): RunStatusFile {
  return {
    version: data.version,
    generatedAt: data.generatedAt,
    ...(data.usage !== undefined ? { usage: data.usage } : {}),
    ...(data.budget !== undefined ? { budget: data.budget } : {}),
    locales: data.locales.map((locale) => ({
      locale: locale.locale,
      status: locale.status,
      needsReview: locale.needsReview,
      ...(locale.usage !== undefined ? { usage: locale.usage } : {}),
    })),
  };
}

export async function readRunStatusFile(
  path: string,
  fs: SdkFs,
): Promise<RunStatusFile | undefined> {
  let read: BoundedFileRead;
  try {
    read = await fs.readFileBounded(path, MAX_RUN_STATUS_FILE_BYTES);
  } catch {
    return undefined;
  }
  if (read.kind !== "ok") {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.content);
  } catch {
    return undefined;
  }
  const result = runStatusFileSchema.safeParse(parsed);
  if (!result.success || result.data.version !== CURRENT_VERSION) {
    return undefined;
  }
  return fromParsed(result.data);
}

export async function writeRunStatusFile(
  path: string,
  data: RunStatusFile,
  fs: SdkFs,
): Promise<void> {
  await fs.mkdir?.(dirname(path));
  await fs.writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}
