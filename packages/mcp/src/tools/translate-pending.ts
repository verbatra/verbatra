import { assertMachineTranslationEnabled, translate } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolCallContext } from "../types.js";
import { defineTool } from "./define-tool.js";
import {
  DEFAULT_LOCK_TIMEOUT_MS,
  lockAcquireTimeoutMs,
  lockTimeoutMsSchema,
  MAX_LOCK_TIMEOUT_MS,
} from "./lock-timeout.js";
import { redactRunSummary, runSummarySchema } from "./run-schema.js";

const paramsSchema = z.strictObject({
  locales: z.array(z.string().min(1)).min(1).optional(),
  maxTokens: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  lockTimeoutMs: lockTimeoutMsSchema,
});

type TranslatePendingResult = z.infer<typeof runSummarySchema>;

async function translatePending(
  params: z.infer<typeof paramsSchema>,
  context: McpToolCallContext,
): Promise<TranslatePendingResult> {
  assertMachineTranslationEnabled(context.config.config, "translating every pending key");
  return translate(
    {
      config: context.config.config,
      cwd: context.cwd,
      ...(params.locales !== undefined ? { locales: params.locales } : {}),
      ...(params.maxTokens !== undefined ? { maxTokens: params.maxTokens } : {}),
      lockAcquireTimeoutMs: lockAcquireTimeoutMs(params.lockTimeoutMs),
      ...(context.onProgress !== undefined ? { onProgress: context.onProgress } : {}),
      ...(context.signal !== undefined ? { signal: context.signal } : {}),
    },
    {
      ...(context.fs !== undefined ? { fs: context.fs } : {}),
      ...(context.adapterRegistry !== undefined
        ? { adapterRegistry: context.adapterRegistry }
        : {}),
      ...(context.createProvider !== undefined ? { createProvider: context.createProvider } : {}),
    },
  );
}

export const translatePendingTool = defineTool({
  name: "translation.translatePending",
  values: { redact: redactRunSummary },
  description:
    "Translates every missing or stale key across the configured target locales in one run, " +
    "calling the configured translation provider and writing the resulting locale files, lock " +
    "file, and run status; the same operation as the verbatra translate CLI command. The " +
    "optional locales parameter narrows the run to the named configured target locales, and " +
    "leaves every other locale untouched; a locale that is not a configured target fails the " +
    "call with UNKNOWN_LOCALE before anything is spent. The optional maxTokens parameter is a " +
    "hard token ceiling for this call, the same as the CLI's --max-tokens: a request that " +
    "would pass it is withheld rather than sent, its keys are listed under budgetWithheld, and " +
    "when the config also sets maxTokens the lower of the two applies. Call " +
    "translation.estimate with the same locales first and show the user the figure. Use it " +
    "only after status.diff has shown the user what would change and the user has explicitly " +
    "agreed to spend. Do not retry it as though it were free: it is not idempotent and bills " +
    "again for whatever is still pending, and a run that fails partway can leave some locales " +
    "written and others untouched. It deletes orphaned keys when project.snapshot reports " +
    "prune: true; say so to the user before running it. Pinned keys are always left alone. " +
    "Stale keys a person wrote, imported, or changed outside verbatra are left alone too, and " +
    "listed under protected in each locale, unless project.snapshot reports humanEdits: " +
    "overwrite, in which case they are retranslated like any other key; under humanEdits: " +
    "suggest they are also sent to the provider for a suggestion that is reported but never " +
    "written. Each locale's integrityRefusals names every key the integrity gate refused, " +
    "with the reason (placeholder, markup, icu, degenerate, or empty) and, when one part is at " +
    "fault, details such as the dropped placeholder or the ICU arm that does not fit the " +
    "target language. Check failed and partial before treating the run as clean, then read " +
    "review.queue for what needs a person. The optional lockTimeoutMs parameter, 0 to " +
    `${MAX_LOCK_TIMEOUT_MS} milliseconds and ${DEFAULT_LOCK_TIMEOUT_MS} by default, bounds` +
    " how long each locale waits for a write lock " +
    "another process holds; a locale that times out fails with LOCK_CONTENDED on its own " +
    "summary before any provider call, and the other locales still run. Cost: calls a translation provider and bills your " +
    "API usage, within the config's token budget and the maxTokens parameter when either is " +
    "set. Only listed when the server was started with spending allowed and a translation " +
    "provider is configured.",
  paramsSchema,
  outputSchema: runSummarySchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: translatePending,
});
