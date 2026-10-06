import { z } from "zod";
import { PSEUDO_MODES } from "./pseudo.js";

/**
 * The zod schema for a {@link PseudolocalizeResult}, the `result` of `verbatra pseudo --json`. It
 * allows fields it does not list.
 */
export const pseudolocalizeResultSchema = z.object({
  locale: z.string(),
  mode: z.enum(PSEUDO_MODES),
  path: z.string(),
  entries: z.number(),
  transformed: z.number(),
  copied: z.array(z.string()).readonly(),
  written: z.boolean(),
});
