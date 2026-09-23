import { describe, expect, it } from "vitest";
import { canonicalIpv6, isValidAllowedHost, parseAllowedHost } from "./allowed-host.js";
import { networkConfigSchema } from "./network-config.js";

describe("parseAllowedHost", () => {
  it.each([
    ["api.anthropic.com", { kind: "name", name: "api.anthropic.com" }],
    ["Gpu.LAN.", { kind: "name", name: "gpu.lan" }],
    ["*.corp.example", { kind: "suffix", suffix: ".corp.example" }],
    ["10.0.0.0/8", { kind: "subnet", address: "10.0.0.0", prefix: 8, family: "ipv4" }],
    ["203.0.113.7", { kind: "subnet", address: "203.0.113.7", prefix: 32, family: "ipv4" }],
    ["FD00::/8", { kind: "subnet", address: "fd00::", prefix: 8, family: "ipv6" }],
    ["::1", { kind: "subnet", address: "::1", prefix: 128, family: "ipv6" }],
  ])("parses %s", (entry, expected) => {
    expect(parseAllowedHost(entry)).toEqual(expected);
  });

  it.each([
    "",
    "http://api.example.com",
    "api.example.com:443",
    "api.example.com/v1",
    "*",
    "*.",
    "a.*.example",
    "300.1.1.1",
    "10.0.0",
    "10.0.0.0/33",
    "fd00::/129",
    "fd00:::1",
    "[::1]",
    "12345",
    "-bad.example",
  ])("rejects %s", (entry) => {
    expect(parseAllowedHost(entry)).toBeUndefined();
    expect(isValidAllowedHost(entry)).toBe(false);
  });

  it("canonicalizes an IPv6 literal", () => {
    expect(canonicalIpv6("0:0:0:0:0:0:0:1")).toBe("::1");
  });
});

describe("networkConfigSchema", () => {
  it("accepts every policy and an allowlist", () => {
    expect(networkConfigSchema.parse({ policy: "any" })).toEqual({ policy: "any" });
    expect(
      networkConfigSchema.parse({ policy: "local-only", allowedHosts: ["api.deepl.com"] }),
    ).toEqual({ policy: "local-only", allowedHosts: ["api.deepl.com"] });
    expect(
      networkConfigSchema.parse({ policy: "allowlist", allowedHosts: ["10.0.0.0/8"] }),
    ).toBeDefined();
  });

  it("requires allowedHosts under allowlist", () => {
    const result = networkConfigSchema.safeParse({ policy: "allowlist" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["allowedHosts"]);
    expect(networkConfigSchema.safeParse({ policy: "allowlist", allowedHosts: [] }).success).toBe(
      false,
    );
  });

  it("rejects an unknown policy, an unknown key and a malformed host", () => {
    expect(networkConfigSchema.safeParse({ policy: "loopback" }).success).toBe(false);
    expect(networkConfigSchema.safeParse({ policy: "any", extra: true }).success).toBe(false);
    expect(
      networkConfigSchema.safeParse({ policy: "local-only", allowedHosts: ["https://x.y"] })
        .success,
    ).toBe(false);
    expect(
      networkConfigSchema.safeParse({ policy: "local-only", allowedHosts: ["999.1.1.1"] }).success,
    ).toBe(false);
  });
});
