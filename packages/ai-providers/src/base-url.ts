import { z } from "zod";
import type { ProviderCallContext } from "./guard.js";

const HTTP_OR_HTTPS_SCHEME = /^https?:\/\//i;

export const httpBaseUrlSchema = z
  .url({ message: "baseUrl must be a valid absolute URL." })
  .regex(HTTP_OR_HTTPS_SCHEME, { message: "baseUrl must use the http or https scheme." });

export function endpointContextOf(baseUrl: string): ProviderCallContext | undefined {
  try {
    return { endpointHost: new URL(baseUrl).host };
  } catch {
    return undefined;
  }
}
