import { z } from "zod";
import { requestTimeoutConfigSchema } from "../request-timeout-config.js";

export const googleTranslateConfigSchema = z.object({}).extend(requestTimeoutConfigSchema.shape);

export type GoogleTranslateConfig = z.infer<typeof googleTranslateConfigSchema>;
