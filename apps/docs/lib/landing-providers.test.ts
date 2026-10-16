import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MACHINE_PROVIDER_IDS, type MachineProviderId } from "./landing-facts";
import {
  landingProviders,
  PROVIDER_DISPLAY,
  PROVIDER_KINDS,
  type ProviderKind,
  providerShortLabel,
  providersOfKind,
} from "./landing-providers";
import { RELEASE_BADGE } from "./release-badge";

const PROVIDERS_SRC = fileURLToPath(new URL("../../../packages/ai-providers/src", import.meta.url));

function providerSource(id: MachineProviderId, file: string): string {
  return readFileSync(join(PROVIDERS_SRC, id, file), "utf8");
}

const REGISTRY_KIND: Readonly<Record<Exclude<ProviderKind, "local">, string>> = {
  llm: "llm",
  machine: "machine-translation",
};

describe("landing providers", () => {
  it("groups every machine provider under exactly one kind, in registry order", () => {
    expect(PROVIDER_KINDS.flatMap(providersOfKind).toSorted()).toEqual(
      [...MACHINE_PROVIDER_IDS].sort(),
    );
    for (const kind of PROVIDER_KINDS)
      expect(providersOfKind(kind)).toEqual(
        MACHINE_PROVIDER_IDS.filter((id) => PROVIDER_DISPLAY[id].kind === kind),
      );
  });

  it("files a hosted provider under the kind its strategy declares", () => {
    for (const id of MACHINE_PROVIDER_IDS) {
      const kind = PROVIDER_DISPLAY[id].kind;
      if (kind === "local") continue;
      expect(providerSource(id, `${id}-provider.ts`), id).toContain(
        `kind: "${REGISTRY_KIND[kind]}"`,
      );
    }
  });

  it("files under local exactly the providers whose config points at a server you run", () => {
    const takesBaseUrl = MACHINE_PROVIDER_IDS.filter((id) =>
      providerSource(id, "config.ts").includes("httpBaseUrlSchema"),
    );
    expect(providersOfKind("local")).toEqual(takesBaseUrl);
  });

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
