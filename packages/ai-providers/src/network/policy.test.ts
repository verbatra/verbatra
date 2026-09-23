import { describe, expect, it } from "vitest";
import {
  describeRule,
  findRefusingRule,
  isRestrictive,
  judgeHost,
  type NetworkPolicy,
  type NetworkRule,
  toAddress,
} from "./policy.js";

function rule(
  policy: NetworkRule["policy"],
  allowedHosts: readonly string[] = [],
  source: NetworkRule["source"] = "config",
): NetworkRule {
  return { source, policy, allowedHosts };
}

function only(...rules: NetworkRule[]): NetworkPolicy {
  return { rules };
}

const LOCAL_ONLY = only(rule("local-only"));

describe("judgeHost: local-only classifies addresses", () => {
  it.each([
    "127.0.0.1",
    "127.255.255.254",
    "10.0.0.1",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.20",
    "[::1]",
    "::1",
    "[0:0:0:0:0:0:0:1]",
    "[fd12:3456::1]",
    "[fc00::1]",
    "[::ffff:7f00:1]",
    "[::ffff:127.0.0.1]",
    "[::ffff:a00:1]",
    "[::ffff:192.168.0.1]",
  ])("permits the local address %s", (host) => {
    expect(judgeHost(LOCAL_ONLY, host).verdict).toBe("permitted");
  });

  it.each([
    "8.8.8.8",
    "172.15.255.255",
    "172.32.0.1",
    "11.0.0.1",
    "192.169.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "[::]",
    "[fe80::1]",
    "[2001:4860:4860::8888]",
    "[::ffff:808:808]",
    "[::ffff:8.8.8.8]",
    "[::ffff:a9fe:a9fe]",
    "[64:ff9b::7f00:1]",
    "[::7f00:1]",
  ])("refuses the non-local address %s", (host) => {
    const judgement = judgeHost(LOCAL_ONLY, host);
    expect(judgement.verdict).toBe("refused");
    expect(judgement.refusedBy).toEqual(rule("local-only"));
  });

  it.each(["localhost", "LOCALHOST", "localhost.", "ollama.localhost", "a.b.localhost"])(
    "permits the loopback name %s without resolving it",
    (host) => {
      expect(judgeHost(LOCAL_ONLY, host).verdict).toBe("permitted");
    },
  );

  it("defers any other name to resolution", () => {
    const judgement = judgeHost(LOCAL_ONLY, "llm.internal");
    expect(judgement.verdict).toBe("resolve");
    expect(judgement.resolveFor).toEqual([rule("local-only")]);
  });

  it("refuses a known public name outright instead of resolving it", () => {
    expect(judgeHost(LOCAL_ONLY, "api.anthropic.com", true).verdict).toBe("refused");
  });

  it("does not treat a name that merely contains localhost as loopback", () => {
    expect(judgeHost(LOCAL_ONLY, "localhost.evil.example").verdict).toBe("resolve");
    expect(judgeHost(LOCAL_ONLY, "notlocalhost", true).verdict).toBe("refused");
  });
});

