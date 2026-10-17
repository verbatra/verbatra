import { z } from "zod";
import type { UnresolvedArgumentReason } from "./message-arguments.js";

const UNRESOLVED_ARGUMENT_REASONS = [
  "invalid-message-syntax",
  "mixed-argument-styles",
  "argument-index-out-of-range",
] as const satisfies readonly UnresolvedArgumentReason[];

/**
 * The zod schema for a {@link GenerateTypesResult}, the `result` of `verbatra types --json`.
 * A zod 4 schema: `parse` accepts fields it does not list and strips them from its result.
 */
export const generateTypesResultSchema = z.object({
  path: z.string(),
  sourcePath: z.string(),
  keys: z.number(),
  withArguments: z.number(),
  unresolved: z
    .array(z.object({ key: z.string(), reason: z.enum(UNRESOLVED_ARGUMENT_REASONS) }))
    .readonly(),
  excluded: z.array(z.string()).readonly(),
  plural: z.array(z.string()).readonly(),
  written: z.boolean(),
  stale: z.boolean(),
  missing: z.boolean(),
  check: z.boolean(),
});
