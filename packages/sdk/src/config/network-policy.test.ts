import { describe, expect, it } from "vitest";
import { SdkError } from "../errors.js";
import {
  assertEndpointPermitted,
  assertProviderNetworkPermitted,
  endpointTargetOf,
  resolveNetworkPolicy,
} from "./network-policy.js";
import type { MachineProviderConfig } from "./provider-config.js";

const anthropic: MachineProviderConfig = {
  id: "anthropic",
  options: { model: "m", maxTokens: 1 },
};

const local: MachineProviderConfig = {
  id: "openai-compatible",
  options: { baseUrl: "http://127.0.0.1:11434/v1", model: "m", maxOutputTokens: 1 },
};

function thrown(run: () => void): SdkError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(SdkError);
    return error as SdkError;
  }
  throw new Error("expected a throw");
}

describe("resolveNetworkPolicy", () => {
  it("has no rule when neither source sets one", () => {
    expect(resolveNetworkPolicy(undefined, {})).toEqual({ rules: [] });
  });

  it("carries the config rule and the environment rule side by side", () => {
    expect(
      resolveNetworkPolicy(
        { policy: "local-only", allowedHosts: ["api.deepl.com"] },
        { VERBATRA_NETWORK_POLICY: "allowlist", VERBATRA_NETWORK_ALLOWED_HOSTS: "gpu.lan" },
      ),
    ).toEqual({
      rules: [
        { source: "config", policy: "local-only", allowedHosts: ["api.deepl.com"] },
        { source: "environment", policy: "allowlist", allowedHosts: ["gpu.lan"] },
      ],
    });
    expect(resolveNetworkPolicy({ policy: "any" }, {}).rules[0]?.allowedHosts).toEqual([]);
  });

  it("copies allowedHosts, so a later change to the config cannot widen the policy", () => {
    const allowedHosts = ["gpu.lan"];
    const policy = resolveNetworkPolicy({ policy: "local-only", allowedHosts }, {});
    allowedHosts.push("api.anthropic.com");
    expect(policy.rules[0]?.allowedHosts).toEqual(["gpu.lan"]);
  });

  it("fails closed as CONFIG_INVALID on an invalid environment value", () => {
    const error = thrown(() =>
      resolveNetworkPolicy(undefined, { VERBATRA_NETWORK_POLICY: "local_only" }),
    );
    expect(error.code).toBe("CONFIG_INVALID");
    expect(error.message).toContain("VERBATRA_NETWORK_POLICY");
  });
});

describe("assertEndpointPermitted", () => {
  const localOnly = resolveNetworkPolicy({ policy: "local-only" }, {});

  it("refuses a hosted provider with NETWORK_POLICY_VIOLATION", () => {
    const error = thrown(() => assertEndpointPermitted(anthropic, localOnly, {}));
    expect(error.code).toBe("NETWORK_POLICY_VIOLATION");
    expect(error.message).toContain('Provider "anthropic" was not constructed');
    expect(error.message).toContain("api.anthropic.com");
    expect(error.message).toContain("No request was sent.");
  });

  it("permits a local endpoint", () => {
    expect(() => assertEndpointPermitted(local, localOnly, {})).not.toThrow();
  });

  it("maps openai-compatible to its base URL and every other provider to its id", () => {
    expect(endpointTargetOf(local)).toEqual({
      id: "openai-compatible",
      baseUrl: "http://127.0.0.1:11434/v1",
    });
    expect(endpointTargetOf(anthropic)).toEqual({ id: "anthropic" });
  });
});

describe("assertProviderNetworkPermitted", () => {
  it("ignores a none provider", () => {
    expect(() =>
      assertProviderNetworkPermitted(
        { provider: { id: "none", options: {} }, network: { policy: "local-only" } },
        {},
      ),
    ).not.toThrow();
  });

  it("applies the environment pin even when the config sets no network block", () => {
    const error = thrown(() =>
      assertProviderNetworkPermitted(
        { provider: anthropic },
        { VERBATRA_NETWORK_POLICY: "local-only" },
      ),
    );
    expect(error.code).toBe("NETWORK_POLICY_VIOLATION");
    expect(error.message).toContain("VERBATRA_NETWORK_POLICY");
  });

  it("reads the process environment by default", () => {
    expect(() => assertProviderNetworkPermitted({ provider: local })).not.toThrow();
  });
});
