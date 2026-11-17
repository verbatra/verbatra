import { describe, expect, it } from "vitest";
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

  it("stays bounded: past the tracked limit new ips are dropped, expired ones are reclaimed", () => {
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
});
