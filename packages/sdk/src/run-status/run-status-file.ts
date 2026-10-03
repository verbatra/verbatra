import { dirname, resolve } from "node:path";
import { REVIEW_REASON_CODES, type ReviewReasonCode } from "@verbatra/ai-providers";
import { z } from "zod";
import type { LocaleSummary, NeedsReviewEntry, RunSummary } from "../flow/summary.js";
import type { BoundedFileRead, SdkFs } from "../fs.js";
import type { RunStatusFile, RunStatusLocale } from "./types.js";

/**
 * Why {@link runStatus} reported `available: false`:
 *
 * - `no-status-file`: no `.verbatra-local/run-status.json` exists, so no non-dry run has completed
 *   in this directory yet.
 * - `unreadable`: something exists at the path but could not be read: the process may not open it,
 *   it is not a regular file, it exceeds the size limit, or the read itself failed.
 * - `invalid`: the file is not JSON, or its JSON at the current version does not have the
 *   run-status shape.
 * - `unsupported-version`: the file names a format version this verbatra does not read, whatever
 *   the rest of its shape.
 */
export type RunStatusUnavailableReason = (typeof RUN_STATUS_UNAVAILABLE_REASONS)[number];

/** Every {@link RunStatusUnavailableReason}. */
export const RUN_STATUS_UNAVAILABLE_REASONS = Object.freeze([
  "no-status-file",
  "unreadable",
  "invalid",
  "unsupported-version",
] as const);

const RUN_STATUS_DIR_NAME = ".verbatra-local";
const RUN_STATUS_FILE_NAME = "run-status.json";

const CURRENT_VERSION = 1;

const RECONCILED_BUDGET_COUNTING = "reconciled";

const MAX_RUN_STATUS_FILE_BYTES = 16 * 1024 * 1024;

const needsReviewEntrySchema = z.object({
  key: z.string(),
  reasons: z.array(z.string()),
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

const fuzzyCacheHitSchema = z.object({
  key: z.string(),
  previousSource: z.string(),
  similarity: z.number().min(0).max(1),
});

const runStatusLocaleSchema = z.object({
  locale: z.string(),
  status: z.enum(["succeeded", "partial", "failed"]),
  needsReview: z.array(needsReviewEntrySchema),
  fuzzyHits: z.array(fuzzyCacheHitSchema).optional(),
  usage: usageSummarySchema.optional(),
});

const versionSchema = z.object({ version: z.number() });

const runStatusFileSchema = z.object({
  version: z.number().int().positive(),
  generatedAt: z.string(),
  usage: usageSummarySchema.optional(),
  budget: runBudgetSchema.optional(),
  budgetCounting: z.literal(RECONCILED_BUDGET_COUNTING).optional(),
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
    ...(locale.fuzzyHits.length > 0 ? { fuzzyHits: locale.fuzzyHits } : {}),
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

type ParsedRunStatusFile = z.infer<typeof runStatusFileSchema>;

function countedBudget(data: ParsedRunStatusFile): ParsedRunStatusFile["budget"] {
  if (data.budgetCounting === undefined && data.budget?.supported === false) {
    return undefined;
  }
  return data.budget;
}

type ParsedNeedsReviewEntry = z.infer<typeof needsReviewEntrySchema>;

function isReviewReasonCode(value: string): value is ReviewReasonCode {
  return (REVIEW_REASON_CODES as readonly string[]).includes(value);
}

function knownNeedsReview(entries: readonly ParsedNeedsReviewEntry[]): NeedsReviewEntry[] {
  return entries.flatMap((entry) => {
    const reasons = entry.reasons.filter(isReviewReasonCode);
    return reasons.length > 0 ? [{ key: entry.key, reasons }] : [];
  });
}

function fromParsed(data: ParsedRunStatusFile): RunStatusFile {
  const budget = countedBudget(data);
  return {
    version: data.version,
    generatedAt: data.generatedAt,
    ...(data.usage !== undefined ? { usage: data.usage } : {}),
    ...(budget !== undefined ? { budget } : {}),
    locales: data.locales.map((locale) => ({
      locale: locale.locale,
      status: locale.status,
      needsReview: knownNeedsReview(locale.needsReview),
      ...(locale.fuzzyHits !== undefined ? { fuzzyHits: locale.fuzzyHits } : {}),
      ...(locale.usage !== undefined ? { usage: locale.usage } : {}),
    })),
  };
}

export type RunStatusRead =
  | { readonly kind: "ok"; readonly file: RunStatusFile }
  | { readonly kind: "unavailable"; readonly reason: RunStatusUnavailableReason };

function unavailable(reason: RunStatusUnavailableReason): RunStatusRead {
  return { kind: "unavailable", reason };
}

async function readBounded(path: string, fs: SdkFs): Promise<BoundedFileRead | undefined> {
  try {
    return await fs.readFileBounded(path, MAX_RUN_STATUS_FILE_BYTES);
  } catch {
    return undefined;
  }
}

function parseJson(content: string): { readonly value: unknown } | undefined {
  try {
    return { value: JSON.parse(content) };
  } catch {
    return undefined;
  }
}

function notRead(read: BoundedFileRead | undefined): RunStatusRead {
  return read?.kind === "missing" && read.unreadable !== true
    ? unavailable("no-status-file")
    : unavailable("unreadable");
}

function fromJson(value: unknown): RunStatusRead {
  const header = versionSchema.safeParse(value);
  if (!header.success) {
    return unavailable("invalid");
  }
  if (header.data.version !== CURRENT_VERSION) {
    return unavailable("unsupported-version");
  }
  const result = runStatusFileSchema.safeParse(value);
  return result.success ? { kind: "ok", file: fromParsed(result.data) } : unavailable("invalid");
}

export async function readRunStatusFile(path: string, fs: SdkFs): Promise<RunStatusRead> {
  const read = await readBounded(path, fs);
  if (read?.kind !== "ok") {
    return notRead(read);
  }
  const parsed = parseJson(read.content);
  return parsed === undefined ? unavailable("invalid") : fromJson(parsed.value);
}

export async function writeRunStatusFile(
  path: string,
  data: RunStatusFile,
  fs: SdkFs,
): Promise<void> {
  await fs.mkdir?.(dirname(path));
  const persisted = { ...data, budgetCounting: RECONCILED_BUDGET_COUNTING };
  await fs.writeFile(path, `${JSON.stringify(persisted, null, 2)}\n`);
}
