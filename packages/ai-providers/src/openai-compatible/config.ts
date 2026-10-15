import { z } from "zod";
import { httpBaseUrlSchema } from "../base-url.js";
import { PROVIDER_ENV } from "../key-env-vars.js";
import { localeMapConfigSchema } from "../locale-map.js";
import { requestTimeoutConfigSchema } from "../request-timeout-config.js";

const HOSTED_PROVIDER_ENV_VARS: ReadonlySet<string> = new Set(
  Object.values(PROVIDER_ENV).map((name) => name.toUpperCase()),
);

const ENDPOINT_PATH_SUFFIX = /\/(?:chat\/)?completions\/*$/i;

export const ENDPOINT_PATH_BASE_URL_MESSAGE =
  "baseUrl must be the API root, usually ending in /v1, not the /chat/completions or " +
  "/completions endpoint: verbatra appends /chat/completions itself.";

function isNotEndpointPath(value: string): boolean {
  try {
    return !ENDPOINT_PATH_SUFFIX.test(new URL(value).pathname);
  } catch {
    return true;
  }
}

function isNotHostedProviderEnvVar(value: string): boolean {
  return !HOSTED_PROVIDER_ENV_VARS.has(value.toUpperCase());
}

export const openAiCompatibleConfigSchema = z
  .object({
    baseUrl: httpBaseUrlSchema.refine(isNotEndpointPath, {
      message: ENDPOINT_PATH_BASE_URL_MESSAGE,
    }),
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
