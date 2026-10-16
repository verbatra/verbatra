import { describe, expect, it } from "vitest";
import { MACHINE_PROVIDER_IDS } from "./landing-facts";
import { PROVIDER_DISPLAY, providerShortLabel } from "./landing-providers";

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
});
