import { describe, expect, it } from "vitest";
import { MACHINE_PROVIDER_IDS } from "./landing-facts";
import { PROVIDER_DISPLAY, PROVIDER_KINDS, providerGroups } from "./landing-providers";

describe("landing providers", () => {
  it("names every machine provider the config accepts, and no other", () => {
    expect(Object.keys(PROVIDER_DISPLAY).sort()).toEqual([...MACHINE_PROVIDER_IDS].sort());
  });

  it("groups every provider exactly once, in kind order", () => {
    const groups = providerGroups();
    expect(groups.map((group) => group.kind)).toEqual([...PROVIDER_KINDS]);
    expect(groups.flatMap((group) => group.providers.map((p) => p.id)).sort()).toEqual(
      [...MACHINE_PROVIDER_IDS].sort(),
    );
    expect(groups.every((group) => group.providers.length > 0)).toBe(true);
  });

  it("files the local model route and the self-hosted engine under local", () => {
    const local = providerGroups().find((group) => group.kind === "local");
    expect(local?.providers.map((p) => p.id)).toEqual(["openai-compatible", "libretranslate"]);
  });
});
