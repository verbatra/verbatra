import { z } from "zod";

export const provenanceMarkersSchema = z.enum(["written", "unavailable"]);

/**
 * The zod schema for an {@link ExportWorkbookResult}, the `result` of `verbatra export --json`.
 * It allows fields it does not list.
 */
export const exportWorkbookResultSchema = z.object({
  path: z.string(),
  locales: z.array(z.object({ locale: z.string(), rows: z.number() })).readonly(),
  provenanceMarkers: provenanceMarkersSchema.exactOptional(),
});
