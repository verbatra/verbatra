import { z } from "zod";
import { httpBaseUrlSchema } from "../base-url.js";
import { PROVIDER_ENV } from "../key-env-vars.js";
import { localeMapConfigSchema } from "../locale-map.js";
import { requestTimeoutConfigSchema } from "../request-timeout-config.js";

const HOSTED_PROVIDER_BY_ENV_VAR: ReadonlyMap<string, string> = new Map(
  Object.entries(PROVIDER_ENV).map(([providerId, name]) => [name.toUpperCase(), providerId]),
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

function hostedProviderEnvVarMessage(value: string): string | undefined {
  const providerId = HOSTED_PROVIDER_BY_ENV_VAR.get(value.toUpperCase());
  return providerId === undefined
    ? undefined
    : `apiKeyEnvVar must not name a hosted provider's environment variable. ${value} belongs to ` +
        `the "${providerId}" provider: set provider.id to "${providerId}", or name a different variable.`;
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
      .superRefine((value, ctx) => {
        const message = hostedProviderEnvVarMessage(value);
        if (message !== undefined) {
          ctx.addIssue({ code: "custom", message });
        }
      })
      .optional(),
  })
  .extend(requestTimeoutConfigSchema.shape)
  .extend(localeMapConfigSchema.shape);

export type OpenAiCompatibleConfig = z.infer<typeof openAiCompatibleConfigSchema>;
