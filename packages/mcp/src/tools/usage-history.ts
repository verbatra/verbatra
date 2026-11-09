import {
  RUN_HISTORY_DEFAULT_LIMIT,
  RUN_HISTORY_MAX_LIMIT,
  runHistory,
  runHistoryResultSchema,
} from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";

const paramsSchema = z.strictObject({
  limit: z.number().optional(),
});

type UsageHistoryResult = z.infer<typeof runHistoryResultSchema>;

async function usageHistory(
  params: z.infer<typeof paramsSchema>,
  context: McpToolContext,
): Promise<UsageHistoryResult> {
  return runHistory(
    { cwd: context.cwd, ...(params.limit !== undefined ? { limit: params.limit } : {}) },
    { ...(context.fs !== undefined ? { fs: context.fs } : {}) },
  );
}

export const usageHistoryTool = defineTool({
  name: "usage.history",
  values: "none",
  description:
    "Reads the local run history: one record per finished translate, watch, " +
    "translation.translatePending or retranslation run that changed something, newest first, " +
    "with when it ran, what triggered it (translate or retranslate), the provider and model, " +
    "the tokens it used, what it cost, and per locale the counts of translated keys, cache " +
    "hits, fuzzy hits, generated plural forms, pruned keys, integrity refusals and provider " +
    "failures, plus how many keys were missing, stale or up to date afterwards. Use it to " +
    "report spend and coverage over time, where usage.summary only reports the last run. " +
    "Records hold counts only, never a key name or a text. cost is frozen when the run ended, " +
    "from the rates the config held then: pricing priced carries currency, asOf and amount; " +
    "no-rate-on-file, rate-unit-mismatch and not-billed carry no amount, so report them as " +
    "no rate and never as free. A cost with basis source-characters is an estimate from the " +
    "source characters sent to a machine-translation provider that reports no usage: say " +
    "estimated, and mention its caveats; keys the provider failed on are not counted. " +
    "A locale without coverage was not measured in that run. Dry runs and runs that changed " +
    "nothing are not recorded, and the file keeps the newest 1000 records. " +
    "The optional limit says how many of the newest records to return: " +
    `${RUN_HISTORY_DEFAULT_LIMIT} by default and at most ${RUN_HISTORY_MAX_LIMIT}, a larger ` +
    "value is reduced to that. total counts every readable record, unreadableRecords the " +
    "lines that could not be read and were left out, and unavailable is set when the whole " +
    "file could not be read, so an empty records list is then not proof that no run happened. " +
    "Read-only: it calls no provider and writes nothing.",
  paramsSchema,
  outputSchema: runHistoryResultSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: usageHistory,
});
