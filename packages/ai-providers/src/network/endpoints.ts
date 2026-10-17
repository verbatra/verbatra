import { GOOGLE_TRANSLATE_ENDPOINT } from "../google-translate/endpoint.js";
import { PROVIDER_ENV } from "../key-env-vars.js";
import { type EnvironmentSource, readTrimmed } from "./environment-rule.js";

export type EndpointTarget =
  | { readonly id: "anthropic" | "openai" | "gemini" | "deepl" | "google-translate" }
  | { readonly id: "openai-compatible" | "libretranslate"; readonly baseUrl: string };

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

function deepLEndpointFor(freeAccount: boolean): ProviderEndpoint {
  return {
    url: freeAccount ? DEEPL_FREE_BASE_URL : DEEPL_BASE_URL,
    knownPublic: true,
    transport: "axios",
  };
}

function deepLEndpoint(env: EnvironmentSource): ProviderEndpoint {
  return deepLEndpointFor(env[PROVIDER_ENV.deepl]?.endsWith(":fx") === true);
}

export type EndpointKeyCondition = "free-key" | "paid-key";

export interface EndpointCandidate {
  readonly endpoint: ProviderEndpoint;
  readonly when?: EndpointKeyCondition;
}

export function endpointCandidates(
  target: EndpointTarget,
  env: EnvironmentSource,
): readonly EndpointCandidate[] {
  if (target.id === "deepl") {
    return [
      { endpoint: deepLEndpointFor(false), when: "paid-key" },
      { endpoint: deepLEndpointFor(true), when: "free-key" },
    ];
  }
  return [{ endpoint: resolveProviderEndpoint(target, env) }];
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
    case "libretranslate":
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

export const NODE_PROXY_FLAG = "--use-env-proxy";

export function fetchUsesEnvProxy(env: EnvironmentSource, execArgv: readonly string[]): boolean {
  const nodeOptions = readTrimmed(env, "NODE_OPTIONS")?.split(/\s+/) ?? [];
  return (
    readTrimmed(env, NODE_PROXY_SWITCH) === "1" ||
    nodeOptions.includes(NODE_PROXY_FLAG) ||
    execArgv.includes(NODE_PROXY_FLAG)
  );
}

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
  execArgv: readonly string[] = process.execArgv,
): readonly ProxyInEffect[] {
  if (transport === "fetch" && !fetchUsesEnvProxy(env, execArgv)) {
    return [];
  }
  return PROXY_ENV_VARS.flatMap((variable) => {
    const value = readTrimmed(env, variable);
    return value === undefined ? [] : [{ variable, host: proxyHost(value) }];
  });
}
