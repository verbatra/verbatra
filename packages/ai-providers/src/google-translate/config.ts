import { z } from "zod";
import { localeMapConfigSchema } from "../locale-map.js";
import { requestTimeoutConfigSchema } from "../request-timeout-config.js";

export const googleTranslateConfigSchema = z
  .object({})
  .extend(requestTimeoutConfigSchema.shape)
  .extend(localeMapConfigSchema.shape);

export type GoogleTranslateConfig = z.infer<typeof googleTranslateConfigSchema>;