describe("judgeHost: allowedHosts", () => {
  it("permits an exact name, ignoring case and a trailing dot", () => {
    const policy = only(rule("local-only", ["API.Anthropic.com."]));
    expect(judgeHost(policy, "api.anthropic.com", true).verdict).toBe("permitted");
    expect(judgeHost(policy, "api.anthropic.com.", true).verdict).toBe("permitted");
  });

  it("matches a wildcard against subdomains only", () => {
    const policy = only(rule("allowlist", ["*.corp.example"]));
    expect(judgeHost(policy, "llm.corp.example").verdict).toBe("permitted");
    expect(judgeHost(policy, "a.b.corp.example").verdict).toBe("permitted");
    expect(judgeHost(policy, "corp.example").verdict).toBe("refused");
    expect(judgeHost(policy, "evilcorp.example").verdict).toBe("refused");
  });

  it("matches an address against an IPv4 or IPv6 CIDR entry", () => {
    const policy = only(rule("allowlist", ["100.64.0.0/10", "2001:db8::/32", "203.0.113.7"]));
    expect(judgeHost(policy, "100.100.1.1").verdict).toBe("permitted");
    expect(judgeHost(policy, "[2001:db8:1::5]").verdict).toBe("permitted");
    expect(judgeHost(policy, "203.0.113.7").verdict).toBe("permitted");
    expect(judgeHost(policy, "203.0.113.8").verdict).toBe("refused");
    expect(judgeHost(policy, "[::ffff:6464:101]").verdict).toBe("permitted");
  });

  it("refuses a loopback address under allowlist unless it is listed", () => {
    expect(judgeHost(only(rule("allowlist", ["gpu.lan"])), "127.0.0.1").verdict).toBe("refused");
    expect(judgeHost(only(rule("allowlist", ["gpu.lan"])), "localhost").verdict).toBe("refused");
  });

  it("refuses an unlisted name under allowlist without subnets, and resolves it with subnets", () => {
    expect(judgeHost(only(rule("allowlist", ["gpu.lan"])), "other.lan").verdict).toBe("refused");
    expect(judgeHost(only(rule("allowlist", ["10.0.0.0/8"])), "other.lan").verdict).toBe("resolve");
  });

  it("ignores a malformed entry rather than letting it match", () => {
    expect(judgeHost(only(rule("allowlist", ["http://x", "10.0.0.0/8"])), "x").verdict).toBe(
      "resolve",
    );
  });
});

describe("judgeHost: combined rules", () => {
  it("permits everything under any", () => {
    expect(judgeHost(only(rule("any")), "8.8.8.8").verdict).toBe("permitted");
    expect(judgeHost(only(), "8.8.8.8").verdict).toBe("permitted");
  });

  it("requires every rule to permit, so the stricter rule wins", () => {
    const policy = only(
      rule("local-only", ["api.anthropic.com"]),
      rule("allowlist", ["gpu.lan"], "environment"),
    );
    const judgement = judgeHost(policy, "api.anthropic.com", true);
    expect(judgement.verdict).toBe("refused");
    expect(judgement.refusedBy?.source).toBe("environment");
  });

  it("collects every rule that still needs resolution", () => {
    const policy = only(rule("local-only"), rule("any"), rule("local-only", [], "environment"));
    expect(judgeHost(policy, "llm.internal").resolveFor).toHaveLength(2);
  });
});

describe("findRefusingRule", () => {
  const rules = [rule("local-only")];

  it("accepts a name whose every address is local", () => {
    expect(findRefusingRule(rules, ["10.1.2.3", "::1"])).toBeUndefined();
  });

  it("refuses when any one address is public", () => {
    expect(findRefusingRule(rules, ["10.1.2.3", "93.184.216.34"])).toEqual(rule("local-only"));
  });

  it("refuses an empty or unparseable answer", () => {
    expect(findRefusingRule(rules, [])).toBeDefined();
    expect(findRefusingRule(rules, ["10.0.0.1", "not-an-address"])).toBeDefined();
  });
});

describe("helpers", () => {
  it("isRestrictive is false only when every rule is any", () => {
    expect(isRestrictive(only())).toBe(false);
    expect(isRestrictive(only(rule("any")))).toBe(false);
    expect(isRestrictive(only(rule("any"), rule("local-only", [], "environment")))).toBe(true);
  });

  it("describeRule names where the rule came from", () => {
    expect(describeRule(rule("local-only"))).toBe(
      'the "local-only" network policy set by the config\'s network block',
    );
    expect(describeRule(rule("allowlist", ["x"], "environment"))).toBe(
      'the "allowlist" network policy set by VERBATRA_NETWORK_POLICY',
    );
  });

  it("toAddress returns undefined for a name", () => {
    expect(toAddress("example.com")).toBeUndefined();
    expect(toAddress("[::ffff:7f00:1]")).toEqual({ address: "127.0.0.1", family: "ipv4" });
  });
});
