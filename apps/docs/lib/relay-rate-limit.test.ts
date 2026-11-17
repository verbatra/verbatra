import { describe, expect, it, vi } from "vitest";
import {
  createRelayRateLimit,
  GLOBAL_LIMIT_PER_WINDOW,
  IP_LIMIT_PER_WINDOW,
  MAX_TRACKED_IPS,
  RATE_WINDOW_MS,
} from "./relay-rate-limit";

describe("relay rate limit", () => {
  it("allows the per-ip limit inside a window and drops the next one", () => {
    const allow = createRelayRateLimit();
    for (let call = 0; call < IP_LIMIT_PER_WINDOW; call += 1) {
      expect(allow("84.132.10.7", 1000)).toBe(true);
    }
    expect(allow("84.132.10.7", 1000)).toBe(false);
  });

  it("counts each ip separately", () => {
    const allow = createRelayRateLimit();
    for (let call = 0; call < IP_LIMIT_PER_WINDOW; call += 1) allow("84.132.10.7", 0);
    expect(allow("84.132.10.8", 0)).toBe(true);
  });

  it("starts a fresh window once the window has passed", () => {
    const allow = createRelayRateLimit();
    for (let call = 0; call < IP_LIMIT_PER_WINDOW; call += 1) allow("84.132.10.7", 0);
    expect(allow("84.132.10.7", RATE_WINDOW_MS - 1)).toBe(false);
    expect(allow("84.132.10.7", RATE_WINDOW_MS)).toBe(true);
  });

  it("drops everything past the global cap even for fresh ips", () => {
    const allow = createRelayRateLimit();
    for (let call = 0; call < GLOBAL_LIMIT_PER_WINDOW; call += 1) {
      expect(allow(`ip-${call}`, 0)).toBe(true);
    }
    expect(allow("fresh-ip", 0)).toBe(false);
    expect(allow("fresh-ip", RATE_WINDOW_MS)).toBe(true);
  });

  it("with the global cap lifted, the tracked table stays bounded: new ips are dropped past the limit and reclaimed once expired", () => {
    const allow = createRelayRateLimit({ globalLimit: Number.POSITIVE_INFINITY });
    for (let call = 0; call < MAX_TRACKED_IPS; call += 1) allow(`ip-${call}`, 0);
    expect(allow("overflow", 0)).toBe(false);
    expect(allow("overflow", RATE_WINDOW_MS)).toBe(true);
  });

  it("does not count a dropped request against the window", () => {
    const allow = createRelayRateLimit();
    for (let call = 0; call < IP_LIMIT_PER_WINDOW + 10; call += 1) allow("84.132.10.7", 0);
    expect(allow("84.132.10.7", RATE_WINDOW_MS)).toBe(true);
  });

  it("counts every address inside one ipv6 /64 prefix as one client", () => {
    const allow = createRelayRateLimit();
    for (let call = 0; call < IP_LIMIT_PER_WINDOW; call += 1) {
      expect(allow(`2a02:810d:4b3f:1c00::${call.toString(16)}`, 0)).toBe(true);
    }
    expect(allow("2a02:810d:4b3f:1c00:aaaa:bbbb:cccc:dddd", 0)).toBe(false);
  });

  it("keeps different ipv6 /64 prefixes apart", () => {
    const allow = createRelayRateLimit();
    for (let call = 0; call < IP_LIMIT_PER_WINDOW; call += 1) allow("2a02:810d:4b3f:1c00::1", 0);
    expect(allow("2a02:810d:4b3f:1c01::1", 0)).toBe(true);
  });

  it("keys an ipv4-mapped ipv6 address by its ipv4 address, not by the shared mapped prefix", () => {
    const allow = createRelayRateLimit();
    for (let call = 0; call < IP_LIMIT_PER_WINDOW; call += 1) allow("::ffff:84.132.10.7", 0);
    expect(allow("::ffff:84.132.10.8", 0)).toBe(true);
    expect(allow("84.132.10.7", 0)).toBe(false);
  });

  it("sweeps expired windows when the global window rolls over", () => {
    const allow = createRelayRateLimit();
    for (let call = 0; call < 50; call += 1) allow(`ip-${call}`, 0);
    const deleted = vi.spyOn(Map.prototype, "delete");
    try {
      allow("ip-0", RATE_WINDOW_MS);
      expect(deleted.mock.calls.length).toBeGreaterThanOrEqual(49);
    } finally {
      deleted.mockRestore();
    }
  });
});
