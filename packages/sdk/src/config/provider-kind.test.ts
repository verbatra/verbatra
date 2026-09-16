import { describe, expect, it, vi } from "vitest";
import { buildProvider, PROVIDER_IDS, type ProviderConfig } from "./provider-config.js";
import { kindOf, PROVIDER_KIND } from "./provider-kind.js";

const CONFIGS: Record<string, ProviderConfig> = {
  anthropic: { id: "anthropic", options: { model: "sonnet-test", maxTokens: 1024 } },
  openai: { id: "openai", options: { model: "gpt-test", maxOutputTokens: 1024 } },
  gemini: { id: "gemini", options: { model: "gemini-test", maxOutputTokens: 1024 } },
  deepl: { id: "deepl", options: {} },
  "google-translate": { id: "google-translate", options: {} },
  "openai-compatible": {
    id: "openai-compatible",
    options: { baseUrl: "http://localhost:1234/v1", model: "llama-3", maxOutputTokens: 1024 },
  },
};

describe("PROVIDER_KIND", () => {
  it("addresses every provider id, so a new provider cannot ship without a kind", () => {
    expect(Object.keys(PROVIDER_KIND).sort()).toEqual([...PROVIDER_IDS].sort());
  });

  it("reports the kind the constructed provider itself reports, for every provider", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("DEEPL_API_KEY", "test-key");
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "test-key");

    for (const id of PROVIDER_IDS) {
      const config = CONFIGS[id];
      expect(config, `no test config for ${id}`).toBeDefined();
      expect(kindOf(id), id).toBe(buildProvider(config as ProviderConfig).kind);
    }

    vi.unstubAllEnvs();
  });
});
