import { z } from "zod";

export const limitsFileNoticeSchema = z.object({
  code: z.literal("LIMITS_FILE_IGNORED"),
  message: z.string(),
});
