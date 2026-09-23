import { describe, expect, it } from "vitest";
import type { ProviderConfig } from "../config/provider-config.js";
import { checkNetworkPolicy } from "./network-doctor.js";

const anthropic: ProviderConfig = { id: "anthropic", options: { model: "m", maxTokens: 1 } };

function compatible(baseUrl: string): ProviderConfig {
  return { id: "openai-compatible", options: { baseUrl, model: "m", maxOutputTokens: 1 } };
}

describe("checkNetworkPolicy", () => {
  it("passes under the default policy and names the endpoint", () => {
    expect(checkNetworkPolicy(anthropic, undefined, {})).toEqual({
      passed: true,
      detail:
        'Network policy: any host (config: unset; VERBATRA_NETWORK_POLICY: unset). Provider "anthropic" connects to api.anthropic.com: permitted.',
    });
  });

  it("fails a hosted provider under local-only with the reason", () => {
    const verdict = checkNetworkPolicy(anthropic, { policy: "local-only" }, {});
    expect(verdict.passed).toBe(false);
    expect(verdict.detail).toContain(
      "Network policy: restricted: a host must satisfy every policy below (config: local-only; VERBATRA_NETWORK_POLICY: unset).",
    );
    expect(verdict.detail).toContain(
      'refused: the endpoint host api.anthropic.com is not permitted by the "local-only" network policy',
    );
  });

  it("names a base-URL override and both policy sources", () => {
    const verdict = checkNetworkPolicy(
      anthropic,
      { policy: "local-only", allowedHosts: ["10.0.0.0/8"] },
      {
        ANTHROPIC_BASE_URL: "http://10.1.1.1:4000",
        VERBATRA_NETWORK_POLICY: "allowlist",
        VERBATRA_NETWORK_ALLOWED_HOSTS: "10.1.1.1",
      },
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.detail).toContain(
      "(config: local-only, allowing 10.0.0.0/8; VERBATRA_NETWORK_POLICY: allowlist, allowing 10.1.1.1)",
    );
    expect(verdict.detail).toContain(
      'Provider "anthropic" connects to 10.1.1.1 (from ANTHROPIC_BASE_URL): permitted. Every request and redirect is checked',
    );
  });

  it("says a name is checked per request when it needs resolving", () => {
    const verdict = checkNetworkPolicy(
      compatible("http://llm.internal:8000/v1"),
      { policy: "local-only" },
      {},
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.detail).toContain("permitted if every address the name resolves to is");
  });

  it("says DeepL is only checked before the provider is built", () => {
    const verdict = checkNetworkPolicy(
      { id: "deepl", options: {} },
      { policy: "local-only", allowedHosts: ["api.deepl.com"] },
      {},
    );
    expect(verdict.detail).toContain("only before the provider is built");
  });

  it("passes a none provider", () => {
    expect(
      checkNetworkPolicy({ id: "none", options: {} }, { policy: "local-only" }, {}).detail,
    ).toContain('No provider is called (provider "none").');
  });

  it("fails an unknown provider id and an invalid environment pin", () => {
    const unknown = { id: "mistral", options: {} } as unknown as ProviderConfig;
    expect(checkNetworkPolicy(unknown, undefined, {})).toMatchObject({ passed: false });
    expect(
      checkNetworkPolicy(anthropic, undefined, { VERBATRA_NETWORK_POLICY: "nope" }),
    ).toMatchObject({ passed: false, detail: expect.stringContaining("must be one of") });
  });
});
