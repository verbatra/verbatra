import { lockState } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool } from "./define-tool.js";

const paramsSchema = z.strictObject({});

const lockLocaleStateSchema = z.strictObject({
  locale: z.string(),
  keyCount: z.number(),
  missing: z.number(),
  stale: z.number(),
  upToDate: z.number(),
});

const lockStateResultSchema = z.object({
  exists: z.boolean(),
  version: z.number().optional(),
  locales: z.array(lockLocaleStateSchema).readonly().optional(),
});

type LockStateResult = z.infer<typeof lockStateResultSchema>;

async function readLockState(
  _params: z.infer<typeof paramsSchema>,
  context: McpToolContext,
): Promise<LockStateResult> {
  return lockState({ config: context.config.config, cwd: context.cwd });
}

export const lockStateTool = defineTool({
  name: "lock.state",
  description:
    "Read the translation lock file: its version, and per configured target locale how many " +
    "keys are missing, stale, or up to date. Reports exists: false when no lock file exists yet, " +
    "which happens before the first successful translate run in this project. Read-only, calls " +
    "no provider.",
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
