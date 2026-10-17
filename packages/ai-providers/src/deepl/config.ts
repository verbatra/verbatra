import { z } from "zod";
import { localeMapConfigSchema } from "../locale-map.js";
import { requestTimeoutConfigSchema } from "../request-timeout-config.js";

export const deepLConfigSchema = z
  .object({
    glossaryId: z.string().min(1).optional(),
  })
  .extend(requestTimeoutConfigSchema.shape)
  .extend(localeMapConfigSchema.shape);

export type DeepLConfig = z.infer<typeof deepLConfigSchema>;
