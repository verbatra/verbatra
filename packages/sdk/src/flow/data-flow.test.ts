import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join, relative, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderConfig } from "../config/provider-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { defaultFs } from "../fs.js";
import { localeLockPath, withLocaleWriteLock } from "../lock/locale-write-lock.js";
import { baseConfig, makeTempDir } from "../test-support.js";
import { buildDataFlowManifest, dataFlow } from "./data-flow.js";
import { type DataFlowManifest, dataFlowManifestSchema } from "./data-flow-manifest.js";
import { checkNetworkPolicy } from "./network-doctor.js";

const KEY_CANARY = "deepl-canary-7d1e9a4c2b:fx";

const PROVIDERS: readonly ProviderConfig[] = [
  { id: "anthropic", options: { model: "m", maxTokens: 1 } },
  { id: "openai", options: { model: "m", maxOutputTokens: 1 } },
  { id: "gemini", options: { model: "m", maxOutputTokens: 1 } },
  { id: "deepl", options: {} },
  { id: "google-translate", options: {} },
  {
    id: "openai-compatible",
    options: { baseUrl: "http://localhost:1234/v1", model: "m", maxOutputTokens: 1 },
  },
  { id: "libretranslate", options: { baseUrl: "http://127.0.0.1:5000" } },
  { id: "none", options: {} },
];

let projectDir: string;

async function writeSource(content: Record<string, unknown>): Promise<void> {
  await mkdir(join(projectDir, "locales"), { recursive: true });
  await writeFile(join(projectDir, "locales", "en.json"), JSON.stringify(content), "utf8");
}

function manifestFor(
  overrides: Partial<VerbatraConfig>,
  env: Record<string, string> = {},
): Promise<DataFlowManifest> {
  return buildDataFlowManifest(baseConfig(overrides), { cwd: projectDir, fs: defaultFs, env });
}

beforeEach(async () => {
  projectDir = await makeTempDir();
  await writeSource({ hi: "Hi", greet: "Hi {{name}}", rich: "Open <b>{{name}}</b>" });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(projectDir, { recursive: true, force: true });
});

describe("buildDataFlowManifest: one manifest per provider", () => {
  it.each(PROVIDERS)("describes $id in a manifest the schema accepts", async (provider) => {
    const manifest = await manifestFor({ provider });

    expect(dataFlowManifestSchema.parse(manifest)).toEqual(manifest);
    expect(manifest.version).toBe(1);
    expect(manifest.provider.id).toBe(provider.id);
    expect(manifest.agents.map((agent) => agent.id)).toEqual(["mcp", "studio-agent-tools"]);
  });

  it("states that nothing is sent for none, and lists no destination, locale or request", async () => {
    const manifest = await manifestFor({ provider: { id: "none", options: {} } });

    expect(manifest.provider).toEqual({ id: "none", kind: "none" });
    expect(manifest.sent).toMatchObject({
      nothing: true,
      fields: [],
      apiKey: "none",
      placeholders: "none",
    });
    expect(manifest.destinations).toEqual([]);
    expect(manifest.locales).toEqual([]);
    expect(manifest.otherRequests).toEqual([]);
    expect(manifest.sent.counts?.sourceKeys).toBe(3);
  });

  it("names the default host, the model and the LLM fields for a hosted LLM", async () => {
    const manifest = await manifestFor({});

    expect(manifest.provider).toEqual({ id: "anthropic", kind: "llm", model: "test-model" });
    expect(manifest.destinations).toEqual([
      {
        host: "api.anthropic.com",
        source: "default",
        policyCheck: "per-request",
        verdict: "permitted",
        proxies: [],
      },
    ]);
    expect(manifest.sent.fields).toContain("key-name");
    expect(manifest.sent.placeholders).toBe("as-written");
    expect(manifest.sent.apiKey).toBe("required");
    expect(manifest.sent.counts).toEqual({ sourceKeys: 3, keysWithContext: 0 });
    expect(manifest.otherRequests.map((request) => request.id)).toEqual(["dns-lookup"]);
  });

  it("names the configured baseUrl as the openai-compatible host", async () => {
    const manifest = await manifestFor({ provider: PROVIDERS[5] as ProviderConfig });

    expect(manifest.destinations).toEqual([
      {
        host: "localhost",
        source: "config",
        setBy: "provider.options.baseUrl",
        policyCheck: "per-request",
        verdict: "permitted",
        proxies: [],
      },
    ]);
    expect(manifest.sent.apiKey).toBe("optional");
  });

  it("names the *_BASE_URL variable that redirects a hosted provider", async () => {
    const manifest = await manifestFor(
      { provider: { id: "openai", options: { model: "m", maxOutputTokens: 1 } } },
      { OPENAI_BASE_URL: "https://gateway.example/v1" },
    );

    expect(manifest.destinations[0]).toMatchObject({
      host: "gateway.example",
      source: "environment",
      setBy: "OPENAI_BASE_URL",
    });
  });

  it("lists both DeepL hosts and never reads or repeats the key", async () => {
    const manifest = await manifestFor(
      { provider: { id: "deepl", options: {} } },
      { DEEPL_API_KEY: KEY_CANARY },
    );

    expect(
      manifest.destinations.map(({ host, when, policyCheck }) => [host, when, policyCheck]),
    ).toEqual([
      ["api.deepl.com", "paid-key", "before-construction"],
      ["api-free.deepl.com", "free-key", "before-construction"],
    ]);
    expect(JSON.stringify(manifest)).not.toContain("canary");
    expect(manifest.otherRequests).toContainEqual({
      id: "language-list",
      trigger: "verbatra doctor --live",
      sendsApiKey: true,
    });
  });

  it("sends no key to the LibreTranslate language list", async () => {
    const manifest = await manifestFor({ provider: PROVIDERS[6] as ProviderConfig });

    expect(manifest.otherRequests[0]).toEqual({
      id: "language-list",
      trigger: "verbatra doctor --live",
      sendsApiKey: false,
    });
  });
});

