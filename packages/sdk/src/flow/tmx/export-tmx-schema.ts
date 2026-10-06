import { z } from "zod";
import { provenanceMarkersSchema } from "../workbook/export-workbook-schema.js";

/**
 * The zod schema for an {@link ExportTmxResult}, the `result` of `verbatra tmx export --json`. It
 * allows fields it does not list.
 */
export const exportTmxResultSchema = z.object({
  path: z.string(),
  units: z.number(),
  locales: z.array(z.object({ locale: z.string(), units: z.number() })).readonly(),
  withoutSource: z.number(),
  illegalCharactersRemoved: z.number(),
  provenanceMarkers: provenanceMarkersSchema,
});
