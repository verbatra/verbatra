import type { KeyHistoryResult } from "@verbatra/sdk";
import { KEY_HISTORY_MAX_KEY_CHARS } from "@verbatra/sdk";
import { z } from "zod";

export const HISTORY_KEY_REVISIONS_METHOD = "history.keyRevisions";

export const keyRevisionsParamsSchema = z.strictObject({
  locale: z.string().min(1).max(128),
  key: z.string().min(1).max(KEY_HISTORY_MAX_KEY_CHARS),
  limit: z.number().int().positive().optional(),
});

export type KeyRevisionsParams = z.infer<typeof keyRevisionsParamsSchema>;

export type KeyRevisionsResult = KeyHistoryResult;