describe("buildDataFlowManifest: the network policy verdict", () => {
  it("shows refused when a local-only policy refuses a hosted provider", async () => {
    const manifest = await manifestFor({ network: { policy: "local-only" } });

    expect(manifest.network).toEqual({
      status: "resolved",
      restricted: true,
      rules: [{ source: "config", policy: "local-only", allowedHosts: [] }],
    });
    expect(manifest.destinations[0]?.verdict).toBe("refused");
    expect(manifest.destinations[0]?.reason).toContain("api.anthropic.com");
  });

  it("combines the config rule with VERBATRA_NETWORK_POLICY", async () => {
    const manifest = await manifestFor(
      { provider: PROVIDERS[6] as ProviderConfig, network: { policy: "any" } },
      { VERBATRA_NETWORK_POLICY: "local-only" },
    );

    expect(manifest.network.status === "resolved" && manifest.network.rules).toEqual([
      { source: "config", policy: "any", allowedHosts: [] },
      { source: "environment", policy: "local-only", allowedHosts: [] },
    ]);
    expect(manifest.destinations[0]?.verdict).toBe("permitted");
  });

  it("defers a host name a local-only policy can judge only by its addresses", async () => {
    const manifest = await manifestFor({
      provider: {
        id: "openai-compatible",
        options: { baseUrl: "http://llm.internal:8000/v1", model: "m", maxOutputTokens: 1 },
      },
      network: { policy: "local-only" },
    });

    expect(manifest.destinations[0]?.verdict).toBe("deferred");
  });

  it("reports an invalid policy variable instead of throwing", async () => {
    const manifest = await manifestFor({}, { VERBATRA_NETWORK_POLICY: "nowhere" });

    expect(manifest.network.status).toBe("invalid");
    expect(manifest.destinations[0]).toMatchObject({
      host: "api.anthropic.com",
      verdict: "invalid-policy",
    });
    expect(dataFlowManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it.each(PROVIDERS.filter((provider) => provider.id !== "deepl" && provider.id !== "none"))(
    "agrees with the network-policy check for $id",
    async (provider) => {
      for (const network of [undefined, { policy: "local-only" as const }]) {
        const manifest = await manifestFor({ provider, network });
        const check = checkNetworkPolicy(provider, network, {});
        const refused = manifest.destinations.some(
          (destination) => destination.verdict === "refused",
        );

        expect(refused).toBe(!check.passed);
      }
    },
  );
});

describe("buildDataFlowManifest: proxies", () => {
  it("lists the proxy DeepL's client honours, by variable and host only", async () => {
    const manifest = await manifestFor(
      { provider: { id: "deepl", options: {} } },
      { HTTPS_PROXY: "http://user:secret-canary@proxy.corp.example:3128" },
    );

    expect(manifest.destinations[0]?.proxies).toEqual([
      { variable: "HTTPS_PROXY", host: "proxy.corp.example" },
    ]);
    expect(JSON.stringify(manifest)).not.toContain("canary");
  });

  it("lists a proxy for a fetch provider only when Node's env proxy is on", async () => {
    const off = await manifestFor({}, { HTTPS_PROXY: "http://proxy.corp.example:3128" });
    const on = await manifestFor(
      {},
      { HTTPS_PROXY: "http://proxy.corp.example:3128", NODE_USE_ENV_PROXY: "1" },
    );

    expect(off.destinations[0]?.proxies).toEqual([]);
    expect(on.destinations[0]?.proxies).toEqual([
      { variable: "HTTPS_PROXY", host: "proxy.corp.example" },
    ]);
  });

  it("marks a proxy URL it cannot parse", async () => {
    const manifest = await manifestFor(
      { provider: { id: "deepl", options: {} } },
      { HTTPS_PROXY: "http://[" },
    );

    expect(manifest.destinations[0]?.proxies).toEqual([
      { variable: "HTTPS_PROXY", host: "(unparseable URL)" },
    ]);
  });
});

describe("dataFlowManifestSchema: additive contract", () => {
  it("parses a manifest with an unknown field at every level and keeps it", async () => {
    const manifest = await manifestFor({ provider: { id: "deepl", options: {} } });
    const extra = { future: true };
    const extended = {
      ...manifest,
      ...extra,
      provider: { ...manifest.provider, ...extra },
      network: { ...manifest.network, ...extra },
      destinations: manifest.destinations.map((destination) => ({
        ...destination,
        ...extra,
        proxies: [{ variable: "HTTPS_PROXY", host: "proxy.example", ...extra }],
      })),
      sent: {
        ...manifest.sent,
        ...extra,
        counts: { sourceKeys: 1, keysWithContext: 0, ...extra },
      },
      locales: manifest.locales.map((locale) => ({ ...locale, ...extra })),
      local: manifest.local.map((file) => ({ ...file, ...extra })),
      otherRequests: manifest.otherRequests.map((request) => ({ ...request, ...extra })),
      agents: manifest.agents.map((agent) => ({ ...agent, ...extra })),
    };
    const network = {
      ...manifest.network,
      ...extra,
      status: "resolved",
      restricted: true,
      rules: [{ source: "config", policy: "local-only", allowedHosts: [], ...extra }],
    };

    expect(dataFlowManifestSchema.parse(extended)).toEqual(extended);
    expect(dataFlowManifestSchema.safeParse({ ...extended, network }).success).toBe(true);
  });

  it("still rejects a known field of the wrong shape", async () => {
    const manifest = await manifestFor({});

    expect(dataFlowManifestSchema.safeParse({ ...manifest, version: 2 }).success).toBe(false);
  });
});

describe("buildDataFlowManifest: the environment it judges against", () => {
  it("reports the environment policy for provider none too", async () => {
    const manifest = await manifestFor(
      { provider: { id: "none", options: {} } },
      { VERBATRA_NETWORK_POLICY: "local-only" },
    );

    expect(manifest.network).toEqual({
      status: "resolved",
      restricted: true,
      rules: [{ source: "environment", policy: "local-only", allowedHosts: [] }],
    });
  });

  it("never carries the value of a key variable the config names", async () => {
    const manifest = await manifestFor(
      {
        provider: {
          id: "openai-compatible",
          options: {
            baseUrl: "http://localhost:1234/v1",
            model: "m",
            maxOutputTokens: 1,
            apiKeyEnvVar: "MY_LLM_KEY",
          },
        },
      },
      { MY_LLM_KEY: "custom-canary-0a9b8c7d6e" },
    );

    expect(JSON.stringify(manifest)).not.toContain("canary");
  });
});

describe("buildDataFlowManifest: what is sent", () => {
  it("counts the keys a masking provider withholds, as the provider would", async () => {
    const deepl = await manifestFor({ provider: { id: "deepl", options: {} } });
    const libre = await manifestFor({ provider: PROVIDERS[6] as ProviderConfig });

    expect(deepl.sent.counts).toEqual({ sourceKeys: 3, keysWithContext: 0, keysWithheld: 1 });
    expect(libre.sent.counts?.keysWithheld).toBe(0);
    expect(deepl.sent.placeholders).toBe("masked");
  });

  it("counts the keys that carry a description", async () => {
    await writeFile(
      join(projectDir, "locales", "en.arb"),
      JSON.stringify({
        "@@locale": "en",
        hi: "Hi",
        "@hi": { description: "A greeting" },
        bye: "Bye",
      }),
      "utf8",
    );
    const manifest = await manifestFor({
      format: "arb",
      files: { pattern: "locales/{locale}.arb" },
    });

    expect(manifest.sent.counts).toEqual({ sourceKeys: 2, keysWithContext: 1 });
  });

  it("says why the counts are missing when the source cannot be read", async () => {
    await rm(join(projectDir, "locales"), { recursive: true });
    const manifest = await manifestFor({});

    expect(manifest.sent.counts).toBeUndefined();
    expect(manifest.sent.countsUnavailable).toContain("en.json");
  });

  it("counts glossary terms per locale only for a provider that sends them", async () => {
    const glossary = { Cart: "Warenkorb" };
    const llm = await manifestFor({ glossary, targetLocales: ["de", "fr"] });
    const deepl = await manifestFor({ glossary, provider: { id: "deepl", options: {} } });

    expect(llm.locales.map((locale) => locale.glossaryTermsSent)).toEqual([1, 1]);
    expect(deepl.locales[0]?.glossaryTermsSent).toBe(0);
  });

  it("reports the code each locale is sent as, after localeMap", async () => {
    const manifest = await manifestFor({
      targetLocales: ["de", "zh-Hant"],
      provider: { id: "deepl", options: { localeMap: { "zh-Hant": "ZH-HANT" } } },
    });

    expect(
      manifest.locales.map(({ locale, codeSent, mapped }) => [locale, codeSent, mapped]),
    ).toEqual([
      ["de", "DE", false],
      ["zh-Hant", "ZH-HANT", true],
    ]);
  });

  it("reports the configured sensitive-data mode", async () => {
    const manifest = await manifestFor({ sensitiveData: { mode: "redact" } });

    expect(manifest.sent.sensitiveData).toBe("redact");
    expect((await manifestFor({})).sent.sensitiveData).toBe("off");
  });

  it("names every local file by its project-relative path, with / separators", async () => {
    const manifest = await manifestFor({});

    expect(manifest.local.map(({ id, path }) => [id, path])).toEqual([
      ["lock", "verbatra.lock.json"],
      ["provenance", "verbatra.provenance.json"],
      ["cache", "verbatra.cache.json"],
      ["local-state", ".verbatra-local"],
    ]);
    expect(manifest.local.find(({ id }) => id === "cache")).toMatchObject({
      holdsSourceText: true,
      holdsTranslations: true,
      holdsPersonalData: false,
      gitignoredByInit: true,
    });
    expect(manifest.local.find(({ id }) => id === "provenance")?.holdsPersonalData).toBe(true);
    expect(manifest.local.find(({ id }) => id === "local-state")?.holdsPersonalData).toBe(true);
  });

  it("marks the local state as personal data because a held write lock records the host name", async () => {
    const manifest = await manifestFor({});
    const localState = manifest.local.find(({ id }) => id === "local-state");
    const lockPath = localeLockPath(projectDir, "de");

    const held = await withLocaleWriteLock(projectDir, "de", defaultFs, async () =>
      JSON.parse(await readFile(lockPath, "utf8")),
    );

    expect(relative(projectDir, lockPath).split(sep)[0]).toBe(localState?.path);
    expect(held).toMatchObject({ hostname: hostname(), pid: process.pid });
    await expect(readFile(lockPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps the paths project-relative from a nested project directory", async () => {
    const nested = join(projectDir, "apps", "web");
    await mkdir(nested, { recursive: true });
    const manifest = await buildDataFlowManifest(baseConfig({}), {
      cwd: nested,
      fs: defaultFs,
      env: {},
    });

    expect(manifest.local.map(({ path }) => path)).toEqual([
      "verbatra.lock.json",
      "verbatra.provenance.json",
      "verbatra.cache.json",
      ".verbatra-local",
    ]);
    expect(JSON.stringify(manifest.local)).not.toContain(projectDir);
  });

  it("narrows the fields to what this config can send", async () => {
    const bare = await manifestFor({ provider: { id: "deepl", options: {} } });
    const full = await manifestFor({
      tone: "formal",
      provider: { id: "deepl", options: { glossaryId: "g-1" } },
    });
    const neutral = await manifestFor({ tone: "neutral", provider: { id: "deepl", options: {} } });
    const llmBare = await manifestFor({});
    const llmFull = await manifestFor({ tone: "informal", glossary: { Cart: "Warenkorb" } });

    expect(bare.sent.fields).toEqual(["source-text", "placeholder-markers", "language-codes"]);
    expect(full.sent.fields).toEqual([
      "source-text",
      "placeholder-markers",
      "language-codes",
      "formality",
      "glossary-id",
    ]);
    expect(neutral.sent.fields).not.toContain("formality");
    expect(llmBare.sent.fields).not.toContain("tone");
    expect(llmBare.sent.fields).not.toContain("glossary-terms");
    expect(llmFull.sent.fields).toEqual(expect.arrayContaining(["tone", "glossary-terms"]));
  });

  it("counts glossary terms exactly as the request payload carries them", async () => {
    const manifest = await manifestFor({
      glossary: {
        version: 2,
        terms: [
          { source: "Cart", target: "Warenkorb", forbidden: { de: ["Karren"] }, note: "shop" },
          { source: "Basket", forbidden: { de: ["Korb"] } },
          { source: "Checkout", targets: { fr: "Paiement" } },
        ],
        doNotTranslate: ["verbatra"],
      },
    });

    expect(manifest.locales[0]?.glossaryTermsSent).toBe(3);
  });
});

describe("dataFlow", () => {
  it("loads the config from disk and describes it", async () => {
    await writeFile(
      join(projectDir, ".verbatrarc.json"),
      JSON.stringify({
        sourceLocale: "en",
        targetLocales: ["de"],
        format: "i18next-json",
        files: { pattern: "locales/{locale}.json" },
        provider: { id: "google-translate", options: {} },
      }),
      "utf8",
    );
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "google-canary-3f9a1c7e5b2d");

    const manifest = await dataFlow({ cwd: projectDir });

    expect(manifest.destinations.map((destination) => destination.host)).toEqual([
      "translation.googleapis.com",
    ]);
    expect(JSON.stringify(manifest)).not.toContain("canary");
  });

  it("throws CONFIG_NOT_FOUND for an explicit config path that does not exist", async () => {
    await expect(
      dataFlow({ cwd: projectDir, configPath: join(projectDir, "missing.json") }),
    ).rejects.toSatisfy((error) => error instanceof SdkError && error.code === "CONFIG_NOT_FOUND");
  });

  it("uses an injected config loader", async () => {
    const config = baseConfig({ provider: { id: "none", options: {} } });
    const manifest = await dataFlow(
      {},
      {
        loadConfig: async () => ({
          config,
          source: { kind: "override" },
          glossary: { source: "none" },
        }),
        fs: defaultFs,
      },
    );

    expect(manifest.sent.nothing).toBe(true);
  });
});
