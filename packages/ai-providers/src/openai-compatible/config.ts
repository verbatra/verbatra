import { z } from "zod";
import type { ProviderCallContext } from "../guard.js";
import { PROVIDER_ENV } from "../key-env-vars.js";
import { localeMapConfigSchema } from "../locale-map.js";
import { requestTimeoutConfigSchema } from "../request-timeout-config.js";

const HOSTED_PROVIDER_ENV_VARS: ReadonlySet<string> = new Set(
  Object.values(PROVIDER_ENV).map((name) => name.toUpperCase()),
);

function isNotHostedProviderEnvVar(value: string): boolean {
  return !HOSTED_PROVIDER_ENV_VARS.has(value.toUpperCase());
}

const HTTP_OR_HTTPS_SCHEME = /^https?:\/\//i;

export const openAiCompatibleConfigSchema = z
  .object({
    baseUrl: z
      .url({ message: "baseUrl must be a valid absolute URL." })
      .regex(HTTP_OR_HTTPS_SCHEME, { message: "baseUrl must use the http or https scheme." }),
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

/**
 * What a transport failure against this endpoint may name: the host and port of the configured
 * `baseUrl`, and nothing else. Deliberately only the URL's `host` component, so any path, query, or
 * user-info in `baseUrl` (where an embedded credential would live) can never travel into a message.
 * Undefined when the value does not parse as a URL at all.
 */
export function endpointContextOf(baseUrl: string): ProviderCallContext | undefined {
  try {
    return { endpointHost: new URL(baseUrl).host };
  } catch {
    return undefined;
  }
}
