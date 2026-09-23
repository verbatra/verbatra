import { describe, expect, it } from "vitest";
import { readEnvironmentRule } from "./environment-rule.js";

describe("readEnvironmentRule", () => {
  it("is unset when neither variable holds a value", () => {
    expect(readEnvironmentRule({})).toEqual({ kind: "unset" });
    expect(
      readEnvironmentRule({ VERBATRA_NETWORK_POLICY: "  ", VERBATRA_NETWORK_ALLOWED_HOSTS: "" }),
    ).toEqual({ kind: "unset" });
  });

  it("reads a policy and a comma-separated host list", () => {
    expect(
      readEnvironmentRule({
        VERBATRA_NETWORK_POLICY: " allowlist ",
        VERBATRA_NETWORK_ALLOWED_HOSTS: " gpu.lan, 10.0.0.0/8 ,,",
      }),
    ).toEqual({
      kind: "rule",
      rule: { source: "environment", policy: "allowlist", allowedHosts: ["gpu.lan", "10.0.0.0/8"] },
    });
    expect(readEnvironmentRule({ VERBATRA_NETWORK_POLICY: "local-only" })).toEqual({
      kind: "rule",
      rule: { source: "environment", policy: "local-only", allowedHosts: [] },
    });
  });

  it.each([
    [{ VERBATRA_NETWORK_POLICY: "local_only" }, "must be one of"],
    [{ VERBATRA_NETWORK_POLICY: "LOCAL-ONLY" }, "must be one of"],
    [{ VERBATRA_NETWORK_ALLOWED_HOSTS: "gpu.lan" }, "is set but VERBATRA_NETWORK_POLICY is not"],
    [{ VERBATRA_NETWORK_POLICY: "allowlist" }, "must name at least one host"],
    [
      { VERBATRA_NETWORK_POLICY: "local-only", VERBATRA_NETWORK_ALLOWED_HOSTS: "https://x" },
      'invalid entry "https://x"',
    ],
  ])("fails closed on %o", (env, message) => {
    const result = readEnvironmentRule(env);
    expect(result.kind).toBe("invalid");
    expect(result.kind === "invalid" ? result.message : "").toContain(message);
  });
});
