import { z } from "zod";
import { httpBaseUrlSchema } from "../base-url.js";
import { PROVIDER_ENV } from "../key-env-vars.js";
import { localeMapConfigSchema } from "../locale-map.js";
import { requestTimeoutConfigSchema } from "../request-timeout-config.js";

const HOSTED_PROVIDER_ENV_VARS: ReadonlySet<string> = new Set(
  Object.values(PROVIDER_ENV).map((name) => name.toUpperCase()),
);

function isNotHostedProviderEnvVar(value: string): boolean {
  return !HOSTED_PROVIDER_ENV_VARS.has(value.toUpperCase());
}

export const openAiCompatibleConfigSchema = z
  .object({
    baseUrl: httpBaseUrlSchema,
    model: z.string().min(1),
    maxOutputTokens: z.number().int().positive(),
    apiKeyEnvVar: z
      .string()
      .min(1)
      .refine(isNotHostedProviderEnvVar, {
        message: "apiKeyEnvVar must not name a hosted provider's environment variable.",
      })
      .optional(),
  })
  .extend(requestTimeoutConfigSchema.shape)
  .extend(localeMapConfigSchema.shape);

export type OpenAiCompatibleConfig = z.infer<typeof openAiCompatibleConfigSchema>;
