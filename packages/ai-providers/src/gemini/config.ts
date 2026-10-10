import { z } from "zod";
import { localeMapConfigSchema } from "../locale-map.js";
import { requestTimeoutConfigSchema } from "../request-timeout-config.js";

export const geminiConfigSchema = z
  .object({
    model: z.string().min(1),
    maxOutputTokens: z.number().int().positive(),
  })
  .extend(requestTimeoutConfigSchema.shape)
  .extend(localeMapConfigSchema.shape);

export type GeminiConfig = z.infer<typeof geminiConfigSchema>;
