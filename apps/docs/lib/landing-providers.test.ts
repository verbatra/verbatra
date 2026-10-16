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

const DECLARED_KIND: Readonly<Record<ProviderKind, string>> = {
  llm: "llm",
  machine: "machine-translation",
};

function declaredKind(id: MachineProviderId): string | undefined {
  return /\bkind: "([a-z-]+)"/.exec(providerSource(id, `${id}-provider.ts`))?.[1];
}

describe("landing providers", () => {
  it("groups every machine provider under exactly one kind, in registry order", () => {
    expect(PROVIDER_KINDS.flatMap(providersOfKind).toSorted()).toEqual(
      [...MACHINE_PROVIDER_IDS].sort(),
    );
    for (const kind of PROVIDER_KINDS) {
      const ids = providersOfKind(kind);
      expect(ids).toEqual(MACHINE_PROVIDER_IDS.filter((id) => ids.includes(id)));
    }
  });

  it("files each provider under the kind its own strategy declares", () => {
    for (const id of MACHINE_PROVIDER_IDS) {
      expect(declaredKind(id), id).toBe(DECLARED_KIND[PROVIDER_DISPLAY[id].kind]);
    }
    expect(Object.values(DECLARED_KIND).sort()).toEqual(
      [...new Set(MACHINE_PROVIDER_IDS.map(declaredKind))].sort(),
    );
  });

  it("names every machine provider the config accepts, and no other", () => {
    expect(Object.keys(PROVIDER_DISPLAY).sort()).toEqual([...MACHINE_PROVIDER_IDS].sort());
  });

  it("shortens only the local model route to its protocol name", () => {
    expect(providerShortLabel("openai-compatible")).toBe("OpenAI-compatible");
    expect(providerShortLabel("deepl")).toBe("DeepL");
  });

  it("lists every machine provider in registry order and marks only the release's new ones", () => {
    const providers = landingProviders();
    expect(providers.map((provider) => provider.id)).toEqual([...MACHINE_PROVIDER_IDS]);
    expect(providers.filter((provider) => provider.isNew).map((provider) => provider.id)).toEqual([
      ...RELEASE_BADGE.providers,
    ]);
  });
});
