import { describe, expect, it } from "vitest";
import { proxiesInEffect, resolveProviderEndpoint } from "./endpoints.js";

describe("resolveProviderEndpoint", () => {
  it.each([
    ["anthropic", "https://api.anthropic.com"],
    ["openai", "https://api.openai.com/v1"],
    ["gemini", "https://generativelanguage.googleapis.com/"],
    ["deepl", "https://api.deepl.com"],
    ["google-translate", "https://translation.googleapis.com/language/translate/v2"],
  ] as const)("resolves the %s default to a known public endpoint", (id, url) => {
    expect(resolveProviderEndpoint({ id }, {})).toEqual({
      url,
      knownPublic: true,
      transport: id === "deepl" ? "axios" : "fetch",
    });
  });

  it.each([
    ["anthropic", "ANTHROPIC_BASE_URL"],
    ["openai", "OPENAI_BASE_URL"],
    ["gemini", "GOOGLE_GEMINI_BASE_URL"],
  ] as const)("follows the %s SDK's own base-URL variable", (id, variable) => {
    expect(resolveProviderEndpoint({ id }, { [variable]: " http://10.0.0.5:8080 " })).toEqual({
      url: "http://10.0.0.5:8080",
      knownPublic: false,
      transport: "fetch",
      overriddenBy: variable,
    });
  });

  it("ignores an empty override", () => {
    expect(resolveProviderEndpoint({ id: "anthropic" }, { ANTHROPIC_BASE_URL: "" }).url).toBe(
      "https://api.anthropic.com",
    );
  });

  it("picks the DeepL free endpoint for a :fx key", () => {
    expect(resolveProviderEndpoint({ id: "deepl" }, { DEEPL_API_KEY: "abc:fx" }).url).toBe(
      "https://api-free.deepl.com",
    );
  });

  it.each(["GOOGLE_GENAI_USE_VERTEXAI", "GOOGLE_GENAI_USE_ENTERPRISE"])(
    "marks Gemini unsupported when %s switches it to Vertex AI",
    (variable) => {
      const endpoint = resolveProviderEndpoint({ id: "gemini" }, { [variable]: "TRUE" });
      expect(endpoint.unsupported).toContain(variable);
      expect(
        resolveProviderEndpoint({ id: "gemini" }, { [variable]: "false" }).unsupported,
      ).toBeUndefined();
    },
  );

  it("uses the configured base URL for openai-compatible", () => {
    expect(
      resolveProviderEndpoint(
        { id: "openai-compatible", baseUrl: "http://localhost:11434/v1" },
        { OPENAI_BASE_URL: "https://elsewhere.example" },
      ),
    ).toEqual({ url: "http://localhost:11434/v1", knownPublic: false, transport: "fetch" });
  });
});

describe("proxiesInEffect", () => {
  const proxyEnv = {
    HTTPS_PROXY: "http://proxy.corp:3128",
    http_proxy: "10.0.0.9:8080",
    ALL_PROXY: "http://[",
  };

  it("ignores proxy variables for fetch unless Node's env proxy is switched on", () => {
    expect(proxiesInEffect("fetch", proxyEnv, [])).toEqual([]);
    expect(proxiesInEffect("fetch", { ...proxyEnv, NODE_USE_ENV_PROXY: "0" }, [])).toEqual([]);
    expect(
      proxiesInEffect("fetch", { ...proxyEnv, NODE_OPTIONS: "--use-env-proxy-x" }, []),
    ).toEqual([]);
  });

  it.each([
    ["NODE_USE_ENV_PROXY=1", { NODE_USE_ENV_PROXY: "1" }, []],
    [
      "--use-env-proxy in NODE_OPTIONS",
      { NODE_OPTIONS: "--max-old-space-size=512 --use-env-proxy" },
      [],
    ],
    ["--use-env-proxy in execArgv", {}, ["--use-env-proxy"]],
  ])("detects the env proxy for fetch through %s", (_, extra, execArgv) => {
    expect(proxiesInEffect("fetch", { ...proxyEnv, ...extra }, execArgv)).toHaveLength(3);
  });

  it("reads the running process's execArgv by default", () => {
    expect(proxiesInEffect("fetch", proxyEnv)).toEqual(
      process.execArgv.includes("--use-env-proxy") ? expect.any(Array) : [],
    );
  });

  it("lists every set proxy variable for axios, and for fetch when switched on", () => {
    const expected = [
      { variable: "HTTPS_PROXY", host: "proxy.corp" },
      { variable: "http_proxy", host: "10.0.0.9" },
      { variable: "ALL_PROXY", host: undefined },
    ];
    expect(proxiesInEffect("axios", proxyEnv, [])).toEqual(expected);
    expect(proxiesInEffect("fetch", { ...proxyEnv, NODE_USE_ENV_PROXY: "1" }, [])).toEqual(
      expected,
    );
  });

  it("treats a proxy URL without a host as unparseable", () => {
    expect(proxiesInEffect("axios", { HTTPS_PROXY: "file:///tmp/x" })).toEqual([
      { variable: "HTTPS_PROXY", host: undefined },
    ]);
  });
});
