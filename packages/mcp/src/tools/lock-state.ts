import { lockState } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";
import { provenanceSummarySchema } from "./sdk-result-schemas.js";

const paramsSchema = z.strictObject({});

const lockLocaleStateSchema = z.object({
  locale: z.string(),
  keyCount: z.number(),
  missing: z.number(),
  stale: z.number(),
  upToDate: z.number(),
  emptySource: z.number().optional(),
  provenance: provenanceSummarySchema.optional(),
});

const lockStateResultSchema = z.object({
  exists: z.boolean(),
  version: z.number().optional(),
  locales: z.array(lockLocaleStateSchema).readonly().optional(),
});

export type LockStateResult = z.infer<typeof lockStateResultSchema>;

async function readLockState(
  _params: z.infer<typeof paramsSchema>,
  context: McpToolContext,
): Promise<LockStateResult> {
  return lockState(
    { config: context.config.config, cwd: context.cwd },
    {
      ...(context.fs !== undefined ? { fs: context.fs } : {}),
      ...(context.adapterRegistry !== undefined
        ? { adapterRegistry: context.adapterRegistry }
        : {}),
    },
  );
}

export const lockStateTool = defineTool({
  name: "lock.state",
  values: "none",
  description:
    "Reads the translation lock file: whether it exists and, when it does, its version and " +
    "the per-locale count of keys that are missing, stale, or up to date against the " +
    "recorded baseline. Use it to tell a project that has never been translated, which has " +
    "no lock file (exists: false), from one whose recorded baseline has drifted. Do not " +
    "confuse it with status.check, which compares the locale files themselves rather than " +
    "the recorded baseline. Each locale also carries provenance: counts byOrigin and " +
    "byReviewState over the keys present in both the source and that locale, read from " +
    "verbatra.provenance.json and absent when that file is corrupt or from a newer " +
    "verbatra. emptySource counts the source keys whose value is empty or whitespace only, " +
    "kept out of the other counts so the four add up to the source's keys. Takes no parameters. Read-only: it calls no provider and writes nothing.",
  paramsSchema,
  outputSchema: lockStateResultSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: readLockState,
});
