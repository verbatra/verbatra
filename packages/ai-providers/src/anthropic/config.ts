import { z } from "zod";
import { localeMapConfigSchema } from "../locale-map.js";
import { requestTimeoutConfigSchema } from "../request-timeout-config.js";

export const anthropicConfigSchema = z
  .object({
    model: z.string().min(1),
    maxTokens: z.number().int().positive(),
  })
  .extend(requestTimeoutConfigSchema.shape)
  .extend(localeMapConfigSchema.shape);

export type AnthropicConfig = z.infer<typeof anthropicConfigSchema>;
