import { z } from "zod";

export const provenanceMarkersSchema = z.enum(["written", "unavailable"]);

/**
 * The zod schema for an {@link ExportWorkbookResult}, the `result` of `verbatra export --json`.
 *
 * A zod 4 schema: `parse` accepts fields it does not list and strips them from its result.
 */
export const exportWorkbookResultSchema = z.object({
  path: z.string(),
  locales: z.array(z.object({ locale: z.string(), rows: z.number() })).readonly(),
  provenanceMarkers: provenanceMarkersSchema.exactOptional(),
});
