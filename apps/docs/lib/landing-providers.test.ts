import { describe, expect, it } from "vitest";
import { MACHINE_PROVIDER_IDS } from "./landing-facts";
import { landingProviders, PROVIDER_DISPLAY, providerShortLabel } from "./landing-providers";
import { RELEASE_BADGE } from "./release-badge";

describe("landing providers", () => {
  it("names every machine provider the config accepts, and no other", () => {
    expect(Object.keys(PROVIDER_DISPLAY).sort()).toEqual([...MACHINE_PROVIDER_IDS].sort());
  });

  it("files the local model route and the self-hosted engine under local", () => {
    const local = MACHINE_PROVIDER_IDS.filter((id) => PROVIDER_DISPLAY[id].kind === "local");
    expect(local).toEqual(["openai-compatible", "libretranslate"]);
  });

  it("shortens only the local model route to its protocol name", () => {
    expect(providerShortLabel("openai-compatible")).toBe("OpenAI-compatible");
    expect(providerShortLabel("deepl")).toBe(PROVIDER_DISPLAY.deepl.label);
  });

  it("lists every machine provider in registry order with its short label, kind and release mark", () => {
    const providers = landingProviders();
    expect(providers.map((provider) => provider.id)).toEqual([...MACHINE_PROVIDER_IDS]);
    for (const provider of providers) {
      expect(provider.label).toBe(providerShortLabel(provider.id));
      expect(provider.kind).toBe(PROVIDER_DISPLAY[provider.id].kind);
    }
    expect(providers.filter((provider) => provider.isNew).map((provider) => provider.id)).toEqual([
      ...RELEASE_BADGE.providers,
    ]);
  });
});
