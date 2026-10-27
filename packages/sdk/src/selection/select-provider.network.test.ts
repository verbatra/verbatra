import { describe, expect, it, vi } from "vitest";
import type { ProviderConfig } from "../config/provider-config.js";
import { makeStubProvider } from "../test-support.js";
import { type CreateProvider, selectProvider } from "./select-provider.js";

const anthropic: ProviderConfig = { id: "anthropic", options: { model: "m", maxTokens: 1 } };

const local: ProviderConfig = {
  id: "openai-compatible",
  options: { baseUrl: "http://localhost:11434/v1", model: "m", maxOutputTokens: 1 },
};

function recordingFactory() {
  return vi.fn<CreateProvider>(() => makeStubProvider().provider);
}

describe("selectProvider: network policy", () => {
  it("refuses a hosted provider under local-only before the factory runs", () => {
    const factory = recordingFactory();
    expect(() =>
      selectProvider(anthropic, factory, { network: { policy: "local-only" }, env: {} }),
    ).toThrow(expect.objectContaining({ code: "NETWORK_POLICY_VIOLATION" }));
    expect(factory).not.toHaveBeenCalled();
  });

  it("refuses through the environment pin alone", () => {
    const factory = recordingFactory();
    expect(() =>
      selectProvider(anthropic, factory, {
        network: undefined,
        env: { VERBATRA_NETWORK_POLICY: "local-only" },
      }),
    ).toThrow(expect.objectContaining({ code: "NETWORK_POLICY_VIOLATION" }));
    expect(factory).not.toHaveBeenCalled();
  });

  it("fails closed on an invalid environment pin", () => {
    const factory = recordingFactory();
    expect(() =>
      selectProvider(local, factory, {
        network: undefined,
        env: { VERBATRA_NETWORK_POLICY: "strict" },
      }),
    ).toThrow(expect.objectContaining({ code: "CONFIG_INVALID" }));
    expect(factory).not.toHaveBeenCalled();
  });

  it("hands the factory the effective policy when it restricts anything", () => {
    const factory = recordingFactory();
    const env = { VERBATRA_NETWORK_POLICY: "local-only" };
    selectProvider(local, factory, { network: { policy: "any" }, env });
    expect(factory).toHaveBeenCalledWith(local, {
      network: {
        policy: {
          rules: [
            { source: "config", policy: "any", allowedHosts: [] },
            { source: "environment", policy: "local-only", allowedHosts: [] },
          ],
        },
        env,
      },
    });
  });

  it("calls the factory with the config alone under the default policy", () => {
    const factory = recordingFactory();
    selectProvider(anthropic, factory, { network: undefined, env: {} });
    selectProvider(anthropic, factory, { network: { policy: "any" }, env: {} });
    expect(factory.mock.calls).toEqual([[anthropic], [anthropic]]);
  });
});
