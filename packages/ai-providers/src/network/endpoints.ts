import { GOOGLE_TRANSLATE_ENDPOINT } from "../google-translate/endpoint.js";
import { PROVIDER_ENV } from "../key-env-vars.js";
import type { EnvironmentSource } from "./environment-rule.js";

export type EndpointTarget =
  | { readonly id: "anthropic" | "openai" | "gemini" | "deepl" | "google-translate" }
  | { readonly id: "openai-compatible"; readonly baseUrl: string };

export type EndpointTransport = "fetch" | "axios";

export interface ProviderEndpoint {
  readonly url: string;
  readonly knownPublic: boolean;
  readonly transport: EndpointTransport;
  readonly overriddenBy?: string;
  readonly unsupported?: string;
}

export const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com";
export const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
export const GEMINI_DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/";
export const DEEPL_BASE_URL = "https://api.deepl.com";
export const DEEPL_FREE_BASE_URL = "https://api-free.deepl.com";

const GEMINI_VERTEX_SWITCHES = ["GOOGLE_GENAI_USE_VERTEXAI", "GOOGLE_GENAI_USE_ENTERPRISE"];

function readTrimmed(env: EnvironmentSource, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function fetchEndpoint(
  env: EnvironmentSource,
  variable: string,
  fallback: string,
): ProviderEndpoint {
  const override = readTrimmed(env, variable);
  return override === undefined
    ? { url: fallback, knownPublic: true, transport: "fetch" }
    : { url: override, knownPublic: false, transport: "fetch", overriddenBy: variable };
}

function geminiEndpoint(env: EnvironmentSource): ProviderEndpoint {
  const endpoint = fetchEndpoint(env, "GOOGLE_GEMINI_BASE_URL", GEMINI_DEFAULT_BASE_URL);
  const vertexSwitch = GEMINI_VERTEX_SWITCHES.find(
    (name) => readTrimmed(env, name)?.toLowerCase() === "true",
  );
  return vertexSwitch === undefined
    ? endpoint
    : {
        ...endpoint,
        unsupported: `${vertexSwitch} switches the Gemini client to Vertex AI, whose sign-in requests bypass the network policy`,
      };
}

function deepLEndpoint(env: EnvironmentSource): ProviderEndpoint {
  const freeAccount = env[PROVIDER_ENV.deepl]?.endsWith(":fx") === true;
  return {
    url: freeAccount ? DEEPL_FREE_BASE_URL : DEEPL_BASE_URL,
    knownPublic: true,
    transport: "axios",
  };
}

export function resolveProviderEndpoint(
  target: EndpointTarget,
  env: EnvironmentSource,
): ProviderEndpoint {
  switch (target.id) {
    case "anthropic":
      return fetchEndpoint(env, "ANTHROPIC_BASE_URL", ANTHROPIC_DEFAULT_BASE_URL);
    case "openai":
      return fetchEndpoint(env, "OPENAI_BASE_URL", OPENAI_DEFAULT_BASE_URL);
    case "gemini":
      return geminiEndpoint(env);
    case "deepl":
      return deepLEndpoint(env);
    case "google-translate":
      return { url: GOOGLE_TRANSLATE_ENDPOINT, knownPublic: true, transport: "fetch" };
    case "openai-compatible":
      return { url: target.baseUrl, knownPublic: false, transport: "fetch" };
  }
}

const PROXY_ENV_VARS = [
  "HTTPS_PROXY",
  "https_proxy",
  "HTTP_PROXY",
  "http_proxy",
  "ALL_PROXY",
  "all_proxy",
];

export const NODE_PROXY_SWITCH = "NODE_USE_ENV_PROXY";

export interface ProxyInEffect {
  readonly variable: string;
  readonly host: string | undefined;
}

function proxyHost(value: string): string | undefined {
  const withScheme = value.includes("://") ? value : `http://${value}`;
  try {
    const host = new URL(withScheme).hostname;
    return host.length === 0 ? undefined : host;
  } catch {
    return undefined;
  }
}

export function proxiesInEffect(
  transport: EndpointTransport,
  env: EnvironmentSource,
): readonly ProxyInEffect[] {
  if (transport === "fetch" && readTrimmed(env, NODE_PROXY_SWITCH) !== "1") {
    return [];
  }
  return PROXY_ENV_VARS.flatMap((variable) => {
    const value = readTrimmed(env, variable);
    return value === undefined ? [] : [{ variable, host: proxyHost(value) }];
  });
}
